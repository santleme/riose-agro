import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import {assertBenchmarkReport, benchmarkComparison, benchmarkReport, measurement, summarizeSamples} from '../scripts/benchmarks/benchmark-report.mjs';

const schema = JSON.parse(readFileSync(new URL('../docs/architecture/benchmark-report.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({allErrors: true, strict: false}).compile(schema);

function sampleReport() {
  const rawSamples = [3, 1, 2];
  return benchmarkReport({
    name: 'test-adapter',
    workload: {seed: 17, populations: [{animals: 100, scope: 'FarmEngine', limit: 'FarmEngine maximum 10000'}]},
    configuration: {warmupRuns: 1, repetitions: rawSamples.length},
    phases: {engine: {status: 'measured', measurements: [measurement('engine', 'tick', 'ms', summarizeSamples(rawSamples), {observations: rawSamples})]}},
    timingBoundaries: [{phase: 'engine', timed: ['One complete FarmEngine tick.'], notTimed: ['FarmEngine construction.', 'Rendering.']}],
    results: {rawSamples},
    limitations: ['Synthetic fixture only.'],
  });
}

function schedulerReport() {
  const report = sampleReport();
  report.benchmark.name = 'scenario-scheduler-concurrency';
  report.configuration.concurrencyCases = [1, 2];
  report.results = {
    environment: {reportedAvailableParallelism: 2, workloadAvailableWorkers: 2},
    workload: {scenarios: 2, hours: 24, seeds: [1, 2]},
    measurement: {},
    rows: [
      {concurrency: 1, medianCpuUtilizationOneCoreEquivalentPercent: 25, medianCpuUtilizationHostNormalizedPercent: 12.5,
        samples: [{wallMs: 10, processCpuMs: {user: 2, system: 0.5, total: 2.5}, cpuUtilization: {oneCoreEquivalentPercent: 25, hostNormalizedPercent: 12.5, normalizationCores: 2}}]},
      {concurrency: 2, medianCpuUtilizationOneCoreEquivalentPercent: 60, medianCpuUtilizationHostNormalizedPercent: 30,
        samples: [{wallMs: 10, processCpuMs: {user: 4, system: 2, total: 6}, cpuUtilization: {oneCoreEquivalentPercent: 60, hostNormalizedPercent: 30, normalizationCores: 2}}]},
    ],
  };
  return report;
}

test('versioned benchmark adapter output validates against the shared JSON Schema and retains observations', () => {
  const report = sampleReport();
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.deepEqual(report.results.rawSamples, [3, 1, 2]);
  assert.deepEqual(report.phases.engine.measurements[0].observations, [3, 1, 2]);
  assert.equal(report.workload.populations[0].animals, 100);
});

test('benchmark report accepts an empty Git status as a clean source state', () => {
  const report = sampleReport();
  assert.match(report.benchmark.source.revision, /^[a-f0-9]{40}$/);
  assert.equal(typeof report.benchmark.source.dirty, 'boolean');
});

test('benchmark schema rejects missing boundaries, seed, or population metadata', () => {
  const mutations = [
    ['missing timing boundaries', report => {delete report.timingBoundaries;}],
    ['missing workload seed', report => {delete report.workload.seed;}],
    ['missing workload population', report => {delete report.workload.populations;}],
    ['missing timed boundary', report => {delete report.timingBoundaries[0].timed;}],
    ['measurement missing source', report => {delete report.phases.engine.measurements[0].source;}],
    ['measurement missing population', report => {delete report.phases.engine.measurements[0].population;}],
    ['measurement missing unit', report => {delete report.phases.engine.measurements[0].unit;}],
  ];
  for (const [label, mutate] of mutations) {
    const report = sampleReport();
    mutate(report);
    assert.equal(validate(report), false, label);
  }
});

test('scenario scheduler reports per-run one-core and host-normalized CPU utilization', () => {
  const report = schedulerReport();
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.doesNotThrow(() => assertBenchmarkReport(report));

  const missingUtilization = schedulerReport();
  delete missingUtilization.results.rows[1].samples[0].cpuUtilization.hostNormalizedPercent;
  assert.equal(validate(missingUtilization), false);
  assert.throws(() => assertBenchmarkReport(missingUtilization), /Invalid benchmark report/);

  const inconsistentUtilization = schedulerReport();
  inconsistentUtilization.results.rows[1].samples[0].cpuUtilization.hostNormalizedPercent = 31;
  inconsistentUtilization.results.rows[1].medianCpuUtilizationHostNormalizedPercent = 31;
  assert.equal(validate(inconsistentUtilization), true, 'JSON schema validates the shape; semantic validator checks the formula');
  assert.throws(() => assertBenchmarkReport(inconsistentUtilization), /host-normalized CPU utilization/);
});

test('benchmark report requires numeric warmup and repetition counts, including per-phase warmup maps', () => {
  for (const [label, mutate] of [
    ['missing warmups', report => {delete report.configuration.warmupRuns;}],
    ['null warmups', report => {report.configuration.warmupRuns = null;}],
    ['negative warmups', report => {report.configuration.warmupRuns = -1;}],
    ['invalid per-phase warmups', report => {report.configuration.warmupRuns = {engine: null};}],
    ['missing repetitions', report => {delete report.configuration.repetitions;}],
    ['null repetitions', report => {report.configuration.repetitions = null;}],
    ['zero repetitions', report => {report.configuration.repetitions = 0;}],
  ]) {
    const report = sampleReport();
    mutate(report);
    assert.equal(validate(report), false, label);
    assert.throws(() => assertBenchmarkReport(report), /configuration\.(warmupRuns|repetitions)/, label);
  }

  const perPhaseWarmups = sampleReport();
  perPhaseWarmups.configuration.warmupRuns = {engine: 0, snapshot: 2};
  assert.equal(validate(perPhaseWarmups), true);
  assert.doesNotThrow(() => assertBenchmarkReport(perPhaseWarmups));
});

test('clean benchmark captures require a valid source revision while dirty captures may omit it', () => {
  for (const [label, mutate] of [
    ['missing revision', report => {delete report.benchmark.source.revision;}],
    ['null revision', report => {report.benchmark.source.revision = null;}],
    ['invalid revision', report => {report.benchmark.source.revision = 'not-a-commit';}],
  ]) {
    const report = sampleReport();
    report.benchmark.source.dirty = false;
    mutate(report);
    assert.equal(validate(report), false, label);
    assert.throws(() => assertBenchmarkReport(report), /clean capture requires a valid hexadecimal source revision/, label);
  }

  const dirtyWithoutRevision = sampleReport();
  dirtyWithoutRevision.benchmark.source.dirty = true;
  dirtyWithoutRevision.benchmark.source.revision = null;
  assert.equal(validate(dirtyWithoutRevision), true);
  assert.doesNotThrow(() => assertBenchmarkReport(dirtyWithoutRevision));
});

test('measured phases require sample count, median, and spread statistics', () => {
  for (const [label, mutate] of [
    ['missing sample count', report => {delete report.phases.engine.measurements[0].statistics.sampleCount;}],
    ['null sample count', report => {report.phases.engine.measurements[0].statistics.sampleCount = null;}],
    ['missing median', report => {delete report.phases.engine.measurements[0].statistics.median;}],
    ['null median', report => {report.phases.engine.measurements[0].statistics.median = null;}],
    ['missing spread', report => {delete report.phases.engine.measurements[0].statistics.spread;}],
    ['null spread', report => {report.phases.engine.measurements[0].statistics.spread = null;}],
    ['incomplete spread', report => {report.phases.engine.measurements[0].statistics.spread = {min: 1, max: 3};}],
  ]) {
    const report = sampleReport();
    mutate(report);
    assert.equal(validate(report), false, label);
    assert.throws(() => assertBenchmarkReport(report), /Invalid benchmark report/, label);
  }

  const notMeasured = sampleReport();
  notMeasured.phases.engine = {status: 'not-measured', measurements: []};
  notMeasured.timingBoundaries = [{phase: 'snapshot', timed: ['No timed work.'], notTimed: [], whatIsTimed: ['No timed work.'], whatIsNotTimed: []}];
  assert.equal(validate(notMeasured), true);
  assert.doesNotThrow(() => assertBenchmarkReport(notMeasured));
});

test('measured statistics must agree with retained raw observations', () => {
  for (const [label, mutate] of [
    ['sample count', report => {report.phases.engine.measurements[0].statistics.sampleCount++;}],
    ['median', report => {report.phases.engine.measurements[0].statistics.median = 99;}],
    ['spread', report => {report.phases.engine.measurements[0].statistics.spread.range = 0;}],
  ]) {
    const report = sampleReport();
    mutate(report);
    assert.throws(() => assertBenchmarkReport(report), /statistics do not match its raw observations/, label);
  }

  const nonNumericObservations = sampleReport();
  nonNumericObservations.phases.engine.measurements[0].observations = ['fast'];
  assert.throws(() => assertBenchmarkReport(nonNumericObservations), /statistics do not match its raw observations/);

  const unavailable = sampleReport();
  unavailable.phases.engine.measurements[0].statistics = {sampleCount: 0, median: null, spread: null};
  unavailable.phases.engine.measurements[0].observations = [];
  assert.doesNotThrow(() => assertBenchmarkReport(unavailable));
});

test('benchmark adapter refuses implicit seed/population defaults and conflated 100k animal scope', () => {
  const common = {
    name: 'invalid-test',
    timingBoundaries: [{phase: 'engine', timed: ['Tick.'], notTimed: []}],
    results: {},
    limitations: [],
  };
  assert.throws(() => benchmarkReport({...common, workload: {populations: [{animals: 100, scope: 'FarmEngine'}]}}), /explicit workload.seed/);
  assert.throws(() => benchmarkReport({...common, workload: {seed: 1}}), /explicit workload population/);
  assert.throws(() => benchmarkReport({...common, workload: {seed: 1, populations: [{animals: 100_000, scope: 'FarmEngine'}]}}), /numeric-kernel-only/);
  assert.throws(() => assertBenchmarkReport({...sampleReport(), workload: {seed: 1, populations: []}}), /Invalid benchmark report/);
});

test('shared schema and adapter enforce separate FarmEngine and numeric-kernel ceilings', () => {
  for (const animals of [9_999, 10_000, 10_001]) {
    const farmReport = sampleReport();
    farmReport.workload.populations[0] = {animals, scope: 'FarmEngine'};
    assert.equal(validate(farmReport), animals <= 10_000, `FarmEngine scope at ${animals} animals`);
    if (animals <= 10_000) assert.doesNotThrow(() => assertBenchmarkReport(farmReport));
    else assert.throws(() => assertBenchmarkReport(farmReport), /Invalid benchmark report/);
  }

  for (const animals of [99_999, 100_000, 100_001]) {
    const kernelReport = sampleReport();
    kernelReport.workload.populations[0] = {animals, scope: 'numeric-kernel-only'};
    assert.equal(validate(kernelReport), animals <= 100_000, `numeric kernel scope at ${animals} animals`);
    if (animals <= 100_000) assert.doesNotThrow(() => assertBenchmarkReport(kernelReport));
    else assert.throws(() => assertBenchmarkReport(kernelReport), /Invalid benchmark report/);
  }
});

test('benchmark report enforces FarmEngine and numeric-kernel population limits', () => {
  for (const scope of ['FarmEngine', 'FarmEngine and Worker', 'farmengine']) {
    const report = sampleReport();
    report.workload.populations[0] = {animals: 10_001, scope};
    assert.equal(validate(report), false, `${scope} must remain within the 10000-animal ceiling`);
    assert.throws(() => assertBenchmarkReport(report), /Invalid benchmark report/);
  }

  const numericReport = sampleReport();
  numericReport.workload.populations[0] = {animals: 100_001, scope: 'numeric-kernel-only'};
  assert.throws(() => benchmarkReport({
    name: 'oversized-kernel',
    workload: numericReport.workload,
    limits: {numericKernelMaxAnimalsMeasured: 100_000},
    timingBoundaries: [{phase: 'engine', timed: ['Numeric kernel batch.'], notTimed: []}],
    results: {},
  }), /exceeds its numeric-kernel measurement limit of 100000/);

  assert.throws(() => benchmarkReport({
    name: 'custom-engine-limit',
    workload: {seed: 1, populations: [{animals: 6_001, scope: 'FarmEngine'}]},
    limits: {farmEngineMaxAnimals: 6_000},
    timingBoundaries: [{phase: 'engine', timed: ['Engine tick.'], notTimed: []}],
    results: {},
  }), /exceeds its FarmEngine limit of 6000/);
});

test('benchmark adapter requires a timing boundary for every measured phase', () => {
  const report = sampleReport();
  report.timingBoundaries = [{phase: 'render', timed: ['Canvas submission.'], notTimed: [], whatIsTimed: ['Canvas submission.'], whatIsNotTimed: []}];
  assert.throws(() => assertBenchmarkReport(report), /measured phase "engine" has no timing boundary/);
});

test('memory taxonomy, raw observations, units, and duration values are validated', () => {
  const report = sampleReport();
  report.phases.engine.measurements[0] = measurement('engine', 'jsHeapUsedAfterGc', 'bytes', summarizeSamples([0, 10]), {observations: [0, 10]});
  const normalized = benchmarkReport({
    name: 'memory-fixture', workload: report.workload, configuration: report.configuration,
    phases: {engine: {status: 'measured', measurements: [report.phases.engine.measurements[0]]}},
    timingBoundaries: report.timingBoundaries, results: {},
  });
  assert.equal(normalized.phases.engine.measurements[0].memoryType, 'js-heap');
  assert.deepEqual(normalized.phases.engine.measurements[0].statistics.rawObservations, [0, 10]);
  assert.equal(normalized.hardware.gpuMemoryBytes, null);

  const invalidType = structuredClone(normalized);
  invalidType.phases.engine.measurements[0].memoryType = 'gpu-from-js-heap';
  assert.equal(validate(invalidType), false);
  assert.throws(() => assertBenchmarkReport(invalidType), /Invalid benchmark report/);

  const missingType = structuredClone(normalized);
  delete missingType.phases.engine.measurements[0].memoryType;
  assert.throws(() => assertBenchmarkReport(missingType), /requires .*memoryType/);

  const lostSamples = structuredClone(normalized);
  delete lostSamples.phases.engine.measurements[0].statistics.rawObservations;
  delete lostSamples.phases.engine.measurements[0].observations;
  assert.throws(() => assertBenchmarkReport(lostSamples), /preserve numeric raw observations/);

  const negativeDuration = sampleReport();
  negativeDuration.phases.engine.measurements[0].statistics = summarizeSamples([-1]);
  negativeDuration.phases.engine.measurements[0].observations = [-1];
  assert.throws(() => assertBenchmarkReport(negativeDuration), /finite non-negative values/);

  for (const [metric, expectedType] of [
    ['jsHeapBytes', 'js-heap'], ['retainedHeapBytes', 'retained-heap'], ['processRssBytes', 'process-rss'],
    ['serializedPayloadBytes', 'serialized-payload'], ['wasmLinearMemoryBytes', 'wasm-memory'], ['gpuMemoryBytes', 'gpu-memory'],
    ['externalMemoryBytes', 'v8-external-memory'], ['arrayBuffersBytes', 'arraybuffer-memory'],
    ['postGcRetainedExternalDelta', 'v8-external-memory'], ['postGcRetainedExternalDeltaPerAnimal', 'v8-external-memory'],
    ['postGcRetainedArrayBuffersDelta', 'arraybuffer-memory'], ['postGcRetainedArrayBuffersDeltaPerAnimal', 'arraybuffer-memory'],
  ]) {
    const typed = benchmarkReport({
      name: 'memory-type-fixture', workload: report.workload, configuration: report.configuration,
      phases: {memory: {status: 'measured', measurements: [measurement('memory', metric, 'bytes', summarizeSamples([12]), {observations: [12]})]}},
      timingBoundaries: [{phase: 'memory', timed: [`Read ${metric}.`], notTimed: []}], results: {},
    });
    assert.equal(typed.phases.memory.measurements[0].memoryType, expectedType);
  }
});

test('report version is fixed and incompatible hosts/revisions are explicitly non-comparable', () => {
  const left = sampleReport();
  const wrongVersion = structuredClone(left);
  wrongVersion.schemaVersion = 3;
  assert.equal(validate(wrongVersion), false);
  assert.throws(() => assertBenchmarkReport(wrongVersion), /Invalid benchmark report/);

  const missingReadinessPhase = structuredClone(left);
  delete missingReadinessPhase.phases.coldStartup;
  assert.equal(validate(missingReadinessPhase), false);

  left.runtime.browser = 'Chromium 156';
  left.benchmark.source.revision = 'abcdef0123456';
  const right = structuredClone(left);
  assert.deepEqual(benchmarkComparison(left, right), {comparable: true, reasons: []});
  right.runtime.browser = 'Firefox 143';
  right.hardware.cpu = 'Other CPU';
  right.benchmark.source.revision = '123456abcdef0';
  const comparison = benchmarkComparison(left, right);
  assert.equal(comparison.comparable, false);
  assert.ok(comparison.reasons.some(reason => reason.startsWith('browser differs')));
  assert.ok(comparison.reasons.some(reason => reason.startsWith('CPU differs')));
  assert.ok(comparison.reasons.some(reason => reason.startsWith('revision differs')));
});

test('#113 readiness fixture can represent its required timing phases without implementing them', () => {
  const phases = ['coldStartup', 'warmStartup', 'engine', 'worker', 'bridgeMarshaling', 'fullScenario', 'uiEndToEnd', 'memory'];
  const report = benchmarkReport({
    name: 'issue-113-readiness-fixture',
    workload: {seed: 'deterministic readiness fixture', populations: [{count: 1, unit: 'scenario', scope: 'fixture'}]},
    configuration: {warmupRuns: 1, repetitions: 1},
    phases: Object.fromEntries(phases.map(phase => [phase, {status: 'measured', measurements: [measurement(phase, phase === 'memory' ? 'jsHeapAfterGc' : 'elapsed', phase === 'memory' ? 'bytes' : 'ms', summarizeSamples([1]), {observations: [1]})]}])),
    timingBoundaries: phases.map(phase => ({phase, timed: [`Fixture boundary for ${phase}.`], notTimed: ['Other phases.']})),
    results: {readinessOnly: true}, limitations: ['Synthetic contract fixture; no #113 implementation or benchmark claim.'],
  });
  assert.equal(report.schemaVersion, 2);
  assert.ok(phases.every(phase => report.phases[phase].status === 'measured'));
  assert.equal(report.phases.memory.measurements[0].memoryType, 'js-heap');
  assert.doesNotThrow(() => assertBenchmarkReport(report));
});
