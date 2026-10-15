import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {benchmarkReport, measurement, summarizeSamples} from '../benchmarks/benchmark-report.mjs';
import {summarizeReplicates} from './replicate-summary.js';

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
  results.push({
    runs: count,
    summarizeMs: summarizeSamples(samples),
    runtimeObservationsMs: samples,
    heapUsedBytes: process.memoryUsage().heapUsed,
  });
}

const args = process.argv.slice(2);
let outputPath = 'docs/evidence/replicate-summary-benchmark-2026-10.json';
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--output' || arg === '-o') {
    if (!args[index + 1]) throw new TypeError(`${arg} requires a file path`);
    outputPath = args[++index];
  } else if (arg.startsWith('--output=')) {
    outputPath = arg.slice('--output='.length);
    if (!outputPath) throw new TypeError('--output requires a file path');
  } else {
    throw new TypeError(`Unknown argument: ${arg}\nUsage: node scripts/experiments/benchmark-replicate-summary.mjs [--output <report.json>]`);
  }
}
outputPath = resolve(outputPath);

const report = benchmarkReport({
  name: 'replicated-scenario-summary',
  workload: {seed: 'deterministic-index-no-rng', populations: counts.map(count => ({count, unit: 'result-records', scope: 'synthetic replicate-summary input'})), runCounts: counts, outputsPerRun: 2, groups: 2, resultsAreSynthetic: true},
  configuration: {warmupRuns: 1, repetitions, aggregation: 'sample SD and Type 7 descriptive quantiles'},
  phases: {serialization: {status: 'not-measured', measurements: []}, layout: {status: 'measured', measurements: [
    measurement('layout', 'summary_runtime', 'ms', summarizeSamples(results.flatMap(result => result.runtimeObservationsMs)), {
      population: 'all configured synthetic result-record populations',
      source: 'performance.now() around one summarizeReplicates call over already constructed records',
      observations: results.flatMap(result => result.runtimeObservationsMs),
      details: 'Raw timing observations by population are also retained in results.',
    }),
    measurement('layout', 'process_heap_used_after_aggregation', 'byte', {sampleCount: results.length, values: results.map(result => result.heapUsedBytes)}, {
      population: 'one process-level sample after each configured population',
      source: 'process.memoryUsage().heapUsed sampled after aggregation; synthetic input records remain retained',
      observations: results.map(result => result.heapUsedBytes),
      details: 'Process heapUsed sampled after each aggregation; includes retained benchmark inputs.',
    }),
  ]}},
  timingBoundaries: [{phase: 'layout', timed: ['One summarizeReplicates call over the already constructed result records.'], notTimed: ['Synthetic input construction.', 'Initial warm-up aggregation.', 'Heap sampling after each timed call.']}],
  results,
  limitations: ['Synthetic inputs isolate reducer cost and are not scenario-engine runtime.', 'Heap is sampled process heap after each workload, not a peak or per-call allocation profile.'],
});
await mkdir(dirname(outputPath), {recursive: true});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
