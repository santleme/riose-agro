import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';
import {clusterFarAnimals, assertVisibleAnimalMembership} from '../../graphics-poc/herd-visual-model.js';
import {distanceToViewportCenter, intersectsViewport, visualLod} from '../../graphics-poc/contract.js';

const sizes = [100, 1000, 10000];
const repeats = 9;
const viewport = {width: 1280, height: 800};
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
const measure = fn => {
  for (let i = 0; i < 2; i++) fn();
  const samples = [];
  let result;
  for (let i = 0; i < repeats; i++) {
    const start = performance.now();
    result = fn();
    samples.push(performance.now() - start);
  }
  return {result, timing: {medianMs: quantile(samples, .5), p95Ms: quantile(samples, .95), samplesMs: samples}};
};
function createHerd(count) {
  return Array.from({length: count}, (_, index) => {
    const x = (index % 180) * 4.2 + Math.floor(index / 180) * 2.4;
    const y = (index % 130) * 3.8 + Math.floor(index / 130) * 2.1;
    const screenX = 640 + (x - 380) * 1.7, screenY = 400 + (y - 250) * 1.7;
    return {animalId: index + 1, id: `animal-${index + 1}`, kind: 'livestock', x, y, screenX, screenY, depth: y, bounds: {left: screenX - 10, right: screenX + 10, top: screenY - 10, bottom: screenY + 10}};
  });
}

const results = [];
for (const count of sizes) {
  const source = createHerd(count);
  const culling = measure(() => source.filter(entry => intersectsViewport(entry.bounds, viewport.width, viewport.height)));
  const visible = culling.result;
  const update = measure(() => {
    const classified = visible.map(entry => ({...entry, lod: visualLod(distanceToViewportCenter(entry.screenX, entry.screenY, viewport.width, viewport.height), 100, 220)}));
    const visual = clusterFarAnimals(classified);
    assertVisibleAnimalMembership(classified, visual.individual, visual.clusters);
    return {visual, classified};
  });
  const latest = update.result.visual;
  const drawUnit = measure(() => [
    ...latest.individual.map(entry => ({id: entry.id, kind: 'animal', count: 1})),
    ...latest.clusters.map(group => ({id: group.id, kind: 'herd-cluster', count: group.count})),
  ]);
  const units = drawUnit.result;
  results.push({
    simulatedAnimals: count,
    visibleAnimals: visible.length,
    culledAnimals: count - visible.length,
    visibleGroups: latest.clusters.length,
    visibleIndividuals: latest.individual.length,
    drawUnits: units.length,
    accountedAnimalIds: units.reduce((sum, unit) => sum + unit.count, 0),
    culling: culling.timing,
    visualUpdateAndGrouping: update.timing,
    drawUnitPreparation: drawUnit.timing,
  });
}

const methodology = {
  repeats,
  warmups: 2,
  viewport,
  culling: 'screen-space bounding-box intersection for each simulated animal',
  visualUpdateAndGrouping: 'classify visible animals by LOD, group far animals using scene-space bins, and assert membership conservation',
  drawUnitPreparation: 'prepare individual/group render-unit descriptors; excludes Canvas/Pixi/GPU draw and asset work',
};
const report = benchmarkReport({
  name: 'graphics-herd-visual-model',
  workload: {seed: 'deterministic-synthetic-herd', populations: sizes.map(animals => ({animals, scope: 'graphics-visual-model-only', limit: 'Synthetic visual workload; does not instantiate FarmEngine or draw through a renderer'}))},
  configuration: {warmupRuns: methodology.warmups, repetitions: repeats, viewport},
  phases: {layout: {status: 'measured', measurements: [
    measurement('layout', 'screen-space culling', 'ms', summarizeSamples(results.flatMap(row => row.culling.samplesMs)), {population: 'all configured synthetic herd sizes', source: methodology.culling}),
    measurement('layout', 'LOD classification, grouping, membership assertion', 'ms', summarizeSamples(results.flatMap(row => row.visualUpdateAndGrouping.samplesMs)), {population: 'all configured synthetic herd sizes', source: methodology.visualUpdateAndGrouping}),
    measurement('layout', 'draw-unit descriptor preparation', 'ms', summarizeSamples(results.flatMap(row => row.drawUnitPreparation.samplesMs)), {population: 'all configured synthetic herd sizes', source: methodology.drawUnitPreparation}),
  ]}},
  timingBoundaries: [{phase: 'layout', timed: ['synthetic input array processing', 'screen-space culling', 'LOD classification', 'far-animal grouping', 'membership conservation assertion', 'draw-unit descriptor construction'], notTimed: ['FarmEngine simulation', 'Canvas/Pixi/GPU rendering', 'asset loading', 'browser frame scheduling']}],
  results,
  limitations: ['Synthetic coordinates and animal counts are a graphics-model microbenchmark, not a representative farm workload.', 'No renderer, browser, GPU, asset, or FarmEngine work is included.'],
});
Object.assign(report, {study: 'graphics-herd-visual-model-benchmark', generatedAt: new Date().toISOString(), environment: {node: process.version, platform: process.platform, arch: process.arch}, methodology, results});
const output = path.resolve('docs/evidence/herd-visual-model-benchmark-2026-10.json');
await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({output, results: results.map(({simulatedAnimals, visibleAnimals, culledAnimals, drawUnits, culling, visualUpdateAndGrouping, drawUnitPreparation}) => ({simulatedAnimals, visibleAnimals, culledAnimals, drawUnits, cullingMedianMs: culling.medianMs, updateMedianMs: visualUpdateAndGrouping.medianMs, drawUnitMedianMs: drawUnitPreparation.medianMs}))}, null, 2)}\n`);
