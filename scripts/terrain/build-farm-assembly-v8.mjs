import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const terrain = JSON.parse(await readFile(path.join(root, 'graphics-poc/scenes/terrain-v8.json'), 'utf8'));
// Keep the authored terrain vegetation when adding the farm assembly.
const prefabs = terrain.prefabs.filter(prefab => ['world-v8-tree', 'world-v8-bridge'].includes(prefab.assetId)).map(prefab => structuredClone(prefab));
function addPrefab(id, assetId, x, y, columns, rows, extra = {}) {
  prefabs.push({
    prefabId: id, assetId, position: {x, y, unit: 'grid-cell'},
    footprint: {columns, rows}, layer: extra.layer ?? 'infrastructure',
    blocking: extra.blocking ?? true,
    ...(extra.visualScale ? {visualScale: extra.visualScale} : {}),
    ...(extra.depthOffset ? {depthOffset: extra.depthOffset} : {}),
    ...(extra.animationClip ? {animationClip: extra.animationClip, animationPhaseMs: extra.animationPhaseMs ?? 0} : {}),
    ...(extra.visualRoute ? {visualRoute: extra.visualRoute} : {}),
    snapping: {grid: 1, origin: [x, y], groundLevel: terrain.terrainV8.heightMap[Math.floor(y)]?.[Math.floor(x)] ?? 0},
    spatialGeometry: {
      status: 'authored-v8-review-required', units: 'grid-cell',
      groundContactAnchor: extra.anchor ?? {x: .5, y: 1, units: 'normalized-sprite'},
      visualBoundingBoxPx: extra.visualBoundingBoxPx ?? null,
      visualHeightCells: extra.visualHeightCells ?? 1,
      collisionPolygon: extra.collisionPolygon ?? [[0, 0], [columns, 0], [columns, rows], [0, rows]],
      clearanceCells: extra.clearanceCells ?? .15,
      supportedOrientations: extra.supportedOrientations ?? [0, 90],
    },
    sockets: extra.sockets ?? [],
    ...(extra.rotationDegrees ? {rotationDegrees: extra.rotationDegrees} : {}),
  });
}

// The farmhouse and shed sit on the continuous raised pasture shelf.
addPrefab('homestead-main-house', 'building-farmhouse-imagegen-v1', 2, 1, 2.5, 1.8, {
  visualHeightCells: 2.2, clearanceCells: .35,
  sockets: [{id: 'front-door', type: 'road', position: [1.25, 1.8], elevation: 1}],
});
addPrefab('homestead-machine-shed', 'building-shed-imagegen-v1', 5, 1, 2.2, 1.8, {
  visualHeightCells: 1.9, clearanceCells: .3,
  sockets: [{id: 'front-entry', type: 'road', position: [1.1, 1.8], elevation: 1}],
});

// This composite supplies a connected fence loop and a hinged gate; the gate
// socket snaps to the road extending south from the bridge.
addPrefab('beef-pen-and-gate', 'corral-wood-standard-imagegen-v1', 12, 8, 3.5, 3, {
  visualScale: 1.8, visualHeightCells: 1.3, clearanceCells: .2,
  sockets: [{id: 'gate-to-access-road', type: 'road', position: [0, .3], elevation: 0}, {id: 'pen-interior', type: 'livestock', position: [.7, .55], elevation: 0}],
});
addPrefab('pen-water-trough', 'water-trough-round-imagegen-v1', 13.25, 9.15, .75, .7, {
  visualScale: .65, depthOffset: 18, layer: 'infrastructure', visualHeightCells: .7, clearanceCells: .3,
  sockets: [{id: 'animal-access', type: 'livestock', position: [.5, .7], elevation: 0}],
});

const cows = [
  ['pen-cow-01', 12.35, 8.85, 'graze', null, 0], ['pen-cow-02', 13.15, 9.2, 'drink', null, 460], ['pen-cow-03', 14.35, 8.85, 'idle', null, 0],
  ['pen-cow-04', 12.65, 10.25, 'walk', [[12.5, 9.8], [13.2, 10.0], [14, 10.0], [14.4, 10.45], [13.6, 10.6], [12.6, 10.35]], 0],
  ['pen-cow-05', 14.35, 10.25, 'walk', [[12.5, 10.7], [13.2, 10.75], [14.1, 10.65], [14.55, 10.2], [13.8, 10.15], [12.75, 10.45]], 520],
];
for (const [id, x, y, animationClip, visualRoute, animationPhaseMs] of cows) addPrefab(id, 'world-v8-animal-idle', x, y, .48, .32, {
  layer: 'livestock', blocking: false, depthOffset: 18, visualHeightCells: .55, clearanceCells: .05,
  collisionPolygon: [[.06, .04], [.42, .04], [.42, .29], [.06, .29]], supportedOrientations: [0, 180],
  animationClip, animationPhaseMs, ...(visualRoute ? {visualRoute} : {}),
});

for (const prefab of prefabs) {
  const minX = Math.floor(prefab.position.x), minY = Math.floor(prefab.position.y);
  const maxX = Math.ceil(prefab.position.x + prefab.footprint.columns), maxY = Math.ceil(prefab.position.y + prefab.footprint.rows);
  for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
    const cell = terrain.terrainV8.cells[y]?.[x];
    if (!cell) continue;
    const occupants = Array.isArray(cell.occupancy) ? cell.occupancy : cell.occupancy ? [cell.occupancy] : [];
    occupants.push({prefabId: prefab.prefabId, assetId: prefab.assetId, blocking: prefab.blocking});
    cell.occupancy = occupants;
  }
}
for (const tile of terrain.terrainTiles) tile.occupancy = terrain.terrainV8.cells[tile.position.y][tile.position.x].occupancy;

const scene = {
  ...terrain,
  sceneId: 'riose-farm-assembly-v8-proof',
  name: 'Montagem rural · sede, galpão e piquete',
  visualVariant: {id: 'farm-assembly-v8', label: 'Etapa 2 · montagem rural', status: 'presentation-only'},
  prefabs,
  zones: [{zoneId: 'beef-paddock-v8', name: 'Piquete', kind: 'pasture', origin: {x: 12, y: 8}, footprint: {columns: 3.5, rows: 3}, color: '#8ba767'}],
};
const output = path.join(root, 'graphics-poc/scenes/farm-assembly-v8.json');
await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, `${JSON.stringify(scene, null, 2)}\n`);
console.log(JSON.stringify({output: path.relative(root, output), prefabs: prefabs.length, cows: cows.length, fencePrefabs: prefabs.filter(item => item.assetId.includes('fence-') || item.assetId.includes('corral-')).length, gateSocket: prefabs.find(item => item.prefabId === 'beef-pen-and-gate').sockets[0], scene: scene.sceneId}, null, 2));
