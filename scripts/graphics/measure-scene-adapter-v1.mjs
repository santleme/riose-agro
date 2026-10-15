import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {adaptComposerDocument} from '../../graphics-poc/scene-adapter-v1.js';
import {benchmarkReport, measurement, summarizeSamples} from '../benchmark-report.mjs';

const manifestPath = new URL('../../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url);
const fixtures = [
  ['beef', new URL('../../graphics-poc/source/main-composer-v1/beef.json', import.meta.url)],
  ['dairy', new URL('../../graphics-poc/source/main-composer-v1/dairy.json', import.meta.url)],
];
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = value => Math.round(value * 1000) / 1000;
const results = [];

for (const [system, url] of fixtures) {
  const sourceBytes = await readFile(url);
  const loadTimes = [], adaptTimes = [];
  let document;
  for (let iteration = 0; iteration < 21; iteration++) {
    const loadStart = performance.now();
    const source = JSON.parse(sourceBytes.toString('utf8'));
    const loadedAt = performance.now();
    const adapted = adaptComposerDocument(source, manifest);
    const adaptedAt = performance.now();
    if (iteration > 0) {
      loadTimes.push(loadedAt - loadStart);
      adaptTimes.push(adaptedAt - loadedAt);
    }
    document = adapted;
  }
  results.push({
    system,
    fixture: url.pathname.split('/').at(-1),
    iterations: loadTimes.length,
    sourceBytes: sourceBytes.byteLength,
    canonicalSceneBytes: Buffer.byteLength(JSON.stringify(document.scene)),
    adapterDocumentBytes: Buffer.byteLength(JSON.stringify(document)),
    unsupportedFieldKinds: document.unsupportedFields.length,
    loadMsMedian: round(median(loadTimes)),
    adaptMsMedian: round(median(adaptTimes)),
    observations: {loadMs: loadTimes, adaptMs: adaptTimes},
  });
}

const report = benchmarkReport({
  name: 'composer-scene-adapter-v1',
  workload: {seed: 'fixed-committed-fixtures-no-rng', populations: [{count: fixtures.length, unit: 'scenes', scope: 'committed Composer beef and dairy fixtures'}]},
  configuration: {warmupRuns: 1, repetitions: 20},
  phases: {
    startup: {status: 'measured', measurements: results.map(row => measurement('startup', 'fixture-json-parse', 'ms', summarizeSamples(row.observations.loadMs), {population: 1, scope: row.system, source: 'scripts/graphics/measure-scene-adapter-v1.mjs', observations: row.observations.loadMs}))},
    layout: {status: 'measured', measurements: results.map(row => measurement('layout', 'composer-to-canonical-adaptation', 'ms', summarizeSamples(row.observations.adaptMs), {population: 1, scope: row.system, source: 'scripts/graphics/measure-scene-adapter-v1.mjs', observations: row.observations.adaptMs}))},
    serialization: {status: 'measured', measurements: results.flatMap(row => [
      measurement('serialization', 'canonical-scene-bytes', 'bytes', summarizeSamples([row.canonicalSceneBytes]), {population: 1, scope: row.system, source: 'JSON.stringify(document.scene)', observations: [row.canonicalSceneBytes]}),
      measurement('serialization', 'adapter-document-bytes', 'bytes', summarizeSamples([row.adapterDocumentBytes]), {population: 1, scope: row.system, source: 'JSON.stringify(document)', observations: [row.adapterDocumentBytes]}),
    ])},
  },
  timingBoundaries: [
    {phase: 'startup', timed: ['Parsing one committed Composer JSON fixture from already-read bytes.'], notTimed: ['Filesystem read, renderer startup, browser image loading.']},
    {phase: 'layout', timed: ['adaptComposerDocument(source, manifest).'], notTimed: ['Fixture file read and canonical scene rendering.']},
    {phase: 'serialization', timed: ['UTF-8 byte counts of JSON.stringify outputs; no serialization duration is measured.'], notTimed: ['Browser storage or renderer transfer.']},
  ],
  results: {adapterVersion: '1.0.0', fixtureScope: 'committed Composer beef and dairy exports only', results},
  limitations: ['Host-local Node measurements; excludes filesystem read, browser rendering, and image loading.'],
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
