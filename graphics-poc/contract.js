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

export function placementFits(prefab, position, columns, rows, others = []) {
  const width = prefab.footprint.columns, height = prefab.footprint.rows;
  if (position.x < 0 || position.y < 0 || position.x + width > columns || position.y + height > rows) return false;
  if (prefab.blocking === false) return true;
  return !others.some(other => {
    if (other.prefabId === prefab.prefabId || other.blocking === false) return false;
    const a = {x: position.x, y: position.y, w: width, h: height};
    const b = {x: other.position.x, y: other.position.y, w: other.footprint.columns, h: other.footprint.rows};
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  });
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
