import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createReadStream} from 'node:fs';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {createBatchExperimentManifest, createExperimentResultRecord, digestScenario, sha256Digest} from '../experiments/batch-manifest.js';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';
import {executeScenario} from './run-scenarios.js';

const require = createRequire(import.meta.url);
const nodeFormatPackages = ['parquetjs', 'parquetjs-lite', '@duckdb/node-api', 'duckdb', 'hyparquet', 'apache-arrow'];
const nodeFormatToolchain = Object.fromEntries(nodeFormatPackages.map(name => {
  try {
    return [name, {available: true, resolvedEntry: require.resolve(name)}];
  } catch {
    return [name, {available: false, resolvedEntry: null}];
  }
}));

const repetitions = Number(process.env.FORMAT_STUDY_REPETITIONS ?? 9);
const recordCount = Number(process.env.FORMAT_STUDY_RECORDS ?? 25);
const animalCount = 100;
const hours = 24;
const fixture = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));

if (!Number.isInteger(repetitions) || repetitions < 3) throw new RangeError('FORMAT_STUDY_REPETITIONS must be an integer >= 3');
if (!Number.isInteger(recordCount) || recordCount < 1) throw new RangeError('FORMAT_STUDY_RECORDS must be a positive integer');

const scenarios = Array.from({length: recordCount}, (_, index) => {
  const scenario = structuredClone(fixture);
  scenario.scenarioId = `format-study-${String(index + 1).padStart(3, '0')}`;
  scenario.engine.seed = fixture.engine.seed + index;
  scenario.engine.animalCount = animalCount;
  scenario.run.hours = hours;
  scenario.assertions = [
    {path: '/state/hour', operator: 'equals', value: 30},
    {path: '/metrics/intake/totalKgDM', operator: 'greaterThan', value: 0},
  ];
  const result = executeScenario(scenario);
  if (!result.passed) throw new Error(`${scenario.scenarioId} failed: ${result.errors.join('; ')}`);
  return {scenario, result};
});

const engineSourceFiles = ['engine.js', 'metabolism-wasm.js', 'environment-model.js', 'feeding-model.js'];
const engineSources = Object.fromEntries(await Promise.all(engineSourceFiles.map(async name => [
  name, await readFile(new URL(`../src/client/${name}`, import.meta.url), 'utf8'),
])));
const engineBuildDigest = sha256Digest(engineSources);
const experimentRuns = scenarios.map(({scenario, result}) => {
  const runId = scenario.scenarioId;
  const metrics = result.result.metrics;
  const outputs = {
    passed: {value: result.passed, unit: 'boolean'},
    weight: {value: metrics.weight, unit: 'kg/animal'},
    gain: {value: metrics.gain, unit: 'kg/animal'},
    totalDryMatterIntake: {value: metrics.intake.totalKgDM, unit: 'kg DM'},
    scenarioResultDigest: {value: sha256Digest(result), unit: 'sha256'},
  };
  const resultRecord = createExperimentResultRecord({runId, outputs});
  return {
    runId,
    scenarioId: scenario.scenarioId,
    scenarioDigest: digestScenario(scenario),
    seed: scenario.engine.seed,
    engine: {id: 'riose-agro/FarmEngine', version: `source-bundle-${engineBuildDigest.slice(7, 23)}`, buildDigest: engineBuildDigest, status: 'provided'},
    models: [],
    datasets: [{id: null, digest: null, uri: null, status: 'missing'}],
    evidence: [{id: null, digest: null, uri: null, status: 'missing'}],
    inputs: {
      animalCount: {value: scenario.engine.animalCount, unit: 'head'},
      duration: {value: scenario.run.hours, unit: 'h'},
      configuration: {value: scenario.configuration, unit: 'engine-configuration-v1'},
    },
    outputs,
    status: 'completed',
    outputDigest: resultRecord.outputDigest,
    resultRef: `batch-results.jsonl#${runId}`,
    result: resultRecord,
  };
});
const manifest = createBatchExperimentManifest({
  experimentId: 'riose-format-study',
  createdAt: '2026-10-12T00:00:00.000Z',
  description: 'Logical run records joined from the current batch manifest and JSONL result contract',
  runs: experimentRuns.map(({result, ...run}) => run),
});
const records = manifest.runs.map((run, index) => ({run, result: experimentRuns[index].result}));
const pythonProbe = spawnSync('python3', ['-c', String.raw`
import importlib.metadata as metadata, importlib.util, json, os, platform, sys
packages = {}
for name in ('pyarrow', 'fastparquet', 'duckdb', 'polars'):
    available = importlib.util.find_spec(name) is not None
    size = None
    version = None
    if available:
        distribution = metadata.distribution(name)
        version = distribution.version
        size = sum(os.path.getsize(distribution.locate_file(file)) for file in (distribution.files or []) if os.path.isfile(distribution.locate_file(file)))
    packages[name] = {'available': available, 'version': version, 'installedPackageBytes': size}
print(json.dumps({'version': platform.python_version(), 'packages': packages}))
`], {encoding: 'utf8'});
if (pythonProbe.status !== 0) throw new Error(`Cannot inspect Python format toolchain: ${pythonProbe.stderr}`);
const pythonToolchain = JSON.parse(pythonProbe.stdout);
const jsonText = `${JSON.stringify(records)}\n`;
const jsonlText = `${records.map(record => JSON.stringify(record)).join('\n')}\n`;
const jsonBytes = Buffer.byteLength(jsonText);
const jsonlBytes = Buffer.byteLength(jsonlText);
const jsonGzipBytes = gzipSync(jsonText, {level: 6}).byteLength;
const jsonlGzipBytes = gzipSync(jsonlText, {level: 6}).byteLength;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expectedDigest = digest(records);
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'riose-format-study-'));

function sampleMemory() {
  const current = process.memoryUsage();
  return {heapUsedBytes: current.heapUsed, rssProcessBytes: current.rss, externalBytes: current.external, arrayBuffersBytes: current.arrayBuffers};
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function timeOperation(operation, expected = expectedDigest) {
  const durations = [];
  const processMemorySamples = [];
  let lastMemory = null;
  for (let iteration = 0; iteration < repetitions; iteration++) {
    if (typeof global.gc === 'function') global.gc();
    const before = sampleMemory();
    const started = performance.now();
    const value = await operation(iteration);
    durations.push(performance.now() - started);
    const after = sampleMemory();
    const deltas = Object.fromEntries(Object.keys(before).map(key => [`${key}DeltaBytes`, after[key] - before[key]]));
    lastMemory = {iteration, before, after, deltas};
    processMemorySamples.push(lastMemory);
    if (value !== undefined) assert.equal(value, expected);
  }
  return {medianMs: median(durations), minMs: Math.min(...durations), maxMs: Math.max(...durations), durationsMs: durations, processMemorySamples, processMemoryLastSample: lastMemory};
}

try {
  const jsonPath = path.join(tempDirectory, 'batch.json');
  const jsonlPath = path.join(tempDirectory, 'batch.jsonl');
  const workloads = {
    json: {
      write: () => writeFile(jsonPath, `${JSON.stringify(records)}\n`),
      read: async () => digest(JSON.parse(await readFile(jsonPath, 'utf8'))),
      selectiveMetricRead: async () => {
        const parsed = JSON.parse(await readFile(jsonPath, 'utf8'));
        return digest(parsed.map(record => ({scenarioId: record.run.scenarioId, totalIntakeKgDM: record.run.outputs.totalDryMatterIntake.value})));
      },
    },
    jsonl: {
      write: () => writeFile(jsonlPath, `${records.map(record => JSON.stringify(record)).join('\n')}\n`),
      read: async () => {
        const rows = [];
        for await (const line of createInterface({input: createReadStream(jsonlPath, {encoding: 'utf8'}), crlfDelay: Infinity})) {
          if (line.trim()) rows.push(JSON.parse(line));
        }
        return digest(rows);
      },
      selectiveMetricRead: async () => {
        const projection = [];
        for await (const line of createInterface({input: createReadStream(jsonlPath, {encoding: 'utf8'}), crlfDelay: Infinity})) {
          if (!line.trim()) continue;
          const record = JSON.parse(line);
          projection.push({scenarioId: record.run.scenarioId, totalIntakeKgDM: record.run.outputs.totalDryMatterIntake.value});
        }
        return digest(projection);
      },
    },
  };

  for (const format of Object.values(workloads)) await format.write();
  for (const [name, format] of Object.entries(workloads)) {
    const actualDigest = await format.read();
    assert.equal(actualDigest, expectedDigest, `${name} round trip changed normalized records`);
  }
const selectedExpectedDigest = digest(records.map(record => ({
  scenarioId: record.run.scenarioId,
  totalIntakeKgDM: record.run.outputs.totalDryMatterIntake.value,
})));
assert.deepEqual(JSON.parse(jsonText), records, 'JSON round trip changed units, null provenance or result data');
assert.deepEqual(jsonlText.trimEnd().split('\n').map(line => JSON.parse(line)), records, 'JSONL round trip changed units, null provenance or result data');
for (const {run, result} of records) {
  assert.equal(run.outputs.totalDryMatterIntake.unit, 'kg DM');
  assert.equal(run.datasets[0].status, 'missing');
  assert.equal(run.datasets[0].id, null);
  assert.equal(run.evidence[0].status, 'missing');
  assert.equal(run.evidence[0].id, null);
  assert.equal(run.engine.status, 'provided');
  assert.equal(result.outputDigest, run.outputDigest);
}
  const results = {};
  for (const [name, format] of Object.entries(workloads)) {
    const write = await timeOperation(format.write);
    const read = await timeOperation(format.read);
    const selectiveMetricRead = await timeOperation(format.selectiveMetricRead, selectedExpectedDigest);
    results[name] = {
      bytes: name === 'json' ? jsonBytes : jsonlBytes,
      gzipLevel6Bytes: name === 'json' ? jsonGzipBytes : jsonlGzipBytes,
      write,
      fullRead: read,
      selectiveMetricRead: {...selectiveMetricRead, expectedDigest: selectedExpectedDigest},
    };
  }

  const detailedResults = {
    schemaVersion: 'riose.experiment-format-study/v1',
    generatedAt: new Date().toISOString(),
    decision: {
      default: 'JSON/JSONL',
      parquet: 'no-go for adoption in this study: no Python Arrow/Parquet engine or Node Parquet/DuckDB package is installed in the existing toolchain; no dependency was added.',
      threshold: 'Reconsider columnar storage only when repeated representative runs show at least 2x end-to-end benefit in the dominant workload or selective-column access is required at a volume where whole-record parsing is material, and the added dependency/runtime footprint is acceptable.',
    },
    workload: {
      runner: 'scripts/run-scenarios.js executeScenario',
      fixture: 'tests/scenarios/baseline-pasture.json',
      comparedRecordShape: 'batch manifest run joined to riose-experiment-result v1 by runId',
      records: recordCount,
      animalsPerRecord: animalCount,
      hoursPerRun: hours,
      seedRange: [fixture.engine.seed, fixture.engine.seed + recordCount - 1],
      exactNormalizedRoundTrip: true,
      sha256: expectedDigest,
      batchManifestDigest: manifest.manifestDigest,
      roundTripCoverage: ['unit-tagged inputs and outputs', 'null dataset/evidence provenance', 'engine identity and build digest', 'scenario digest and seed', 'result digest and status'],
    },
    toolchain: {
      node: process.version,
      platform: process.platform,
      python: pythonToolchain.version,
      pyarrowAvailable: pythonToolchain.packages.pyarrow.available,
      fastparquetAvailable: pythonToolchain.packages.fastparquet.available,
      pyarrow: pythonToolchain.packages.pyarrow,
      fastparquet: pythonToolchain.packages.fastparquet,
      pythonDuckdb: pythonToolchain.packages.duckdb,
      pythonPolars: pythonToolchain.packages.polars,
      nodePackages: nodeFormatToolchain,
      parquetEnginesAvailable: Object.values(pythonToolchain.packages).some(pkg => pkg.available) || Object.values(nodeFormatToolchain).some(pkg => pkg.available),
      parquetMeasurement: Object.values(pythonToolchain.packages).some(pkg => pkg.available) || Object.values(nodeFormatToolchain).some(pkg => pkg.available) ? 'available-library-not-yet-benchmarked' : 'skipped-no-library-installed',
      note: 'Installed package bytes are reported only for Python distributions that exist; Node packages are checked by resolution only. Transitive dependency footprint and portability across target environments require a separate packaging study.',
    },
    storage: {jsonBytes, jsonlBytes, jsonGzipLevel6Bytes: jsonGzipBytes, jsonlGzipLevel6Bytes: jsonlGzipBytes},
    measurements: results,
    memoryMethod: 'process.memoryUsage heapUsed/RSS/external/ArrayBuffers sampled before and after each operation; RSS is process-level. Output includes last sample and is not a peak-memory claim.',
    selectiveReadMethod: 'JSON parses the full array before projecting fields. JSONL streams one line at a time and retains only the requested projection, but each selected row still requires parsing its complete JSON object; Parquet was unavailable.',
    limitations: [
      'One fixed scenario fixture is expanded into a deterministic 25-record (by default) batch; it is a representative experiment-runner record shape, not a survey of every future output contract.',
      'JSONL and JSON contain identical full records; no fields, units, nulls, provenance or failures are dropped.',
      `No Parquet results are reported because ${Object.values(pythonToolchain.packages).some(pkg => pkg.available) || Object.values(nodeFormatToolchain).some(pkg => pkg.available) ? 'an installed library requires a separately validated Parquet adapter before comparison' : 'no Arrow/Parquet or DuckDB library is present in the current Python or Node toolchain'}; no network install or new dependency was introduced.`,
      'Timing is specific to this host and includes local file IO; medians/spread are not cross-host product thresholds.',
    ],
  };
  const experimentPopulation = {count: recordCount, unit: 'experiment-run records', scope: 'serialized experiment batch'};
  const source = 'scripts/research_experiment_format.mjs; current FarmEngine scenario runner and batch manifest/result contract';
  const phaseMeasurements = [];
  const addSamples = (metric, unit, samples, population = experimentPopulation, method = source) => {
    phaseMeasurements.push(measurement('serialization', metric, unit, {
      ...summarizeSamples(samples),
      rawObservations: samples,
    }, {population, source: method}));
  };
  const addMemorySamples = (format, operation, operationReport) => {
    for (const memoryKey of ['heapUsedBytes', 'rssProcessBytes', 'externalBytes', 'arrayBuffersBytes']) {
      addSamples(`${format}-${operation}-${memoryKey}-delta`, 'bytes',
        operationReport.processMemorySamples.map(sample => sample.deltas[`${memoryKey}DeltaBytes`]),
        experimentPopulation, `${source}; process.memoryUsage before and after each ${operation} operation`);
    }
  };
  for (const [format, result] of Object.entries(results)) {
    addSamples(`${format}-write-duration`, 'ms', result.write.durationsMs);
    addSamples(`${format}-full-read-duration`, 'ms', result.fullRead.durationsMs);
    addSamples(`${format}-selective-read-duration`, 'ms', result.selectiveMetricRead.durationsMs);
    addSamples(`${format}-uncompressed-size`, 'bytes', [result.bytes]);
    addSamples(`${format}-gzip-level-6-size`, 'bytes', [result.gzipLevel6Bytes]);
    addMemorySamples(format, 'write', result.write);
    addMemorySamples(format, 'full-read', result.fullRead);
    addMemorySamples(format, 'selective-read', result.selectiveMetricRead);
  }
  const report = benchmarkReport({
    name: 'json-jsonl-experiment-output-format-study',
    runtime: {
      python: pythonToolchain.version,
      pyarrowAvailable: pythonToolchain.packages.pyarrow.available,
      fastparquetAvailable: pythonToolchain.packages.fastparquet.available,
      pythonDuckdbAvailable: pythonToolchain.packages.duckdb.available,
      pythonPolarsAvailable: pythonToolchain.packages.polars.available,
      nodeParquetPackagesAvailable: Object.values(nodeFormatToolchain).some(pkg => pkg.available),
    },
    workload: {
      seed: `${fixture.engine.seed}-${fixture.engine.seed + recordCount - 1} (per-record deterministic seed range)`,
      populations: [
        experimentPopulation,
        {animals: animalCount, scope: 'animals per scenario run'},
      ],
      records: recordCount,
      hoursPerRun: hours,
      fixture: 'tests/scenarios/baseline-pasture.json',
    },
    configuration: {warmupRuns: {write: 1, fullRead: 1, selectiveMetricRead: 0}, repetitions},
    phases: {serialization: {status: 'measured', measurements: phaseMeasurements}},
    timingBoundaries: [
      {phase: 'serialization', timed: ['JSON stringify plus local file write', 'JSONL row serialization plus local file write'], notTimed: ['scenario execution and manifest/result construction', 'gzip compression; compressed byte count only', 'process memory sampling']},
      {phase: 'serialization', timed: ['full file read, parse, and normalized digest for JSON', 'full line-stream read, parse, accumulation, and normalized digest for JSONL'], notTimed: ['scenario execution', 'manifest/result construction']},
      {phase: 'serialization', timed: ['JSON full-array parse then selected-field projection and digest', 'JSONL line-stream parse, selected-field projection, and digest'], notTimed: ['scenario execution', 'manifest/result construction']},
    ],
    results: detailedResults,
    limitations: detailedResults.limitations,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(tempDirectory, {recursive: true, force: true});
}
