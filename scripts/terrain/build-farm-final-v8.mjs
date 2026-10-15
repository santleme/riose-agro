import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {composeFarmSceneV8} from '../../src/client/farm-scene-composer-v8.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scene = JSON.parse(await readFile(path.join(root, 'graphics-poc/scenes/farm-assembly-v8.json'), 'utf8'));
const clone = (id, sourceId, x, y, overrides = {}) => {
  const source = scene.prefabs.find(prefab => prefab.prefabId === sourceId);
  if (!source) throw new Error(`Prefab de origem ausente: ${sourceId}`);
  return {...structuredClone(source), prefabId: id, position: {...source.position, x, y}, ...overrides};
};

const pastureA = clone('east-pen-and-gate', 'beef-pen-and-gate', 1, 8, {
  visualScale: 1.45, sockets: [{id: 'gate-to-access-road', type: 'road', position: [2, 0], elevation: 0}],
});
const pastureB = clone('central-pen-and-gate', 'beef-pen-and-gate', 5, 8, {
  visualScale: 1.45, sockets: [{id: 'gate-to-access-road', type: 'road', position: [2, 0], elevation: 0}],
});
scene.prefabs.push(pastureA, pastureB);

scene.prefabs.push(
  clone('east-pen-trough', 'pen-water-trough', 2.15, 9.25, {depthOffset: 18}),
  clone('central-pen-trough', 'pen-water-trough', 6.25, 9.25, {depthOffset: 18}),
  clone('east-cow-01', 'pen-cow-03', 1.45, 10.3, {depthOffset: 28, animationClip: 'graze', visualRoute: [[1.4, 10.2], [2, 10.35], [3.1, 10.3], [3.25, 10.7], [2.2, 10.8], [1.4, 10.65]]}),
  clone('east-cow-02', 'pen-cow-04', 3.1, 10.55, {depthOffset: 28, animationClip: 'idle', visualRoute: undefined}),
  clone('central-cow-01', 'pen-cow-05', 5.45, 10.3, {depthOffset: 28, animationClip: 'walk', visualRoute: [[5.4, 10.2], [6.2, 10.35], [7.2, 10.3], [7.5, 10.7], [6.4, 10.8], [5.5, 10.65]], animationPhaseMs: 280}),
  clone('central-cow-02', 'pen-cow-03', 7.1, 10.55, {depthOffset: 28, animationClip: 'graze', visualRoute: undefined}),
  clone('farm-feed-shelter', 'homestead-machine-shed', 7.1, .5, {prefabId: 'farm-feed-shelter', assetId: 'feed-salt-roofed-imagegen-v1', footprint: {columns: 1.2, rows: 1}, visualScale: .72, visualHeightCells: 1.1}),
);
const westTree = scene.prefabs.find(item => item.prefabId === 'tree-low-west');
if (westTree) westTree.position = {...westTree.position, x: 4.3, y: 6.5};

scene.zones = [
  {zoneId: 'east-pasture-v8', name: 'Pastagem leste', kind: 'pasture', origin: {x: 1, y: 8}, footprint: {columns: 3.5, rows: 3}, color: '#8ba767'},
  {zoneId: 'central-pasture-v8', name: 'Pastagem central', kind: 'pasture', origin: {x: 5, y: 8}, footprint: {columns: 3.5, rows: 3}, color: '#8ba767'},
  {zoneId: 'north-pasture-v8', name: 'Pastagem alta', kind: 'pasture', origin: {x: 1, y: 3.25}, footprint: {columns: 2.7, rows: 1.5}, color: '#91ab69'},
  {zoneId: 'beef-paddock-v8', name: 'Piquete de manejo', kind: 'service', origin: {x: 12, y: 8}, footprint: {columns: 3.5, rows: 3}, color: '#8ba767'},
];

scene.sceneId = 'riose-farm-final-v8';
scene.name = 'Fazenda Riose · três pastagens';
scene.visualVariant = {id: 'farm-final-v8', label: 'Etapa 3 · fazenda completa', status: 'presentation-only'};
const seed = Number(process.argv[2] ?? 84018);
const {scene: composedScene, decorativeAnchors} = composeFarmSceneV8(scene, seed);
composedScene.sceneId = 'riose-farm-final-v8';
composedScene.name = 'Fazenda Riose · três pastagens';
const filename = seed === 84018 ? 'farm-final-v8.json' : `farm-final-v8-seed-${seed}.json`;
const output = path.join(root, 'graphics-poc/scenes', filename);
await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, `${JSON.stringify(composedScene, null, 2)}\n`);
console.log(JSON.stringify({output: path.relative(root, output), seed, zones: composedScene.zones.length, prefabs: composedScene.prefabs.length, animals: composedScene.prefabs.filter(item => item.layer === 'livestock').length, decorativeAnchors, bridge: composedScene.terrainV8.routes.bridgeCrossing}, null, 2));
