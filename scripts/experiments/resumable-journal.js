import {appendFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {createReadStream, createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {dirname, basename, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {
  canonicalJson, createBatchExperimentManifest, createExperimentResultRecord, digestResultRecordBytes,
  sha256Digest, validateBatchExperimentManifest,
} from './batch-manifest.js';

async function atomicWrite(path, text) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), {recursive: true});
  const temporary = `${absolute}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, {flag: 'wx'});
    await rename(temporary, absolute);
  } catch (error) {
    await import('node:fs/promises').then(({rm}) => rm(temporary, {force: true}));
    throw error;
  }
}

async function readManifest(path) {
  try {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    return validateBatchExperimentManifest(manifest);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot resume from invalid batch manifest: ${error.message}`, {cause: error});
  }
}

async function* readRawLines(path) {
  let pending = Buffer.alloc(0);
  for await (const chunk of createReadStream(path)) {
    pending = Buffer.concat([pending, chunk]);
    let newline;
    while ((newline = pending.indexOf(0x0a)) !== -1) {
      let recordBytes = pending.subarray(0, newline);
      if (recordBytes.at(-1) === 0x0d) recordBytes = recordBytes.subarray(0, -1);
      yield {recordBytes, terminated: true};
      pending = pending.subarray(newline + 1);
    }
  }
  if (pending.length) yield {recordBytes: pending, terminated: false};
}

function parseRawRecord(recordBytes) {
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(recordBytes));
}

async function scanAndRepairResults(path, manifestRuns, {maxRetainedResults, verifyCompletedRun}) {
  const absolute = resolve(path), indexById = new Map(manifestRuns.map((run, index) => [run.runId, index]));
  const potential = new Set(), duplicates = new Set(), retained = new Map(), candidates = new Map(), rejected = [];
  const retainedFrom = Math.max(0, manifestRuns.length - maxRetainedResults);
  const isVerifiedRecord = async (record, recordDigest) => {
    if (record.type !== 'riose-experiment-result' || record.version !== 1 || typeof record.runId !== 'string') return {valid: false, reason: 'unsupported result record'};
    const runIndex = indexById.get(record.runId);
    const run = manifestRuns[runIndex];
    // The append-only result journal is the durable completion marker. A crash
    // can leave a valid row ahead of the most recent manifest checkpoint, where
    // the run still appears planned (or failed after a later retry attempt).
    if (!run || !['completed', 'running', 'planned', 'failed'].includes(run.status)) return {valid: false, reason: `unlinked runId ${record.runId}`};
    if (sha256Digest(record.outputs) !== record.outputDigest) return {valid: false, reason: `outputDigest mismatch for ${record.runId}`};
    const expectedRef = `${basename(absolute)}#${run.runId}`;
    if (run.status === 'completed' && record.outputDigest !== run.outputDigest) return {valid: false, reason: `manifest outputDigest mismatch for ${record.runId}`};
    if (run.status === 'completed' && recordDigest !== run.resultDigest) return {valid: false, reason: `resultDigest mismatch for ${record.runId}`};
    if (run.status === 'completed' && run.resultRef !== expectedRef) return {valid: false, reason: `resultRef mismatch for ${record.runId}`};
    if (verifyCompletedRun && !(await verifyCompletedRun(run, record))) return {valid: false, reason: `artifact verification failed for ${record.runId}`};
    return {valid: true};
  };
  try {
    for await (const {recordBytes, terminated} of readRawLines(absolute)) {
      if (!recordBytes.length) continue;
      if (!terminated) { rejected.push({runId: null, message: 'truncated JSONL record without a line terminator'}); continue; }
      try {
        const recordDigest = digestResultRecordBytes(recordBytes);
        const record = parseRawRecord(recordBytes);
        const verification = await isVerifiedRecord(record, recordDigest);
        if (!verification.valid) { rejected.push({runId: record.runId ?? null, message: verification.reason}); continue; }
        const runIndex = indexById.get(record.runId);
        if (potential.has(record.runId)) { duplicates.add(record.runId); retained.delete(record.runId); rejected.push({runId: record.runId, message: `duplicate result record for ${record.runId}`}); continue; }
        potential.add(record.runId);
        candidates.set(record.runId, {record, resultDigest: recordDigest, resultRef: `${basename(absolute)}#${record.runId}`});
        if (runIndex >= retainedFrom) retained.set(record.runId, {record});
      } catch (error) {
        rejected.push({runId: null, message: `invalid JSONL record: ${error.message}`});
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const runId of duplicates) potential.delete(runId);

  const temp = `${absolute}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(absolute), {recursive: true});
  const output = createWriteStream(temp, {flags: 'wx'});
  const written = new Set();
  try {
    for await (const {recordBytes, terminated} of readRawLines(absolute)) {
      if (!terminated || !recordBytes.length) continue;
      try {
        const recordDigest = digestResultRecordBytes(recordBytes);
        const record = parseRawRecord(recordBytes);
        const verification = await isVerifiedRecord(record, recordDigest);
        if (potential.has(record.runId) && !duplicates.has(record.runId) && !written.has(record.runId)
          && verification.valid) {
          written.add(record.runId);
          if (!output.write(Buffer.concat([recordBytes, Buffer.from('\n')]))) await once(output, 'drain');
        }
      } catch { /* remove corrupt rows during compaction */ }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') { output.destroy(); throw error; }
  }
  await new Promise((resolvePromise, reject) => { output.once('error', reject); output.end(resolvePromise); });
  await rename(temp, absolute);
  return {validIds: written, candidates: new Map([...candidates].filter(([runId]) => written.has(runId))), retained: new Map([...retained].filter(([runId]) => written.has(runId))), rejected};
}

function seal(manifest, runs) {
  return createBatchExperimentManifest({
    experimentId: manifest.experimentId,
    createdAt: manifest.createdAt,
    ...(manifest.description === undefined ? {} : {description: manifest.description}),
    runs,
  });
}

function sameRunPlan(expected, actual) {
  if (expected.experimentId !== actual.experimentId || expected.runs.length !== actual.runs.length) return false;
  const actualRuns = new Map(actual.runs.map(run => [run.runId, run]));
  const identity = run => ({runId: run.runId, scenarioFormat: run.scenarioFormat, scenarioVersion: run.scenarioVersion, scenarioId: run.scenarioId, scenarioRef: run.scenarioRef, scenarioDigest: run.scenarioDigest, seed: run.seed, engine: run.engine, models: run.models, datasets: run.datasets, evidence: run.evidence, inputs: run.inputs});
  return expected.runs.every(run => {
    const savedRun = actualRuns.get(run.runId);
    return savedRun && canonicalJson(identity(savedRun)) === canonicalJson(identity(run));
  });
}

/** Run or resume one local batch. The manifest checkpoints completed runs in bounded groups; JSONL remains the per-run durable journal. */
export async function runResumableBatch({manifestPath, resultsPath, errorsPath = `${resultsPath}.errors.jsonl`, manifest: inputManifest, executeRun, onProgress, verifyCompletedRun, maxRetainedResults = 100, manifestCheckpointInterval = 100, concurrency = 1, signal} = {}) {
  if (typeof manifestPath !== 'string' || !manifestPath || typeof resultsPath !== 'string' || !resultsPath) throw new TypeError('manifestPath and resultsPath are required');
  if (typeof executeRun !== 'function') throw new TypeError('executeRun must be a function');
  if (!Number.isInteger(maxRetainedResults) || maxRetainedResults < 0) throw new RangeError('maxRetainedResults must be a non-negative integer');
  if (!Number.isInteger(manifestCheckpointInterval) || manifestCheckpointInterval < 1) throw new RangeError('manifestCheckpointInterval must be a positive integer');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer');
  validateBatchExperimentManifest(inputManifest);
  const saved = await readManifest(manifestPath);
  if (saved && !sameRunPlan(inputManifest, saved)) throw new Error('Saved batch plan does not match the requested experiment');

  let manifest = saved ?? inputManifest;
  const requestedById = new Map(inputManifest.runs.map(run => [run.runId, run]));
  const {validIds: validCompleted, candidates, retained, rejected} = await scanAndRepairResults(resultsPath, manifest.runs, {maxRetainedResults, verifyCompletedRun});
  if (rejected.length) {
    await mkdir(dirname(resolve(errorsPath)), {recursive: true});
    await appendFile(errorsPath, rejected.map(({runId, message}) => `${JSON.stringify({runId, occurredAt: new Date().toISOString(), message: `Journal repair: ${message}`})}\n`).join(''));
  }

  let runs = manifest.runs.map(run => {
    const planned = requestedById.get(run.runId);
    if (validCompleted.has(run.runId)) {
      const candidate = candidates.get(run.runId);
      return run.status === 'completed' ? run : {...run, outputs: candidate.record.outputs, status: 'completed', outputDigest: candidate.record.outputDigest, resultDigest: candidate.resultDigest, resultRef: candidate.resultRef};
    }
    return {...planned, status: 'planned', outputs: {}, outputDigest: null, resultDigest: null, resultRef: null};
  });
  manifest = seal(manifest, runs);
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  let pendingManifestUpdates = 0;
  const persistManifest = async () => {
    manifest = seal(manifest, runs);
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    pendingManifestUpdates = 0;
  };
  const checkpointManifest = async () => {
    pendingManifestUpdates++;
    if (pendingManifestUpdates >= manifestCheckpointInterval) await persistManifest();
  };

  const completeRun = async (index, run, execution) => {
    if (execution.status === 'fulfilled') {
      const outputs = execution.value;
      const result = createExperimentResultRecord({runId: run.runId, outputs});
      const resultLine = JSON.stringify(result);
      const resultDigest = digestResultRecordBytes(resultLine);
      await appendFile(resultsPath, `${resultLine}\n`);
      validCompleted.add(run.runId);
      if (maxRetainedResults && index >= runs.length - maxRetainedResults) retained.set(run.runId, {record: result});
      runs[index] = {
        ...run,
        outputs,
        status: 'completed',
        outputDigest: result.outputDigest,
        resultDigest,
        resultRef: `${basename(resultsPath)}#${run.runId}`,
      };
      await checkpointManifest();
      await onProgress?.({runId: run.runId, status: 'completed', index, total: runs.length});
      return;
    }
    const error = execution.reason;
    runs[index] = {...run, outputs: {}, status: 'failed', outputDigest: null, resultDigest: null, resultRef: null};
    await checkpointManifest();
    await mkdir(dirname(resolve(errorsPath)), {recursive: true});
    await appendFile(errorsPath, `${JSON.stringify({runId: run.runId, occurredAt: new Date().toISOString(), message: String(error?.message ?? error)})}\n`);
    await onProgress?.({runId: run.runId, status: 'failed', index, total: runs.length});
  };

  if (concurrency > 1) {
    // Keep execution isolated behind executeRun, while serializing all journal writes.
    // A completed out-of-order result occupies a slot until its index can be committed,
    // bounding both active work and retained result memory by `concurrency`.
    const slots = new Map();
    let nextLaunch = 0;
    for (let index = 0; index < runs.length; index++) {
      if (validCompleted.has(runs[index].runId)) {
        await onProgress?.({runId: runs[index].runId, status: 'skipped-verified', index, total: runs.length});
      }
    }
    const launch = async index => {
      const run = {...runs[index], status: 'running', outputs: {}, outputDigest: null, resultDigest: null, resultRef: null};
      runs[index] = run;
      await onProgress?.({runId: run.runId, status: 'running', index, total: runs.length});
      if (signal?.aborted) {
        runs[index] = {...run, status: 'planned', outputs: {}, outputDigest: null, resultDigest: null, resultRef: null};
        return;
      }
      slots.set(index, {run, promise: Promise.resolve().then(() => executeRun(run)).then(
        value => ({status: 'fulfilled', value}), reason => ({status: 'rejected', reason}),
      )});
    };
    const fill = async () => {
      while (!signal?.aborted && slots.size < concurrency && nextLaunch < runs.length) {
        const index = nextLaunch++;
        if (validCompleted.has(runs[index].runId)) continue;
        await launch(index);
      }
    };
    await fill();
    for (let index = 0; index < runs.length; index++) {
      if (validCompleted.has(runs[index].runId)) continue;
      const slot = slots.get(index);
      if (!slot) {
        if (runs[index].status === 'running') {
          runs[index] = {...runs[index], status: 'planned', outputs: {}, outputDigest: null, resultDigest: null, resultRef: null};
        }
        continue;
      }
      const execution = await slot.promise;
      slots.delete(index);
      await completeRun(index, slot.run, execution);
      await fill();
    }
  } else for (let index = 0; index < runs.length; index++) {
    if (signal?.aborted) break;
    let run = runs[index];
    if (validCompleted.has(run.runId)) {
      await onProgress?.({runId: run.runId, status: 'skipped-verified', index, total: runs.length});
      continue;
    }
    run = {...run, status: 'running', outputs: {}, outputDigest: null, resultDigest: null, resultRef: null};
    runs[index] = run;
    await onProgress?.({runId: run.runId, status: 'running', index, total: runs.length});
    const execution = await Promise.resolve().then(() => executeRun(run)).then(
      value => ({status: 'fulfilled', value}), reason => ({status: 'rejected', reason}),
    );
    await completeRun(index, run, execution);
  }

  if (pendingManifestUpdates > 0) await persistManifest();
  manifest = validateBatchExperimentManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  const results = [...retained.entries()].filter(([runId]) => validCompleted.has(runId))
    .sort(([a], [b]) => runs.findIndex(run => run.runId === a) - runs.findIndex(run => run.runId === b))
    .slice(-maxRetainedResults).map(([, value]) => value.record);
  return {manifest, results, completedRuns: manifest.runs.filter(run => run.status === 'completed').length};
}
