import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';
import {createBatchExperimentManifest, digestScenario, sha256Digest} from '../experiments/batch-manifest.js';
import {runResumableBatch} from '../experiments/resumable-journal.js';

const args = process.argv.slice(2);
let runCount = 25, repetitions = 5;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  const [name, inlineValue] = arg.split('=', 2);
  if (name !== '--run-count' && name !== '--repetitions') {
    throw new TypeError(`Unknown argument: ${arg}\nUsage: node scripts/benchmark-resumable-journal.mjs [--run-count <positive integer>] [--repetitions <positive integer>]`);
  }
  const value = inlineValue ?? args[++index];
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new TypeError(`${name} requires a positive integer`);
  if (name === '--run-count') runCount = parsed;
  else repetitions = parsed;
}
const simulatedRunMs = [0, 2];
const runPlans = Array.from({length: runCount}, (_, index) => ({
  runId: `run-${index}`, scenarioId: `scenario-${index}`, scenarioDigest: digestScenario({scenarioId: index}), seed: index,
  engine: {id: 'synthetic', version: '1', buildDigest: sha256Digest('synthetic-engine'), status: 'provided'},
  models: [], datasets: [], evidence: [], inputs: {index: {value: index, unit: 'index'}}, outputs: {},
  status: 'planned', outputDigest: null, resultRef: null,
}));
const measured = [];
for (const runDurationMs of simulatedRunMs) {
  const samples = [];
  const heapUsedSamples = [];
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const root = await mkdtemp(join(tmpdir(), 'riose-journal-bench-'));
    try {
      const manifest = createBatchExperimentManifest({experimentId: `journal-${runDurationMs}-${repetition}`, createdAt: '2026-10-12T12:00:00.000Z', runs: runPlans});
      const started = performance.now();
      await runResumableBatch({manifestPath: join(root, 'manifest.json'), resultsPath: join(root, 'results.jsonl'), manifest,
        executeRun: async run => {
          if (runDurationMs) await delay(runDurationMs);
          return {value: {value: Number(run.runId.slice(4)), unit: 'count'}};
        },
      });
      samples.push(performance.now() - started);
      if (global.gc) global.gc();
      heapUsedSamples.push(process.memoryUsage().heapUsed);
    } finally { await rm(root, {recursive: true, force: true}); }
  }
  const summary = summarizeSamples(samples);
  const heapUsedStatistics = summarizeSamples(heapUsedSamples);
  measured.push({runCount, simulatedRunMs: runDurationMs, journalBatchMs: summary, executionBudgetMs: runCount * runDurationMs, approximateJournalOverheadMs: Math.max(0, summary.median - runCount * runDurationMs), heapUsedBytes: heapUsedSamples, heapUsedStatistics, heapUsedMaximumBytes: Math.max(...heapUsedSamples)});
}

const report = benchmarkReport({
  name: 'resumable-scenario-journal',
  workload: {seed: 'deterministic-index-no-rng', populations: [{count: runCount, unit: 'scenario-runs', scope: 'synthetic resumable journal batch'}], runCounts: [runCount], resultBytesPerRun: 64, scenariosAreSynthetic: true},
  configuration: {warmupRuns: 0, repetitions, atomicMode: 'same-filesystem temp write and rename'},
  phases: {layout: {status: 'measured', measurements: [
    measurement('layout', 'journal_batch_time', 'ms', summarizeSamples(measured.map(row => row.journalBatchMs.median)), {details: measured}),
    measurement('layout', 'heap_used_after_batch', 'byte', {sampleCount: repetitions * measured.length, values: measured.flatMap(row => row.heapUsedBytes), maximum: Math.max(...measured.map(row => row.heapUsedMaximumBytes))}, {
      observations: measured.flatMap(row => row.heapUsedBytes),
      details: 'Raw process heapUsed observations after each repeated batch; maximum is the largest observation across all runs.',
    }),
  ]}},
  timingBoundaries: [{phase: 'layout', timed: ['Batch journal execution, result appends, and configured synthetic per-run delay.'], notTimed: ['Temporary directory creation and cleanup.', 'Manifest construction.', 'Heap sampling.']}],
  results: measured,
  limitations: ['Synthetic runs isolate journal overhead; scenario engine execution time and result size vary.', 'Heap is process heap after a batch with forced GC where available, not peak RSS or per-run allocation.', 'Approximate overhead subtracts only the configured synthetic execution delay.'],
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
