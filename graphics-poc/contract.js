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

export function intersectsViewport(bounds, width, height) {
  return bounds.left < width && bounds.right > 0 && bounds.top < height && bounds.bottom > 0;
}

export function visualLod(distance, nearDistance = 100, mediumDistance = 220) {
  return distance <= nearDistance ? 'near' : distance <= mediumDistance ? 'medium' : 'far';
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

export function placementValidation(prefab, position, columns, rows, others = [], zones = []) {
  const width = prefab.footprint.columns, height = prefab.footprint.rows;
  if (position.x < 0 || position.y < 0 || position.x + width > columns || position.y + height > rows) return {valid: false, reason: 'out-of-bounds'};
  const overlaps = prefab.blocking !== false && others.some(other => {
    if (other.prefabId === prefab.prefabId || other.blocking === false) return false;
    const a = {x: position.x, y: position.y, w: width, h: height};
    const b = {x: other.position.x, y: other.position.y, w: other.footprint.columns, h: other.footprint.rows};
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
      const a = {x: position.x, y: position.y, w: width, h: height}, b = {x: other.position.x, y: other.position.y, w: other.footprint.columns, h: other.footprint.rows};
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

export function distributePrefab(prefabTemplate, zone, columns, rows, others = [], spacing = 3) {
  const placed = [], occupants = [...others];
  for (let y = zone.origin.y + 1; y < zone.origin.y + zone.footprint.rows - 1; y += spacing) {
    for (let x = zone.origin.x + 1; x < zone.origin.x + zone.footprint.columns - 1; x += spacing) {
      const prefabId = `${prefabTemplate.assetId}-auto-${x}-${y}`;
      if (occupants.some(item => item.prefabId === prefabId)) continue;
      const prefab = {...prefabTemplate, prefabId, position: {x, y, unit: 'grid-cell'}};
      if (!placementFits(prefab, prefab.position, columns, rows, occupants)) continue;
      placed.push(prefab); occupants.push(prefab);
    }
  }
  return placed;
}

export function terrainCells(scene) {
  const {columns, rows} = scene.projection, cells = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const zone = scene.zones.find(item => column >= item.origin.x && row >= item.origin.y && column < item.origin.x + item.footprint.columns && row < item.origin.y + item.footprint.rows);
    let assetId = zone?.groundAssetId ?? 'grass-light';
    if (zone) {
      const edges = (column === zone.origin.x || column === zone.origin.x + zone.footprint.columns - 1 || row === zone.origin.y || row === zone.origin.y + zone.footprint.rows - 1);
      if (edges && zone.transitionAssetIds?.edge) assetId = zone.transitionAssetIds.edge;
    }
    cells.push({column, row, assetId, zoneId: zone?.zoneId ?? null});
  }
  return cells;
}
