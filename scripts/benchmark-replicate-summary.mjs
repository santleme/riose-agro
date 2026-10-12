import {mkdir, writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';
import {summarizeReplicates} from '../experiments/replicate-summary.js';

const counts = [1_000, 10_000, 100_000];
const repetitions = 7;
const results = [];
for (const count of counts) {
  const records = Array.from({length: count}, (_, index) => ({
    runId: `run-${index}`,
    status: 'completed',
    inputs: {system: {value: index % 2 ? 'beef' : 'dairy', unit: 'category'}},
    outputs: {
      gain: {value: 80 + (index % 101) / 100, unit: 'kg'},
      intake: {value: 9 + (index % 71) / 100, unit: 'kg/day'},
    },
  }));
  summarizeReplicates(records, {groupBy: ['system']});
  const samples = [];
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const started = performance.now();
    summarizeReplicates(records, {groupBy: ['system']});
    samples.push(performance.now() - started);
  }
  results.push({runs: count, summarizeMs: summarizeSamples(samples), heapUsedBytes: process.memoryUsage().heapUsed});
}

const report = benchmarkReport({
  name: 'replicated-scenario-summary',
  workload: {seed: 'deterministic-index-no-rng', populations: counts.map(count => ({count, unit: 'result-records', scope: 'synthetic replicate-summary input'})), runCounts: counts, outputsPerRun: 2, groups: 2, resultsAreSynthetic: true},
  configuration: {warmupRuns: 1, repetitions, aggregation: 'sample SD and Type 7 descriptive quantiles'},
  phases: {serialization: {status: 'not-measured', measurements: []}, layout: {status: 'measured', measurements: [
    measurement('layout', 'summary_runtime', 'ms', summarizeSamples(results.flatMap(result => Array(result.summarizeMs.sampleCount).fill(result.summarizeMs.median))), {details: 'Per-size measurements are in results.'}),
    measurement('layout', 'peak_observed_heap_used', 'byte', {sampleCount: results.length, values: results.map(result => result.heapUsedBytes)}, {details: 'Process heapUsed sampled after each aggregation; includes retained benchmark inputs.'}),
  ]}},
  timingBoundaries: [{phase: 'layout', timed: ['One summarizeReplicates call over the already constructed result records.'], notTimed: ['Synthetic input construction.', 'Initial warm-up aggregation.', 'Heap sampling after each timed call.']}],
  results,
  limitations: ['Synthetic inputs isolate reducer cost and are not scenario-engine runtime.', 'Heap is sampled process heap after each workload, not a per-call allocation profile.'],
});
const path = 'docs/evidence/replicate-summary-benchmark-2026-10.json';
await mkdir('docs/evidence', {recursive: true});
await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({path, results}, null, 2)}\n`);
