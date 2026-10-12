import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {assertBenchmarkReport} from '../scripts/benchmark-report.mjs';

const root = new URL('..', import.meta.url);
const repo = decodeURIComponent(root.pathname);
const run = (script, args = [], env = {}) => execFileSync(process.execPath, [script, ...args], {
  cwd: repo,
  encoding: 'utf8',
  env: {...process.env, ...env},
  maxBuffer: 32 * 1024 * 1024,
});

function assertMeasurements(report) {
  assertBenchmarkReport(report);
  for (const phase of Object.values(report.phases)) {
    for (const item of phase.measurements) {
      assert.equal(typeof item.source, 'string');
      assert.ok(item.source.trim());
      assert.ok(item.population !== undefined);
    }
  }
}

test('public benchmark adapters emit schema-valid envelopes and retain raw observations', async t => {
  const temp = await mkdtemp(join(os.tmpdir(), 'riose-benchmark-adapters-'));
  t.after(() => rm(temp, {recursive: true, force: true}));

  const animalPath = join(temp, 'animal.json');
  const animalSummary = JSON.parse(run('scripts/benchmark-animal-layout.mjs', [], {
    ANIMAL_LAYOUT_REPETITIONS: '5',
    ANIMAL_LAYOUT_OUTPUT: animalPath,
  }));
  const animal = JSON.parse(await readFile(animalPath, 'utf8'));
  assert.equal(animalSummary.resultPath, animalPath);
  assertMeasurements(animal);
  assert.equal(animal.workload.seed, 417);
  assert.deepEqual([...new Set(animal.results.rows.map(row => row.animals))], [100, 1000, 10000]);
  assert.deepEqual([...new Set(animal.results.rows.map(row => row.hour))], [7, 22]);
  assert.ok(animal.results.rows.every(row => row.complexity.productionCodeChanged === false));
  assert.equal(animal.results.rows.length, 6);
  assert.ok(animal.results.rows[0].measurements.aosEndToEnd.observations.length >= 5);
  assert.ok(animal.phases.engine.measurements[0].statistics.sampleCount >= 5);
  assert.ok(animal.phases.worker.measurements.length > 0);

  const scene = JSON.parse(run('scripts/measure-scene-adapter-v1.mjs'));
  assertMeasurements(scene);
  assert.equal(scene.results.results.length, 2);
  assert.ok(scene.results.results[0].observations.loadMs.length > 0);
  assert.ok(scene.results.results[0].observations.adaptMs.length > 0);

  const generated = JSON.parse(run('scripts/measure-generated-scene-adapter-v1.mjs', [], {
    GENERATED_SCENE_ADAPTER_WARMUPS: '1',
    GENERATED_SCENE_ADAPTER_REPETITIONS: '5',
  }));
  assertMeasurements(generated);
  assert.equal(generated.results.results.length, 2);
  assert.ok(generated.results.results[0].observations.generationMs.length >= 5);
  assert.ok(generated.results.results[0].observations.adaptationMs.length >= 5);

  const farmPath = join(temp, 'farm.json');
  const farm = JSON.parse(run('scripts/benchmark-farm-layout-generator.mjs', ['--output', farmPath], {
    FARM_LAYOUT_WARMUPS: '1',
    FARM_LAYOUT_REPETITIONS: '5',
  }));
  assertMeasurements(farm);
  assert.equal(farm.workload.seed, '417 + deterministic iteration index');
  assert.equal(farm.results.results.length, 3);
  assert.ok(farm.results.results[0].observations.generationMs.length >= 5);
  assert.deepEqual(JSON.parse(await readFile(farmPath, 'utf8')), farm);
});
