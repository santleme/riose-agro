import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import {assertBenchmarkReport} from '../scripts/benchmarks/benchmark-report.mjs';

const root = new URL('..', import.meta.url);
const repo = decodeURIComponent(root.pathname);
const run = (script, args = [], env = {}, nodeOptions = []) => execFileSync(process.execPath, [...nodeOptions, script, ...args], {
  cwd: repo,
  encoding: 'utf8',
  env: {...process.env, ...env},
  maxBuffer: 32 * 1024 * 1024,
});

async function localChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  try {
    for (const entry of (await (await import('node:fs/promises')).readdir(join(os.homedir(), '.cache/ms-playwright'))).filter(name => /^chromium-\d+$/.test(name))) {
      candidates.push(join(os.homedir(), '.cache/ms-playwright', entry, 'chrome-linux64/chrome'));
      candidates.push(join(os.homedir(), '.cache/ms-playwright', entry, 'chrome-linux/chrome'));
    }
  } catch {}
  for (const candidate of candidates.filter(Boolean)) {
    try { await access(candidate); return candidate; } catch {}
  }
  return null;
}

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

  const scene = JSON.parse(run('scripts/graphics/measure-scene-adapter-v1.mjs'));
  assertMeasurements(scene);
  assert.equal(scene.results.results.length, 2);
  assert.ok(scene.results.results[0].observations.loadMs.length > 0);
  assert.ok(scene.results.results[0].observations.adaptMs.length > 0);

  const generated = JSON.parse(run('scripts/graphics/measure-generated-scene-adapter-v1.mjs', [], {
    GENERATED_SCENE_ADAPTER_WARMUPS: '1',
    GENERATED_SCENE_ADAPTER_REPETITIONS: '5',
  }));
  assertMeasurements(generated);
  assert.equal(generated.results.results.length, 2);
  assert.ok(generated.results.results[0].observations.generationMs.length >= 5);
  assert.ok(generated.results.results[0].observations.adaptationMs.length >= 5);

  const farmPath = join(temp, 'farm.json');
  const farm = JSON.parse(run('scripts/benchmarks/benchmark-farm-layout-generator.mjs', ['--output', farmPath], {
    FARM_LAYOUT_WARMUPS: '1',
    FARM_LAYOUT_REPETITIONS: '5',
  }));
  assertMeasurements(farm);
  assert.equal(farm.workload.seed, '417 + deterministic iteration index');
  assert.equal(farm.results.results.length, 3);
  assert.ok(farm.results.results[0].observations.generationMs.length >= 5);
  assert.deepEqual(JSON.parse(await readFile(farmPath, 'utf8')), farm);
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

test('graphics evidence and scenario scheduler use the shared benchmark envelope', async () => {
  const [atlas, herd] = await Promise.all([
    readFile(new URL('../docs/evidence/graphics-atlas-load-2026-10-12.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../docs/evidence/herd-visual-model-benchmark-2026-10.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assertMeasurements(atlas);
  assert.equal(atlas.results.atlasCount, atlas.atlasCount);
  assert.equal(atlas.results.atlases.length, atlas.atlasCount);
  assert.ok(atlas.results.atlases.every(row => row.browserSamples.length === atlas.configuration.repetitions));
  assertMeasurements(herd);
  assert.equal(herd.results.length, 3);
  assert.ok(herd.results.every(row => row.culling.samplesMs.length === herd.configuration.repetitions
    && row.visualUpdateAndGrouping.samplesMs.length === herd.configuration.repetitions
    && row.drawUnitPreparation.samplesMs.length === herd.configuration.repetitions));

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

test('browser and graphics PoC adapters emit valid reports when Chromium is available', async t => {
  const chrome = await localChrome();
  if (!chrome) {
    t.skip('Browser adapter smoke requires Chromium; the standard JavaScript CI job does not install it.');
    return;
  }
  execFileSync('npm', ['run', 'build:graphics-poc'], {cwd: repo, stdio: 'ignore'});
  const server = spawn(process.execPath, ['src/server/server.js'], {cwd: repo, stdio: 'ignore'});
  t.after(() => { if (server.exitCode === null) server.kill('SIGTERM'); });
  const origin = 'http://127.0.0.1:8000/';
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(origin)).ok; } catch {}
    if (ready) break;
    await delay(100);
  }
  assert.equal(ready, true, 'local server starts for browser benchmark smoke');

  const browser = JSON.parse(run('scripts/benchmarks/benchmark-browser.mjs', [], {
    CHROME_BIN: chrome,
    RIOSE_URL: new URL('product.html', origin).href,
    BENCH_REPETITIONS: '1',
  }));
  assertMeasurements(browser);
  assert.equal(browser.configuration.repetitions, 1);
  assert.ok(browser.results.worker.every(row => row.roundTrip24h.observationsMs?.length === 1));
  assert.ok(browser.phases.engine.measurements.every(item => item.statistics.rawObservations?.length === 1));
  assert.ok(browser.phases.engine.measurements.some(item => item.population === 100_000));

  await t.test('graphics PoC adapter emits a report when its built bundle is served', async t => {
    const bundle = await fetch(`${origin}graphics-poc/dist/app.js`);
    if (!bundle.ok) {
      assert.fail(`Built graphics PoC bundle should be explicitly served after the build, received HTTP ${bundle.status}.`);
    }
    const graphics = JSON.parse(run('scripts/graphics/benchmark-graphics-poc.mjs', [], {
      CHROME_BIN: chrome,
      RIOSE_GRAPHICS_URL: `${origin}graphics-poc/index.html`,
      BENCH_HERDS: '100',
      BENCH_DURATION_MS: '300',
      BENCH_WARMUP_MS: '10',
      BENCH_REPEATS: '1',
    }));
    assertMeasurements(graphics);
    assert.equal(graphics.results.results.length > 0, true);
    assert.ok(graphics.results.results.every(row => Number.isFinite(row.frameMeanFps) && row.frameMeanFps > 0),
      `the browser capture must collect real animation-frame samples: ${JSON.stringify(graphics.results.results)}`);
  });
});
