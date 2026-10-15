export function projectIso(column, row, cellWidth = 64, cellHeight = 32, origin = {x: 0, y: 0}) {
  return {x: origin.x + (column - row) * cellWidth / 2, y: origin.y + (column + row) * cellHeight / 2};
}

export function zoneGridCorners(zone) {
  const {x, y} = zone.origin, {columns, rows} = zone.footprint;
  return [
    {column: x, row: y},
    {column: x + columns, row: y},
    {column: x + columns, row: y + rows},
    {column: x, row: y + rows},
  ];
}

export function unprojectIso(x, y, cellWidth = 64, cellHeight = 32, origin = {x: 0, y: 0}) {
  const horizontal = (x - origin.x) / (cellWidth / 2), vertical = (y - origin.y) / (cellHeight / 2);
  return {column: (horizontal + vertical) / 2, row: (vertical - horizontal) / 2};
}

export function farmPositionToGrid(x, y, columns = 14, rows = 10) {
  return {column: Math.max(0, Math.min(columns - 1, x / 576 * columns)), row: Math.max(0, Math.min(rows - 1, y / 336 * rows))};
}

export function simulationPositionToScene(x, y, scene, housing = 'pasture') {
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const zones = scene.zones ?? [];
  const pastureZones = zones.filter(zone => zone.kind === 'pasture').sort((a, b) => a.origin.y - b.origin.y);
  const serviceZone = zones.find(zone => zone.kind === 'service' || zone.kind === 'farmstead');
  const cell = (zone, horizontal, vertical) => ({
    column: zone.origin.x + clamp01(horizontal) * Math.max(0, zone.footprint.columns - 1),
    row: zone.origin.y + clamp01(vertical) * Math.max(0, zone.footprint.rows - 1),
  });
  if (housing === 'barn' && serviceZone) return cell(serviceZone, (x - 392) / 132, (y - 186) / 98);
  const north = y < 160;
  const pasture = pastureZones[north ? 0 : 1] ?? pastureZones[0];
  if (pasture) return cell(pasture, (x - 35) / 300, (y - (north ? 45 : 180)) / 100);
  return {column: clamp01(x / 576) * Math.max(0, scene.projection.columns - 1), row: clamp01(y / 336) * Math.max(0, scene.projection.rows - 1)};
}

export function intersectsViewport(bounds, width, height) {
  return bounds.left < width && bounds.right > 0 && bounds.top < height && bounds.bottom > 0;
}

export function visualLod(distance, nearDistance = 100, mediumDistance = 220) {
  return distance <= nearDistance ? 'near' : distance <= mediumDistance ? 'medium' : 'far';
}

export function distanceToViewportCenter(screenX, screenY, width, height) {
  return Math.hypot(screenX - width / 2, screenY - height / 2);
}

export function visualUpdateInterval(distance, nearDistance = 100, mediumDistance = 220) {
  if (!Number.isFinite(distance) || distance < 0) return 120;
  if (distance <= nearDistance) return 1000 / 60;
  const progress = Math.max(0, Math.min(1, (distance - nearDistance) / (mediumDistance - nearDistance)));
  return 33 + 87 * progress ** 2;
}

export function toolAvailableInSystem(toolSystem, domain) {
  return toolSystem === domain || toolSystem === 'both';
}

export {clusterFarAnimals} from './herd-visual-model.js';

export function placementFits(prefab, position, columns, rows, others = []) {
  return placementValidation(prefab, position, columns, rows, others).valid;
}

export function rotatePrefab(prefab) {
  return Number.isFinite(prefab.rotationDegrees)
    ? {...prefab, rotationDegrees: ((prefab.rotationDegrees + 90) % 360 + 360) % 360}
    : {...prefab, rotationSteps: ((prefab.rotationSteps ?? 0) + 1) % 4};
}

function orientedFootprint(prefab) {
  const degreeTurns = prefab.rotationDegrees / 90;
  const quarterTurns = Number.isInteger(degreeTurns)
    ? degreeTurns
    : Number.isFinite(prefab.rotationDegrees) ? 0 : prefab.rotationSteps ?? 0;
  return Math.abs(quarterTurns) % 2
    ? {columns: prefab.footprint.rows, rows: prefab.footprint.columns}
    : prefab.footprint;
}

export function placementValidation(prefab, position, columns, rows, others = [], zones = []) {
  if (!prefab?.footprint || ![prefab.footprint.columns, prefab.footprint.rows].every(value => Number.isFinite(value) && value > 0)) {
    return {valid: false, reason: 'geometry-missing'};
  }
  const dimensions = orientedFootprint(prefab), width = dimensions.columns, height = dimensions.rows;
  const polygonFor = (item, at = item.position) => {
    const source = item.spatialGeometry?.collisionPolygon;
    const turns = Number.isFinite(item.rotationDegrees) ? item.rotationDegrees : (item.rotationSteps ?? 0) * 90;
    const radians = turns * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    if (Array.isArray(source) && source.length >= 3) return source.map(point => ({x: at.x + point.x * cos - point.y * sin, y: at.y + point.x * sin + point.y * cos}));
    const size = orientedFootprint(item);
    return [{x: at.x, y: at.y}, {x: at.x + size.columns, y: at.y}, {x: at.x + size.columns, y: at.y + size.rows}, {x: at.x, y: at.y + size.rows}];
  };
  const boundsOf = polygon => ({minX: Math.min(...polygon.map(point => point.x)), maxX: Math.max(...polygon.map(point => point.x)), minY: Math.min(...polygon.map(point => point.y)), maxY: Math.max(...polygon.map(point => point.y))});
  const collision = (first, second) => {
    const a = polygonFor(first), b = polygonFor(second);
    for (const polygon of [a, b]) for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index], end = polygon[(index + 1) % polygon.length];
      const axis = {x: -(end.y - start.y), y: end.x - start.x};
      const project = points => points.map(point => point.x * axis.x + point.y * axis.y);
      const pa = project(a), pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
    return true;
  };
  const polygon = polygonFor(prefab, position), bounds = boundsOf(polygon);
  if (bounds.minX < 0 || bounds.minY < 0 || bounds.maxX > columns || bounds.maxY > rows) return {valid: false, reason: 'out-of-bounds'};
  const overlaps = prefab.blocking !== false && others.some(other => other.prefabId !== prefab.prefabId && other.blocking !== false && collision({...prefab, position}, other));
  if (overlaps) return {valid: false, reason: 'collision'};
  const rules = prefab.placementRules ?? {};
  if (rules.allowedZoneKinds?.length) {
    const zone = zones.find(item => position.x >= item.origin.x && position.y >= item.origin.y && position.x + width <= item.origin.x + item.footprint.columns && position.y + height <= item.origin.y + item.footprint.rows);
    if (!zone || !rules.allowedZoneKinds.includes(zone.kind)) return {valid: false, reason: 'zone'};
  }
  if (rules.alignment) {
    const actual = rules.alignment.axis === 'row' ? position.y : position.x;
    if (actual !== rules.alignment.value) return {valid: false, reason: 'alignment'};
  }
  if (rules.adjacentTo?.length) {
    const adjacent = others.some(other => {
      if (!rules.adjacentTo.includes(other.assetId)) return false;
      const otherFootprint = orientedFootprint(other);
      const a = {x: position.x, y: position.y, w: width, h: height}, b = {x: other.position.x, y: other.position.y, w: otherFootprint.columns, h: otherFootprint.rows};
      const verticalTouch = (a.x + a.w === b.x || b.x + b.w === a.x) && a.y < b.y + b.h && a.y + a.h > b.y;
      const horizontalTouch = (a.y + a.h === b.y || b.y + b.h === a.y) && a.x < b.x + b.w && a.x + a.w > b.x;
      return verticalTouch || horizontalTouch;
    });
    if (!adjacent) return {valid: false, reason: 'adjacency'};
  }
  return {valid: true, reason: null};
}

export function composePrefabs(recipe, origin, columns, rows, others = []) {
  const occupants = [...others], prefabs = [];
  for (const part of recipe) {
    const prefab = {...part, prefabId: `${part.assetId}-${origin.x}-${origin.y}`, position: {x: origin.x + part.offset.x, y: origin.y + part.offset.y, unit: 'grid-cell'}};
    delete prefab.offset;
    const result = placementValidation(prefab, prefab.position, columns, rows, occupants);
    if (!result.valid) return {valid: false, reason: result.reason, prefabs: []};
    prefabs.push(prefab); occupants.push(prefab);
  }
  return {valid: true, reason: null, prefabs};
}

export function distributePrefab(prefabTemplate, zone, columns, rows, others = [], spacing = 3, seed = 20261012) {
  const placed = [], occupants = [...others], footprint = prefabTemplate.footprint;
  const minX = zone.origin.x + 0.75, minY = zone.origin.y + 0.75;
  const maxX = zone.origin.x + zone.footprint.columns - footprint.columns - 0.25;
  const maxY = zone.origin.y + zone.footprint.rows - footprint.rows - 0.25;
  if (maxX < minX || maxY < minY) return placed;

  let state = 2166136261;
  for (const character of `${seed}:${zone.zoneId}:${prefabTemplate.assetId}`) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const area = Math.max(1, (maxX - minX + footprint.columns) * (maxY - minY + footprint.rows));
  const target = Math.max(1, Math.floor(area / (spacing * spacing)));
  const minimumDistance = Math.max(1.25, spacing * 0.48);
  const clusterCount = Math.max(2, Math.ceil(target / 4));
  const clusters = Array.from({length: clusterCount}, () => ({x: minX + random() * (maxX - minX), y: minY + random() * (maxY - minY)}));
  const candidates = [];
  for (let attempt = 0; attempt < target * 120; attempt++) {
    let candidateX = minX + random() * (maxX - minX), candidateY = minY + random() * (maxY - minY);
    if (random() < 0.72) {
      const center = clusters[Math.floor(random() * clusters.length)], angle = random() * Math.PI * 2, radius = spacing * (0.2 + random() * 0.85);
      candidateX = center.x + Math.cos(angle) * radius; candidateY = center.y + Math.sin(angle) * radius;
    }
    const x = Math.round((Math.max(minX, Math.min(maxX, candidateX))) * 4) / 4;
    const y = Math.round((Math.max(minY, Math.min(maxY, candidateY))) * 4) / 4;
    if (candidates.some(point => Math.hypot(point.x - x, point.y - y) < minimumDistance)) continue;
    const prefabId = `${prefabTemplate.assetId}-auto-${zone.zoneId}-${seed}-${attempt}`;
    if (occupants.some(item => item.prefabId === prefabId)) continue;
    const prefab = {...prefabTemplate, prefabId, position: {x, y, unit: 'grid-cell'}};
    if (!placementFits(prefab, prefab.position, columns, rows, occupants)) continue;
    candidates.push({x, y}); placed.push(prefab); occupants.push(prefab);
    if (placed.length >= target) break;
  }
  return placed;
}

export function terrainCells(scene) {
  const {columns, rows} = scene.projection, cells = [];
  if (Array.isArray(scene.terrainTiles) && scene.terrainTiles.length) {
    return scene.terrainTiles.map(tile => ({
      column: tile.position.x,
      row: tile.position.y,
      assetId: tile.assetId,
      zoneId: tile.zoneId ?? null,
      transitionZoneId: null,
      elevation: tile.elevation ?? 0,
      material: tile.material ?? null,
      slope: tile.slope ?? 0,
      navigable: tile.navigable ?? true,
      occupancy: tile.occupancy ?? null,
      connectivity: tile.connectivity ?? [],
      transition: tile.transition ?? null,
    }));
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const zone = scene.zones.find(item => column >= item.origin.x && row >= item.origin.y && column < item.origin.x + item.footprint.columns && row < item.origin.y + item.footprint.rows);
    let assetId = zone?.groundAssetId ?? 'grass-light';
    if (zone) {
      const horizontalEdge = zone.footprint.columns > 2 && (column === zone.origin.x || column === zone.origin.x + zone.footprint.columns - 1);
      const verticalEdge = zone.footprint.rows > 2 && (row === zone.origin.y || row === zone.origin.y + zone.footprint.rows - 1);
      const edges = horizontalEdge || verticalEdge;
      if (edges && zone.transitionAssetIds?.edge) assetId = zone.transitionAssetIds.edge;
    } else {
      const transition = scene.zones.find(item => item.transitionAssetIds?.edge
        && column >= item.origin.x - 1 && row >= item.origin.y - 1
        && column <= item.origin.x + item.footprint.columns && row <= item.origin.y + item.footprint.rows);
      if (transition) assetId = transition.transitionAssetIds.edge;
    }
    cells.push({column, row, assetId, zoneId: zone?.zoneId ?? null, transitionZoneId: !zone && assetId !== 'grass-light' ? scene.zones.find(item => item.transitionAssetIds?.edge === assetId && column >= item.origin.x - 1 && row >= item.origin.y - 1 && column <= item.origin.x + item.footprint.columns && row <= item.origin.y + item.footprint.rows)?.zoneId ?? null : null});
  }
  return cells;
}

export function paintZoneTerrainTiles(tiles, zone, columns, rows) {
  if (!Array.isArray(tiles)) return tiles;
  const {x, y} = zone.origin, {columns: width, rows: height} = zone.footprint;
  const edgeAssetId = zone.transitionAssetIds?.edge;
  return tiles.map(tile => {
    const column = tile.position.x, row = tile.position.y;
    const inside = column >= x && row >= y && column < x + width && row < y + height;
    const boundary = inside && (column === x || row === y || column === x + width - 1 || row === y + height - 1);
    const adjacent = !inside && edgeAssetId && column >= x - 1 && row >= y - 1
      && column <= x + width && row <= y + height && column >= 0 && row >= 0 && column < columns && row < rows;
    if (inside) return {...tile, assetId: boundary && edgeAssetId ? edgeAssetId : zone.groundAssetId, zoneId: zone.zoneId};
    if (adjacent) return {...tile, assetId: edgeAssetId};
    return tile;
  });
}

export function sortTerrainCellsBackToFront(cells, cellWidth = 96, cellHeight = 48) {
  return [...cells].sort((a, b) => (a.column + a.row - b.column - b.row) * cellHeight
    || (a.column - a.row - b.column + b.row) * cellWidth);
}
