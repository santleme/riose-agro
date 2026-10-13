import {appendFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {createReadStream, createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {dirname, basename, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {
  canonicalJson, createBatchExperimentManifest, createExperimentResultRecord, parseExperimentResultJsonl,
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

function readLines(path) {
  const input = createReadStream(path, {encoding: 'utf8'});
  const lines = createInterface({input, crlfDelay: Infinity});
  lines.on('error', error => { if (error.code === 'ENOENT') lines.close(); });
  return lines;
}

async function scanAndRepairResults(path, manifestRuns, {maxRetainedResults, verifyCompletedRun}) {
  const absolute = resolve(path), indexById = new Map(manifestRuns.map((run, index) => [run.runId, index]));
  const potential = new Set(), duplicates = new Set(), retained = new Map();
  const retainedFrom = Math.max(0, manifestRuns.length - maxRetainedResults);
  const isVerifiedRecord = async record => {
    if (record.type !== 'riose-experiment-result' || record.version !== 1 || typeof record.runId !== 'string') return false;
    const runIndex = indexById.get(record.runId);
    const run = manifestRuns[runIndex];
    if (!run || run.status !== 'completed' || record.outputDigest !== run.outputDigest || sha256Digest(record.outputs) !== record.outputDigest) return false;
    return !verifyCompletedRun || await verifyCompletedRun(run, record);
  };
  try {
    for await (const line of readLines(absolute)) {
      if (!line.trim()) continue;
      try {
        const [record] = parseExperimentResultJsonl(`${line}\n`);
        if (!(await isVerifiedRecord(record))) continue;
        const runIndex = indexById.get(record.runId);
        if (potential.has(record.runId)) { duplicates.add(record.runId); retained.delete(record.runId); continue; }
        potential.add(record.runId);
        if (runIndex >= retainedFrom) retained.set(record.runId, {record, line});
      } catch {
        // Ignore truncated or corrupt lines; completed runs without a verified row are rerun.
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
    for await (const line of readLines(absolute)) {
      if (!line.trim()) continue;
      try {
        const [record] = parseExperimentResultJsonl(`${line}\n`);
        if (potential.has(record.runId) && !duplicates.has(record.runId) && !written.has(record.runId)
          && await isVerifiedRecord(record)) {
          written.add(record.runId);
          if (!output.write(`${line}\n`)) await once(output, 'drain');
        }
      } catch { /* remove corrupt rows during compaction */ }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') { output.destroy(); throw error; }
  }
  await new Promise((resolvePromise, reject) => { output.once('error', reject); output.end(resolvePromise); });
  await rename(temp, absolute);
  return {validIds: potential, retained: new Map([...retained].filter(([runId]) => potential.has(runId) && !duplicates.has(runId)))};
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
  const identity = run => ({runId: run.runId, scenarioId: run.scenarioId, scenarioDigest: run.scenarioDigest, seed: run.seed, engine: run.engine, models: run.models, datasets: run.datasets, evidence: run.evidence, inputs: run.inputs});
  return expected.runs.every(run => {
    const savedRun = actualRuns.get(run.runId);
    return savedRun && canonicalJson(identity(savedRun)) === canonicalJson(identity(run));
  });
}

/** Run or resume one local batch. The supplied manifest is written before execution begins. */
export async function runResumableBatch({manifestPath, resultsPath, errorsPath = `${resultsPath}.errors.jsonl`, manifest: inputManifest, executeRun, onProgress, verifyCompletedRun, maxRetainedResults = 100, concurrency = 1, signal} = {}) {
  if (typeof manifestPath !== 'string' || !manifestPath || typeof resultsPath !== 'string' || !resultsPath) throw new TypeError('manifestPath and resultsPath are required');
  if (typeof executeRun !== 'function') throw new TypeError('executeRun must be a function');
  if (!Number.isInteger(maxRetainedResults) || maxRetainedResults < 0) throw new RangeError('maxRetainedResults must be a non-negative integer');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer');
  validateBatchExperimentManifest(inputManifest);
  const saved = await readManifest(manifestPath);
  if (saved && !sameRunPlan(inputManifest, saved)) throw new Error('Saved batch plan does not match the requested experiment');

  let manifest = saved ?? inputManifest;
  const requestedById = new Map(inputManifest.runs.map(run => [run.runId, run]));
  const {validIds: validCompleted, retained} = await scanAndRepairResults(resultsPath, manifest.runs, {maxRetainedResults, verifyCompletedRun});

  let runs = manifest.runs.map(run => {
    const planned = requestedById.get(run.runId);
    if (validCompleted.has(run.runId)) return run;
    return {...planned, status: 'planned', outputs: {}, outputDigest: null, resultRef: null};
  });
  manifest = seal(manifest, runs);
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const completeRun = async (index, run, execution) => {
    if (execution.status === 'fulfilled') {
      const outputs = execution.value;
      const result = createExperimentResultRecord({runId: run.runId, outputs});
      await appendFile(resultsPath, `${JSON.stringify(result)}\n`);
      validCompleted.add(run.runId);
      if (maxRetainedResults && index >= runs.length - maxRetainedResults) retained.set(run.runId, {record: result, line: JSON.stringify(result)});
      runs[index] = {
        ...run,
        outputs,
        status: 'completed',
        outputDigest: result.outputDigest,
        resultRef: `${basename(resultsPath)}#${run.runId}`,
      };
      manifest = seal(manifest, runs);
      await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await onProgress?.({runId: run.runId, status: 'completed', index, total: runs.length});
      return;
    }
    const error = execution.reason;
    runs[index] = {...run, outputs: {}, status: 'failed', outputDigest: null, resultRef: null};
    manifest = seal(manifest, runs);
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
      const run = {...runs[index], status: 'running', outputs: {}, outputDigest: null, resultRef: null};
      runs[index] = run;
      manifest = seal(manifest, runs);
      await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await onProgress?.({runId: run.runId, status: 'running', index, total: runs.length});
      if (signal?.aborted) {
        runs[index] = {...run, status: 'planned', outputs: {}, outputDigest: null, resultRef: null};
        manifest = seal(manifest, runs);
        await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
          runs[index] = {...runs[index], status: 'planned', outputs: {}, outputDigest: null, resultRef: null};
          manifest = seal(manifest, runs);
          await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
    run = {...run, status: 'running', outputs: {}, outputDigest: null, resultRef: null};
    runs[index] = run;
    manifest = seal(manifest, runs);
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await onProgress?.({runId: run.runId, status: 'running', index, total: runs.length});
    const execution = await Promise.resolve().then(() => executeRun(run)).then(
      value => ({status: 'fulfilled', value}), reason => ({status: 'rejected', reason}),
    );
    await completeRun(index, run, execution);
  }

  manifest = validateBatchExperimentManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  const results = [...retained.entries()].filter(([runId]) => validCompleted.has(runId))
    .sort(([a], [b]) => runs.findIndex(run => run.runId === a) - runs.findIndex(run => run.runId === b))
    .slice(-maxRetainedResults).map(([, value]) => value.record);
  return {manifest, results, completedRuns: manifest.runs.filter(run => run.status === 'completed').length};
}
