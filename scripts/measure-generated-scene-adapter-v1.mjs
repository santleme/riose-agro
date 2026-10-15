import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {adaptGeneratedFarmLayoutDocument} from '../graphics-poc/scene-adapter-v1.js';
import {generateFarmLayout} from '../src/client/scenario-editor/scene-layout.js';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';

const warmupRuns = Number(process.env.GENERATED_SCENE_ADAPTER_WARMUPS ?? 5);
const repetitions = Number(process.env.GENERATED_SCENE_ADAPTER_REPETITIONS ?? 21);
if (!Number.isInteger(warmupRuns) || warmupRuns < 1 || !Number.isInteger(repetitions) || repetitions < 5) {
  throw new TypeError('GENERATED_SCENE_ADAPTER_WARMUPS must be >= 1 and GENERATED_SCENE_ADAPTER_REPETITIONS must be >= 5');
}

const [prefabs, composerManifest, rendererManifest] = await Promise.all([
  readFile(new URL('../public/assets/scenario-editor/prefabs.json', import.meta.url), 'utf8').then(text => JSON.parse(text).prefabs),
  readFile(new URL('../public/assets/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return {sampleCount: values.length, medianMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), minMs: sorted[0], maxMs: sorted.at(-1)};
};
const results = [];

for (const scenarioType of ['beef', 'dairy']) {
  const generationSamples = [], adapterSamples = [];
  let source, adapted;
  for (let index = 0; index < warmupRuns + repetitions; index++) {
    const generationStart = performance.now();
    source = generateFarmLayout({scenarioType, seed: 417 + index, prefabs, manifest: composerManifest});
    const generatedAt = performance.now();
    adapted = adaptGeneratedFarmLayoutDocument(source, rendererManifest, prefabs, composerManifest);
    const adaptedAt = performance.now();
    if (index >= warmupRuns) {
      generationSamples.push(generatedAt - generationStart);
      adapterSamples.push(adaptedAt - generatedAt);
    }
  }
  results.push({
    scenarioType,
    seeds: {first: 417 + warmupRuns, last: 416 + warmupRuns + repetitions, count: repetitions},
    sourcePlacements: source.placements.length,
    sourcePrefabInstances: source.prefabInstances.length,
    expandedPlacementCount: adapted.sourceFormat.expandedPlacementCount,
    canonicalZones: adapted.scene.zones.length,
    canonicalAssets: adapted.scene.assets.length,
    unsupportedFieldCount: adapted.unsupportedFields.length,
    sourceBytes: Buffer.byteLength(JSON.stringify(source)),
    canonicalSceneBytes: Buffer.byteLength(JSON.stringify(adapted.scene)),
    adapterDocumentBytes: Buffer.byteLength(JSON.stringify(adapted)),
    generation: summarize(generationSamples),
    adaptation: summarize(adapterSamples),
    observations: {generationMs: generationSamples, adaptationMs: adapterSamples},
    rawByteObservations: {
      sourceBytes: Buffer.byteLength(JSON.stringify(source)),
      canonicalSceneBytes: Buffer.byteLength(JSON.stringify(adapted.scene)),
      adapterDocumentBytes: Buffer.byteLength(JSON.stringify(adapted)),
    },
  });
}

let revision = null, dirty = null;
try {
  revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  dirty = execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim().length > 0;
} catch {}

const report = benchmarkReport({
  name: 'generated-scene-adapter-v1',
  workload: {seed: '417 + deterministic iteration index', populations: [{count: results.length, unit: 'scenario-types', scope: 'generated beef and dairy Composer layouts'}]},
  configuration: {warmupRuns, repetitions, baseSeed: 417, timer: 'performance.now'},
  phases: {
    layout: {status: 'measured', measurements: results.flatMap(row => [
      measurement('layout', 'layout-generation', 'ms', summarizeSamples(row.observations.generationMs), {population: 1, scope: row.scenarioType, source: 'scripts/measure-generated-scene-adapter-v1.mjs', observations: row.observations.generationMs}),
      measurement('layout', 'generated-scene-adaptation', 'ms', summarizeSamples(row.observations.adaptationMs), {population: 1, scope: row.scenarioType, source: 'scripts/measure-generated-scene-adapter-v1.mjs', observations: row.observations.adaptationMs}),
    ])},
    serialization: {status: 'measured', measurements: results.flatMap(row => Object.entries(row.rawByteObservations).map(([metric, value]) => measurement('serialization', metric, 'bytes', summarizeSamples([value]), {population: 1, scope: row.scenarioType, source: 'JSON.stringify output byte count; duration not measured', observations: [value]})))},
  },
  timingBoundaries: [
    {phase: 'layout', timed: ['generateFarmLayout() and adaptGeneratedFarmLayoutDocument() are measured separately for each generated layout.'], notTimed: ['Browser rendering, image loading, and filesystem reads.']},
    {phase: 'serialization', timed: ['UTF-8 byte counts for source, canonical scene, and adapter document JSON.'], notTimed: ['JSON serialization duration, storage, and browser rendering.']},
  ],
  results: {
  studySchemaVersion: 'riose.generated-scene-adapter-measurement/v1',
  adapterVersion: '1.0.0',
  sourceFormat: 'riose-generated-farm-layout-v1',
  source: {revision, dirty},
  fixtureScope: 'generated beef and dairy Composer layouts using committed prefab and asset manifests',
  results,
  },
  limitations: ['Host-local Node measurements; excludes browser rendering and image loading.'],
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
