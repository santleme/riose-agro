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
    assert.equal(first.generation.assets.length > 0, true);
    assert.deepEqual(validateFarmLayout(first, {prefabs, manifest}), []);

    const otherSeed = generateFarmLayout({...input, seed: 418});
    assert.notEqual(otherSeed.generation.inputFingerprint, first.generation.inputFingerprint);
  }
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
