const CARDINALS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x, y) => `${x},${y}`;

function random32(seed) {
  let value = seed >>> 0;
  return () => {
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rectContains(rect, x, y) {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

function zoneContains(zone, x, y) {
  return x >= zone.origin.x && y >= zone.origin.y && x < zone.origin.x + zone.footprint.columns && y < zone.origin.y + zone.footprint.rows;
}

function isoDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function addPrefab(prefabs, prefabId, assetId, x, y, footprint, extra = {}) {
  const prefab = {
    prefabId, assetId, layer: extra.layer ?? 'infrastructure',
    position: {x: x - footprint.columns / 2, y: y - footprint.rows / 2, unit: 'grid-cell'},
    footprint, visualScale: extra.visualScale ?? 1, blocking: extra.blocking ?? true,
    spatialGeometry: {contactAnchor: extra.anchor ?? {x: .5, y: .92}, collisionPolygon: [[0, 0], [footprint.columns, 0], [footprint.columns, footprint.rows], [0, footprint.rows]]},
    sockets: extra.sockets ?? [], ...extra,
  };
  delete prefab.anchor;
  prefabs.push(prefab);
  return prefab;
}

function addFenceRing(prefabs, id, rect, gapCell, type, accessSockets = []) {
  const ring = [];
  const append = (x, y, edge, part) => {
    const isGate = edge === 'south' && Math.abs(x - gapCell) < .51;
    const vertical = edge === 'east' || edge === 'west';
    const prefabId = `${id}-${edge}-${part}`;
    const prefab = addPrefab(prefabs, prefabId,
      isGate ? 'fence-gate-wood-imagegen-v1' : vertical ? 'world-v8-farm-fence-wood-segment-y' : 'world-v8-farm-fence-wood-segment-x',
      x, y, vertical ? {columns: .54, rows: 1} : {columns: 1, rows: .54},
      // Each source fence tile spans one 2:1 world edge; its transparent pixel
      // padding means the first contact-sheet scale (.18) left visible gaps.
      {visualScale: isGate ? 1 : .245, blocking: true, modularType: isGate ? 'fence-gate' : 'fence-segment',
        flipX: edge === 'west' || edge === 'south',
        sockets: isGate
          ? [{id: `${prefabId}-left`, type: 'fence'}, {id: `${prefabId}-right`, type: 'fence'}, {id: `${prefabId}-road`, type: 'road', position: [0, .8]}]
          : [{id: `${prefabId}-start`, type: 'fence'}, {id: `${prefabId}-end`, type: 'fence'}]});
    ring.push({prefab, isGate, edge, x, y});
  };
  let part = 0;
  for (let x = rect.x + .5; x < rect.x + rect.width; x += 1) append(x, rect.y, 'north', part++);
  part = 0;
  for (let y = rect.y + .5; y < rect.y + rect.height; y += 1) append(rect.x + rect.width, y, 'east', part++);
  part = 0;
  for (let x = rect.x + rect.width - .5; x > rect.x; x -= 1) append(x, rect.y + rect.height, 'south', part++);
  part = 0;
  for (let y = rect.y + rect.height - .5; y > rect.y; y -= 1) append(rect.x, y, 'west', part++);
  for (let index = 0; index < ring.length; index++) {
    const item = ring[index], previous = ring[(index + ring.length - 1) % ring.length].prefab.prefabId;
    const next = ring[(index + 1) % ring.length].prefab.prefabId;
    item.prefab.socketConnections = item.isGate ? {left: previous, right: next} : {start: previous, end: next};
    if (item.isGate) item.prefab.roadConnectionCell = [Math.round(item.x), Math.ceil(item.y + .5)];
  }
  return ring;
}

function pathBetween(cells, start, end) {
  const rows = cells.length, columns = cells[0].length;
  const open = [{x: start[0], y: start[1], g: 0, f: Math.abs(end[0] - start[0]) + Math.abs(end[1] - start[1])}];
  const previous = new Map(), cost = new Map([[key(...start), 0]]);
  while (open.length) {
    open.sort((a, b) => a.f - b.f || a.g - b.g);
    const current = open.shift();
    if (current.x === end[0] && current.y === end[1]) {
      const result = [[current.x, current.y]];
      let cursor = key(current.x, current.y);
      while (previous.has(cursor)) { const step = previous.get(cursor); result.push(step.point); cursor = step.from; }
      return result.reverse();
    }
    for (const [dx, dy] of CARDINALS) {
      const x = current.x + dx, y = current.y + dy, next = cells[y]?.[x];
      if (!next?.navigable || Math.abs(next.elevation - cells[current.y][current.x].elevation) > 1) continue;
      const stepCost = 1 + Math.abs(next.elevation - cells[current.y][current.x].elevation) * 1.5;
      const candidate = current.g + stepCost, id = key(x, y);
      if (candidate >= (cost.get(id) ?? Infinity)) continue;
      cost.set(id, candidate); previous.set(id, {from: key(current.x, current.y), point: [x, y]});
      open.push({x, y, g: candidate, f: candidate + Math.abs(end[0] - x) + Math.abs(end[1] - y)});
    }
  }
  throw new Error(`Não foi encontrada rota navegável entre ${start} e ${end}.`);
}

function linkRoute(cells, route, routeKind = 'road') {
  for (let index = 0; index < route.length; index++) {
    const [x, y] = route[index], cell = cells[y][x];
    if (cell.material !== 'ramp') cell.material = 'road';
    if (index) {
      const [px, py] = route[index - 1];
      cell.connectivity.push({x: px, y: py, routeKind});
      cells[py][px].connectivity.push({x, y, routeKind});
    }
  }
}

function makeCattle(prefabs, rect, count, seed, excluded = [], idStart = 1) {
  const random = random32(seed), points = [];
  const minX = rect.x + 1.05, maxX = rect.x + rect.width - 1.05;
  const minY = rect.y + 1.05, maxY = rect.y + rect.height - 1.05;
  const candidates = [];
  for (let y = minY; y <= maxY; y += .82) for (let x = minX; x <= maxX; x += .9) {
    if (excluded.some(obstacle => Math.hypot(obstacle.x - x, obstacle.y - y) < (obstacle.radius ?? .8))) continue;
    candidates.push({x, y});
  }
  // Farthest-point assembly spreads the herd while maintaining sprite clearance.
  while (points.length < count) {
    let best = null, bestDistance = -Infinity;
    for (const candidate of candidates) {
      if (points.includes(candidate)) continue;
      const clearance = points.length ? Math.min(...points.map(other => isoDistance(candidate, other))) : random();
      if (clearance < .82) continue;
      const score = clearance + random() * .015;
      if (score > bestDistance) { best = candidate; bestDistance = score; }
    }
    if (!best) break;
    points.push(best);
  }
  if (points.length !== count) throw new Error(`A região rural acomoda ${points.length} bovinos seguros; ${count} foram solicitados.`);
  points.forEach((point, index) => {
    const r = .11, phase = random() * 10000;
    const visualRoute = [[point.x - r, point.y], [point.x, point.y - r], [point.x + r, point.y], [point.x, point.y + r]];
    const cow = addPrefab(prefabs, `cow-${String(index + idStart).padStart(2, '0')}`, 'world-v8-animal-idle', point.x, point.y,
      {columns: .6, rows: .45}, {layer: 'livestock', blocking: false, visualScale: 1, animationClip: 'walk', animationPhaseMs: phase, visualRoute,
        movement: {mode: 'patrol', navigation: 'terrain-grid', collisionRadius: .25, speedWorldUnitsPerSecond: .16}});
    cow.spatialGeometry.collisionPolygon = [[.08, .06], [.52, .06], [.52, .39], [.08, .39]];
  });
  return points;
}

function updateCellGraph(cells) {
  for (const row of cells) for (const cell of row) {
    cell.connectivity = [];
    for (const [dx, dy] of CARDINALS) {
      const neighbor = cells[cell.y + dy]?.[cell.x + dx];
      if (neighbor?.navigable && Math.abs(neighbor.elevation - cell.elevation) <= 1) cell.connectivity.push({x: neighbor.x, y: neighbor.y, routeKind: neighbor.material === 'road' || neighbor.material === 'ramp' ? 'road' : 'ground'});
    }
  }
}

function buildCliffs(cells) {
  const rows = cells.length, columns = cells[0].length, cliffs = [];
  for (const row of cells) for (const cell of row) {
    for (const [dx, dy, direction, suffix] of [[1, 0, 'east', 'east'], [0, 1, 'south', 'south']]) {
      const next = cells[cell.y + dy]?.[cell.x + dx];
      const bottom = next ? next.elevation : -1;
      if (cell.elevation <= bottom) continue;
      cliffs.push({id: `edge-${cell.x}-${cell.y}-${direction}`, from: [cell.x, cell.y], to: next ? [next.x, next.y] : null,
        direction, topElevation: cell.elevation, bottomElevation: bottom, levels: cell.elevation - bottom,
        material: 'layered-earth', assetId: `world-v8-cliff-${suffix}-${(cell.x + cell.y) % 4}`});
    }
  }
  return cliffs;
}

function positionBuilding(prefabs, id, assetId, x, y, footprint, extra = {}) {
  const prefab = addPrefab(prefabs, id, assetId, x, y, footprint, {visualScale: extra.visualScale, blocking: true,
    sockets: [{id: `${id}-entry`, type: 'road', position: [0, footprint.rows / 2]}], ...extra});
  return prefab;
}

/** Compile a relational rural layout into the runtime scene schema consumed by the existing Pixi renderer. */
export function generateRuralWorld(source, spec) {
  if (!source?.terrainV8 || !spec?.id || !Number.isSafeInteger(spec.seed) || spec.seed < 0) throw new TypeError('World generation needs a V8 source scene, stable id, and unsigned seed.');
  const {columns, rows} = spec.dimensions, cellW = source.projection.cellWidth, cellH = source.projection.cellHeight;
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 12 || rows < 10) throw new RangeError('Rural worlds need at least 12×10 terrain cells.');
  const scene = structuredClone(source);
  scene.sceneId = spec.id; scene.name = spec.name; scene.projection.columns = columns; scene.projection.rows = rows;
  scene.simulation = {...scene.simulation, seed: spec.seed, scenarioId: spec.id, populationCount: 0, productionSystem: 'visual-only'};
  scene.visualVariant = {id: spec.id, label: spec.name, status: 'presentation-only'};
  const heightMap = Array.from({length: rows}, () => Array(columns).fill(0));
  const upperMarginX = Math.max(2, Math.round(columns * .0833)), upperMarginY = Math.max(2, Math.round(rows * .1111));
  const upper = spec.levels === 2 ? {x: upperMarginX, y: upperMarginY, width: columns - upperMarginX * 2,
    height: Math.floor(rows * .39)} : null;
  if (upper) for (let y = upper.y; y < upper.y + upper.height; y++) for (let x = upper.x; x < upper.x + upper.width; x++) heightMap[y][x] = 1;
  const cells = heightMap.map((line, y) => line.map((elevation, x) => ({x, y, material: 'grass', elevation, inclination: 0, navigable: true,
    occupancy: null, connectivity: [], transition: null, slopeClass: 'level'})));
  const prefabs = [], zones = [], roadRoutes = [];
  const pasture = spec.levels === 1
    ? {x: Math.floor((columns - spec.pasture.width) / 2), y: Math.floor((rows - spec.pasture.height) / 2), width: spec.pasture.width, height: spec.pasture.height}
    : {x: 2, y: Math.floor(rows * .61), width: columns - 4, height: rows - Math.floor(rows * .61) - 1};
  const gateX = pasture.x + Math.floor(pasture.width / 2) - .5;
  const pastureRing = addFenceRing(prefabs, 'pasture-fence', pasture, gateX, 'pasture');
  const pastureGate = pastureRing.find(item => item.isGate);
  zones.push({zoneId: 'pasture', name: 'Piquete', kind: 'pasture', origin: {x: pasture.x, y: pasture.y}, footprint: {columns: pasture.width, rows: pasture.height}, color: '#8ba06b'});

  let corral = null, barn = null;
  if (upper && spec.relationships?.corral?.adjacentTo === 'barn') {
    const w = Math.max(6, Math.floor(upper.width * .36)), h = Math.max(4, Math.floor(upper.height * .72));
    corral = {x: upper.x + 1, y: upper.y + .5, width: w, height: h};
    const corralGateX = corral.x + Math.floor(corral.width / 2) - .5;
    addFenceRing(prefabs, 'corral-fence', corral, corralGateX, 'corral');
    zones.push({zoneId: 'corral', name: 'Curral', kind: 'service', origin: {x: corral.x, y: corral.y}, footprint: {columns: corral.width, rows: corral.height}, color: '#a78d63'});
    const bw = Math.max(2.4, upper.width * .18), bh = Math.max(1.6, upper.height * .4);
    barn = {x: upper.x + upper.width * .66, y: upper.y + upper.height * .33, width: bw, height: bh};
    barn.prefab = positionBuilding(prefabs, 'upper-barn', 'world-v8-farm-equipment-barn', barn.x + bw / 2, barn.y + bh / 2, {columns: bw, rows: bh}, {visualScale: 1.02, sockets: [{id: 'upper-barn-entry', type: 'road', position: [0, bh / 2]}]});
  }

  const gateAccess = [Math.round(gateX), Math.min(rows - 1, Math.floor(pasture.y + pasture.height + .65))];
  const start = [Math.round(columns / 2), rows - 1];
  const firstRoute = pathBetween(cells, start, gateAccess);
  roadRoutes.push(firstRoute);
  linkRoute(cells, firstRoute);
  pastureGate.prefab.roadConnectionCell = gateAccess;

  let lowerCount = spec.herd.count;
  if (upper && corral && barn) {
    lowerCount = Math.floor(spec.herd.count * .65);
    const rampX = Math.round(columns / 2), rampY = upper.y + upper.height;
    cells[rampY][rampX].material = 'ramp'; cells[rampY][rampX].slopeClass = 'ramp'; cells[rampY][rampX].inclination = 1;
    const gateToRamp = pathBetween(cells, gateAccess, [rampX, rampY]);
    const barnApproach = [Math.round(barn.x), Math.round(barn.y + barn.height / 2)];
    const toBarn = pathBetween(cells, [rampX, rampY], barnApproach);
    roadRoutes.push(gateToRamp, toBarn); linkRoute(cells, gateToRamp); linkRoute(cells, toBarn);
    barn.prefab.roadConnectionCell = barnApproach;
    const corralGate = prefabs.find(item => item.modularType === 'fence-gate' && item.prefabId.startsWith('corral-fence'));
    if (corralGate) corralGate.roadConnectionCell = [Math.round(corralGate.position.x), Math.floor(corralGate.position.y + corralGate.footprint.rows + .2)];
  }

  const troughX = pasture.x + pasture.width * .22, troughY = pasture.y + pasture.height * .52;
  addPrefab(prefabs, 'pasture-water-trough', 'water-trough-round-imagegen-v1', troughX, troughY, {columns: .85, rows: .72},
    {visualScale: .58, blocking: true, sockets: [{id: 'animal-access', type: 'animal-access', position: [0, .7]}]});
  const cattleExclusions = [{x: troughX, y: troughY, radius: 1.25}];
  const herd = makeCattle(prefabs, pasture, lowerCount, spec.seed, cattleExclusions);

  if (upper && corral && spec.herd.count > lowerCount) {
    const upperCount = spec.herd.count - lowerCount;
    makeCattle(prefabs, {x: corral.x + .3, y: corral.y + .3, width: corral.width - .6, height: corral.height - .6},
      upperCount, spec.seed ^ 0x9e3779b9, [], lowerCount + 1);
  }

  const sceneryCandidates = [];
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < columns - 1; x++) {
    const cell = cells[y][x];
    if (cell.material !== 'grass' || pastureRing.some(item => Math.hypot(item.x - (x + .5), item.y - (y + .5)) < 1.35)
      || prefabs.some(prefab => prefab.blocking && x + .5 >= prefab.position.x - .4 && x + .5 < prefab.position.x + prefab.footprint.columns + .4
        && y + .5 >= prefab.position.y - .4 && y + .5 < prefab.position.y + prefab.footprint.rows + .4)) continue;
    if (x < 3 || y < 2 || x >= columns - 3 || y >= rows - 3) sceneryCandidates.push({x: x + .5, y: y + .5});
  }
  const sceneryRandom = random32(spec.seed ^ 0xa511e9b3), treeCount = spec.scenery?.trees ?? 0, selectedTrees = [];
  for (let i = sceneryCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(sceneryRandom() * (i + 1)); [sceneryCandidates[i], sceneryCandidates[j]] = [sceneryCandidates[j], sceneryCandidates[i]];
  }
  for (const point of sceneryCandidates) {
    if (selectedTrees.some(other => isoDistance(point, other) < 2.15)) continue;
    selectedTrees.push(point);
    if (selectedTrees.length >= treeCount) break;
  }
  selectedTrees.forEach((point, index) => addPrefab(prefabs, `edge-tree-${index + 1}`, 'world-v8-tree', point.x, point.y,
    {columns: .6, rows: .5}, {visualScale: .42, blocking: false, layer: 'infrastructure'}));

  updateCellGraph(cells);
  const terrainTiles = cells.flat().map(cell => {
    const roadNeighbors = cell.connectivity.filter(link => ['road', 'ramp'].includes(cells[link.y][link.x].material));
    const joinsX = roadNeighbors.some(link => link.x !== cell.x), joinsY = roadNeighbors.some(link => link.y !== cell.y);
    const roadAsset = joinsX && joinsY ? 'world-v8-road-cross' : joinsY ? 'world-v8-road-row' : 'world-v8-road';
    return {position: {x: cell.x, y: cell.y}, assetId:
      cell.material === 'road' ? roadAsset : cell.material === 'ramp' ? 'world-v8-ramp' : 'world-v8-grass',
      zoneId: zones.find(zone => zoneContains(zone, cell.x + .5, cell.y + .5))?.zoneId ?? null,
      elevation: cell.elevation, material: cell.material, slope: cell.inclination, navigable: cell.navigable,
      occupancy: null, connectivity: cell.connectivity, transition: cell.transition};
  });
  const textureCandidateCells = terrainTiles.filter(tile => tile.material === 'grass' && tile.zoneId === 'pasture' &&
    !prefabs.some(prefab => prefab.blocking && tile.position.x + .5 >= prefab.position.x - .25 && tile.position.x + .5 < prefab.position.x + prefab.footprint.columns + .25
      && tile.position.y + .5 >= prefab.position.y - .25 && tile.position.y + .5 < prefab.position.y + prefab.footprint.rows + .25));
  const textureRandom = random32(spec.seed ^ 0x63d83595);
  for (let index = textureCandidateCells.length - 1; index > 0; index--) {
    const j = Math.floor(textureRandom() * (index + 1)); [textureCandidateCells[index], textureCandidateCells[j]] = [textureCandidateCells[j], textureCandidateCells[index]];
  }
  for (const tile of textureCandidateCells.slice(0, Math.floor(textureCandidateCells.length * .1))) tile.assetId = 'world-v8-grass-natural';
  scene.zones = zones; scene.prefabs = prefabs; scene.entities = []; scene.assetInstances = [];
  scene.terrainTiles = terrainTiles;
  scene.terrainV8 = {...scene.terrainV8, id: `${spec.id}-world`, dimensions: {columns, rows, metersPerCell: 5, elevationUnit: 'level', elevationPxPerLevel: 60},
    heightMap, cells, routes: {road: roadRoutes.flat(), ramp: roadRoutes.flatMap(route => route.filter(([x, y]) => cells[y][x].material === 'ramp'))}, bridges: [],
    cliffSegments: buildCliffs(cells), objects: [], artReview: 'review-generated-layout'};

  for (const prefab of prefabs) {
    const {x, y} = prefab.position, f = prefab.footprint;
    for (let cy = Math.floor(y); cy < Math.ceil(y + f.rows); cy++) for (let cx = Math.floor(x); cx < Math.ceil(x + f.columns); cx++) {
      const cell = cells[cy]?.[cx];
      if (!cell) continue;
      const occupied = Array.isArray(cell.occupancy) ? cell.occupancy : [];
      occupied.push({prefabId: prefab.prefabId, assetId: prefab.assetId, blocking: prefab.blocking}); cell.occupancy = occupied;
    }
  }
  for (const tile of terrainTiles) tile.occupancy = cells[tile.position.y][tile.position.x].occupancy;
  scene.generation = {compiler: 'rural-world-generator-v9', seed: spec.seed, relations: spec.relationships ?? {}, requestedHerdCount: spec.herd.count, compiledHerdCount: herd.length + (spec.herd.count - lowerCount)};
  return scene;
}

export const RURAL_WORLD_V9_SPECS = Object.freeze([
  {id: 'rural-small-v9', name: 'Piquete compacto · 10 bovinos', seed: 915431, dimensions: {columns: 12, rows: 10}, levels: 1,
    pasture: {width: 8, height: 7}, herd: {count: 10}, scenery: {trees: 4}, relationships: {gate: {on: 'south-boundary', connectsTo: 'access-road'}, trough: {inside: 'pasture', accessibleTo: 'animals'}}},
  {id: 'rural-property-v9', name: 'Propriedade em dois níveis · 20 bovinos', seed: 280174, dimensions: {columns: 24, rows: 18}, levels: 2,
    pasture: {width: 'lower-terrace'}, herd: {count: 20}, scenery: {trees: 9}, relationships: {barn: {on: 'upper-terrace', connectsTo: 'main-road'}, corral: {adjacentTo: 'barn', connectsTo: 'main-road'}, ramp: {connects: ['lower-terrace', 'upper-terrace']}}},
]);
