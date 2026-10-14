import {readFile, writeFile} from 'node:fs/promises';
import {buildAssetRegistry, validateAssetRegistry} from '../graphics-poc/asset-registry.js';

const read = file => readFile(file, 'utf8').then(JSON.parse);
const [rendererManifest, sourceManifest] = await Promise.all([
  read('graphics-poc/assets/main-composer-render-manifest.json'),
  read('graphics-poc/asset-sources.json'),
]);
const registry = buildAssetRegistry(rendererManifest, sourceManifest);
const errors = validateAssetRegistry(registry);
if (errors.length) throw new Error(`Asset registry invalid:\n${errors.join('\n')}`);
await writeFile('graphics-poc/asset-registry.json', `${JSON.stringify(registry, null, 2)}\n`);
const unresolved = registry.assets.filter(asset => asset.reviewStatus === 'UNRESOLVED').length;
const unreviewed = registry.assets.filter(asset => asset.reviewStatus === 'REVIEW').length;
console.log(`Wrote ${registry.assets.length} spatial assets (${unreviewed} REVIEW, ${unresolved} UNRESOLVED).`);
