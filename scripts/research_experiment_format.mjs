import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {executeScenario} from './run-scenarios.js';

const repetitions = Number(process.env.FORMAT_STUDY_REPETITIONS ?? 9);
const recordCount = Number(process.env.FORMAT_STUDY_RECORDS ?? 25);
const animalCount = 100;
const hours = 24;
const fixture = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));

if (!Number.isInteger(repetitions) || repetitions < 3) throw new RangeError('FORMAT_STUDY_REPETITIONS must be an integer >= 3');
if (!Number.isInteger(recordCount) || recordCount < 1) throw new RangeError('FORMAT_STUDY_RECORDS must be a positive integer');

const records = Array.from({length: recordCount}, (_, index) => {
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
  return result;
});

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
  let lastMemory = null;
  for (let iteration = 0; iteration < repetitions; iteration++) {
    if (typeof global.gc === 'function') global.gc();
    const before = sampleMemory();
    const started = performance.now();
    const value = await operation(iteration);
    durations.push(performance.now() - started);
    const after = sampleMemory();
    lastMemory = {before, after, retainedHeapDeltaBytes: after.heapUsedBytes - before.heapUsedBytes};
    if (value !== undefined) assert.equal(value, expected);
  }
  return {medianMs: median(durations), minMs: Math.min(...durations), maxMs: Math.max(...durations), durationsMs: durations, processMemoryLastSample: lastMemory};
}

try {
  const jsonPath = path.join(tempDirectory, 'batch.json');
  const jsonlPath = path.join(tempDirectory, 'batch.jsonl');
  const workloads = {
    json: {
      write: () => writeFile(jsonPath, jsonText),
      read: async () => digest(JSON.parse(await readFile(jsonPath, 'utf8'))),
      selectiveMetricRead: async () => {
        const parsed = JSON.parse(await readFile(jsonPath, 'utf8'));
        return digest(parsed.map(record => ({scenarioId: record.scenarioId, totalIntakeKgDM: record.result.metrics.intake.totalKgDM})));
      },
    },
    jsonl: {
      write: () => writeFile(jsonlPath, jsonlText),
      read: async () => digest((await readFile(jsonlPath, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line))),
      selectiveMetricRead: async () => {
        const lines = (await readFile(jsonlPath, 'utf8')).trimEnd().split('\n');
        return digest(lines.map(line => {
          const record = JSON.parse(line);
          return {scenarioId: record.scenarioId, totalIntakeKgDM: record.result.metrics.intake.totalKgDM};
        }));
      },
    },
  };

  for (const format of Object.values(workloads)) await format.write();
  for (const [name, format] of Object.entries(workloads)) {
    const actualDigest = await format.read();
    assert.equal(actualDigest, expectedDigest, `${name} round trip changed normalized records`);
  }
  const selectedExpectedDigest = digest(records.map(record => ({scenarioId: record.scenarioId, totalIntakeKgDM: record.result.metrics.intake.totalKgDM})));
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

  const report = {
    schemaVersion: 'riose.experiment-format-study/v1',
    generatedAt: new Date().toISOString(),
    decision: {
      default: 'JSON/JSONL',
      parquet: 'no-go for adoption in this study: neither pyarrow nor fastparquet is installed in the existing Python toolchain; no dependency was added.',
      threshold: 'Reconsider columnar storage only when repeated representative runs show at least 2x end-to-end benefit in the dominant workload or selective-column access is required at a volume where whole-record parsing is material, and the added dependency/runtime footprint is acceptable.',
    },
    workload: {
      runner: 'scripts/run-scenarios.js executeScenario',
      fixture: 'tests/scenarios/baseline-pasture.json',
      records: recordCount,
      animalsPerRecord: animalCount,
      hoursPerRun: hours,
      seedRange: [fixture.engine.seed, fixture.engine.seed + recordCount - 1],
      exactNormalizedRoundTrip: true,
      sha256: expectedDigest,
    },
    toolchain: {node: process.version, platform: process.platform, python: '3.12.3', pyarrowAvailable: false, fastparquetAvailable: false, parquetBinaryFootprintBytes: null, note: 'Parquet was not installed or measured; its dependency and portability costs are therefore unquantified.'},
    storage: {jsonBytes, jsonlBytes, jsonGzipLevel6Bytes: jsonGzipBytes, jsonlGzipLevel6Bytes: jsonlGzipBytes},
    measurements: results,
    memoryMethod: 'process.memoryUsage heapUsed/RSS/external/ArrayBuffers sampled before and after each operation; RSS is process-level. Output includes last sample and is not a peak-memory claim.',
    selectiveReadMethod: 'Both formats read the file and parse every whole record before selecting scenarioId and total intake. JSONL does not provide column projection; Parquet was unavailable.',
    limitations: [
      'One fixed scenario fixture is expanded into a deterministic 25-record (by default) batch; it is a representative experiment-runner record shape, not a survey of every future output contract.',
      'JSONL and JSON contain identical full records; no fields, units, nulls, provenance or failures are dropped.',
      'No Parquet results are reported because no Arrow/Parquet library is present in the current toolchain; no network install or new dependency was introduced.',
      'Timing is specific to this host and includes local file IO; medians/spread are not cross-host product thresholds.',
    ],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(tempDirectory, {recursive: true, force: true});
}
