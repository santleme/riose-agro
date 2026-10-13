import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import {generateFarmLayout, validateFarmLayout} from '../public/assets/scenario-editor/scene-layout.js';
import {
  adaptGeneratedFarmLayoutDocument,
  GENERATED_LAYOUT_SOURCE_FORMAT,
  restoreGeneratedFarmLayoutDocument,
} from '../graphics-poc/scene-adapter-v1.js';

const [prefabs, composerManifest, rendererManifest, schema] = await Promise.all([
  readFile(new URL('../public/assets/scenario-editor/prefabs.json', import.meta.url), 'utf8').then(text => JSON.parse(text).prefabs),
  readFile(new URL('../public/assets/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../schemas/visual-scene.schema.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const validateCanonical = new Ajv2020({allErrors: true, strict: true, strictRequired: false}).compile(schema);

test('generated beef and dairy Composer layouts adapt deterministically to valid canonical scenes', () => {
  for (const scenarioType of ['beef', 'dairy']) {
    const source = generateFarmLayout({scenarioType, seed: 417, prefabs, manifest: composerManifest});
    assert.deepEqual(validateFarmLayout(source, {prefabs, manifest: composerManifest}), []);
    const first = adaptGeneratedFarmLayoutDocument(source, rendererManifest, prefabs, composerManifest);
    const second = adaptGeneratedFarmLayoutDocument(source, rendererManifest, prefabs, composerManifest);
    assert.deepEqual(first, second);
    assert.equal(first.adapterVersion, '1.0.0');
    assert.equal(first.sourceFormat.formatId, GENERATED_LAYOUT_SOURCE_FORMAT);
    assert.equal(validateCanonical(first.scene), true, JSON.stringify(validateCanonical.errors));
    assert.equal(first.sourceFormat.expandedPlacementCount, source.placements.length
      + source.prefabInstances.reduce((count, instance) => count + prefabs.find(item => item.id === instance.prefabId).placements.length, 0));
    assert.deepEqual(first.sourceFormat.ids.zoneIds, source.zones.map(zone => zone.id));
    assert.deepEqual(first.sourceFormat.ids.placementIds, source.placements.map(item => item.id));
    assert.deepEqual(first.sourceFormat.ids.prefabInstanceIds, source.prefabInstances.map(item => item.id));
    const authoredAssetIds = new Set(source.placements.map(item => item.assetId));
    for (const instance of source.prefabInstances) {
      for (const child of prefabs.find(item => item.id === instance.prefabId).placements) authoredAssetIds.add(child.assetId);
    }
    assert.deepEqual(first.sourceFormat.ids.assetIds, [...authoredAssetIds].sort());
    assert.equal(first.scene.provenance, undefined, 'no fabricated source commit is added to the canonical scene');
  }
});

test('generated layout restoration preserves exact source zones, IDs, assets, and generator metadata', () => {
  const constraints = [{type: 'must-be-adjacent', first: 'module-water-paddock-nw', second: 'module-water-paddock-ne'}];
  const source = generateFarmLayout({scenarioType: 'dairy', seed: 417, prefabs, manifest: composerManifest, constraints});
  const document = adaptGeneratedFarmLayoutDocument(source, rendererManifest, prefabs, composerManifest);
  assert.deepEqual(restoreGeneratedFarmLayoutDocument(document), source);
  assert.deepEqual(document.authoredSource.zones, source.zones);
  assert.deepEqual(document.authoredSource.placements.map(item => item.assetId), source.placements.map(item => item.assetId));
  assert.ok(document.unsupportedFields.some(item => item.path === 'scene.generation.generatorVersion'));
  assert.ok(document.unsupportedFields.some(item => item.path === 'scene.generation.algorithm'));
  assert.ok(document.unsupportedFields.some(item => item.path === 'scene.generation.constraints.0.type'));

  const withUnknownGenerationField = structuredClone(source);
  withUnknownGenerationField.generation.futurePolicy = {mode: 'opaque'};
  const futureDocument = adaptGeneratedFarmLayoutDocument(withUnknownGenerationField, rendererManifest, prefabs, composerManifest);
  assert.ok(futureDocument.unsupportedFields.some(item => item.path === 'scene.generation.futurePolicy.mode'));
});

test('generated adapter rejects source and canonical tampering and invalid generated layouts', () => {
  const source = generateFarmLayout({scenarioType: 'beef', seed: 417, prefabs, manifest: composerManifest});
  const changedSource = structuredClone(source);
  changedSource.zones[0].name = 'Modified';
  const document = adaptGeneratedFarmLayoutDocument(source, rendererManifest, prefabs, composerManifest);
  assert.throws(() => restoreGeneratedFarmLayoutDocument({...document, authoredSource: changedSource}), /integrity check/);
  const changedCanonical = structuredClone(document);
  changedCanonical.scene.name = 'Modified';
  assert.throws(() => restoreGeneratedFarmLayoutDocument(changedCanonical), /cannot be rewritten/);
  const invalidLayout = structuredClone(source);
  invalidLayout.prefabInstances[0].col = invalidLayout.grid.width;
  assert.throws(() => adaptGeneratedFarmLayoutDocument(invalidLayout, rendererManifest, prefabs, composerManifest), /Generated Composer layout is invalid/);
});
