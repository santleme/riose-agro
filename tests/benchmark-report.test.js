import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import {assertBenchmarkReport, benchmarkReport, measurement, summarizeSamples} from '../scripts/benchmark-report.mjs';

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

test('versioned benchmark adapter output validates against the shared JSON Schema and retains observations', () => {
  const report = sampleReport();
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.deepEqual(report.results.rawSamples, [3, 1, 2]);
  assert.deepEqual(report.phases.engine.measurements[0].observations, [3, 1, 2]);
  assert.equal(report.workload.populations[0].animals, 100);
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
  notMeasured.timingBoundaries = [{phase: 'snapshot', timed: ['No timed work.'], notTimed: []}];
  assert.equal(validate(notMeasured), true);
  assert.doesNotThrow(() => assertBenchmarkReport(notMeasured));
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

test('benchmark report enforces the separate FarmEngine, renderer, and numeric-kernel population limits', () => {
  for (const scope of ['FarmEngine', 'FarmEngine and Worker', 'renderer', 'FarmEngine and renderer', 'farmengine', 'RenderER']) {
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
  }), /exceeds its FarmEngine\/renderer limit of 6000/);
});

test('benchmark adapter requires a timing boundary for every measured phase', () => {
  const report = sampleReport();
  report.timingBoundaries = [{phase: 'render', timed: ['Canvas submission.'], notTimed: []}];
  assert.throws(() => assertBenchmarkReport(report), /measured phase "engine" has no timing boundary/);
});
