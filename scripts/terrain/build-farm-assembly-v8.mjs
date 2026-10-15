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
    ...(extra.modularType ? {modularType: extra.modularType} : {}),
    ...(extra.flipX ? {flipX: true} : {}),
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

const penBounds = {x: 7, y: 6, columns: 2.5, rows: 2.5};
const fenceNodes = [];
const penCorners = [[7, 6], [9.5, 6], [9.5, 8.5], [7, 8.5]];
for (let edge = 0; edge < 4; edge++) {
  const [ax, ay] = penCorners[edge], [bx, by] = penCorners[(edge + 1) % 4];
  const count = edge % 2 === 0 ? 3 : 2;
  for (let segment = 0; segment < count; segment++) {
    const t = (segment + .5) / count, anchorX = ax + (bx - ax) * t, anchorY = ay + (by - ay) * t;
    if (edge === 0 && segment === 0) {
      addPrefab('beef-pen-gate', 'fence-gate-wood-imagegen-v1', anchorX - .4, anchorY - .3, .8, .6, {
        visualScale: 1.35, flipX: true, modularType: 'fence-gate', visualHeightCells: .7, clearanceCells: .15,
        sockets: [{id: 'gate-left-fence', type: 'fence'}, {id: 'gate-right-fence', type: 'fence'}, {id: 'gate-to-access-road', type: 'road', position: [.4, -.7], elevation: 0}],
        collisionPolygon: [[0, 0], [.8, 0], [.8, .6], [0, .6]],
      });
      fenceNodes.push({prefabId: 'beef-pen-gate'});
      continue;
    }
    const id = `beef-pen-fence-${edge}-${segment}`;
    const segmentLength = Math.hypot(bx - ax, by - ay) / count;
    const columns = edge % 2 === 0 ? segmentLength : .55, rows = edge % 2 === 0 ? .55 : segmentLength;
    addPrefab(id, 'world-v8-farm-fence-wood-segment', anchorX - columns / 2, anchorY - rows / 2, columns, rows, {
      visualScale: segmentLength * 96 * Math.sqrt(1.25) / (2 * 512) * 1.18, visualHeightCells: .6, clearanceCells: .05,
      modularType: 'fence-segment',
      ...(edge % 2 === 0 ? {flipX: true} : {}),
      sockets: [{id: `${id}-start`, type: 'fence', position: [-.55, 0]}, {id: `${id}-end`, type: 'fence', position: [.55, 0]}],
      collisionPolygon: [[0, 0], [1.1, 0], [1.1, .55], [0, .55]],
    });
    fenceNodes.push({prefabId: id});
  }
}
for (let index = 0; index < fenceNodes.length; index++) {
  const node = fenceNodes[index], prefab = prefabs.find(item => item.prefabId === node.prefabId);
  const previous = fenceNodes[(index + fenceNodes.length - 1) % fenceNodes.length].prefabId;
  const next = fenceNodes[(index + 1) % fenceNodes.length].prefabId;
  prefab.socketConnections = prefab.modularType === 'fence-gate' ? {left: previous, right: next} : {start: previous, end: next};
}
const penGate = prefabs.find(item => item.prefabId === 'beef-pen-gate');
const penGateCenter = {x: penGate.position.x + penGate.footprint.columns / 2, y: penGate.position.y + penGate.footprint.rows / 2};
penGate.roadConnectionCell = terrain.terrainV8.cells.flat().filter(cell => ['road', 'ramp'].includes(cell.material))
  .map(cell => ({cell, distance: Math.hypot(cell.x + .5 - penGateCenter.x, cell.y + .5 - penGateCenter.y)}))
  .sort((a, b) => a.distance - b.distance)[0].cell;
penGate.roadConnectionCell = [penGate.roadConnectionCell.x, penGate.roadConnectionCell.y];
addPrefab('pen-water-trough', 'water-trough-round-imagegen-v1', 8.25, 7.15, .75, .7, {
  visualScale: .65, depthOffset: 18, layer: 'infrastructure', visualHeightCells: .7, clearanceCells: .3,
  sockets: [{id: 'animal-access', type: 'livestock', position: [.5, .7], elevation: 0}],
});

const cows = [
  ['pen-cow-01', 7.35, 6.85, 'graze', null, 0], ['pen-cow-02', 8.15, 7.2, 'drink', null, 460], ['pen-cow-03', 9.0, 6.85, 'idle', null, 0],
  ['pen-cow-04', 7.65, 8.0, 'walk', [[7.5, 7.8], [8.2, 8.0], [9, 8.0], [9.4, 8.25], [8.6, 8.4], [7.6, 8.35]], 0],
  ['pen-cow-05', 9.0, 8.0, 'walk', [[7.5, 8.45], [8.2, 8.5], [9.1, 8.45], [9.4, 8.1], [8.8, 8.05], [7.75, 8.2]], 520],
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
  zones: [{zoneId: 'beef-paddock-v8', name: 'Piquete', kind: 'pasture', origin: {x: penBounds.x, y: penBounds.y}, footprint: {columns: penBounds.columns, rows: penBounds.rows}, color: '#8ba767'}],
};
const output = path.join(root, 'graphics-poc/scenes/farm-assembly-v8.json');
await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, `${JSON.stringify(scene, null, 2)}\n`);
console.log(JSON.stringify({output: path.relative(root, output), prefabs: prefabs.length, cows: cows.length, fencePrefabs: prefabs.filter(item => item.assetId.includes('fence-') || item.assetId.includes('corral-')).length, gateSocket: prefabs.find(item => item.prefabId === 'beef-pen-gate').sockets[2], scene: scene.sceneId}, null, 2));
