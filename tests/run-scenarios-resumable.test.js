import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digestResultRecordBytes, sha256Digest} from '../experiments/batch-manifest.js';
import {runScenarioDirectoryResumable} from '../scripts/run-scenarios.js';
import {executeScenario} from '../scripts/run-scenarios.js';
import {ScenarioWorkerPool} from '../scripts/scenario-worker-pool.js';
import {ENGINE_SOURCE_FILES} from '../src/client/engine-provenance.js';

test('scenario directory runner resumes verified records and reruns a corrupt per-scenario result', async t => {
  const root = await mkdtemp(join(tmpdir(), 'riose-scenario-resume-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const scenarios = join(root, 'scenarios'), results = join(root, 'results');
  const {mkdir} = await import('node:fs/promises');
  await mkdir(scenarios, {recursive: true});
  const fixture = await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8');
  await writeFile(join(scenarios, 'baseline.json'), fixture);

  const first = await runScenarioDirectoryResumable(scenarios, results);
  assert.equal(first.length, 1);
  assert.equal(first[0].passed, true);
  const resultPath = join(results, 'baseline.result.json');
  const firstResult = JSON.parse(await readFile(resultPath, 'utf8'));
  assert.equal(firstResult.passed, true);

  const manifestPath = join(results, 'batch-manifest.json');
  const resultJournalPath = join(results, 'batch-results.jsonl');
  const manifestBefore = JSON.parse(await readFile(manifestPath, 'utf8'));
  const engineSources = Object.fromEntries(await Promise.all(ENGINE_SOURCE_FILES.map(async name => [
    name, await readFile(new URL(`../src/client/${name}`, import.meta.url), 'utf8'),
  ])));
  assert.equal(manifestBefore.runs[0].scenarioFormat, 'riose-scenario-harness');
  assert.equal(manifestBefore.runs[0].scenarioVersion, 1);
  assert.equal(manifestBefore.runs[0].scenarioId, 'baseline-pasture');
  assert.equal(manifestBefore.runs[0].scenarioRef, 'baseline.json');
  assert.equal(manifestBefore.runs[0].engine.buildDigest, sha256Digest(engineSources));
  assert.deepEqual(manifestBefore.runs[0].models, []);
  assert.equal(manifestBefore.runs[0].resultDigest, digestResultRecordBytes((await readFile(resultJournalPath, 'utf8')).split('\n')[0]));
  await runScenarioDirectoryResumable(scenarios, results);
  assert.equal((await readFile(resultJournalPath, 'utf8')).trim().split('\n').length, 1);

  await writeFile(resultPath, '{corrupted');
  const repaired = await runScenarioDirectoryResumable(scenarios, results);
  assert.equal(repaired[0].passed, true);
  assert.deepEqual(JSON.parse(await readFile(resultPath, 'utf8')), firstResult);
  const manifestAfter = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifestAfter.runs[0].status, 'completed');
  assert.equal(manifestBefore.runs[0].outputDigest, manifestAfter.runs[0].outputDigest);
});

test('automatic scenario execution uses an exact measured concurrency profile and reports its choice', async t => {
  const root = await mkdtemp(join(tmpdir(), 'riose-scenario-auto-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const scenarios = join(root, 'scenarios'), results = join(root, 'results');
  const {mkdir} = await import('node:fs/promises');
  await mkdir(scenarios, {recursive: true});
  const fixture = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));
  await writeFile(join(scenarios, 'baseline.json'), JSON.stringify(fixture));
  const executorProfile = {version: 'riose-executor-profile/1', environment: {
    platform: process.platform, arch: process.arch, node: process.version, cpu: os.cpus()[0]?.model,
  }, records: [{operation: 'scenario-batch', scenarioCount: 1, animalCount: 3, hours: 24,
    backend: 'local-js', concurrency: 2, p95EndToEndMs: 10, peakRssBytes: 100_000_000,
    estimatedCostUsd: 0, parity: 'passed', status: 'measured'}]};
  let selected;
  const output = await runScenarioDirectoryResumable(scenarios, results, {concurrency: 'auto', executorProfile,
    onExecutorSelection: choice => { selected = choice; }});
  assert.equal(selected.backend, 'local-js');
  assert.equal(selected.concurrency, 2);
  assert.equal(output[0].passed, true);
});

test('worker execution preserves serial scenario and seed indexed outputs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'riose-scenario-workers-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const scenarios = join(root, 'scenarios'), results = join(root, 'results');
  const {mkdir} = await import('node:fs/promises');
  await mkdir(scenarios, {recursive: true});
  const fixture = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));
  const expected = [];
  for (const [index, seed] of [41, 42, 43].entries()) {
    const scenario = structuredClone(fixture);
    scenario.scenarioId = `seed-${seed}`;
    scenario.engine.seed = seed;
    const file = `case-${index}.json`;
    await writeFile(join(scenarios, file), JSON.stringify(scenario));
    expected.push({file, ...executeScenario(scenario)});
  }
  const pool = new ScenarioWorkerPool(2, {maxOldGenerationSizeMb: 128});
  t.after(() => pool.close());
  await pool.ready();
  const parallel = await runScenarioDirectoryResumable(scenarios, results, {concurrency: 2, workerMemoryLimitMb: 128, workerPool: pool});
  assert.deepEqual(parallel, expected);
  assert.equal((await pool.execute(fixture)).passed, true);
  const manifest = JSON.parse(await readFile(join(results, 'batch-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.runs.map(run => [run.runId, run.seed]), [['case-0.json', 41], ['case-1.json', 42], ['case-2.json', 43]]);
});

test('concurrent execution requires an explicit per-worker memory cap', async () => {
  await assert.rejects(() => runScenarioDirectoryResumable('/missing', '/unused', {concurrency: 2}), /workerMemoryLimitMb/);
});

test('worker pool releases its slot after a structured-clone error and continues', async t => {
  const pool = new ScenarioWorkerPool(1, {maxOldGenerationSizeMb: 128});
  t.after(() => pool.close());
  await assert.rejects(() => pool.execute({notCloneable() {}}), /could not be cloned/i);
  const scenario = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));
  const result = await pool.execute(scenario);
  assert.equal(result.passed, true);
});
