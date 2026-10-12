import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBatchExperimentManifest, digestScenario, sha256Digest, validateBatchExperimentManifest} from '../experiments/batch-manifest.js';
import {runResumableBatch} from '../experiments/resumable-journal.js';

function plannedRun(runId) {
  const scenario = {scenarioId: runId, hours: 24};
  return {
    runId, scenarioId: runId, scenarioDigest: digestScenario(scenario), seed: 17,
    engine: {id: 'farm-engine', version: '1', buildDigest: sha256Digest('engine'), status: 'provided'},
    models: [], datasets: [], evidence: [], inputs: {hours: {value: 24, unit: 'h'}}, outputs: {},
    status: 'planned', outputDigest: null, resultRef: null,
  };
}

async function setup(t, runs = ['r1', 'r2', 'r3']) {
  const dir = await mkdtemp(join(tmpdir(), 'riose-run-journal-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  return {
    manifestPath: join(dir, 'manifest.json'),
    resultsPath: join(dir, 'results.jsonl'),
    errorsPath: join(dir, 'errors.jsonl'),
    manifest: createBatchExperimentManifest({experimentId: 'journal-test', createdAt: '2026-10-12T12:00:00.000Z', runs: runs.map(plannedRun)}),
  };
}

test('writes the plan first, then atomically journals each completed run and skips verified outputs on resume', async t => {
  const options = await setup(t);
  const called = [];
  const first = await runResumableBatch({...options, executeRun: async run => {
    called.push(run.runId);
    assert.equal(JSON.parse(await readFile(options.manifestPath, 'utf8')).runs.find(item => item.runId === run.runId).status, 'running');
    return {gain: {value: 10 + called.length, unit: 'kg/day'}};
  }});
  assert.deepEqual(called, ['r1', 'r2', 'r3']);
  assert.equal(first.completedRuns, 3);
  assert.equal(first.results.length, 3);
  validateBatchExperimentManifest(first.manifest);

  const resumedCalls = [];
  const resumed = await runResumableBatch({...options, executeRun: async run => { resumedCalls.push(run.runId); return {}; }});
  assert.deepEqual(resumedCalls, []);
  assert.equal(resumed.completedRuns, 3);
});

test('rejects a resume when engine identity or declared inputs changed', async t => {
  const options = await setup(t, ['r1']);
  await runResumableBatch({...options, executeRun: async () => ({gain: {value: 3, unit: 'kg/day'}})});
  const changedRun = {...options.manifest.runs[0], engine: {...options.manifest.runs[0].engine, version: '2'}};
  const changedPlan = createBatchExperimentManifest({experimentId: options.manifest.experimentId, createdAt: options.manifest.createdAt, runs: [changedRun]});
  await assert.rejects(() => runResumableBatch({...options, manifest: changedPlan, executeRun: async () => ({})}), /plan does not match/);
});

test('an interruption after the durable running status restarts only the unfinished runs', async t => {
  const options = await setup(t);
  await assert.rejects(() => runResumableBatch({...options,
    executeRun: async () => ({gain: {value: 7, unit: 'kg/day'}}),
    onProgress: ({runId, status}) => { if (runId === 'r2' && status === 'running') throw new Error('simulated process interruption'); },
  }), /simulated process interruption/);
  const interrupted = JSON.parse(await readFile(options.manifestPath, 'utf8'));
  assert.deepEqual(interrupted.runs.map(run => run.status), ['completed', 'running', 'planned']);
  const called = [];
  const resumed = await runResumableBatch({...options, executeRun: async run => { called.push(run.runId); return {gain: {value: 8, unit: 'kg/day'}}; }});
  assert.deepEqual(called, ['r2', 'r3']);
  assert.equal(resumed.completedRuns, 3);
});

test('a digest mismatch or corrupt JSONL row is discarded and the run safely reruns', async t => {
  const options = await setup(t, ['r1']);
  await runResumableBatch({...options, executeRun: async () => ({gain: {value: 1, unit: 'kg/day'}})});
  const records = (await readFile(options.resultsPath, 'utf8')).trim().split('\n');
  records.push('{broken json');
  const record = JSON.parse(records[0]);
  record.outputDigest = sha256Digest({gain: {value: 999, unit: 'kg/day'}});
  await writeFile(options.resultsPath, `${JSON.stringify(record)}\n${records[1]}\n`);
  let runs = 0;
  const resumed = await runResumableBatch({...options, executeRun: async () => { runs++; return {gain: {value: 2, unit: 'kg/day'}}; }});
  assert.equal(runs, 1);
  assert.equal(resumed.manifest.runs[0].outputs.gain.value, 2);
  assert.equal((await readFile(options.resultsPath, 'utf8')).trim().split('\n').length, 1);
});

test('a middle run failure is recorded and does not stop unrelated runs', async t => {
  const options = await setup(t);
  const calls = [];
  const result = await runResumableBatch({...options, executeRun: async run => {
    calls.push(run.runId);
    if (run.runId === 'r2') throw new Error('synthetic failure');
    return {gain: {value: 12, unit: 'kg/day'}};
  }});
  assert.deepEqual(calls, ['r1', 'r2', 'r3']);
  assert.deepEqual(result.manifest.runs.map(run => run.status), ['completed', 'failed', 'completed']);
  const errors = JSON.parse((await readFile(options.errorsPath, 'utf8')).trim());
  assert.equal(errors.runId, 'r2');
  assert.equal(errors.message, 'synthetic failure');
  let retried = false;
  const resumed = await runResumableBatch({...options, executeRun: async run => { assert.equal(run.runId, 'r2'); retried = true; return {gain: {value: 13, unit: 'kg/day'}}; }});
  assert.equal(retried, true);
  assert.deepEqual(resumed.manifest.runs.map(run => run.status), ['completed', 'completed', 'completed']);
});

test('completed result retention can be bounded without changing durable records', async t => {
  const options = await setup(t);
  const result = await runResumableBatch({...options, maxRetainedResults: 1, executeRun: async () => ({gain: {value: 12, unit: 'kg/day'}})});
  assert.equal(result.results.length, 1);
  assert.equal(result.completedRuns, 3);
  assert.equal((await readFile(options.resultsPath, 'utf8')).trim().split('\n').length, 3);
});
