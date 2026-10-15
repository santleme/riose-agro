import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {waterTileAssetId} from '../../src/client/terrain-world-v8.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const assembly = await readJson('graphics-poc/scenes/farm-assembly-v8.json');
const reference = await readJson('assets/previews/ranch-composition-v4/rural-diorama-scene-v4-grounding-v2-gate-v2-water-v2-feed-v2-review.json');
const renderManifest = await readJson('graphics-poc/assets/main-composer-render-manifest.json');
const v8Assets = await readJson('assets/generated/world-v8/terrain-atlas-v8.json');

const COLUMNS = 20, ROWS = 18, CELL_W = 96, CELL_H = 48, CENTER_X = 887, CENTER_Y = 443.5;
const runtimeById = new Map(renderManifest.assets.map(asset => [asset.assetId, asset]));
const byCategory = (prefix, fallback) => renderManifest.assets.find(asset => asset.assetId.startsWith(prefix))?.assetId ?? fallback;
const assetMap = {
  'building.farmhouse.imagegen.v2': 'building-farmhouse-imagegen-v1',
  'building.shed.imagegen.v1': 'building-shed-imagegen-v1',
  'building.workshop.imagegen.v1': 'building-workshop-imagegen-v1',
  'vehicle.pickup.rural.imagegen.v1': 'vehicle-pickup-rural-imagegen-v1',
  'vehicle.livestock-truck.imagegen.v1': 'vehicle-pickup-rural-imagegen-v1',
  'vehicle.tractor.imagegen.v2': 'vehicle-tractor-imagegen-v1',
  'water.reservoir.imagegen.v1': 'world-v8-farm-silo-water-tower',
  'vegetation.tree.shade.imagegen.v2': 'world-v8-tree',
  'feed.salt.roofed.imagegen.v1': 'feed-salt-roofed-imagegen-v1',
  'feed.trough.hay.imagegen.v2': 'feed-trough-hay-imagegen-v1',
  'corral.wood.standard.imagegen.v1': 'corral-wood-standard-imagegen-v1',
  'fence.gate.wood.imagegen.v2': 'fence-gate-wood-imagegen-v1',
  'fence.wire.wood-post.imagegen.v1': 'world-v8-farm-fence-wood-segment-y',
  'handling.alley.cattle.imagegen.v1': byCategory('handling-alley', 'handling-chute-cattle-imagegen-v1'),
  'handling.chute.cattle.imagegen.v1': 'handling-chute-cattle-imagegen-v1',
  'technology.scale.electronic.full.imagegen.v1': 'technology-scale-electronic-full-imagegen-v1',
  'water.trough.cattle.galvanized.imagegen.v2': 'water-trough-round-imagegen-v1',
  'water.pond.imagegen.v1': 'world-v8-stream-waterfall',
  'technology.gateway.antenna.imagegen.v1': 'technology-gateway-antenna-imagegen-v1',
  'technology.monitor.station.imagegen.v2': 'technology-monitor-station-imagegen-v1',
  'technology.traceability.system.imagegen.v1': 'technology-traceability-system-imagegen-v1',
  'technology.reader.handheld.imagegen.v1': byCategory('technology-reader', 'technology-monitor-station-imagegen-v1'),
  'livestock.nelore.adult.grazing.ne.v1': 'world-v8-animal-idle',
  'livestock.nelore.adult.idle.imagegen.v1': 'world-v8-animal-idle',
  'livestock.nelore.adult.walking.ne.v1': 'world-v8-animal-idle',
  'livestock.nelore.calf.idle.ne.v1': 'livestock-nelore-calf-idle-imagegen-v1',
};

function referenceToGrid([px, py]) {
  const dx = (px - CENTER_X) / (CELL_W / 2);
  const dy = (py - CENTER_Y) / (CELL_H / 2);
  return {x: COLUMNS / 2 + (dx + dy) / 2, y: ROWS / 2 + (dy - dx) / 2};
}

function gridToReference(x, y) {
  const dx = (x - COLUMNS / 2) - (y - ROWS / 2);
  const dy = (x - COLUMNS / 2) + (y - ROWS / 2);
  return [CENTER_X + dx * CELL_W / 2, CENTER_Y + dy * CELL_H / 2];
}

function contains(polygon, point) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j], [x, y] = point;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const zonesById = Object.fromEntries(reference.zones.map(zone => [zone.id, zone]));
const heightMap = Array.from({length: ROWS}, (_, row) => Array.from({length: COLUMNS}, (_, column) => {
  const point = gridToReference(column + .5, row + .5);
  const zoneLevel = Object.values(zonesById).filter(zone => ['piquete-oeste', 'pasto-norte', 'piquete-leste', 'cultivo', 'casa-sede', 'infraestrutura'].includes(zone.id))
    .some(zone => contains(zone.polygon, point));
  return zoneLevel ? 1 : 0;
}));

// The northwest pasture sits one terrace above its surrounding grassland.
for (let row = 0; row < ROWS; row++) for (let column = 0; column < COLUMNS; column++) {
  const point = gridToReference(column + .5, row + .5);
  if (contains(zonesById['piquete-oeste'].polygon, point)) heightMap[row][column] = 2;
}
for (let row = 0; row < ROWS; row++) for (let column = 0; column < COLUMNS; column++) {
  if (heightMap[row][column] !== 2) continue;
  for (const [x, y] of [[column - 1, row], [column + 1, row], [column, row - 1], [column, row + 1]]) {
    if (x >= 0 && x < COLUMNS && y >= 0 && y < ROWS && heightMap[y][x] === 0) heightMap[y][x] = 1;
  }
}

const waterCoordinates = [
  [0, 14], [0, 15], [0, 16], [0, 17], [1, 17], [2, 17], [3, 17], [4, 17],
  [5, 17], [6, 17], [7, 17], [8, 17], [9, 17], [10, 17], [11, 17], [12, 17],
  [12, 16], [12, 15], [13, 15], [13, 14], [14, 14], [15, 14], [16, 14], [17, 14], [18, 14],
  [13, 16], [14, 15], [15, 15], [16, 15],
];
const waterKeys = new Set(waterCoordinates.map(([x, y]) => `${x},${y}`));
const roadRoutes = [
  [[2, 16], [5, 15], [7, 14], [8, 12], [8, 10], [9, 8], [11, 8], [13, 7], [14, 6], [16, 6], [17, 7]],
  [[16, 6], [16, 8], [16, 10], [16, 12], [15, 13], [14, 14], [15, 14], [16, 14], [16, 13], [16, 12]],
  [[8, 10], [6, 10], [4, 10], [3, 11], [2, 12]],
  [[9, 8], [9, 6], [9, 4], [10, 3]],
];
const roadKeys = new Set();
for (const route of roadRoutes) for (let index = 0; index < route.length - 1; index++) {
  let [x, y] = route[index]; const [endX, endY] = route[index + 1];
  roadKeys.add(`${x},${y}`);
  while (x !== endX || y !== endY) {
    if (x !== endX) x += Math.sign(endX - x);
    else y += Math.sign(endY - y);
    roadKeys.add(`${x},${y}`);
  }
}
const bridgeLinks = [[14, 14], [15, 14], [16, 14]];
const bridgeKeys = new Set(bridgeLinks.map(([x, y]) => `${x},${y}`));

const cellAt = (x, y) => Number.isInteger(y) && Number.isInteger(x) ? cells[y]?.[x] ?? null : null;
const cells = heightMap.map((line, y) => line.map((elevation, x) => {
  const key = `${x},${y}`;
  const material = waterKeys.has(key) ? 'water' : roadKeys.has(key) ? 'road' : 'grass';
  return {x, y, material, elevation, inclination: 0, navigable: material !== 'water' || bridgeKeys.has(key), occupancy: null, connectivity: [], transition: null,
    slopeClass: 'level'};
}));
for (const row of cells) for (const cell of row) {
  const neighbors = [[cell.x - 1, cell.y], [cell.x + 1, cell.y], [cell.x, cell.y - 1], [cell.x, cell.y + 1]].map(([x, y]) => cellAt(x, y)).filter(Boolean);
  cell.inclination = Math.max(0, ...neighbors.map(neighbor => Math.abs(neighbor.elevation - cell.elevation)));
  cell.slopeClass = cell.inclination ? 'walkable-step' : 'level';
  for (const next of neighbors) {
    if (!cell.navigable || !next.navigable || Math.abs(cell.elevation - next.elevation) > 1) continue;
    const linkedBridge = bridgeKeys.has(`${cell.x},${cell.y}`) && bridgeKeys.has(`${next.x},${next.y}`);
    if ((cell.material === 'water' || next.material === 'water') && !linkedBridge) continue;
    cell.connectivity.push({x: next.x, y: next.y, routeKind: cell.material === 'road' || next.material === 'road' ? 'road' : 'ground'});
  }
  const seam = neighbors.find(next => next.material !== cell.material);
  if (seam) cell.transition = {from: cell.material, to: seam.material, neighbor: [seam.x, seam.y], kind: 'tile-mask'};
}

const cliffSegments = [];
for (const row of cells) for (const cell of row) {
  for (const [direction, x, y] of [['east', cell.x + 1, cell.y], ['south', cell.x, cell.y + 1]]) {
    const next = cellAt(x, y), bottom = next?.elevation ?? -1;
    if (cell.elevation <= bottom) continue;
    cliffSegments.push({id: `cliff-${cell.x}-${cell.y}-${direction}`, from: [cell.x, cell.y], to: next ? [x, y] : null, direction,
      topElevation: cell.elevation, bottomElevation: bottom, levels: cell.elevation - bottom, material: 'layered-earth', assetId: `world-v8-cliff-${direction}-${(cell.x + cell.y) % 4}`});
  }
}
const bridges = [{id: 'creek-crossing-v8', assetId: 'world-v8-bridge', position: {x: 15, y: 14, z: 0}, size: {width: 2, height: 1},
  footprint: [[14, 13.5], [16, 13.5], [16, 14.5], [14, 14.5]], pivot: {x: .5, y: .72}, orientation: 'x-axis',
  sockets: [{id: 'west-road', type: 'road', position: [14, 14]}, {id: 'east-road', type: 'road', position: [16, 14]}],
  clearance: {width: 2, height: 1}, links: bridgeLinks, collisionPolygon: [[14, 13.5], [16, 13.5], [16, 14.5], [14, 14.5]]}];

function routeThroughRoad(start, end) {
  const queue = [start], previous = new Map([[start.join(','), null]]);
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === end[0] && y === end[1]) break;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const key = `${nx},${ny}`, cell = cellAt(nx, ny);
      if (!roadKeys.has(key) && !bridgeKeys.has(key)) continue;
      if (!cell?.navigable || previous.has(key)) continue;
      if (Math.abs(cell.elevation - cellAt(x, y).elevation) > 1) continue;
      previous.set(key, `${x},${y}`); queue.push([nx, ny]);
    }
  }
  const endKey = end.join(','); if (!previous.has(endKey)) return [];
  const path = [];
  for (let at = endKey; at; at = previous.get(at)) path.push(at.split(',').map(Number));
  return path.reverse();
}

const terrainModel = {
  schemaVersion: 1, id: 'riose-farm-final-v8-terrain', projection: 'isometric-2-to-1',
  dimensions: {columns: COLUMNS, rows: ROWS, metersPerCell: 5, elevationUnit: 'level', elevationPxPerLevel: 60},
  heightMap, cells, routes: {road: [...roadKeys].map(key => key.split(',').map(Number)), navigable: routeThroughRoad([2, 16], [16, 12]),
    bridgeCrossing: bridgeLinks, maxWalkStep: 1}, bridges, cliffSegments,
  objects: [{id: 'creek-crossing-v8', assetId: 'world-v8-bridge', x: 15, y: 14, z: 0, width: 2, height: 1, anchor: [.5, .72], orientation: 'x-axis', depth: 14}],
  transitionRules: ['grass-to-road', 'grass-to-water', 'road-to-bridge', 'terrace-to-ramp', 'ramp-to-lowland'], artReview: 'pending-human-review',
};

const roadRampKeys = new Set([...roadKeys].filter(key => {
  const [x, y] = key.split(',').map(Number), cell = cellAt(x, y);
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => cellAt(nx, ny) && cellAt(nx, ny).elevation !== cell.elevation);
}));
const lushGrassPatches = new Set(['0,1', '3,1', '4,3', '2,4']);
const useNaturalGrassTile = (x, y) => lushGrassPatches.has(`${Math.floor(x / 4)},${Math.floor(y / 3)}`) && (x + y) % 2 === 0;
for (const key of roadRampKeys) {
  const [x, y] = key.split(',').map(Number), cell = cellAt(x, y);
  if (cell?.material === 'road') cell.material = 'ramp';
}
const terrainTiles = cells.flat().map(cell => {
  const horizontalRoad = [-1, 1].some(dx => ['road', 'ramp'].includes(cellAt(cell.x + dx, cell.y)?.material));
  const verticalRoad = [-1, 1].some(dy => ['road', 'ramp'].includes(cellAt(cell.x, cell.y + dy)?.material));
  const roadAsset = horizontalRoad && verticalRoad ? 'road-cross' : verticalRoad ? 'road-row' : 'road';
  const assetId = cell.material === 'water' ? waterTileAssetId(cells, cell.x, cell.y)
    : cell.material === 'grass' && useNaturalGrassTile(cell.x, cell.y) ? 'world-v8-grass-natural'
    : `world-v8-${roadRampKeys.has(`${cell.x},${cell.y}`) ? 'ramp' : cell.material === 'road' ? roadAsset : cell.material}`;
  return {position: {x: cell.x, y: cell.y}, assetId,
  zoneId: null, elevation: cell.elevation, material: cell.material,
  slope: cell.inclination, navigable: cell.navigable, occupancy: null, connectivity: cell.connectivity, transition: cell.transition};
});

const bridgePrefab = {prefabId: 'creek-bridge-main', assetId: 'world-v8-bridge', layer: 'infrastructure', position: {x: 14, y: 13.5, unit: 'grid-cell'},
  footprint: {columns: 2, rows: 1}, visualScale: 1, blocking: true, sockets: bridges[0].sockets,
  spatialGeometry: {contactAnchor: [.5, .72], collisionPolygon: bridges[0].collisionPolygon}};
const prefabs = [bridgePrefab];
for (const placement of reference.placements) {
  // The V4 fence assets are point-like marks without connected rails. Rebuild the
  // three pasture boundaries from snapped V8 segments below; keep the handling corral.
  if (placement.assetId.startsWith('fence.wire.') || placement.assetId.startsWith('fence.gate.')) continue;
  const assetId = assetMap[placement.assetId];
  if (!assetId) continue;
  const assetMeta = runtimeById.get(assetId) ?? v8Assets.assets[assetId.replace(/^world-v8-/, '')];
  const [xPx, yPx] = placement.anchorPx, anchor = referenceToGrid([xPx, yPx]);
  const targetWidth = placement.requestedSizePx?.[0] ?? 72;
  const nativeWidth = assetMeta?.frame?.w ?? assetMeta?.frame?.width ?? 128;
  const nativeScale = assetMeta?.scale ?? (assetId.startsWith('world-v8-') ? assetId.includes('animal') ? .38 : assetId.includes('tree') ? .68 : .82 : 1);
  const visualScale = Math.max(.12, Math.min(2.2, targetWidth / (nativeWidth * nativeScale)));
  const footprint = assetMeta?.footprint
    ? Array.isArray(assetMeta.footprint) ? {columns: assetMeta.footprint[0], rows: assetMeta.footprint[1]} : {columns: assetMeta.footprint.width ?? 1, rows: assetMeta.footprint.height ?? 1}
    : {columns: Math.max(.55, targetWidth / 125), rows: Math.max(.45, targetWidth / 175)};
  const isAnimal = placement.assetId.startsWith('livestock.');
  const id = placement.placementId;
  const clip = id === 'v4-placement-053' ? 'drink' : placement.assetId.includes('grazing') ? 'graze' : placement.assetId.includes('walking') ? 'walk' : isAnimal ? 'idle' : null;
  const prefab = {prefabId: id, assetId, layer: isAnimal ? 'livestock' : assetId.startsWith('world-v8-farm-') ? 'infrastructure' : assetId === 'world-v8-tree' ? 'infrastructure' : 'infrastructure',
    position: {x: anchor.x - footprint.columns / 2, y: anchor.y - footprint.rows / 2, unit: 'grid-cell'}, footprint,
    visualScale, depthOffset: isAnimal ? 0 : 0, blocking: !isAnimal && !assetId.includes('tree') && !assetId.includes('trough'),
    spatialGeometry: {contactAnchor: assetMeta?.anchor ?? {x: .5, y: .92}, collisionPolygon: [[0, 0], [footprint.columns, 0], [footprint.columns, footprint.rows], [0, footprint.rows]]},
    sourcePlacementId: placement.placementId, sourceAssetId: placement.assetId};
  if (Number.isFinite(placement.transform?.rotationDegreesCCW)) prefab.rotationDegrees = placement.transform.rotationDegreesCCW;
  if (placement.transform?.flip === 'h') prefab.flipX = true;
  if (assetId.startsWith('world-v8-farm-fence-wood-segment-')) {
    prefab.modularType = 'fence-segment';
    prefab.sockets = [{id: `${id}-start`, type: 'fence', position: [-footprint.columns / 2, 0]}, {id: `${id}-end`, type: 'fence', position: [footprint.columns / 2, 0]}];
    prefab.spatialGeometry.collisionPolygon = [[0, 0], [footprint.columns, 0], [footprint.columns, footprint.rows], [0, footprint.rows]];
  } else if (assetId === 'fence-gate-wood-imagegen-v1') {
    prefab.modularType = 'fence-gate';
    prefab.sockets = [{id: `${id}-left`, type: 'fence'}, {id: `${id}-right`, type: 'fence'}, {id: `${id}-road`, type: 'road'}];
  }
  if (clip) {
    prefab.animationClip = clip; prefab.animationPhaseMs = (Number.parseInt(id.slice(-3), 10) || 0) * 113;
    if (clip === 'walk') {
      const offset = (Number.parseInt(id.slice(-2), 10) || 1) % 2 ? .28 : -.28;
      prefab.visualRoute = [[anchor.x - offset, anchor.y], [anchor.x + offset, anchor.y]];
    }
  }
  // Record the access sockets on the residence and main shed against actual
  // road cells in the authored route.
  if (id === 'v4-placement-001') {
    prefab.sockets = [{id: 'farmhouse-entry', type: 'road', position: [.5, 1]}];
    prefab.roadConnectionCell = [9, 8];
  }
  if (id === 'v4-placement-013') {
    prefab.position.x += 3;
    prefab.position.y += 2.5;
    prefab.sockets = [{id: 'shed-entry', type: 'road', position: [.5, 1]}];
    prefab.roadConnectionCell = [16, 6];
  }
  if (assetId === 'world-v8-farm-silo-water-tower') prefab.visualScale *= .72;
  if (assetId === 'world-v8-stream-waterfall') {
    const runtimeScale = .7, frameWidth = assetMeta?.frame?.w ?? assetMeta?.frame?.width ?? 478;
    prefab.visualScale = footprint.columns * CELL_W / (frameWidth * runtimeScale);
  }
  prefabs.push(prefab);
}

function gridPrefab(prefabId, assetId, anchor, footprint, visualScale, extra = {}) {
  const x = typeof anchor.x === 'number' ? anchor.x : anchor[0], y = typeof anchor.y === 'number' ? anchor.y : anchor[1];
  return {prefabId, assetId, layer: extra.layer ?? 'infrastructure', position: {x: x - footprint.columns / 2, y: y - footprint.rows / 2, unit: 'grid-cell'},
    footprint, visualScale, blocking: extra.blocking ?? false,
    spatialGeometry: {contactAnchor: {x: .5, y: .92}, collisionPolygon: [[0, 0], [footprint.columns, 0], [footprint.columns, footprint.rows], [0, footprint.rows]]}, ...extra};
}

// A pair of planted crop beds gives the cultivation zone the same broad read as the reference.
for (const [index, anchor] of [[6.25, 14.5], [4.2, 15.05]].entries()) {
  prefabs.push(gridPrefab(`crop-field-${index + 1}`, 'world-v8-farm-crop-field', {x: anchor[0], y: anchor[1]}, {columns: 2.4, rows: 1.7}, 1.12,
    {blocking: true, spatialGeometry: {contactAnchor: {x: .5, y: .72}, collisionPolygon: [[0, 0], [2.4, 0], [2.4, 1.7], [0, 1.7]]}}));
}
prefabs.push(gridPrefab('north-pasture-windmill', 'world-v8-farm-windmill', {x: 12.8, y: .5}, {columns: 1.1, rows: .8}, .78, {blocking: true}));
prefabs.push(gridPrefab('north-pasture-open-shelter', 'world-v8-farm-equipment-barn', {x: 10.4, y: 1.45}, {columns: 1.2, rows: .8}, .47, {blocking: true}));

for (const [index, [x, y]] of [[7.2, 1.5], [9.7, 2.1], [12.2, 2.5], [14.8, 3.1], [3.2, 6.3], [5.9, 5.2], [1.3, 12.4], [2.4, 15.2], [9.7, 13.2], [11.5, 15.4], [18.1, 9.2], [17.4, 12.1],
  [2.2, 2.6], [5.1, 1.35], [17.6, 1.35], [19, 3.5], [1.2, 7.5], [6.8, 4.6], [11.8, 5.25], [18.8, 7.1], [5.1, 12.2], [7.5, 13.4], [13.5, 12.8], [19, 13.6], [4.1, 4.4], [14.4, 8.2], [10.8, 11.2], [0.8, 10.3], [15.1, 16.4],
  [13.4, 1.2], [15.2, 2.7], [18.5, 4.7], [1, 4], [5.7, 7.3], [11, 7.3], [12, 7.2], [3.2, 13.3], [5.5, 13.8], [10, 13.8], [13.3, 13.8], [18.7, 15.1], [1, 9.5],
  [4.8, 6], [7.2, 8.1], [12.8, 4.4], [14, 5.4], [6.8, 11.7], [7.3, 12.1], [13.7, 9.1], [17.8, 8.6], [8.7, 15.5], [10.6, 14.7], [12.5, 15.9], [15.5, 16.5]].entries()) {
  const cell = cellAt(Math.floor(x), Math.floor(y));
  if (!cell || cell.material !== 'grass') continue;
  const collides = prefabs.some(item => item.blocking && x >= item.position.x - .35 && x < item.position.x + item.footprint.columns + .35
    && y >= item.position.y - .35 && y < item.position.y + item.footprint.rows + .35);
  const overlapsGrove = prefabs.some(item => item.assetId === 'world-v8-tree' && Math.hypot(item.position.x + .5 - x, item.position.y + .5 - y) < 1.15);
  if (!collides && !overlapsGrove) prefabs.push(gridPrefab(`grove-tree-${index + 1}`, 'world-v8-tree', {x, y}, {columns: 1, rows: 1}, .72, {blocking: false}));
}

// Snap complete modular fence rings around every pasture and connect each gate in the ring.
function addModularPastureFence(zoneId, gapOnEdge = -1) {
  const zone = zonesById[zoneId], corners = zone.polygon.map(referenceToGrid), ring = [];
  for (let edge = 0; edge < corners.length; edge++) {
    const a = corners[edge], b = corners[(edge + 1) % corners.length];
    for (let segment = 0; segment < 2; segment++) {
      const t = (segment + .5) / 2, anchor = {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t};
      const id = edge === gapOnEdge && segment === 0 ? `gate-${zoneId}` : `fence-${zoneId}-${edge}-${segment}`;
      const isGate = id.startsWith('gate-');
      const edgeLength = Math.hypot(b.x - a.x, b.y - a.y), segmentWidth = edgeLength / 2;
      const footprint = edge % 2 === 0 ? {columns: .55, rows: segmentWidth} : {columns: segmentWidth, rows: .55};
      const scale = isGate ? .23 : segmentWidth * CELL_W * Math.sqrt(1.25) / (2 * 512) * 1.18;
      const prefab = gridPrefab(id, isGate ? 'fence-gate-wood-imagegen-v1' : 'world-v8-farm-fence-wood-segment-y', anchor, footprint, scale, {
        blocking: true, modularType: isGate ? 'fence-gate' : 'fence-segment', flipX: edge % 2 === 1,
        sockets: isGate
          ? [{id: `${id}-left`, type: 'fence'}, {id: `${id}-right`, type: 'fence'}, {id: `${id}-road`, type: 'road'}]
          : [{id: `${id}-start`, type: 'fence'}, {id: `${id}-end`, type: 'fence'}],
        spatialGeometry: {contactAnchor: {x: .5, y: .92}, collisionPolygon: [[0, 0], [footprint.columns, 0], [footprint.columns, footprint.rows], [0, footprint.rows]]},
      });
      ring.push({prefab, isGate});
    }
  }
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index], previous = ring[(index + ring.length - 1) % ring.length].prefab.prefabId;
    const next = ring[(index + 1) % ring.length].prefab.prefabId;
    current.prefab.socketConnections = current.isGate ? {left: previous, right: next} : {start: previous, end: next};
    if (current.isGate) {
      const gate = current.prefab, centerX = gate.position.x + gate.footprint.columns / 2, centerY = gate.position.y + gate.footprint.rows / 2;
      const nearestRoad = cells.flat().filter(cell => ['road', 'ramp'].includes(cell.material))
        .map(cell => ({cell, distance: Math.hypot(cell.x + .5 - centerX, cell.y + .5 - centerY)}))
        .sort((left, right) => left.distance - right.distance)[0]?.cell;
      if (nearestRoad) gate.roadConnectionCell = [nearestRoad.x, nearestRoad.y];
    }
  }
  for (const {prefab, isGate} of ring) prefabs.push(prefab);
}
addModularPastureFence('piquete-oeste', 3);
addModularPastureFence('pasto-norte', 3);
addModularPastureFence('piquete-leste', 0);

const forestTree = prefabs.find(item => item.assetId === 'world-v8-tree');
if (forestTree) prefabs.push({...structuredClone(forestTree), prefabId: 'tree-low-west', position: {...forestTree.position, x: forestTree.position.x + 1.4, y: forestTree.position.y + 2.2}});

const zoneNames = {cultivo: 'Lavoura', 'casa-sede': 'Sede', infraestrutura: 'Serviços', manejo: 'Curral', agua: 'Açude', 'piquete-oeste': 'Pastagem oeste', 'pasto-norte': 'Pastagem norte', 'piquete-leste': 'Pastagem leste', 'borda-verde': 'Bosque', monitoramento: 'Monitoramento'};
const zones = reference.zones.map(zone => {
  const grid = zone.polygon.map(point => referenceToGrid(point));
  const xs = grid.map(point => point.x), ys = grid.map(point => point.y), pasture = zone.id.startsWith('piquete') || zone.id === 'pasto-norte';
  return {zoneId: zone.id, name: zoneNames[zone.id], kind: pasture ? 'pasture' : zone.id === 'manejo' ? 'service' : zone.id === 'agua' ? 'water' : 'farm',
    origin: {x: Math.min(...xs), y: Math.min(...ys)}, footprint: {columns: Math.max(...xs) - Math.min(...xs), rows: Math.max(...ys) - Math.min(...ys)}, color: pasture ? '#91a76c' : '#a78d63'};
});

// Fill out the three grazing regions with animated cattle while preserving the V4 herd anchors.
const cowCount = prefabs.filter(prefab => prefab.layer === 'livestock').length;
const cowAnchors = [[3.15, 9.45], [4.2, 9.35], [3.35, 10.25], [4.35, 10.7], [8.55, 3.8], [9.5, 3.3], [10.1, 4.4], [15.4, 5.3], [16.2, 4.5], [17.2, 5.8], [16.2, 6.2], [15.6, 10.2], [16.5, 10.15], [17.25, 10.5]];
for (let index = cowCount; index < cowAnchors.length; index++) {
  const [x, y] = cowAnchors[index], calf = index % 5 === 4;
  const assetId = calf ? 'livestock-nelore-calf-idle-imagegen-v1' : 'world-v8-animal-idle';
  prefabs.push({prefabId: `v8-cow-${String(index + 1).padStart(2, '0')}`, assetId, layer: 'livestock', position: {x: x - .3, y: y - .225, unit: 'grid-cell'},
    footprint: {columns: .6, rows: .45}, visualScale: calf ? .78 : 1, blocking: false,
    spatialGeometry: {contactAnchor: {x: .5, y: 1}, collisionPolygon: [[.06, .04], [.54, .04], [.54, .41], [.06, .41]]}, animationClip: index % 3 === 0 ? 'graze' : 'idle', animationPhaseMs: index * 127});
}

const addedPastureCattle = [
  ['piquete-oeste', 3.5, 8.5], ['piquete-oeste', 4.5, 8.5],
  ['piquete-oeste', 2.7, 8.8], ['piquete-leste', 17.8, 5.1],
];
for (const [index, [zoneId, x, y]] of addedPastureCattle.entries()) {
  if (!contains(zonesById[zoneId].polygon, gridToReference(x, y)) || cellAt(Math.floor(x), Math.floor(y))?.material !== 'grass') continue;
  if (prefabs.some(item => item.layer === 'livestock' && Math.hypot(item.position.x + item.footprint.columns / 2 - x, item.position.y + item.footprint.rows / 2 - y) < .72)) continue;
  const prefabId = `v8-pasture-cow-${String(index + 1).padStart(2, '0')}`;
  prefabs.push({prefabId, assetId: 'world-v8-animal-idle', layer: 'livestock', position: {x: x - .3, y: y - .225, unit: 'grid-cell'},
    footprint: {columns: .6, rows: .45}, visualScale: 1, blocking: false,
    spatialGeometry: {contactAnchor: {x: .5, y: 1}, collisionPolygon: [[.06, .04], [.54, .04], [.54, .41], [.06, .41]]},
    animationClip: index % 2 ? 'graze' : 'idle', animationPhaseMs: (index + 19) * 137});
}

const base = structuredClone(assembly);
base.sceneId = 'riose-farm-final-v8'; base.name = 'Fazenda Riose · reconstrução artesanal';
base.projection = {type: 'isometric-2to1', cellWidth: CELL_W, cellHeight: CELL_H, columns: COLUMNS, rows: ROWS};
base.terrainTiles = terrainTiles; base.terrainV8 = terrainModel; base.prefabs = prefabs; base.zones = zones;
base.entities = []; base.assetInstances = [];
base.simulation = {...base.simulation, scenarioId: 'riose-farm-v8-art-directed', seed: 84018, populationCount: 0, productionSystem: 'visual-only'};
base.visualVariant = {id: 'farm-final-v8-art-directed', label: 'Fazenda artesanal · composição V4 em terreno V8', status: 'presentation-only'};

const composedScene = base;
composedScene.sceneId = 'riose-farm-final-v8'; composedScene.name = 'Fazenda Riose · reconstrução artesanal';
composedScene.zones = zones; composedScene.prefabs = prefabs;
composedScene.terrainTiles = terrainTiles; composedScene.terrainV8 = terrainModel;
const filename = 'farm-final-v8.json';
const output = path.join(root, 'graphics-poc/scenes', filename);
await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, `${JSON.stringify(composedScene, null, 2)}\n`);
console.log(JSON.stringify({output: path.relative(root, output), seed: base.simulation.seed, dimensions: [COLUMNS, ROWS], cells: cells.flat().length,
  elevationLevels: [...new Set(heightMap.flat())], roads: roadKeys.size, water: waterCoordinates.length, bridges: bridges.length,
  zones: zones.length, prefabs: prefabs.length, animals: prefabs.filter(item => item.layer === 'livestock').length,
  fences: prefabs.filter(item => item.assetId.includes('fence-')).length, routeCells: terrainModel.routes.navigable.length,
  cliffs: cliffSegments.length, unmapped: reference.placements.filter(item => !assetMap[item.assetId]).map(item => item.assetId)}, null, 2));
