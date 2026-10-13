#!/usr/bin/env node
import {Worker} from 'node:worker_threads';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir, availableParallelism} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {runScenarioDirectoryResumable} from './run-scenarios.js';
import {ScenarioWorkerPool} from './scenario-worker-pool.js';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';

const repetitions = Number(process.env.RIOSE_SCHEDULER_REPETITIONS ?? 4);
const warmupRuns = Number(process.env.RIOSE_SCHEDULER_WARMUPS ?? 1);
const memoryPerWorkerMb = Number(process.env.RIOSE_SCHEDULER_WORKER_MEMORY_MB ?? 128);
const rssPollIntervalMs = 5;
const scenarioTemplate = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));
const scenarioCount = Number(process.env.RIOSE_SCHEDULER_SCENARIO_COUNT ?? 6);
const reportedAvailableParallelism = availableParallelism();
const availableWorkers = Math.min(reportedAvailableParallelism, scenarioCount, 4);
const requestedConcurrencyCases = process.env.RIOSE_SCHEDULER_CONCURRENCIES?.split(',').map(Number);
const concurrencyCases = requestedConcurrencyCases ?? [1, Math.min(2, availableWorkers), availableWorkers];
if (!Number.isSafeInteger(scenarioCount) || scenarioCount < 1 || scenarioCount > 10_000
    || !Number.isSafeInteger(repetitions) || repetitions < 3
    || !Number.isSafeInteger(warmupRuns) || warmupRuns < 0
    || !Number.isSafeInteger(memoryPerWorkerMb) || memoryPerWorkerMb < 16
    || !Array.isArray(concurrencyCases) || concurrencyCases.length === 0
    || concurrencyCases.some(value => !Number.isSafeInteger(value) || value < 1 || value > availableWorkers)
    || new Set(concurrencyCases).size !== concurrencyCases.length) {
  throw new RangeError('invalid scheduler benchmark count, warmup, repetition or memory setting');
}

function startRssMonitor() {
  const worker = new Worker(new URL('./benchmark-rss-monitor.js', import.meta.url), {workerData: {intervalMs: rssPollIntervalMs}});
  return new Promise((resolve, reject) => {
    worker.once('message', message => {
      if (message.type !== 'ready') return reject(new Error('RSS monitor failed to initialize'));
      resolve({stop: () => new Promise((resolveStop, rejectStop) => {
        worker.once('message', result => result.type === 'stopped' ? resolveStop(result) : rejectStop(new Error('RSS monitor returned an invalid result')));
        worker.once('error', rejectStop);
        worker.postMessage({type: 'stop'});
      })});
    });
    worker.once('error', reject);
  });
}

async function once(concurrency, scenarioCount) {
  const root = await mkdtemp(join(tmpdir(), 'riose-scheduler-bench-'));
  const scenarios = join(root, 'scenarios'), results = join(root, 'results');
  let pool;
  let rssMonitor;
  let sample;
  let workerShutdownMs = 0;
  try {
    await mkdir(scenarios);
    for (let index = 0; index < scenarioCount; index++) {
      const scenario = structuredClone(scenarioTemplate);
      scenario.scenarioId = `scheduler-${index}`;
      scenario.engine.seed = 20261012 + index;
      await writeFile(join(scenarios, `scenario-${index}.json`), JSON.stringify(scenario));
    }
    rssMonitor = await startRssMonitor();

    const startupCpuBefore = process.cpuUsage();
    const startupStart = performance.now();
    if (concurrency > 1) {
      pool = new ScenarioWorkerPool(concurrency, {maxOldGenerationSizeMb: memoryPerWorkerMb});
      await pool.ready();
    }
    const workerStartupMs = concurrency > 1 ? performance.now() - startupStart : 0;
    const workerStartupCpu = concurrency > 1 ? process.cpuUsage(startupCpuBefore) : {user: 0, system: 0};

    const cpuBefore = process.cpuUsage();
    const wallStart = performance.now();
    const output = await runScenarioDirectoryResumable(scenarios, results, {
      concurrency,
      ...(concurrency > 1 ? {workerMemoryLimitMb: memoryPerWorkerMb, workerPool: pool} : {}),
    });
    const wallMs = performance.now() - wallStart;
    const cpu = process.cpuUsage(cpuBefore);
    const reportedWallMs = Number(wallMs.toFixed(3));
    const processCpuMs = {user: Number((cpu.user / 1000).toFixed(3)), system: Number((cpu.system / 1000).toFixed(3)), total: Number(((cpu.user + cpu.system) / 1000).toFixed(3))};
    const oneCoreEquivalentPercent = Number((processCpuMs.total / reportedWallMs * 100).toFixed(3));
    const normalizationCores = reportedAvailableParallelism;
    const rss = await rssMonitor.stop();
    rssMonitor = null;
    sample = {
      workerStartupMs: Number(workerStartupMs.toFixed(3)),
      workerStartupCpuMs: {user: Number((workerStartupCpu.user / 1000).toFixed(3)), system: Number((workerStartupCpu.system / 1000).toFixed(3)), total: Number(((workerStartupCpu.user + workerStartupCpu.system) / 1000).toFixed(3))},
      wallMs: reportedWallMs,
      throughputScenariosPerSecond: Number((scenarioCount / (wallMs / 1000)).toFixed(3)),
      processCpuMs,
      cpuUtilization: {
        oneCoreEquivalentPercent,
        hostNormalizedPercent: Number((oneCoreEquivalentPercent / normalizationCores).toFixed(3)),
        normalizationCores,
      },
      peakObservedRssBytes: rss.peakRssBytes,
      rssSamples: rss.samples,
      rssMaxObservedPollGapMs: Number(rss.maxObservedPollGapMs.toFixed(3)),
      allPassed: output.length === scenarioCount && output.every(row => row.passed),
    };
  } finally {
    if (rssMonitor) await rssMonitor.stop();
    if (pool) {
      const shutdownStart = performance.now();
      await pool.close();
      workerShutdownMs = performance.now() - shutdownStart;
    }
    await rm(root, {recursive: true, force: true});
  }
  sample.workerShutdownMs = Number(workerShutdownMs.toFixed(3));
  sample.endToEndMs = Number((sample.workerStartupMs + sample.wallMs + workerShutdownMs).toFixed(3));
  sample.endToEndThroughputScenariosPerSecond = Number((scenarioCount / (sample.endToEndMs / 1000)).toFixed(3));
  return sample;
}

const rows = [];
for (const concurrency of concurrencyCases) {
  for (let warmup = 0; warmup < warmupRuns; warmup++) {
    const result = await once(concurrency, scenarioCount);
    if (!result.allPassed) throw new Error(`scheduler warmup failed at ${scenarioCount} scenarios/concurrency ${concurrency}`);
  }
  const samples = [];
  for (let repetition = 0; repetition < repetitions; repetition++) samples.push(await once(concurrency, scenarioCount));
  const summary = (key, quantile) => {
    const values = samples.map(sample => key.split('.').reduce((value, part) => value?.[part], sample)).sort((a, b) => a - b);
    if (quantile === 0.5) {
      const middle = values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
      return Number(middle.toFixed(3));
    }
    return Number(values[Math.max(0, Math.ceil(values.length * quantile) - 1)].toFixed(3));
  };
  rows.push({scenarioCount,concurrency,workerMemoryLimitMb: concurrency > 1 ? memoryPerWorkerMb : null,
    sampleCount:samples.length,percentileMethod:'nearest-rank; sample p95 is provisional when fewer than 30 independent batch samples are available',samples,
    medianWallMs:summary('wallMs',0.5),p95WallMs:summary('wallMs',0.95),
    medianThroughputScenariosPerSecond:summary('throughputScenariosPerSecond',0.5),
    medianProcessCpuMs:summary('processCpuMs.total',0.5),
    medianCpuUtilizationOneCoreEquivalentPercent:summary('cpuUtilization.oneCoreEquivalentPercent',0.5),
    medianCpuUtilizationHostNormalizedPercent:summary('cpuUtilization.hostNormalizedPercent',0.5),
    medianWorkerStartupMs:summary('workerStartupMs',0.5),medianWorkerStartupCpuMs:summary('workerStartupCpuMs.total',0.5),
    medianEndToEndMs:summary('endToEndMs',0.5),p95EndToEndMs:summary('endToEndMs',0.95),
    medianEndToEndThroughputScenariosPerSecond:summary('endToEndThroughputScenariosPerSecond',0.5),
    medianPeakObservedRssBytes:summary('peakObservedRssBytes',0.5),p95PeakObservedRssBytes:summary('peakObservedRssBytes',0.95),
    allPassed:samples.every(sample=>sample.allPassed)});
}
const environment = {node: process.version, platform: process.platform, arch: process.arch, reportedAvailableParallelism, workloadAvailableWorkers: availableWorkers};
const workload = {scenarios: scenarioCount, hours: scenarioTemplate.run.hours, seeds: Array.from({length: scenarioCount}, (_, index) => 20261012 + index)};
const measurementDetails = {
  workerStartup: 'Worker constructor through ready handshake; separate from workload wall and CPU time',
  processCpu: 'process.cpuUsage delta for the whole Node process during journaled workload; includes CPU used by scenario Worker threads and the RSS monitor thread; worker startup CPU is reported separately',
  cpuUtilization: 'Per sample, one-core-equivalent percent = (whole-process user+system CPU milliseconds / workload wall milliseconds) * 100. It may exceed 100% when multiple threads run simultaneously. Host-normalized percent divides that value by os.availableParallelism(), the OS-reported available parallelism at capture time; it is not a machine-wide OS utilization reading.',
  effectiveWorkerCount: `Concurrency is capped at ${availableWorkers}; the pool is limited to four Workers, available parallelism, and the scenario count.`,
  percentile: `Batch p95 uses nearest-rank from ${repetitions} independent measured batches per concurrency; fewer than 30 samples are provisional.`,
  peakRss: `Independent Worker thread polls process.memoryUsage.rss() every ${rssPollIntervalMs}ms nominally; each sample also records the largest observed gap, making practical timer scheduling resolution explicit. RSS is process-wide and sampled rather than a hard peak guarantee.`,
  rssLimit: 'Not a hard total-process memory limit: worker old-generation caps do not cap young generation, native allocations, main thread, monitor thread, or process RSS; do not sum RSS values or per-worker caps as a total-process bound.',
  includes: ['scenario execution', 'manifest and journal writes', 'result verification'],
  endToEndTime: 'worker startup + workload wall + worker shutdown; serial is workload wall only',
  excludesFromWorkloadTime: ['scenario fixture creation', 'worker startup', 'worker shutdown', 'RSS monitor startup'],
};
const rowMeasurements = rows.flatMap(row => {
  const values = path => row.samples.map(sample => path.split('.').reduce((value, part) => value?.[part], sample));
  const add = (phase, metric, unit, path, source) => measurement(phase, metric, unit,
    summarizeSamples(values(path)), {concurrency: row.concurrency, source});
  return [
    add('engine', 'journaled workload wall time', 'ms', 'wallMs', 'runScenarioDirectoryResumable from first dispatch through verified results'),
    add('engine', 'journaled workload throughput', 'scenarios/s', 'throughputScenariosPerSecond', `${scenarioCount} independent scenario results divided by workload wall time at concurrency ${row.concurrency}`),
    add('engine', 'process CPU total', 'ms', 'processCpuMs.total', measurementDetails.processCpu),
    add('engine', 'CPU utilization, one-core-equivalent', '% of one logical CPU', 'cpuUtilization.oneCoreEquivalentPercent', measurementDetails.cpuUtilization),
    add('engine', 'CPU utilization, host-normalized', '% of os.availableParallelism capacity', 'cpuUtilization.hostNormalizedPercent', measurementDetails.cpuUtilization),
    add('engine', 'end-to-end time', 'ms', 'endToEndMs', 'worker startup + workload wall + worker shutdown; serial path has no worker startup'),
    add('engine', 'end-to-end throughput', 'scenarios/s', 'endToEndThroughputScenariosPerSecond', `${scenarioCount} independent scenario results divided by end-to-end time at concurrency ${row.concurrency}`),
    add('startup', 'worker pool startup', 'ms', 'workerStartupMs', 'Worker constructor through ready handshake; serial case is zero'),
    add('startup', 'worker startup process CPU total', 'ms', 'workerStartupCpuMs.total', 'process.cpuUsage delta during Worker construction through ready handshake; serial case is zero'),
    add('worker', 'sampled process peak RSS', 'bytes', 'peakObservedRssBytes', measurementDetails.peakRss),
  ];
});
const report = benchmarkReport({
  name: 'scenario-scheduler-concurrency',
  runtime: {platform: process.platform},
  workload: {seed: 20261012, populations: [{count: scenarioCount, unit: 'scenarios', scope: 'FarmEngine scenario scheduler; worker concurrency comparison'}], hours: scenarioTemplate.run.hours, scenarioSeeds: workload.seeds},
  configuration: {warmupRuns, repetitions, concurrencyCases, maxWorkerConcurrency:4, workerMemoryLimitMb: memoryPerWorkerMb, rssPollIntervalMs},
  phases: {
    engine: {status: 'measured', measurements: rowMeasurements.filter(item => item.phase === 'engine')},
    startup: {status: 'measured', measurements: rowMeasurements.filter(item => item.phase === 'startup')},
    worker: {status: 'measured', measurements: rowMeasurements.filter(item => item.phase === 'worker')},
  },
  timingBoundaries: [
    {phase: 'engine', timed: measurementDetails.includes, notTimed: measurementDetails.excludesFromWorkloadTime},
    {phase: 'startup', timed: ['Worker construction and ready handshake'], notTimed: ['scenario fixture creation', 'scenario execution', 'worker shutdown']},
    {phase: 'worker', timed: ['process RSS observations collected while the run executes'], notTimed: ['per-worker RSS attribution', 'hard process memory enforcement', 'memory outside the polling interval']},
  ],
  results: {environment, workload, measurement: measurementDetails, rows},
  limitations: [measurementDetails.peakRss, measurementDetails.rssLimit, measurementDetails.effectiveWorkerCount, 'Synthetic baseline scenarios and this host-specific measurement do not establish performance on other machines.'],
});
Object.assign(report, {
  format: 'riose-scenario-scheduler-benchmark-v2',
  environment,
  legacyWorkload: workload,
  measurement: measurementDetails,
  rows,
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
