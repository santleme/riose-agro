import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {assertBenchmarkReport} from '../scripts/benchmarks/benchmark-report.mjs';

const root = new URL('..', import.meta.url);
const repo = fileURLToPath(root);
const run = (script, args = [], env = {}, nodeOptions = []) => execFileSync(process.execPath, [...nodeOptions, script, ...args], {
  cwd: repo,
  encoding: 'utf8',
  env: {...process.env, ...env},
  maxBuffer: 32 * 1024 * 1024,
});

function assertMeasurements(report) {
  assertBenchmarkReport(report);
  for (const phase of Object.values(report.phases)) {
    for (const item of phase.measurements) {
      assert.equal(typeof item.source, 'string');
      assert.ok(item.source.trim());
      assert.ok(item.population !== undefined);
    }
  }
}

test('public benchmark adapters emit schema-valid envelopes and retain raw observations', async t => {
  const temp = await mkdtemp(join(os.tmpdir(), 'riose-benchmark-adapters-'));
  t.after(() => rm(temp, {recursive: true, force: true}));

  const animalPath = join(temp, 'animal.json');
  const animalSummary = JSON.parse(run('scripts/benchmarks/benchmark-animal-layout.mjs', [], {
    ANIMAL_LAYOUT_REPETITIONS: '5',
    ANIMAL_LAYOUT_OUTPUT: animalPath,
  }, ['--expose-gc']));
  const animal = JSON.parse(await readFile(animalPath, 'utf8'));
  assert.equal(animalSummary.resultPath, animalPath);
  assertMeasurements(animal);
  assert.equal(animal.workload.seed, 417);
  assert.deepEqual([...new Set(animal.results.rows.map(row => row.animals))], [100, 1000, 10000]);
  assert.deepEqual([...new Set(animal.results.rows.map(row => row.hour))], [7, 22]);
  assert.ok(animal.results.rows.every(row => row.complexity.productionCodeChanged === false));
  assert.equal(animal.results.rows.length, 6);
  assert.ok(animal.results.rows[0].measurements.aosEndToEnd.observations.length >= 5);
  assert.ok(animal.phases.engine.measurements[0].statistics.sampleCount >= 5);
  assert.ok(animal.phases.worker.measurements.length > 0);
  assert.equal(animal.decisionEvidence.comparisons.length, animal.results.rows.length);
  assert.equal(animal.decision, animal.decisionEvidence.recommendation);
  assert.match(animal.decisionEvidence.rule, /counterbalanced paired samples/);
  assert.ok(animal.results.rows.every(row => row.pairedComparison.paired
    && row.pairedComparison.orderBySample.length === animal.workload.repetitions
    && row.pairedComparison.orderBySample.every((order, index, orders) => index === 0 || order !== orders[index - 1])));
  assert.ok(animal.decisionEvidence.comparisons.every(comparison =>
    comparison.repeatableNetWin === (comparison.soaEndToEndMedianMs < comparison.aosMedianMs
      && comparison.sampleWinRate >= animal.decisionEvidence.requiredSampleWinRate)));

});

test('simulation and history benchmark adapters emit schema-valid reports with raw samples', () => {
  const simulation = JSON.parse(run('scripts/benchmarks/benchmark-simulation.mjs', [], {
    BENCH_REPETITIONS: '1',
    BENCH_SIMULATION_WARMUPS: '0',
    BENCH_KERNEL_WARMUPS: '0',
    BENCH_SNAPSHOT_WARMUPS: '0',
  }));
  assertMeasurements(simulation);
  assert.equal(simulation.configuration.repetitions, 1);
  assert.equal(simulation.schemaVersion, 2);
  assert.equal(simulation.phases.memory.measurements[0].memoryType, 'wasm-memory');
  assert.ok(simulation.phases.engine.measurements.every(item => item.statistics.observationsMs?.length === 1));
  assert.ok(simulation.phases.engine.measurements.some(item => item.population === 100_000 && item.scope === 'numeric-kernel'));

  const historyReports = run('scripts/benchmarks/benchmark-history.mjs', [], {BENCH_REPETITIONS: '1', BENCH_HERDS: '1000'})
    .trim().split('\n').map(line => JSON.parse(line));
  assert.equal(historyReports.length, 1);
  const [history] = historyReports;
  assertMeasurements(history);
  assert.equal(history.configuration.repetitions, 1);
  assert.equal(history.results.animals, 1000);
  assert.equal(history.results.snapshotsIdentical, true);
  assert.ok(history.phases.engine.measurements.every(item => item.observationsMs?.length === 1));
  assert.ok(history.phases.snapshot.measurements.every(item => item.observationsMs?.length === 1));
});

test('history storage adapter preserves typed memory observations separately from timing', () => {
  const reports = run('scripts/benchmarks/benchmark-history-storage.mjs', [], {
    BENCH_REPETITIONS: '2', BENCH_HISTORY_HERDS: '1000', BENCH_HISTORY_HOURS: '24',
  }).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(reports.length, 1);
  const [report] = reports;
  assertMeasurements(report);
  assert.equal(report.schemaVersion, 2);
  assert.ok(report.phases.memory.measurements.some(item => item.memoryType === 'retained-heap'));
  assert.ok(report.phases.memory.measurements.some(item => item.memoryType === 'process-rss'));
  assert.ok(report.phases.memory.measurements.every(item => item.statistics.rawObservations.length === 2));
});

test('scenario scheduler emits computational benchmark observations', async () => {
  const scheduler = JSON.parse(run('scripts/benchmarks/benchmark-scenario-scheduler.mjs', [], {RIOSE_SCHEDULER_REPETITIONS: '1'}));
  assertMeasurements(scheduler);
  assert.equal(scheduler.configuration.repetitions, 1);
  assert.equal(scheduler.results.rows.length, scheduler.configuration.concurrencyCases.length);
  assert.ok(scheduler.results.rows.every(row => row.samples.length === 1 && row.allPassed
    && Number.isFinite(row.medianCpuUtilizationOneCoreEquivalentPercent)
    && Number.isFinite(row.medianCpuUtilizationHostNormalizedPercent)));
  for (const row of scheduler.results.rows) {
    const sample = row.samples[0];
    const expectedOneCore = sample.processCpuMs.total / sample.wallMs * 100;
    assert.ok(Math.abs(sample.cpuUtilization.oneCoreEquivalentPercent - expectedOneCore) <= 0.002);
    assert.ok(Math.abs(sample.cpuUtilization.hostNormalizedPercent
      - expectedOneCore / scheduler.environment.reportedAvailableParallelism) <= 0.002);
    assert.equal(sample.cpuUtilization.normalizationCores, scheduler.environment.reportedAvailableParallelism);
  }
  for (const phase of ['engine', 'startup', 'worker']) {
    assert.ok(scheduler.phases[phase].measurements.every(item => Number.isInteger(item.concurrency)));
  }
  assert.ok(scheduler.phases.worker.measurements[0].statistics.sampleCount > 0);
});
