import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {adaptComposerDocument} from '../graphics-poc/scene-adapter-v1.js';

const manifestPath = new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url);
const fixtures = [
  ['beef', new URL('../graphics-poc/source/main-composer-v1/beef.json', import.meta.url)],
  ['dairy', new URL('../graphics-poc/source/main-composer-v1/dairy.json', import.meta.url)],
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
  });
}

process.stdout.write(`${JSON.stringify({adapterVersion: '1.0.0', fixtureScope: 'committed Composer beef and dairy exports only', results}, null, 2)}\n`);
