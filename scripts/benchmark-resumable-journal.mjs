import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';
import {createBatchExperimentManifest, digestScenario, sha256Digest} from '../experiments/batch-manifest.js';
import {runResumableBatch} from '../experiments/resumable-journal.js';

const runCount = 25, repetitions = 5, simulatedRunMs = [0, 2];
const runPlans = Array.from({length: runCount}, (_, index) => ({
  runId: `run-${index}`, scenarioId: `scenario-${index}`, scenarioDigest: digestScenario({scenarioId: index}), seed: index,
  engine: {id: 'synthetic', version: '1', buildDigest: sha256Digest('synthetic-engine'), status: 'provided'},
  models: [], datasets: [], evidence: [], inputs: {index: {value: index, unit: 'index'}}, outputs: {},
  status: 'planned', outputDigest: null, resultRef: null,
}));
const measured = [];
for (const runDurationMs of simulatedRunMs) {
  const samples = [];
  let heapUsedBytes = 0;
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
      heapUsedBytes = Math.max(heapUsedBytes, process.memoryUsage().heapUsed);
    } finally { await rm(root, {recursive: true, force: true}); }
  }
  const summary = summarizeSamples(samples);
  measured.push({runCount, simulatedRunMs: runDurationMs, journalBatchMs: summary, executionBudgetMs: runCount * runDurationMs, approximateJournalOverheadMs: Math.max(0, summary.median - runCount * runDurationMs), heapUsedBytes});
}

const report = benchmarkReport({
  name: 'resumable-scenario-journal',
  workload: {runCounts: [runCount], resultBytesPerRun: 64, scenariosAreSynthetic: true},
  configuration: {warmupRuns: 0, repetitions, atomicMode: 'same-filesystem temp write and rename'},
  phases: {layout: {status: 'measured', measurements: [
    measurement('layout', 'journal_batch_time', 'ms', summarizeSamples(measured.map(row => row.journalBatchMs.median)), {details: measured}),
    measurement('layout', 'heap_used_after_batch', 'byte', {sampleCount: measured.length, maximum: Math.max(...measured.map(row => row.heapUsedBytes))}),
  ]}},
  results: measured,
  limitations: ['Synthetic runs isolate journal overhead; scenario engine execution time and result size vary.', 'Heap is process heap after a batch with forced GC where available, not peak RSS or per-run allocation.', 'Approximate overhead subtracts only the configured synthetic execution delay.'],
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
