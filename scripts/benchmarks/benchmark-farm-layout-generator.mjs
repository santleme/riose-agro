import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {dirname, resolve} from 'node:path';
import {generateFarmLayout} from '../../src/client/scenario-editor/scene-layout.js';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';

const repetitions = Number(process.env.FARM_LAYOUT_REPETITIONS ?? 50);
const warmupRuns = Number(process.env.FARM_LAYOUT_WARMUPS ?? 10);
if (!Number.isInteger(repetitions) || repetitions < 5 || !Number.isInteger(warmupRuns) || warmupRuns < 1) {
  throw new TypeError('FARM_LAYOUT_REPETITIONS must be >= 5 and FARM_LAYOUT_WARMUPS must be >= 1');
}

const args = process.argv.slice(2);
let outputPath = null;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--output' || arg === '-o') {
    outputPath = args[++index];
    if (!outputPath) throw new TypeError(`${arg} requires a file path`);
  } else if (arg.startsWith('--output=')) {
    outputPath = arg.slice('--output='.length);
    if (!outputPath) throw new TypeError('--output requires a file path');
  } else {
    throw new TypeError(`Unknown argument: ${arg}\nUsage: node scripts/benchmarks/benchmark-farm-layout-generator.mjs [--output <report.json>]`);
  }
}

const prefabs = JSON.parse(await readFile(new URL('../../public/assets/scenario-editor/prefabs.json', import.meta.url), 'utf8')).prefabs;
const manifest = JSON.parse(await readFile(new URL('../../public/assets/manifest.json', import.meta.url), 'utf8'));
const cases = [
  {name: 'beef', scenarioType: 'beef'},
  {name: 'dairy', scenarioType: 'dairy'},
  {
    name: 'dairy-adjacency',
    scenarioType: 'dairy',
    constraints: [{type: 'must-be-adjacent', first: 'module-water-paddock-nw', second: 'module-water-paddock-ne'}],
  },
];
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
const results = [];

for (const item of cases) {
  const input = {...item, seed: 417, prefabs, manifest};
  for (let i = 0; i < warmupRuns; i++) generateFarmLayout({...input, seed: input.seed + i});
  const samples = [];
  let sampleScene;
  for (let i = 0; i < repetitions; i++) {
    const started = performance.now();
    sampleScene = generateFarmLayout({...input, seed: input.seed + i});
    samples.push(performance.now() - started);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  results.push({
    name: item.name,
    scenarioType: item.scenarioType,
    constraints: item.constraints ?? [],
    seeds: {first: input.seed, last: input.seed + repetitions - 1, count: repetitions},
    placements: sampleScene.placements.length,
    prefabInstances: sampleScene.prefabInstances.length,
    totalEditableItems: sampleScene.placements.length + sampleScene.prefabInstances.length,
    observations: {generationMs: samples},
    generationMs: {
      sampleCount: samples.length,
      median: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      min: sorted[0],
      max: sorted.at(-1),
    },
  });
}

let revision = null, dirty = null;
try {
  revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  dirty = execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim().length > 0;
} catch {}

const report = benchmarkReport({
  name: 'farm-layout-generator',
  runtime: {node: process.version},
  hardware: {hostRelease: os.release(), logicalCpus: os.cpus().length, cpuModel: os.cpus()[0]?.model ?? null},
  workload: {
    seed: '417 + deterministic iteration index',
    populations: results.map(row => ({count: row.totalEditableItems, unit: 'editable-items', scope: row.name})),
    description: 'Committed Composer prefabs and asset manifest; deterministic seed sweep starting at 417.',
  },
  configuration: {warmupRuns, repetitions, timer: 'performance.now; generation only'},
  phases: {
    layout: {status: 'measured', measurements: results.map(row => measurement(
      'layout', 'farm-layout-generation', 'ms', summarizeSamples(row.observations.generationMs), {
        population: {count: row.totalEditableItems, unit: 'editable-items', scope: row.name},
        source: 'scripts/benchmarks/benchmark-farm-layout-generator.mjs',
        scenarioType: row.scenarioType,
        seedRange: row.seeds,
        observations: row.observations.generationMs,
      },
    ))},
  },
  timingBoundaries: [
    {phase: 'layout', timed: ['generateFarmLayout() for one deterministic seed and scenario.'], notTimed: ['Warmup calls, manifest/prefab reads, browser rendering, filesystem writes, and simulation.']},
  ],
  results: {
    studySchemaVersion: 'riose.farm-layout-benchmark/v1',
    source: {revision, dirty},
    host: {release: os.release(), cpus: os.cpus().length, model: os.cpus()[0]?.model ?? null},
    legacyWorkload: 'committed Composer prefabs and asset manifest; deterministic seed sweep starting at 417',
    results,
  },
  limitations: ['Host-local timings; no filesystem, browser rendering, or simulation work is included.'],
});
const reportText = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  const destination = resolve(outputPath);
  await mkdir(dirname(destination), {recursive: true});
  await writeFile(destination, reportText);
}
process.stdout.write(reportText);
