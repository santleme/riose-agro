import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {benchmarkFarmLayouts} from '../scripts/benchmark-farm-layout.mjs';

const [prefabDocument, manifest] = await Promise.all([
  readFile(new URL('../public/assets/scenario-editor/prefabs.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../public/assets/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
]);

test('farm layout benchmark reports timed, validated beef and dairy placement counts', () => {
  const report = benchmarkFarmLayouts({prefabs: prefabDocument.prefabs, manifest, repetitions: 2, warmups: 0, seed: 417});
  assert.equal(report.benchmark, 'seeded-farm-layout-generation');
  assert.equal(report.methodology.seed, 417);
  assert.equal(report.methodology.repetitionsPerSystem, 2);
  assert.deepEqual(report.results.map(result => result.scenarioType), ['beef', 'dairy']);
  for (const result of report.results) {
    assert.ok(result.placementCount > 0);
    assert.ok(result.prefabInstanceCount > 0);
    assert.equal(result.editableObjectCount, result.placementCount + result.prefabInstanceCount);
    assert.equal(result.validationDiagnosticCount, 0);
    assert.equal(result.generationTimeMs.samples.length, 2);
    assert.ok(result.generationTimeMs.median >= 0);
    assert.ok(result.generationTimeMs.p95 >= result.generationTimeMs.median);
    assert.match(result.inputFingerprint, /^fnv1a32-[0-9a-f]{8}$/);
  }
});

test('farm layout benchmark validates its sample configuration', () => {
  assert.throws(() => benchmarkFarmLayouts({prefabs: prefabDocument.prefabs, manifest, repetitions: 0}), /positive integer/);
  assert.throws(() => benchmarkFarmLayouts({prefabs: {}, manifest}), /requires prefabs and manifest/);
});
