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

test('shared schema and adapter enforce the same numeric-kernel scope above the FarmEngine limit', () => {
  for (const animals of [99_999, 100_000, 100_001]) {
    const farmReport = sampleReport();
    farmReport.workload.populations[0] = {animals, scope: 'FarmEngine'};
    assert.equal(validate(farmReport), animals < 100_000, `FarmEngine scope at ${animals} animals`);
    if (animals < 100_000) assert.doesNotThrow(() => assertBenchmarkReport(farmReport));
    else assert.throws(() => assertBenchmarkReport(farmReport), /Invalid benchmark report/);

    const kernelReport = sampleReport();
    kernelReport.workload.populations[0] = {animals, scope: 'numeric-kernel-only'};
    assert.equal(validate(kernelReport), true, `numeric kernel scope at ${animals} animals`);
    assert.doesNotThrow(() => assertBenchmarkReport(kernelReport));
  }
});

test('benchmark adapter requires a timing boundary for every measured phase', () => {
  const report = sampleReport();
  report.timingBoundaries = [{phase: 'render', timed: ['Canvas submission.'], notTimed: []}];
  assert.throws(() => assertBenchmarkReport(report), /measured phase "engine" has no timing boundary/);
});
