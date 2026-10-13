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
    assert.equal(first.scene.representationRole, 'authored-preservation');
    assert.ok(first.scene.entities.some(entity => entity.representationMode === 'sampled-miniature'));
    if (source === dairy) {
      assert.equal(first.scene.simulation.initialConditions.layoutOnly, true);
      assert.equal(first.scene.domainModule.status, 'in-progress');
      assert.deepEqual(first.scene.domainModule.modelIds, []);
    }
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
    assert.ok(document.unsupportedFields.some(field => field.path === 'scene.placements[0].properties.autoTileGroup'));
  }
});

test('Composer snapshot digest treats parsed object key order as non-semantic', () => {
  const document = adaptComposerDocument(beef, manifest);
  document.authoredSource = Object.fromEntries(Object.entries(document.authoredSource).reverse());
  document.authoredSource.scene = Object.fromEntries(Object.entries(document.authoredSource.scene).reverse());
  assert.deepStrictEqual(restoreComposerDocument(document), beef);
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

test('Composer v1 accepts only its declared source version and projection', () => {
  assert.doesNotThrow(() => adaptComposerDocument(beef, manifest));
  const unsupportedVersion = structuredClone(beef);
  unsupportedVersion.scene.schemaVersion = 99;
  assert.throws(() => adaptComposerDocument(unsupportedVersion, manifest), /Unsupported Composer source schemaVersion/);
  const unsupportedProjection = structuredClone(beef);
  unsupportedProjection.scene.grid.projection = 'orthographic';
  assert.throws(() => adaptComposerDocument(unsupportedProjection, manifest), /Unsupported Composer projection/);
  const missingProjection = structuredClone(beef);
  delete missingProjection.scene.grid.projection;
  assert.throws(() => adaptComposerDocument(missingProjection, manifest), /Unsupported Composer projection/);
});

test('Composer rejects duplicate asset and semantic IDs and missing required footprints', () => {
  const duplicateAssetId = structuredClone(manifest);
  duplicateAssetId.assets.push(structuredClone(duplicateAssetId.assets[0]));
  assert.throws(() => adaptComposerDocument(beef, duplicateAssetId), /duplicate manifest asset IDs/);

  const duplicateSemanticId = structuredClone(manifest);
  duplicateSemanticId.assets[1].sourceSemanticId = duplicateSemanticId.assets[0].sourceSemanticId;
  assert.throws(() => adaptComposerDocument(beef, duplicateSemanticId), /duplicate manifest semantic IDs/);

  const missingFootprint = structuredClone(manifest);
  const infrastructureAssetId = beef.expandedPlacements.find(item => !['terrain', 'animals'].includes(item.layer)).assetId;
  delete missingFootprint.assets.find(item => item.assetId === infrastructureAssetId).footprint;
  assert.throws(() => adaptComposerDocument(beef, missingFootprint), /Missing or invalid required footprint/);
});

test('Composer preserves and reports unknown visual state, unsupported rotation and nested coordinate fields', () => {
  const authored = structuredClone(beef);
  const animal = authored.expandedPlacements.find(item => item.layer === 'animals');
  animal.properties.visualState = 'hovering';
  animal.rotation = 37;
  animal.position.futureAxis = 12;
  authored.scene.zones[0].polygon[0].futureAxis = 44;
  const terrain = authored.expandedPlacements.find(item => item.layer === 'terrain');
  terrain.rotation = 90;
  const document = adaptComposerDocument(authored, manifest);
  const byPath = new Map(document.unsupportedFields.map(item => [item.path, item]));
  assert.equal(document.scene.entities.find(item => item.visualId === animal.properties.visualId).state.stateId, 'hovering');
  assert.equal(byPath.get(`expandedPlacements[${authored.expandedPlacements.indexOf(animal)}].properties.visualState`).disposition, 'unsupported');
  assert.equal(byPath.get(`expandedPlacements[${authored.expandedPlacements.indexOf(animal)}].rotation`).disposition, 'unsupported');
  assert.ok(byPath.has(`expandedPlacements[${authored.expandedPlacements.indexOf(animal)}].position.futureAxis`));
  assert.ok(byPath.has('scene.zones[0].polygon[0].futureAxis'));
  assert.ok(byPath.has(`expandedPlacements[${authored.expandedPlacements.indexOf(terrain)}].rotation`));
  assert.deepEqual(restoreComposerDocument(document), authored);
});

test('Composer rejects malformed coordinates, duplicate source IDs and broken visual references', () => {
  const malformedCoordinates = structuredClone(beef);
  malformedCoordinates.expandedPlacements[0].position.col = Number.POSITIVE_INFINITY;
  assert.throws(() => adaptComposerDocument(malformedCoordinates, manifest), /Invalid Composer coordinate pair/);

  const duplicateZones = structuredClone(beef);
  duplicateZones.scene.zones[1].id = duplicateZones.scene.zones[0].id;
  assert.throws(() => adaptComposerDocument(duplicateZones, manifest), /duplicate zone IDs/);

  const brokenReference = structuredClone(beef);
  brokenReference.scene.visualGroups[0].zoneId = 'missing-zone';
  assert.throws(() => adaptComposerDocument(brokenReference, manifest), /references missing zone/);

  const ambiguousDuplicate = structuredClone(beef);
  ambiguousDuplicate.expandedPlacements.push(structuredClone(ambiguousDuplicate.expandedPlacements[0]));
  assert.throws(() => adaptComposerDocument(ambiguousDuplicate, manifest), /Ambiguous duplicate Composer placement ID/);
});

test('Composer provenance uses manifest source metadata and is omitted when unverifiable', () => {
  const committed = adaptComposerDocument(beef, manifest);
  assert.equal(committed.scene.provenance.sourceCommit, manifest.sourceRevision.assetManifestCommit);
  const withoutRevision = structuredClone(manifest);
  delete withoutRevision.sourceRevision.assetManifestCommit;
  const unverified = adaptComposerDocument(beef, withoutRevision);
  assert.equal(unverified.scene.provenance, undefined);
});
