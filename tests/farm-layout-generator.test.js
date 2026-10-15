import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateFarmLayout, validateFarmLayout} from '../src/client/scenario-editor/scene-layout.js';

const [prefabDocument, manifest] = await Promise.all([
  readFile(new URL('../public/assets/scenario-editor/prefabs.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../public/assets/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const prefabs = prefabDocument.prefabs;

function containsPoint(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    if ((a.row > point.row) !== (b.row > point.row)
      && point.col < ((b.col - a.col) * (point.row - a.row)) / (b.row - a.row) + a.col) inside = !inside;
  }
  return inside;
}

test('seeded beef and dairy farm layouts are deterministic, traceable, and valid', () => {
  for (const scenarioType of ['beef', 'dairy']) {
    const input = {scenarioType, seed: 417, prefabs, manifest};
    const first = generateFarmLayout(input);
    const second = generateFarmLayout(input);
    assert.deepEqual(first, second);
    assert.equal(first.generation.model.used, false);
    assert.equal(first.generation.seed, 417);
    assert.equal(first.generation.generatorVersion, 3);
    assert.equal(first.generation.algorithm, 'seeded-spatial-grammar-v3');
    assert.equal(first.schemaVersion, 1, 'the generated scene format remains v1; only generator behavior is versioned');
    assert.equal(first.generation.assets.length > 0, true);
    assert.deepEqual(validateFarmLayout(first, {prefabs, manifest}), []);
    const instanceIds = [...first.placements, ...first.prefabInstances].map(item => item.id);
    assert.equal(new Set(instanceIds).size, instanceIds.length, 'every editable scene object has a unique ID');

    const otherSeed = generateFarmLayout({...input, seed: 418});
    assert.notEqual(otherSeed.generation.inputFingerprint, first.generation.inputFingerprint);
    assert.notDeepEqual(
      otherSeed.prefabInstances.filter(item => item.prefabId === 'water-point').map(({id, col, row}) => ({id, col, row})),
      first.prefabInstances.filter(item => item.prefabId === 'water-point').map(({id, col, row}) => ({id, col, row})),
      'the seed changes structural water-point placement, not only animal appearance',
    );
    assert.ok(first.prefabInstances.some(item => item.prefabId === (scenarioType === 'dairy' ? 'dairy-milking-base' : 'corral-scale')),
      'production-system-specific required facility is present');
  }
});

test('declared adjacency constraints direct deterministic module placement', () => {
  const constraints = [{type: 'must-be-adjacent', first: 'module-water-paddock-nw', second: 'module-water-paddock-ne'}];
  const input = {scenarioType: 'dairy', seed: 417, prefabs, manifest, constraints};
  const first = generateFarmLayout(input);
  const second = generateFarmLayout(input);
  const unconstrained = generateFarmLayout({...input, constraints: []});
  assert.deepEqual(first, second);
  assert.deepEqual(validateFarmLayout(first, {prefabs, manifest, constraints}), []);
  const a = first.prefabInstances.find(item => item.id === constraints[0].first);
  const b = first.prefabInstances.find(item => item.id === constraints[0].second);
  const prefabById = new Map(prefabs.map(item => [item.id, item]));
  const [aw, ah] = prefabById.get(a.prefabId).footprint;
  const [bw, bh] = prefabById.get(b.prefabId).footprint;
  const edgeAdjacent = ((a.col + aw === b.col || b.col + bw === a.col)
      && a.row < b.row + bh && a.row + ah > b.row)
    || ((a.row + ah === b.row || b.row + bh === a.row)
      && a.col < b.col + bw && a.col + aw > b.col);
  assert.equal(edgeAdjacent, true);
  const originalB = unconstrained.prefabInstances.find(item => item.id === constraints[0].second);
  assert.notDeepEqual([b.col, b.row], [originalB.col, originalB.row], 'the rule moved the module to satisfy the declared relation');
});

test('seed sweep preserves deterministic, collision-free in-bounds layouts for both systems', () => {
  for (const scenarioType of ['beef', 'dairy']) {
    for (let seed = 0; seed < 16; seed++) {
      const input = {scenarioType, seed, prefabs, manifest};
      const first = generateFarmLayout(input);
      const second = generateFarmLayout(input);
      assert.deepEqual(first, second, `${scenarioType} seed ${seed} must be reproducible`);
      assert.deepEqual(validateFarmLayout(first, {prefabs, manifest}), [], `${scenarioType} seed ${seed} must validate`);
      const ids = [...first.placements, ...first.prefabInstances].map(item => item.id);
      assert.equal(new Set(ids).size, ids.length, `${scenarioType} seed ${seed} must have unique editable IDs`);
    }
  }
});

test('generated systems contain their facilities, paddocks, access and shared service props', () => {
  const expected = {
    beef: ['farmstead', 'corral-scale', 'supplement-area', 'gateway-antenna'],
    dairy: ['farmstead', 'corral-scale', 'supplement-area', 'gateway-antenna', 'dairy-milking-base', 'dairy-calf-unit'],
  };
  const sharedAssets = [
    'water-pond-imagegen-v1', 'feed-trough-hay-imagegen-v1', 'feed-salt-roofed-imagegen-v1',
    'vehicle-tractor-imagegen-v1', 'vehicle-pickup-rural-imagegen-v1',
    'building-workshop-imagegen-v1', 'technology-traceability-system-imagegen-v1',
  ];

  for (const scenarioType of ['beef', 'dairy']) {
    const scene = generateFarmLayout({scenarioType, seed: 417, prefabs, manifest});
    const prefabIds = scene.prefabInstances.map(item => item.prefabId);
    for (const required of expected[scenarioType]) {
      assert.ok(prefabIds.includes(required), `${scenarioType} includes required ${required} facility`);
    }
    assert.equal(prefabIds.filter(id => id === 'water-point').length, 4, `${scenarioType} has one water point per paddock`);
    assert.equal(new Set(scene.placements.filter(item => item.assetId === 'fence-wire-wood-post-imagegen-v1').map(item => item.properties.autoTileGroup)).size, 4,
      `${scenarioType} has four independently editable paddock fence runs`);
    assert.ok(scene.placements.filter(item => item.layer === 'roads').length >= 30, `${scenarioType} has connected access roads`);
    for (const assetId of sharedAssets) {
      assert.ok(scene.placements.some(item => item.assetId === assetId), `${scenarioType} includes shared service asset ${assetId}`);
    }
    assert.ok(scene.zones.some(zone => zone.type === 'pasture'));
    assert.ok(scene.zones.some(zone => zone.type === 'service'));
    assert.deepEqual(validateFarmLayout(scene, {prefabs, manifest}), []);

    // Generated placements are ordinary scene objects: a user edit remains part
    // of the scene and can be revalidated before the Composer saves it.
    const edited = structuredClone(scene);
    const animal = edited.placements.find(item => item.layer === 'animals');
    animal.properties.visualState = 'resting';
    assert.deepEqual(validateFarmLayout(edited, {prefabs, manifest}), []);
    assert.equal(edited.placements.find(item => item.id === animal.id).properties.visualState, 'resting');
  }
});

test('safe-integer seed high bits affect structural placement instead of aliasing at 32 bits', () => {
  for (const scenarioType of ['beef', 'dairy']) {
    const lowSeed = generateFarmLayout({scenarioType, seed: 0, prefabs, manifest});
    const highSeed = generateFarmLayout({scenarioType, seed: 2 ** 32, prefabs, manifest});
    const waterPositions = scene => scene.prefabInstances
      .filter(item => item.prefabId === 'water-point')
      .map(({id, col, row}) => ({id, col, row}));
    assert.notDeepEqual(waterPositions(highSeed), waterPositions(lowSeed), `${scenarioType} must incorporate the high seed bits`);
    assert.deepEqual(validateFarmLayout(highSeed, {prefabs, manifest}), []);
    assert.deepEqual(highSeed, generateFarmLayout({scenarioType, seed: 2 ** 32, prefabs, manifest}));
  }
});

test('impossible declared adjacency constraints fail clearly and missing assets stay visible', () => {
  assert.throws(() => generateFarmLayout({
    scenarioType: 'beef', seed: 417, prefabs, manifest,
    constraints: [{type: 'must-be-adjacent', first: 'beef-farmstead', second: 'beef-corral-scale'}],
  }), /Generated farm layout is invalid:.*unsatisfied-constraint/);

  const incompleteManifest = {assets: manifest.assets.filter(item => item.id !== 'water-trough-round-imagegen-v1')};
  const scene = generateFarmLayout({scenarioType: 'beef', seed: 417, prefabs, manifest: incompleteManifest});
  assert.equal(scene.generation.assets.find(item => item.id === 'water-trough-round-imagegen-v1')?.status, 'unresolved');
  assert.ok(scene.generation.validation.some(item => item.code === 'unresolved-prefab-asset'));
});

test('layout validation reports out-of-bounds instances, collisions, and unsatisfied constraints', () => {
  const scene = generateFarmLayout({scenarioType: 'beef', seed: 417, prefabs, manifest});
  const invalid = structuredClone(scene);
  invalid.prefabInstances[0].row = invalid.grid.height;
  invalid.prefabInstances[1].col = invalid.prefabInstances[0].col;
  invalid.prefabInstances[1].row = invalid.prefabInstances[0].row;
  const diagnostics = validateFarmLayout(invalid, {
    prefabs,
    manifest,
    constraints: [{type: 'must-be-adjacent', first: 'missing-a', second: 'missing-b'}],
  });
  assert.ok(diagnostics.some(item => item.code === 'out-of-bounds'));
  assert.ok(diagnostics.some(item => item.code === 'blocking-collision'));
  assert.ok(diagnostics.some(item => item.code === 'unsatisfied-constraint'));
});

test('layout generation rejects unsupported production-system types', () => {
  assert.throws(() => generateFarmLayout({scenarioType: 'poultry', prefabs, manifest}), /Unsupported farm scenario/);
  assert.throws(() => generateFarmLayout({scenarioType: 'dairy', seed: '417', prefabs, manifest}), /safe integer/);
  assert.throws(() => generateFarmLayout({scenarioType: 'dairy', prefabs, manifest, constraints: {type: 'must-be-adjacent'}}), /constraints must be an array/);
  assert.throws(() => generateFarmLayout({scenarioType: 'dairy', prefabs: {}, manifest}), /prefabs must be an array/);
});

test('layout validation checks assigned placement zones and prefab child bounds', () => {
  const scene = generateFarmLayout({scenarioType: 'dairy', seed: 417, prefabs, manifest});
  const invalidZone = structuredClone(scene);
  const animal = invalidZone.placements.find(item => item.layer === 'animals');
  animal.properties.zoneId = 'zone-service';
  const zoneDiagnostics = validateFarmLayout(invalidZone, {prefabs, manifest});
  assert.ok(zoneDiagnostics.some(item => item.code === 'placement-outside-zone'));
  assert.ok(zoneDiagnostics.some(item => item.code === 'asset-zone-mismatch'));

  const invalidPrefabs = structuredClone(prefabs);
  const gateway = invalidPrefabs.find(item => item.id === 'gateway-antenna');
  gateway.placements[0].col = gateway.footprint[0] + 1;
  const footprintDiagnostics = validateFarmLayout(scene, {prefabs: invalidPrefabs, manifest});
  assert.ok(footprintDiagnostics.some(item => item.code === 'prefab-child-out-of-bounds'));

  const invalidPolygon = structuredClone(scene);
  invalidPolygon.zones[0].polygon[0].col = invalidPolygon.grid.width + 1;
  assert.ok(validateFarmLayout(invalidPolygon, {prefabs, manifest}).some(item => item.code === 'zone-out-of-bounds'));

  invalidPolygon.zones[0].polygon[1] = null;
  assert.doesNotThrow(() => validateFarmLayout(invalidPolygon, {prefabs, manifest}));
});

test('layout validation rejects duplicate instance IDs and placement footprints crossing zone edges', () => {
  const scene = generateFarmLayout({scenarioType: 'dairy', seed: 417, prefabs, manifest});
  const duplicateIdScene = structuredClone(scene);
  duplicateIdScene.placements[1].id = duplicateIdScene.placements[0].id;
  assert.ok(validateFarmLayout(duplicateIdScene, {prefabs, manifest}).some(item => item.code === 'duplicate-instance-id'));

  const crossingScene = structuredClone(scene);
  const animal = crossingScene.placements.find(item => item.layer === 'animals');
  animal.properties.zoneId = 'zone-pasture-north';
  animal.position = {col: 17.5, row: 3};
  assert.ok(validateFarmLayout(crossingScene, {prefabs, manifest}).some(item =>
    item.code === 'placement-outside-zone' && item.path === `$.placements[${crossingScene.placements.indexOf(animal)}]`));
});

test('concave zone edges cannot cut through a prefab footprint when sampled points remain inside', () => {
  const scene = generateFarmLayout({scenarioType: 'dairy', seed: 417, prefabs, manifest});
  const module = scene.prefabInstances.find(item => item.id === 'module-network');
  const service = scene.zones.find(zone => zone.id === 'zone-service');
  service.polygon = [
    {col: 19, row: 6}, {col: 20.5, row: 6}, {col: 20.5, row: 7.75},
    {col: 21.5, row: 7.75}, {col: 21.5, row: 6}, {col: 23, row: 6},
    {col: 23, row: 10}, {col: 19, row: 10},
  ];
  const samplePoints = [
    {col: module.col, row: module.row},
    {col: module.col + 2, row: module.row},
    {col: module.col, row: module.row + 2},
    {col: module.col + 2, row: module.row + 2},
    {col: module.col + 1, row: module.row + 1},
  ];
  assert.ok(samplePoints.every(point => containsPoint(point, service.polygon)));
  assert.ok(validateFarmLayout(scene, {prefabs, manifest}).some(item =>
    item.code === 'prefab-zone-mismatch' && item.path === '$.prefabInstances[4]'));
});
