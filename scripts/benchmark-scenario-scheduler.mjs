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
const memoryPerWorkerMb = Number(process.env.RIOSE_SCHEDULER_WORKER_MEMORY_MB ?? 128);
const rssPollIntervalMs = 5;
const scenarioTemplate = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));
const scenarioCount = 6;
const availableWorkers = Math.min(availableParallelism(), scenarioCount);
const concurrencyCases = [1, Math.min(2, availableWorkers), availableWorkers]
  .filter((value, index, values) => values.indexOf(value) === index);

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

async function once(concurrency) {
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
    const rss = await rssMonitor.stop();
    rssMonitor = null;
    sample = {
      workerStartupMs: Number(workerStartupMs.toFixed(3)),
      workerStartupCpuMs: {user: Number((workerStartupCpu.user / 1000).toFixed(3)), system: Number((workerStartupCpu.system / 1000).toFixed(3))},
      wallMs: Number(wallMs.toFixed(3)),
      throughputScenariosPerSecond: Number((scenarioCount / (wallMs / 1000)).toFixed(3)),
      processCpuMs: {user: Number((cpu.user / 1000).toFixed(3)), system: Number((cpu.system / 1000).toFixed(3)), total: Number(((cpu.user + cpu.system) / 1000).toFixed(3))},
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
  const samples = [];
  for (let repetition = 0; repetition < repetitions; repetition++) samples.push(await once(concurrency));
  const median = key => {
    const values = samples.map(sample => sample[key]).sort((a, b) => a - b);
    return Number(values[Math.floor(values.length / 2)].toFixed(3));
  };
  rows.push({concurrency, workerMemoryLimitMb: concurrency > 1 ? memoryPerWorkerMb : null, samples,
    medianWallMs: median('wallMs'), medianThroughputScenariosPerSecond: median('throughputScenariosPerSecond'),
    medianEndToEndMs: median('endToEndMs'), medianEndToEndThroughputScenariosPerSecond: median('endToEndThroughputScenariosPerSecond'),
    medianPeakObservedRssBytes: median('peakObservedRssBytes'), allPassed: samples.every(sample => sample.allPassed)});
}
const environment = {node: process.version, platform: process.platform, arch: process.arch, reportedAvailableParallelism: availableParallelism(), workloadAvailableWorkers: availableWorkers};
const workload = {scenarios: scenarioCount, hours: scenarioTemplate.run.hours, seeds: Array.from({length: scenarioCount}, (_, index) => 20261012 + index)};
const measurementDetails = {
  workerStartup: 'Worker constructor through ready handshake; separate from workload wall and CPU time',
  processCpu: 'process.cpuUsage delta during journaled workload; worker startup reported separately',
  peakRss: `Independent Worker thread polls process.memoryUsage.rss() every ${rssPollIntervalMs}ms nominally; each sample also records the largest observed gap, making practical timer scheduling resolution explicit. RSS is process-wide and sampled rather than a hard peak guarantee.`,
  rssLimit: 'Not a hard total-process memory limit: worker old-generation caps do not cap young generation, native allocations, main thread, monitor thread, or process RSS; do not sum RSS values or per-worker caps as a total-process bound.',
  includes: ['scenario execution', 'manifest and journal writes', 'result verification'],
  endToEndTime: 'worker startup + workload wall + worker shutdown; serial is workload wall only',
  excludesFromWorkloadTime: ['scenario fixture creation', 'worker startup', 'worker shutdown', 'RSS monitor startup'],
};
const allSamples = rows.flatMap(row => row.samples);
const report = benchmarkReport({
  name: 'scenario-scheduler-concurrency',
  runtime: {platform: process.platform},
  workload: {seed: 20261012, populations: [{count: scenarioCount, unit: 'scenarios', scope: 'FarmEngine scenario scheduler; worker concurrency comparison'}], hours: scenarioTemplate.run.hours, scenarioSeeds: workload.seeds},
  configuration: {warmupRuns: 0, repetitions, concurrencyCases, workerMemoryLimitMb: memoryPerWorkerMb, rssPollIntervalMs},
  phases: {
    engine: {status: 'measured', measurements: [
      measurement('engine', 'journaled workload wall time', 'ms', summarizeSamples(allSamples.map(sample => sample.wallMs)), {source: 'runScenarioDirectoryResumable from first dispatch through verified results'}),
      measurement('engine', 'end-to-end time', 'ms', summarizeSamples(allSamples.map(sample => sample.endToEndMs)), {source: 'worker startup + workload wall + worker shutdown; serial path has no worker startup'}),
      measurement('engine', 'process CPU total', 'ms', summarizeSamples(allSamples.map(sample => sample.processCpuMs.total)), {source: 'process.cpuUsage delta during journaled workload; startup CPU is recorded separately in raw samples'}),
    ]},
    startup: {status: 'measured', measurements: [measurement('startup', 'worker pool startup', 'ms', summarizeSamples(allSamples.map(sample => sample.workerStartupMs)), {source: 'Worker constructor through ready handshake; serial case is zero'})]},
    worker: {status: 'measured', measurements: [measurement('worker', 'sampled process peak RSS', 'bytes', summarizeSamples(allSamples.map(sample => sample.peakObservedRssBytes)), {source: measurementDetails.peakRss})]},
  },
  timingBoundaries: [
    {phase: 'engine', timed: measurementDetails.includes, notTimed: measurementDetails.excludesFromWorkloadTime},
    {phase: 'startup', timed: ['Worker construction and ready handshake'], notTimed: ['scenario fixture creation', 'scenario execution', 'worker shutdown']},
    {phase: 'worker', timed: ['process RSS observations collected while the run executes'], notTimed: ['per-worker RSS attribution', 'hard process memory enforcement', 'memory outside the polling interval']},
  ],
  results: {environment, workload, measurement: measurementDetails, rows},
  limitations: [measurementDetails.peakRss, measurementDetails.rssLimit, 'Synthetic baseline scenarios and this host-specific measurement do not establish performance on other machines.'],
});
Object.assign(report, {
  format: 'riose-scenario-scheduler-benchmark-v2',
  environment,
  legacyWorkload: workload,
  measurement: measurementDetails,
  rows,
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
