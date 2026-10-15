export const TERRAIN_WORLD_V8 = Object.freeze({
  columns: 16,
  rows: 12,
  cellWidthPx: 128,
  cellHeightPx: 64,
  elevationPxPerLevel: 60,
  maxWalkStep: 1,
  metersPerCell: 5,
});

const KEY = (x, y) => `${x},${y}`;
const neighbors = (x, y) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];

function getCell(cells, x, y) {
  return cells[y]?.[x] ?? null;
}

function isBridgeLinked(a, b, bridges) {
  return bridges.some(bridge => bridge.links.some((point, index) => {
    const next = bridge.links[index + 1];
    if (!next) return false;
    return (point[0] === a.x && point[1] === a.y && next[0] === b.x && next[1] === b.y)
      || (next[0] === a.x && next[1] === a.y && point[0] === b.x && point[1] === b.y);
  }));
}

function shortestRoute(cells, bridges, start, end) {
  const queue = [[start.x, start.y]], previous = new Map([[KEY(start.x, start.y), null]]);
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === end.x && y === end.y) break;
    const cell = getCell(cells, x, y);
    for (const [nx, ny] of neighbors(x, y)) {
      const next = getCell(cells, nx, ny);
      if (!next || !next.navigable || Math.abs(next.elevation - cell.elevation) > TERRAIN_WORLD_V8.maxWalkStep) continue;
      if ((cell.material === 'water' || next.material === 'water') && !isBridgeLinked(cell, next, bridges)) continue;
      const key = KEY(nx, ny);
      if (previous.has(key)) continue;
      previous.set(key, KEY(x, y)); queue.push([nx, ny]);
    }
  }
  const endKey = KEY(end.x, end.y);
  if (!previous.has(endKey)) return [];
  const path = [];
  for (let at = endKey; at; at = previous.get(at)) path.push(at.split(',').map(Number));
  return path.reverse();
}

export function buildTerrainWorldV8() {
  const {columns, rows} = TERRAIN_WORLD_V8;
  const heightMap = Array.from({length: rows}, () => Array(columns).fill(0));
  for (let y = 0; y <= 4; y++) for (let x = 1; x <= 7; x++) heightMap[y][x] = 1;

  const waterCells = new Set([
    ...Array.from({length: 10}, (_, index) => [10, index + 1]),
    [9, 3], [9, 4], [11, 6], [11, 7], [9, 9],
  ].map(([x, y]) => KEY(x, y)));
  const roadCells = new Set([
    ...Array.from({length: 6}, (_, index) => [index + 2, 2]),
    [7, 3], [7, 4], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [11, 6], [11, 7], [12, 7],
    [3, 5], [4, 5], [5, 5], [6, 5], [3, 6], [3, 7], [7, 6], [7, 7], [12, 6],
  ].map(([x, y]) => KEY(x, y)));
  const rampCells = new Set([KEY(7, 4), KEY(7, 5)]);

  const cells = heightMap.map((line, y) => line.map((elevation, x) => {
    const key = KEY(x, y);
    const material = waterCells.has(key) ? 'water' : rampCells.has(key) ? 'ramp' : roadCells.has(key) ? 'road' : 'grass';
    const surrounding = neighbors(x, y).map(([nx, ny]) => getCell(heightMap, nx, ny)).filter(value => value !== null);
    const slope = surrounding.length ? Math.max(...surrounding.map(value => Math.abs(value - elevation))) : 0;
    return {
      x, y, material, elevation,
      inclination: slope,
      navigable: material !== 'water' || key === KEY(10, 5),
      occupancy: null,
      connectivity: [],
      transition: null,
      slopeClass: slope === 0 ? 'level' : slope === 1 ? 'walkable-step' : 'cliff',
    };
  }));

  const bridges = [{
    id: 'creek-crossing-01', assetId: 'world-v8-bridge',
    position: {x: 10.5, y: 5.5, z: 0},
    size: {width: 2, height: 1},
    footprint: [[9.5, 5], [11.5, 5], [11.5, 6], [9.5, 6]],
    pivot: {x: .5, y: .72}, orientation: 'x-axis',
    sockets: [{id: 'west-road', type: 'road', position: [9.5, 5.5]}, {id: 'east-road', type: 'road', position: [11.5, 5.5]}],
    clearance: {width: 2.1, height: 1.2},
    links: [[9, 5], [10, 5], [11, 5]],
    collisionPolygon: [[9.5, 5], [11.5, 5], [11.5, 6], [9.5, 6]],
  }];

  for (const row of cells) for (const cell of row) {
    cell.connectivity = neighbors(cell.x, cell.y).flatMap(([x, y]) => {
      const next = getCell(cells, x, y);
      if (!next || !cell.navigable || !next.navigable || Math.abs(cell.elevation - next.elevation) > TERRAIN_WORLD_V8.maxWalkStep) return [];
      if ((cell.material === 'water' || next.material === 'water') && !isBridgeLinked(cell, next, bridges)) return [];
      return [{x, y, routeKind: rampCells.has(KEY(cell.x, cell.y)) || rampCells.has(KEY(x, y)) ? 'ramp' : 'ground'}];
    });
    const seams = neighbors(cell.x, cell.y).map(([x, y]) => getCell(cells, x, y)).filter(Boolean);
    const materialChange = seams.find(next => next.material !== cell.material);
    if (materialChange) cell.transition = {from: cell.material, to: materialChange.material, neighbor: [materialChange.x, materialChange.y], kind: 'tile-mask'};
  }

  const cliffSegments = [];
  for (const row of cells) for (const cell of row) {
    for (const [direction, nx, ny] of [['east', cell.x + 1, cell.y], ['south', cell.x, cell.y + 1]]) {
      const neighbor = getCell(cells, nx, ny), isBoundary = !neighbor;
      const bottom = neighbor?.elevation ?? -1;
      if (cell.elevation > bottom) cliffSegments.push({
        id: `cliff-${cell.x}-${cell.y}-${direction}`, from: [cell.x, cell.y], to: neighbor ? [nx, ny] : null,
        direction, topElevation: cell.elevation, bottomElevation: bottom, levels: cell.elevation - bottom,
        material: 'layered-earth', assetId: `world-v8-cliff-${direction}-${(cell.x + cell.y) % 4}`,
      });
    }
  }

  const terrainObjects = [
    {id: 'bridge-creek-01', assetId: 'world-v8-bridge', x: 10.5, y: 5.5, z: 0, width: 2, height: 1, anchor: [.5, .72], orientation: 'x-axis', depth: 6.2},
    {id: 'tree-low-west', assetId: 'world-v8-tree', x: 1.5, y: 7.5, z: 0, width: 1, height: 1, anchor: [.5, .92], depth: 8.42},
    {id: 'tree-high-north', assetId: 'world-v8-tree', x: 5.5, y: 1.5, z: 2, width: 1, height: 1, anchor: [.5, .92], depth: 3.1},
    {id: 'tree-river-east', assetId: 'world-v8-tree', x: 13.5, y: 7.5, z: 0, width: 1, height: 1, anchor: [.5, .92], depth: 10.4},
  ];
  const rampRoute = shortestRoute(cells, bridges, {x: 4, y: 2}, {x: 12, y: 5});
  const waterRoute = shortestRoute(cells, bridges, {x: 9, y: 5}, {x: 11, y: 5});
  const model = {
    schemaVersion: 1,
    id: 'riose-terrain-v8-first-proof',
    projection: 'isometric-2-to-1',
    dimensions: {columns, rows, metersPerCell: TERRAIN_WORLD_V8.metersPerCell, elevationUnit: 'level', elevationPxPerLevel: TERRAIN_WORLD_V8.elevationPxPerLevel},
    heightMap,
    cells,
    routes: {road: [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [7, 3], [7, 4], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5]],
      navigable: rampRoute, bridgeCrossing: waterRoute, maxWalkStep: TERRAIN_WORLD_V8.maxWalkStep},
    bridges, cliffSegments, objects: terrainObjects,
    transitionRules: ['grass-to-road', 'grass-to-water', 'road-to-bridge', 'high-pasture-to-ramp', 'ramp-to-lowland'],
    artReview: 'pending-human-review',
  };
  return model;
}

const WATER_NEIGHBOR_DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function waterTileAssetId(cells, x, y) {
  let connectedEdges = 0;
  for (let index = 0; index < WATER_NEIGHBOR_DIRECTIONS.length; index++) {
    const [dx, dy] = WATER_NEIGHBOR_DIRECTIONS[index];
    if (cells[y + dy]?.[x + dx]?.material === 'water') connectedEdges |= 1 << index;
  }
  return connectedEdges === 15 ? 'world-v8-water-0' : `world-v8-water-edge-${connectedEdges}`;
}

export function validateTerrainWorldV8(model) {
  const errors = [];
  const {columns, rows} = model.dimensions;
  if (model.projection !== 'isometric-2-to-1') errors.push('projection');
  if (model.heightMap.length !== rows || model.heightMap.some(line => line.length !== columns)) errors.push('heightmap-dimensions');
  if (model.cells.length !== rows || model.cells.some(line => line.length !== columns)) errors.push('cell-dimensions');
  for (const row of model.cells) for (const cell of row) {
    if (!['grass', 'road', 'ramp', 'water'].includes(cell.material)) errors.push(`material:${cell.x},${cell.y}`);
    if (cell.elevation !== model.heightMap[cell.y][cell.x]) errors.push(`height:${cell.x},${cell.y}`);
    if (cell.inclination > 1) errors.push(`grade:${cell.x},${cell.y}`);
    if (cell.material === 'water' && cell.navigable && !model.bridges.some(bridge => bridge.links.some(point => point[0] === cell.x && point[1] === cell.y))) errors.push(`water-navigation:${cell.x},${cell.y}`);
  }
  if (!model.routes.road.length || !model.routes.navigable.length) errors.push('road-route');
  if (JSON.stringify(model.routes.bridgeCrossing) !== JSON.stringify([[9, 5], [10, 5], [11, 5]])) errors.push('bridge-connectivity');
  if (!model.cliffSegments.length) errors.push('cliff-geometry');
  return {valid: errors.length === 0, errors};
}
