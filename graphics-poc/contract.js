export function projectIso(column, row, cellWidth = 64, cellHeight = 32, origin = {x: 0, y: 0}) {
  return {x: origin.x + (column - row) * cellWidth / 2, y: origin.y + (column + row) * cellHeight / 2};
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

export function visualUpdateInterval(distance, nearDistance = 100, mediumDistance = 220) {
  if (!Number.isFinite(distance) || distance < 0) return 120;
  if (distance <= nearDistance) return 1000 / 60;
  const progress = Math.max(0, Math.min(1, (distance - nearDistance) / (mediumDistance - nearDistance)));
  return 33 + 87 * progress ** 2;
}

export function toolAvailableInSystem(toolSystem, domain) {
  return toolSystem === domain || toolSystem === 'both';
}

export function clusterFarAnimals(entries, cellWidth = 48, cellHeight = 36) {
  const individual = [], groups = new Map();
  for (const entry of entries) {
    if (entry.lod !== 'far') { individual.push(entry); continue; }
    const column = Math.floor(entry.screenX / cellWidth), row = Math.floor(entry.screenY / cellHeight), key = `${column}:${row}`;
    let group = groups.get(key);
    if (!group) { group = {id: `herd:${key}`, kind: 'herd-cluster', assetId: 'nelore-adult-low', lod: 'far', count: 0, animalIds: [], x: 0, y: 0, screenX: 0, screenY: 0, depth: 0}; groups.set(key, group); }
    group.count++; group.animalIds.push(entry.animalId); group.x += entry.x; group.y += entry.y; group.screenX += entry.screenX; group.screenY += entry.screenY; group.depth += entry.depth;
  }
  for (const group of groups.values()) {
    group.x /= group.count; group.y /= group.count; group.screenX /= group.count; group.screenY /= group.count; group.depth /= group.count;
  }
  return {individual, clusters: [...groups.values()]};
}

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
  const footprint = orientedFootprint(prefab), width = footprint.columns, height = footprint.rows;
  if (position.x < 0 || position.y < 0 || position.x + width > columns || position.y + height > rows) return {valid: false, reason: 'out-of-bounds'};
  const overlaps = prefab.blocking !== false && others.some(other => {
    if (other.prefabId === prefab.prefabId || other.blocking === false) return false;
    const a = {x: position.x, y: position.y, w: width, h: height};
    const otherFootprint = orientedFootprint(other);
    const b = {x: other.position.x, y: other.position.y, w: otherFootprint.columns, h: otherFootprint.rows};
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  });
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
  const minimumDistance = Math.max(1.25, spacing * 0.72);
  const candidates = [];
  for (let attempt = 0; attempt < target * 80; attempt++) {
    const x = Math.round((minX + random() * (maxX - minX)) * 4) / 4;
    const y = Math.round((minY + random() * (maxY - minY)) * 4) / 4;
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

export function sortTerrainCellsBackToFront(cells, cellWidth = 96, cellHeight = 48) {
  return [...cells].sort((a, b) => (a.column + a.row - b.column - b.row) * cellHeight
    || (a.column - a.row - b.column + b.row) * cellWidth);
}
