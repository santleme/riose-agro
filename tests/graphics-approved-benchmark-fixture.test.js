import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  APPROVED_BENCHMARK_FIXTURE_ID,
  classifyBenchmarkSceneAssets,
  classifyLegacyBenchmarkImageResources,
  createApprovedBenchmarkFixture,
} from '../graphics-poc/benchmark-fixture.js';
import {classifyWebGlAdapterInfo} from '../graphics-poc/gpu-preflight.js';

const [scene, fixtureConfig, sourceManifest, renderManifest] = await Promise.all([
  readFile(new URL('../graphics-poc/scene.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../graphics-poc/benchmark-approved-scene.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../graphics-poc/asset-sources.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
]);

test('the current benchmark scene uses only released project-owned runtime assets', () => {
  const assets = classifyBenchmarkSceneAssets(scene, sourceManifest, renderManifest);
  const byStatus = assets.reduce((groups, asset) => ((groups[asset.classification] ??= []).push(asset), groups), {});

  assert.equal(assets.find(asset => asset.assetId === 'nelore-adult')?.classification, 'APPROVED');
  assert.equal(assets.find(asset => asset.assetId === 'nelore-adult-low')?.classification, 'APPROVED');
  assert.equal(byStatus.REVIEW?.length ?? 0, 0);
  assert.equal(byStatus.UNRESOLVED?.length ?? 0, 0);
  assert.equal(byStatus.REJECTED?.length ?? 0, 0);
});

test('legacy image paths are not classified as runtime release inputs', () => {
  const resources = classifyLegacyBenchmarkImageResources(sourceManifest, renderManifest);
  const byId = new Map(resources.map(resource => [resource.resourceId, resource]));

  assert.equal(byId.get('nelore-adult')?.classification, 'APPROVED');
  assert.equal(byId.get('farm-starter-atlas')?.classification, 'UNRESOLVED');
  assert.equal(byId.get('handling-review-atlas-v1')?.classification, 'UNRESOLVED');
  assert.equal(byId.get('dairy-heifer')?.classification, 'UNRESOLVED');
  assert.ok(resources.some(resource => resource.resourceId === 'synthetic-release' && resource.classification === 'APPROVED'));
});

test('builds an approved-only fixture while preserving simulation, projection, and culling geometry', () => {
  const original = structuredClone(scene);
  const fixture = createApprovedBenchmarkFixture(scene, fixtureConfig, sourceManifest, renderManifest);

  assert.equal(fixture.fixtureId, APPROVED_BENCHMARK_FIXTURE_ID);
  assert.deepEqual(fixture.approvedAssetIds, ['nelore-adult']);
  assert.deepEqual(fixture.benchmarkAssets.map(asset => asset.assetId), ['nelore-adult', 'nelore-adult-low']);
  assert.equal(fixture.benchmarkAssets.every(asset => asset.classification === 'APPROVED'), true);
  assert.deepEqual(fixture.scene.simulation, original.simulation);
  assert.deepEqual(fixture.scene.projection, original.projection);
  assert.deepEqual(fixture.scene.zones, original.zones.map(({groundAssetId, transitionAssetIds, ...zone}) => zone));
  assert.deepEqual(fixture.scene.prefabs, []);
  assert.deepEqual(fixture.scene.entities, []);
  assert.deepEqual(fixture.scene.terrainTiles, []);
  assert.ok(fixture.excludedSceneAssets.every(asset => asset.classification === 'APPROVED'));
  assert.deepEqual(scene, original, 'building the fixture does not mutate the product/source scene');
});

test('rejects unapproved, review, or unresolved benchmark fixture inputs', () => {
  const reviewSource = structuredClone(sourceManifest);
  reviewSource.assetSources.find(asset => asset.assetId === 'nelore-adult').status = 'REVIEW';
  assert.throws(() => createApprovedBenchmarkFixture(scene, fixtureConfig, reviewSource, renderManifest), /not explicitly approved/);

  const invalidAsset = {...fixtureConfig, approvedAssetIds: ['farm-starter-atlas']};
  assert.throws(() => createApprovedBenchmarkFixture(scene, invalidAsset, sourceManifest, renderManifest), /only the approved Nelore/);

  assert.throws(() => createApprovedBenchmarkFixture(scene, {...fixtureConfig, fixtureId: 'unknown'}, sourceManifest, renderManifest), /Unsupported approved benchmark fixture/);
});

test('GPU preflight accepts only an identified non-software NVIDIA GTX 1060 renderer', () => {
  assert.equal(classifyWebGlAdapterInfo({available: true, vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1060/PCIe/SSE2', unmasked: true}).identifiesGtx1060, true);
  for (const renderer of ['Google SwiftShader', 'llvmpipe (LLVM 18.1.8)', 'Software Rasterizer']) {
    const info = classifyWebGlAdapterInfo({available: true, vendor: 'Google Inc.', renderer});
    assert.equal(info.softwareFallback, true, renderer);
    assert.equal(info.identifiesGtx1060, false, renderer);
  }
  assert.equal(classifyWebGlAdapterInfo({available: true, vendor: 'WebKit', renderer: 'WebKit WebGL'}).identifiesGtx1060, false);
});
