import {readFile} from 'node:fs/promises';
import {buildAssetRegistry, validateAssetRegistry} from '../graphics-poc/asset-registry.js';

const read = file => readFile(file, 'utf8').then(JSON.parse);
const [registry, rendererManifest, sourceManifest] = await Promise.all([
  read('graphics-poc/asset-registry.json'),
  read('graphics-poc/assets/main-composer-render-manifest.json'),
  read('graphics-poc/asset-sources.json'),
]);
const errors = validateAssetRegistry(registry);
const expected = buildAssetRegistry(rendererManifest, sourceManifest);
if (JSON.stringify(registry) !== JSON.stringify(expected)) errors.push('Registry is stale; run npm run build:graphics-asset-registry.');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const statuses = Object.fromEntries([...new Set(registry.assets.map(asset => asset.reviewStatus))]
    .map(status => [status, registry.assets.filter(asset => asset.reviewStatus === status).length]));
  console.log(`Valid registry: ${registry.assets.length} assets; ${Object.entries(statuses).map(([status, count]) => `${status}=${count}`).join(', ')}.`);
}
