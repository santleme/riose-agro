import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBatchExperimentManifest, digestResultRecordBytes, digestScenario, sha256Digest, validateBatchExperimentManifest, verifyExperimentResults} from '../scripts/experiments/batch-manifest.js';
import {runResumableBatch} from '../scripts/experiments/resumable-journal.js';

function plannedRun(runId) {
  const scenario = {scenarioId: runId, hours: 24};
  return {
    runId, scenarioFormat: 'riose-scenario-harness', scenarioVersion: 1, scenarioId: runId, scenarioRef: `scenarios/${runId}.json`, scenarioDigest: digestScenario(scenario), seed: 17,
    engine: {id: 'farm-engine', version: '1', buildDigest: sha256Digest('engine'), status: 'provided'},
    models: [], datasets: [], evidence: [], inputs: {hours: {value: 24, unit: 'h'}}, outputs: {},
    status: 'planned', outputDigest: null, resultDigest: null, resultRef: null,
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

test('writes the plan first, journals each completion and skips verified outputs on resume', async t => {
  const options = await setup(t);
  const called = [];
  const first = await runResumableBatch({...options, executeRun: async run => {
    called.push(run.runId);
    assert.equal(run.status, 'running');
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

test('an interruption before a manifest checkpoint recovers durable journal rows and runs only unfinished work', async t => {
  const options = await setup(t);
  await assert.rejects(() => runResumableBatch({...options,
    executeRun: async () => ({gain: {value: 7, unit: 'kg/day'}}),
    onProgress: ({runId, status}) => { if (runId === 'r2' && status === 'running') throw new Error('simulated process interruption'); },
  }), /simulated process interruption/);
  const interrupted = JSON.parse(await readFile(options.manifestPath, 'utf8'));
  assert.deepEqual(interrupted.runs.map(run => run.status), ['planned', 'planned', 'planned']);
  const called = [];
  const resumed = await runResumableBatch({...options, executeRun: async run => { called.push(run.runId); return {gain: {value: 8, unit: 'kg/day'}}; }});
  assert.deepEqual(called, ['r2', 'r3']);
  assert.equal(resumed.completedRuns, 3);
});

test('manifest updates are checkpointed in configured groups while every result is journaled immediately', async t => {
  const options = await setup(t, ['r1', 'r2', 'r3']);
  const manifestStates = [];
  const result = await runResumableBatch({...options, manifestCheckpointInterval: 2,
    executeRun: async run => ({gain: {value: Number(run.runId.slice(1)), unit: 'kg/day'}}),
    onProgress: async ({status}) => {
      if (status === 'completed') {
        manifestStates.push(JSON.parse(await readFile(options.manifestPath, 'utf8')).runs.map(run => run.status));
        assert.equal((await readFile(options.resultsPath, 'utf8')).trim().split('\n').length, manifestStates.length);
      }
    },
  });
  assert.deepEqual(manifestStates, [
    ['planned', 'planned', 'planned'],
    ['completed', 'completed', 'planned'],
    ['completed', 'completed', 'planned'],
  ]);
  assert.equal(result.completedRuns, 3);
  assert.deepEqual(result.manifest.runs.map(run => run.status), ['completed', 'completed', 'completed']);
});

test('resume verifies multiple planned journal rows after interruption within a checkpoint group', async t => {
  const options = await setup(t, ['r1', 'r2', 'r3']);
  await assert.rejects(() => runResumableBatch({...options, manifestCheckpointInterval: 3,
    executeRun: async run => ({gain: {value: Number(run.runId.slice(1)), unit: 'kg/day'}}),
    onProgress: ({runId, status}) => { if (runId === 'r2' && status === 'completed') throw new Error('interrupted before checkpoint'); },
  }), /interrupted before checkpoint/);
  assert.deepEqual(JSON.parse(await readFile(options.manifestPath, 'utf8')).runs.map(run => run.status), ['planned', 'planned', 'planned']);

  const verifiedStatuses = [];
  const executed = [];
  const result = await runResumableBatch({...options, manifestCheckpointInterval: 3,
    verifyCompletedRun: async run => { verifiedStatuses.push(run.status); return true; },
    executeRun: async run => { executed.push(run.runId); return {gain: {value: Number(run.runId.slice(1)), unit: 'kg/day'}}; },
  });
  assert.deepEqual(verifiedStatuses, ['planned', 'planned', 'planned', 'planned']);
  assert.deepEqual(executed, ['r3']);
  assert.equal(result.completedRuns, 3);
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

test('compaction keeps only the uniquely verified row when a corrupt duplicate shares its runId', async t => {
  const options = await setup(t, ['r1']);
  await runResumableBatch({...options, executeRun: async () => ({gain: {value: 4, unit: 'kg/day'}})});
  const validLine = (await readFile(options.resultsPath, 'utf8')).trim();
  const corruptDuplicate = JSON.parse(validLine);
  corruptDuplicate.outputs = {gain: {value: 999, unit: 'kg/day'}};
  await writeFile(options.resultsPath, `${validLine}\n${JSON.stringify(corruptDuplicate)}\n`);

  let executed = false;
  const resumed = await runResumableBatch({...options, executeRun: async () => { executed = true; return {}; }});
  const compactedRecords = (await readFile(options.resultsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));

  assert.equal(executed, false);
  assert.equal(resumed.completedRuns, 1);
  assert.equal(compactedRecords.length, 1);
  assert.deepEqual(verifyExperimentResults(resumed.manifest, compactedRecords, {resultRefByRunId: {r1: resumed.manifest.runs[0].resultRef}, resultDigestByRunId: {r1: resumed.manifest.runs[0].resultDigest}}), {
    valid: true,
    completedRuns: 1,
    resultRecords: 1,
  });
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

test('bounded scheduler limits in-flight runs and commits journal rows in plan order', async t => {
  const options = await setup(t, ['r1', 'r2', 'r3', 'r4']);
  const started = [], active = new Set(), maxActive = {value: 0};
  const result = await runResumableBatch({...options, concurrency: 2, executeRun: async run => {
    started.push(run.runId); active.add(run.runId); maxActive.value = Math.max(maxActive.value, active.size);
    await new Promise(resolve => setTimeout(resolve, run.runId === 'r1' ? 20 : 2));
    active.delete(run.runId);
    return {gain: {value: Number(run.runId.slice(1)), unit: 'kg/day'}};
  }});
  assert.equal(maxActive.value, 2);
  assert.deepEqual(started, ['r1', 'r2', 'r3', 'r4']);
  assert.deepEqual(result.manifest.runs.map(run => run.runId), ['r1', 'r2', 'r3', 'r4']);
  assert.deepEqual((await readFile(options.resultsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line).runId), ['r1', 'r2', 'r3', 'r4']);
});

test('abort stops launching new work and remaining planned runs resume safely', async t => {
  const options = await setup(t, ['r1', 'r2', 'r3', 'r4']);
  const controller = new AbortController();
  const started = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const running = runResumableBatch({...options, concurrency: 2, signal: controller.signal, executeRun: async run => {
    started.push(run.runId);
    await gate;
    return {gain: {value: Number(run.runId.slice(1)), unit: 'kg/day'}};
  }});
  while (started.length < 2) await new Promise(resolve => setTimeout(resolve, 1));
  controller.abort();
  release();
  const cancelled = await running;
  assert.deepEqual(started, ['r1', 'r2']);
  assert.deepEqual(cancelled.manifest.runs.map(run => run.status), ['completed', 'completed', 'planned', 'planned']);
  const resumedCalls = [];
  const resumed = await runResumableBatch({...options, concurrency: 2, executeRun: async run => {
    resumedCalls.push(run.runId);
    return {gain: {value: Number(run.runId.slice(1)), unit: 'kg/day'}};
  }});
  assert.deepEqual(resumedCalls, ['r3', 'r4']);
  assert.deepEqual(resumed.manifest.runs.map(run => run.status), ['completed', 'completed', 'completed', 'completed']);
});

test('a failed concurrent run is isolated, keeps its plan index, and reruns on resume', async t => {
  const options = await setup(t, ['r1', 'r2', 'r3']);
  const first = await runResumableBatch({...options, concurrency: 2, executeRun: async run => {
    if (run.runId === 'r2') throw new Error('worker failure');
    return {gain: {value: Number(run.runId.slice(1)), unit: 'kg/day'}};
  }});
  assert.deepEqual(first.manifest.runs.map(run => run.status), ['completed', 'failed', 'completed']);
  assert.deepEqual((await readFile(options.resultsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line).runId), ['r1', 'r3']);
  let retried = false;
  const resumed = await runResumableBatch({...options, concurrency: 2, executeRun: async run => {
    assert.equal(run.runId, 'r2'); retried = true;
    return {gain: {value: 2, unit: 'kg/day'}};
  }});
  assert.equal(retried, true);
  assert.deepEqual(resumed.manifest.runs.map(run => run.status), ['completed', 'completed', 'completed']);
});

test('abort between journal launch and execution leaves the run planned', async t => {
  const options = await setup(t, ['r1', 'r2']);
  const controller = new AbortController();
  let executions = 0;
  const cancelled = await runResumableBatch({...options, concurrency: 2, signal: controller.signal,
    onProgress: ({status}) => { if (status === 'running') controller.abort(); },
    executeRun: async () => { executions++; return {gain: {value: 1, unit: 'kg/day'}}; },
  });
  assert.equal(executions, 0);
  assert.deepEqual(cancelled.manifest.runs.map(run => run.status), ['planned', 'planned']);
});

test('serial cancellation leaves unstarted runs planned', async t => {
  const options = await setup(t, ['r1', 'r2']);
  const controller = new AbortController();
  const serial = await runResumableBatch({...options, signal: controller.signal,
    executeRun: async run => {
      if (run.runId === 'r1') controller.abort();
      return {gain: {value: Number(run.runId.slice(1)), unit: 'kg/day'}};
    },
  });
  assert.deepEqual(serial.manifest.runs.map(run => run.status), ['completed', 'planned']);
});

test('resultDigest covers exact UTF-8 record bytes and excludes LF and CRLF terminators', () => {
  const record = Buffer.from('{"runId":"r1","outputs":{}}');
  const reformatted = Buffer.from('{ "runId":"r1","outputs":{}}');
  assert.notEqual(digestResultRecordBytes(record), digestResultRecordBytes(reformatted));
  assert.equal(digestResultRecordBytes(record), digestResultRecordBytes(Buffer.concat([record, Buffer.from('\n')]).subarray(0, record.length)));
  assert.equal(digestResultRecordBytes(record), digestResultRecordBytes(Buffer.concat([record, Buffer.from('\r\n')]).subarray(0, record.length)));
});

test('resume seals a valid appended row after crash before manifest completion', async t => {
  const options = await setup(t, ['r1']);
  const first = await runResumableBatch({...options, executeRun: async () => ({gain: {value: 5, unit: 'kg/day'}})});
  const running = {...first.manifest.runs[0], outputs: {}, status: 'running', outputDigest: null, resultDigest: null, resultRef: null};
  await writeFile(options.manifestPath, JSON.stringify(createBatchExperimentManifest({experimentId: first.manifest.experimentId, createdAt: first.manifest.createdAt, runs: [running]})));
  let executed = false;
  const recovered = await runResumableBatch({...options, executeRun: async () => { executed = true; return {}; }});
  assert.equal(executed, false);
  assert.equal(recovered.manifest.runs[0].status, 'completed');
  assert.equal(recovered.manifest.runs[0].resultDigest, digestResultRecordBytes((await readFile(options.resultsPath, 'utf8')).trim()));
  assert.equal((await readFile(options.resultsPath, 'utf8')).trim().split('\n').length, 1);
});

test('valid duplicate records invalidate the run and trigger one rerun', async t => {
  const options = await setup(t, ['r1']);
  await runResumableBatch({...options, executeRun: async () => ({gain: {value: 5, unit: 'kg/day'}})});
  const row = (await readFile(options.resultsPath, 'utf8')).trim();
  await writeFile(options.resultsPath, `${row}\n${row}\n`);
  let executions = 0;
  const result = await runResumableBatch({...options, executeRun: async () => { executions++; return {gain: {value: 6, unit: 'kg/day'}}; }});
  assert.equal(executions, 1);
  assert.equal(result.completedRuns, 1);
  assert.equal((await readFile(options.resultsPath, 'utf8')).trim().split('\n').length, 1);
});

test('valid-ID set contains only records retained by the second compaction pass', async t => {
  const options = await setup(t, ['r1']);
  await runResumableBatch({...options, executeRun: async () => ({gain: {value: 5, unit: 'kg/day'}})});
  let verifications = 0, executions = 0;
  const result = await runResumableBatch({...options, verifyCompletedRun: async () => ++verifications === 1,
    executeRun: async () => { executions++; return {gain: {value: 6, unit: 'kg/day'}}; }});
  assert.equal(executions, 1);
  assert.equal(result.completedRuns, 1);
  assert.equal((await readFile(options.resultsPath, 'utf8')).trim().split('\n').length, 1);
});

test('wrong resultRef and unsafe resultRef are rejected', async t => {
  const options = await setup(t, ['r1']);
  const first = await runResumableBatch({...options, executeRun: async () => ({gain: {value: 5, unit: 'kg/day'}})});
  const changed = createBatchExperimentManifest({experimentId: first.manifest.experimentId, createdAt: first.manifest.createdAt, runs: [{...first.manifest.runs[0], resultRef: 'elsewhere.jsonl#r1'}]});
  await writeFile(options.manifestPath, JSON.stringify(changed));
  let executions = 0;
  await runResumableBatch({...options, executeRun: async () => { executions++; return {gain: {value: 6, unit: 'kg/day'}}; }});
  assert.equal(executions, 1);
  assert.throws(() => createBatchExperimentManifest({experimentId: changed.experimentId, createdAt: changed.createdAt, runs: [{...changed.runs[0], resultRef: '../results.jsonl#r1'}]}), /pattern|safely identify/);
});

test('CRLF terminator is excluded and byte-reformatted semantic equivalent row is rejected', async t => {
  const options = await setup(t, ['r1']);
  await runResumableBatch({...options, executeRun: async () => ({gain: {value: 5, unit: 'kg/day'}})});
  const row = (await readFile(options.resultsPath, 'utf8')).trimEnd();
  await writeFile(options.resultsPath, `${row}\r\n`);
  let executions = 0;
  await runResumableBatch({...options, executeRun: async () => { executions++; return {}; }});
  assert.equal(executions, 0);
  await writeFile(options.resultsPath, `${row.replace('{', '{ ')}\n`);
  await runResumableBatch({...options, executeRun: async () => { executions++; return {gain: {value: 6, unit: 'kg/day'}}; }});
  assert.equal(executions, 1);
});

test('truncated JSONL row is reported and rerun', async t => {
  const options = await setup(t, ['r1']);
  await runResumableBatch({...options, executeRun: async () => ({gain: {value: 5, unit: 'kg/day'}})});
  const row = (await readFile(options.resultsPath, 'utf8')).trim();
  await writeFile(options.resultsPath, row.slice(0, -1));
  let executions = 0;
  await runResumableBatch({...options, executeRun: async () => { executions++; return {gain: {value: 6, unit: 'kg/day'}}; }});
  assert.equal(executions, 1);
  assert.match(await readFile(options.errorsPath, 'utf8'), /truncated JSONL record/);
});
