import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import {adaptComposerDocument, restoreComposerDocument, SCENE_ADAPTER_VERSION} from '../graphics-poc/scene-adapter-v1.js';

const [manifest, schema, beef, dairy] = await Promise.all([
  readFile(new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../schemas/visual-scene.schema.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../graphics-poc/source/main-composer-v1/beef.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../graphics-poc/source/main-composer-v1/dairy.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const validate = new Ajv2020({allErrors: true, strict: true, strictRequired: false}).compile(schema);

test('versioned Composer adapter is deterministic and emits schema-valid beef and dairy scenes', () => {
  for (const source of [beef, dairy]) {
    const first = adaptComposerDocument(source, manifest);
    const second = adaptComposerDocument(source, manifest);
    assert.equal(first.adapterVersion, SCENE_ADAPTER_VERSION);
    assert.deepEqual(first, second);
    assert.equal(validate(first.scene), true, JSON.stringify(validate.errors));
    assert.equal(first.sourceFormat.sceneId, source.scene.metadata.id);
    assert.deepEqual(first.sourceFormat.ids.zoneIds, source.scene.zones.map(zone => zone.id));
    assert.deepEqual(new Set(first.sourceFormat.ids.assetIds), new Set(first.scene.assets.map(asset => asset.assetId)));
    assert.equal(first.scene.zones.length, source.scene.zones.length, 'authored zones map one-to-one, without synthetic splits');
    assert.equal(first.scene.entities.length, source.expandedPlacements.filter(item => item.layer === 'animals').length);
    assert.equal(first.scene.entities.every(entity => ['sampled-miniature', 'operational'].includes(entity.representationMode)), true);
    assert.ok(first.scene.entities.some(entity => entity.representationMode === 'sampled-miniature'));
    for (const group of first.scene.visualGroups ?? []) {
      for (const entityId of group.visualEntityIds) {
        const linked = first.scene.entities.find(entity => entity.entityId === entityId);
        assert.ok(linked, `${group.groupId} references a missing visual entity ${entityId}`);
        assert.equal(linked.groupId, group.groupId);
      }
    }
  }
});

test('round-trip restore preserves exact authored zones, asset IDs and unsupported Composer fields', () => {
  for (const source of [beef, dairy]) {
    const document = adaptComposerDocument(source, manifest);
    const restored = restoreComposerDocument(document);
    assert.deepEqual(restored, source);
    assert.deepEqual(restored.scene.zones, source.scene.zones);
    assert.deepEqual(restored.scene.placements.map(item => item.assetId), source.scene.placements.map(item => item.assetId));
    assert.ok(document.unsupportedFields.some(field => field.path === 'scene.metadata.description'));
    assert.ok(document.unsupportedFields.some(field => field.path === 'scene.autoTile.enabled'));
    assert.ok(document.unsupportedFields.some(field => field.path === 'scene.placements[].properties.autoTileGroup'));
  }
});

test('adapter rejects a modified or unsupported source snapshot instead of silently restoring it', () => {
  const document = adaptComposerDocument(beef, manifest);
  document.authoredSource.scene.zones[0].name = 'Tampered';
  assert.throws(() => restoreComposerDocument(document), /integrity check/);
  const changedCanonical = adaptComposerDocument(beef, manifest);
  changedCanonical.scene.zones[0].name = 'Changed';
  assert.throws(() => restoreComposerDocument(changedCanonical), /cannot save canonical edits/);
  assert.throws(() => restoreComposerDocument({adapterVersion: '2.0.0'}), /Unsupported or incomplete/);
});
