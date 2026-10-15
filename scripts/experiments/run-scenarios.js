#!/usr/bin/env node
import {readdir, readFile, mkdir, writeFile, rename, rm} from 'node:fs/promises';
import {basename, dirname, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {FarmEngine} from '../../src/client/engine.js';
import {ENGINE_SOURCE_FILES} from '../../src/client/engine-provenance.js';
import {createBatchExperimentManifest, sha256Digest} from './batch-manifest.js';
import {HARNESS_FORMAT, validateScenarioIdentity} from './scenario-dispatch.js';
import {runResumableBatch} from './resumable-journal.js';
import {ScenarioWorkerPool} from '../scenario-worker-pool.js';
import {selectExperimentExecutor} from '../../src/server/experiment-executor.js';

const schemaPath = fileURLToPath(new URL('../../schemas/scenario.schema.json', import.meta.url));
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const validateShape = new Ajv2020({allErrors: true, strict: true}).compile(schema);
const defaultScenarioDirectory = fileURLToPath(new URL('../../tests/scenarios/', import.meta.url));
const defaultResultDirectory = fileURLToPath(new URL('../../.test-results/scenarios/', import.meta.url));

function formatValidationError(error) {
  return `${error.instancePath || '/'} ${error.message}`;
}

export function validateScenario(scenario) {
  if (validateShape(scenario)) return {valid: true, errors: []};
  return {valid: false, errors: validateShape.errors.map(formatValidationError)};
}

function readPointer(value, pointer) {
  return pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((current, key) => {
      if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
      if (Array.isArray(current) && !/^(0|[1-9]\d*)$/.test(key)) return undefined;
      return current[key];
    }, value);
}

function checkAssertion(actual, assertion) {
  const expected = assertion.value;
  switch (assertion.operator) {
    case 'equals': return Object.is(actual, expected);
    case 'greaterThan': return typeof actual === 'number' && actual > expected;
    case 'lessThan': return typeof actual === 'number' && actual < expected;
    case 'approximatelyEquals': return typeof actual === 'number' && typeof expected === 'number'
      && Math.abs(actual - expected) <= (assertion.tolerance ?? 1e-6);
    default: return false;
  }
}

function failedResult(scenario, errors) {
  return {
    formatVersion: 1,
    scenarioId: typeof scenario?.scenarioId === 'string' ? scenario.scenarioId : null,
    passed: false,
    errors,
    assertions: [],
    input: scenario ?? null,
    result: null,
  };
}

export function executeScenario(scenario) {
  const validation = validateScenario(scenario);
  if (!validation.valid) return failedResult(scenario, validation.errors);

  try {
    const engine = new FarmEngine(scenario.engine.seed, scenario.engine.animalCount);
    if (scenario.configuration) engine.configure(scenario.configuration);
    engine.tick(scenario.run.hours);
    const output = {state: engine.snapshot(), metrics: engine.metrics()};
    const assertions = scenario.assertions.map(assertion => {
      const actual = readPointer(output, assertion.path);
      const passed = checkAssertion(actual, assertion);
      return {
        path: assertion.path,
        operator: assertion.operator,
        expected: assertion.value,
        ...(assertion.tolerance === undefined ? {} : {tolerance: assertion.tolerance}),
        actual: actual === undefined ? null : actual,
        passed,
        message: passed ? 'passed' : `Expected ${assertion.path} ${assertion.operator} ${JSON.stringify(assertion.value)}; received ${JSON.stringify(actual)}`,
      };
    });
    const errors = assertions.filter(assertion => !assertion.passed).map(assertion => assertion.message);
    return {
      formatVersion: 1,
      scenarioId: scenario.scenarioId,
      passed: errors.length === 0,
      errors,
      assertions,
      input: scenario,
      result: output,
    };
  } catch (error) {
    return failedResult(scenario, [error.message]);
  }
}

export async function runScenarioDirectory(scenarioDirectory, resultDirectory) {
  const scenarioFiles = (await readdir(scenarioDirectory, {withFileTypes: true}))
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .filter(entry => !entry.name.endsWith('.result.json'))
    .map(entry => entry.name)
    .sort();
  if (scenarioFiles.length === 0) throw new Error(`No scenario JSON files found in ${scenarioDirectory}`);
  await mkdir(resultDirectory, {recursive: true});

  const results = [];
  for (const file of scenarioFiles) {
    let result;
    try {
      const scenario = JSON.parse(await readFile(resolve(scenarioDirectory, file), 'utf8'));
      result = executeScenario(scenario);
    } catch (error) {
      result = failedResult(null, [`${basename(file)}: ${error.message}`]);
    }
    await writeFile(resolve(resultDirectory, file.replace(/\.json$/i, '.result.json')), `${JSON.stringify(result, null, 2)}\n`);
    results.push({file, ...result});
  }
  return results;
}

async function atomicWrite(path, text) {
  await mkdir(dirname(path), {recursive: true});
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, {flag: 'wx'});
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, {force: true});
    throw error;
  }
}

function resultFileName(file) {
  return file.replace(/\.json$/i, '.result.json');
}

export function parseExecutorResourceLimits(environment = process.env) {
  const parseLimit = (name, defaultValue) => {
    const raw = environment[name];
    if (raw === undefined) return defaultValue;
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a finite nonnegative number`);
    }
    return value;
  };
  return {
    maxCostUsd: parseLimit('RIOSE_EXECUTOR_MAX_COST_USD', 0),
    maxRssBytes: parseLimit('RIOSE_EXECUTOR_MAX_RSS_BYTES', Infinity),
  };
}

export async function runScenarioDirectoryResumable(scenarioDirectory, resultDirectory, {
  concurrency: requestedConcurrency = 1, workerMemoryLimitMb: requestedWorkerMemoryLimitMb,
  signal, workerPool: suppliedWorkerPool, executorProfile, maxCostUsd = 0, maxRssBytes = Infinity,
  onExecutorSelection,
} = {}) {
  const automatic = requestedConcurrency === 'auto';
  let concurrency = requestedConcurrency;
  let workerMemoryLimitMb = requestedWorkerMemoryLimitMb;
  if (!automatic && (!Number.isInteger(concurrency) || concurrency < 1)) throw new RangeError('concurrency must be a positive integer or "auto"');
  if (!automatic && concurrency > 1 && (!Number.isInteger(workerMemoryLimitMb) || workerMemoryLimitMb < 16)) {
    throw new RangeError('concurrent scenario execution requires workerMemoryLimitMb of at least 16');
  }
  const scenarioFiles = (await readdir(scenarioDirectory, {withFileTypes: true}))
    .filter(entry => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.result.json'))
    .map(entry => entry.name).sort();
  if (scenarioFiles.length === 0) throw new Error(`No scenario JSON files found in ${scenarioDirectory}`);
  await mkdir(resultDirectory, {recursive: true});
  const engineSourceFiles = ENGINE_SOURCE_FILES;
  const engineSources = Object.fromEntries(await Promise.all(engineSourceFiles.map(async name => [
    name, await readFile(fileURLToPath(new URL(`../src/client/${name}`, import.meta.url)), 'utf8'),
  ])));
  const engineDigest = sha256Digest(engineSources);
  const plans = [];
  const scenarioByRunId = new Map();
  const workloadShapes = [];
  for (const file of scenarioFiles) {
    const source = await readFile(resolve(scenarioDirectory, file), 'utf8');
    let scenario;
    try { scenario = JSON.parse(source); }
    catch (error) { throw new Error(`Invalid JSON in ${file}: ${error.message}`); }
    const runId = file;
    const validation = validateScenario(scenario);
    if (!validation.valid) throw new Error(`Invalid scenario ${file}: ${validation.errors.join('; ')}`);
    const identity = validateScenarioIdentity({scenarioFormat: HARNESS_FORMAT, scenarioVersion: 1, scenarioId: scenario.scenarioId, scenarioRef: file, seed: scenario.engine.seed, scenario});
    scenarioByRunId.set(runId, {file, scenario});
    const configuration = scenario.configuration ?? {};
    workloadShapes.push({animalCount: scenario?.engine?.animalCount ?? null, hours: scenario?.run?.hours ?? null});
    plans.push({
      runId,
      scenarioFormat: identity.scenarioFormat,
      scenarioVersion: identity.scenarioVersion,
      scenarioId: identity.scenarioId,
      scenarioRef: identity.scenarioRef,
      scenarioDigest: identity.scenarioDigest,
      seed: identity.seed,
      engine: {id: 'riose-agro/FarmEngine', version: `source-bundle-${engineDigest.slice(7, 23)}`, buildDigest: engineDigest, status: 'provided'},
      models: [],
      datasets: [{id: null, digest: null, uri: null, status: 'missing'}],
      evidence: [{id: null, digest: null, uri: null, status: 'missing'}],
      inputs: {
        animalCount: {value: Number.isInteger(scenario?.engine?.animalCount) ? scenario.engine.animalCount : null, unit: 'head'},
        duration: {value: Number.isInteger(scenario?.run?.hours) ? scenario.run.hours : null, unit: 'h'},
        configuration: {value: configuration, unit: 'engine-configuration-v1'},
      },
      outputs: {}, status: 'planned', outputDigest: null, resultDigest: null, resultRef: null,
    });
  }
  if (automatic) {
    const first = workloadShapes[0];
    const homogeneous = workloadShapes.every(shape => shape.animalCount === first.animalCount && shape.hours === first.hours);
    const selection = selectExperimentExecutor({profile: executorProfile,
      workload: {operation: 'scenario-batch', scenarioCount: scenarioFiles.length,
        animalCount: homogeneous ? first.animalCount : null, hours: homogeneous ? first.hours : null},
      maxCostUsd, maxRssBytes, availableBackends: ['local-js']});
    concurrency = selection.concurrency;
    if (concurrency > 1 && workerMemoryLimitMb === undefined) workerMemoryLimitMb = 128;
    await onExecutorSelection?.(selection);
  }
  if (concurrency > 1 && (!Number.isInteger(workerMemoryLimitMb) || workerMemoryLimitMb < 16)) {
    throw new RangeError('concurrent scenario execution requires workerMemoryLimitMb of at least 16');
  }
  const manifestPath = resolve(resultDirectory, 'batch-manifest.json');
  const resultsPath = resolve(resultDirectory, 'batch-results.jsonl');
  const manifest = createBatchExperimentManifest({
    experimentId: `scenario-directory:${basename(resolve(scenarioDirectory))}`,
    description: 'Resumable execution journal for scripts/experiments/run-scenarios.js',
    runs: plans,
  });
  if (suppliedWorkerPool && (concurrency < 2 || typeof suppliedWorkerPool.execute !== 'function' || suppliedWorkerPool.size !== concurrency)) {
    throw new TypeError('workerPool must be a matching ScenarioWorkerPool for concurrency greater than 1');
  }
  const ownsPool = concurrency > 1 && !suppliedWorkerPool;
  const pool = concurrency > 1 ? suppliedWorkerPool ?? new ScenarioWorkerPool(concurrency, {maxOldGenerationSizeMb: workerMemoryLimitMb}) : null;
  let journal;
  try { journal = await runResumableBatch({manifestPath, resultsPath, manifest, maxRetainedResults: 100, concurrency, signal, verifyCompletedRun: async (run, record) => {
    const resultPath = resolve(resultDirectory, resultFileName(scenarioByRunId.get(run.runId).file));
    try {
      const result = JSON.parse(await readFile(resultPath, 'utf8'));
      return sha256Digest(result) === record.outputs.scenarioResultDigest?.value;
    } catch { return false; }
  }, executeRun: async run => {
    const {file, scenario, source} = scenarioByRunId.get(run.runId);
    if (!scenario) throw new Error(`Invalid JSON in ${file}`);
    const result = pool ? await pool.execute(scenario) : executeScenario(scenario);
    const resultPath = resolve(resultDirectory, resultFileName(file));
    await atomicWrite(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    const output = {
      scenarioResultRef: {value: basename(resultPath), unit: 'path'},
      scenarioResultDigest: {value: sha256Digest(result), unit: 'sha256'},
      passed: {value: result.passed, unit: 'boolean'},
    };
    const metrics = result.result?.metrics;
    if (metrics && Number.isFinite(metrics.weight)) output.weight = {value: metrics.weight, unit: 'kg/animal'};
    if (metrics && Number.isFinite(metrics.gain)) output.gain = {value: metrics.gain, unit: 'kg/animal'};
    return output;
  }}); } finally { if (ownsPool) await pool.close(); }
  return Promise.all(journal.manifest.runs.map(async run => {
    const file = scenarioByRunId.get(run.runId).file;
    if (run.status === 'completed') {
      try { return {file, ...JSON.parse(await readFile(resolve(resultDirectory, resultFileName(file)), 'utf8'))}; }
      catch (error) { return {file, ...failedResult(null, [`${file}: verified result file unavailable: ${error.message}`])}; }
    }
    return {file, ...failedResult(null, [`${file}: batch run status ${run.status}; see batch-results.jsonl.errors.jsonl`])};
  }));
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const resumable = arguments_.includes('--resume');
  const automatic = arguments_.includes('--auto');
  const [scenarioArgument, resultArgument] = arguments_.filter(argument => argument !== '--resume' && argument !== '--auto');
  const scenarioDirectory = resolve(scenarioArgument ?? defaultScenarioDirectory);
  const resultDirectory = resolve(resultArgument ?? defaultResultDirectory);
  try {
    let executorOptions = {};
    if (automatic) {
      const executorProfilePath = fileURLToPath(new URL('../../docs/performance/executor-profile-v2.json', import.meta.url));
      const executorProfile = JSON.parse(await readFile(executorProfilePath, 'utf8'));
      const resourceLimits = parseExecutorResourceLimits();
      executorOptions = {concurrency: 'auto', executorProfile,
        ...resourceLimits,
        onExecutorSelection: selection => process.stdout.write(`Executor: ${selection.backend}, concurrency ${selection.concurrency} (${selection.reason})\n`)};
    }
    const results = resumable || automatic
      ? await runScenarioDirectoryResumable(scenarioDirectory, resultDirectory, executorOptions)
      : await runScenarioDirectory(scenarioDirectory, resultDirectory);
    for (const result of results) {
      const label = result.passed ? 'PASS' : 'FAIL';
      process.stdout.write(`${label} ${result.file}${result.errors.length ? `: ${result.errors.join('; ')}` : ''}\n`);
    }
    process.stdout.write(`Results: ${resultDirectory}${resumable ? ' (resumable batch manifest and JSONL journal)' : ''}\n`);
    if (results.some(result => !result.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
