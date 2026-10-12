import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateFarmLayout, validateFarmLayout} from '../public/assets/scenario-editor/scene-layout.js';

const [prefabDocument, manifest] = await Promise.all([
  readFile(new URL('../public/assets/scenario-editor/prefabs.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../public/assets/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const prefabs = prefabDocument.prefabs;

test('seeded beef and dairy farm layouts are deterministic, traceable, and valid', () => {
  for (const scenarioType of ['beef', 'dairy']) {
    const input = {scenarioType, seed: 417, prefabs, manifest};
    const first = generateFarmLayout(input);
    const second = generateFarmLayout(input);
    assert.deepEqual(first, second);
    assert.equal(first.generation.model.used, false);
    assert.equal(first.generation.seed, 417);
    assert.equal(first.generation.generatorVersion, 2);
    assert.equal(first.generation.algorithm, 'seeded-spatial-grammar-v2');
    assert.equal(first.schemaVersion, 1, 'the generated scene format remains v1; only generator behavior is versioned');
    assert.equal(first.generation.assets.length > 0, true);
    assert.deepEqual(validateFarmLayout(first, {prefabs, manifest}), []);

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
});
