import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {adaptMainComposerScene} from '../graphics-poc/main-composer-adapter.js';
import {assertGraphicsReleaseReady} from './assets/graphics-release-gate.mjs';
import {enrichRendererManifest, enrichRuntimeAssetManifest} from './assets/runtime-asset-provenance.mjs';
import {createWaterStressVisualVariant} from '../graphics-poc/visual-scenario-variants.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const releaseBuild = process.argv.includes('--release');
if (releaseBuild) await assertGraphicsReleaseReady();
const readJson = file => readFile(path.join(root, file), 'utf8').then(JSON.parse);
const sourceDir = 'graphics-poc/source/main-composer-v1';
const [rawRendererManifest, semanticManifest, dairyManifest, rawRuntimeManifest, beefSource, dairySource, geometryManifest] = await Promise.all([
  readJson('graphics-poc/assets/main-composer-render-manifest.json'),
  readJson('assets/manifests/manifest.json'),
  readJson('public/assets/modules/livestock-dairy/manifest.json'),
  readJson('public/assets/manifest.json'),
  readJson(`${sourceDir}/beef.json`),
  readJson(`${sourceDir}/dairy.json`),
  readJson('graphics-poc/asset-geometry-v1.json'),
]);
const assetSourceManifest = await readJson('graphics-poc/asset-sources.json');
const manifest = enrichRendererManifest(rawRendererManifest, {semanticManifest, dairyManifest});
for (const asset of manifest.assets) asset.spatialGeometry = geometryManifest.assets[asset.assetId] ?? null;
const runtimeManifest = enrichRuntimeAssetManifest(rawRuntimeManifest, {semanticManifest, dairyManifest, rendererManifest: rawRendererManifest});
const outputs = [
  ['graphics-poc/scene.json', adaptMainComposerScene(beefSource, manifest)],
  ['graphics-poc/scenes/dairy.json', adaptMainComposerScene(dairySource, manifest)],
];
const waterStressScene = createWaterStressVisualVariant(outputs[0][1], {rendererManifest: manifest, sourceManifest: assetSourceManifest});
outputs.push(['graphics-poc/scenes/water-stress-visual.json', waterStressScene]);
for (const [file, scene] of outputs) await writeFile(path.join(root, file), `${JSON.stringify(scene, null, 2)}\n`);
await writeFile(path.join(root, 'public/assets/manifest.json'), `${JSON.stringify(runtimeManifest, null, 2)}\n`);
process.stdout.write(`${releaseBuild ? 'Release' : 'Preview'} build: adapted ${outputs.map(([file, scene]) => `${scene.sceneId} (${scene.terrainTiles.length} terrain tiles, ${scene.prefabs.length} infrastructure placements, ${scene.entities.length} visual entities)`).join('; ')}\n`);
