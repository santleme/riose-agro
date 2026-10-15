function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function overlapsWithClearance(x, y, width, height, prefab, clearance) {
  const left = prefab.position.x - clearance, top = prefab.position.y - clearance;
  const right = prefab.position.x + prefab.footprint.columns + clearance;
  const bottom = prefab.position.y + prefab.footprint.rows + clearance;
  return x < right && x + width > left && y < bottom && y + height > top;
}

export function composeFarmSceneV8(sourceScene, seed = 84018) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('Seed precisa ser um inteiro não negativo.');
  const scene = structuredClone(sourceScene), tree = scene.prefabs.find(item => item.prefabId === 'tree-low-west');
  if (!tree) throw new Error('Prefab decorativo tree-low-west ausente.');
  const fixedTrees = scene.prefabs.filter(item => item.assetId === tree.assetId && !['tree-low-west', 'tree-seeded-accent-v8'].includes(item.prefabId));
  const blockers = scene.prefabs.filter(item => item.blocking && item.prefabId !== tree.prefabId);
  const zones = scene.zones ?? [];
  const candidates = [];
  for (const row of scene.terrainV8.cells) for (const cell of row) {
    if (cell.material !== 'grass' || !cell.navigable) continue;
    const x = cell.x, y = cell.y;
    // Keep seeded accents inside the playable land rather than on its silhouette.
    if (x < 1 || y < 1 || x >= scene.terrainV8.dimensions.columns - 2 || y >= scene.terrainV8.dimensions.rows - 2) continue;
    if (zones.some(zone => x + .5 >= zone.origin.x && x + .5 < zone.origin.x + zone.footprint.columns
      && y + .5 >= zone.origin.y && y + .5 < zone.origin.y + zone.footprint.rows)) continue;
    if (blockers.some(prefab => overlapsWithClearance(x, y, 1, 1, prefab, .55))) continue;
    if (fixedTrees.some(prefab => Math.hypot(prefab.position.x - x, prefab.position.y - y) < 2.2)) continue;
    candidates.push({x, y});
  }
  if (!candidates.length) throw new Error('Nenhuma célula segura disponível para vegetação decorativa.');
  const random = mulberry32(seed), first = candidates[Math.floor(random() * candidates.length)];
  const separated = candidates.filter(point => Math.hypot(point.x - first.x, point.y - first.y) >= 2.5);
  const second = separated.length ? separated[Math.floor(random() * separated.length)] : null;
  tree.position = {...tree.position, x: first.x, y: first.y};
  const extraId = 'tree-seeded-accent-v8';
  scene.prefabs = scene.prefabs.filter(item => item.prefabId !== extraId);
  if (second) scene.prefabs.push({...structuredClone(tree), prefabId: extraId, position: {...tree.position, x: second.x, y: second.y}});
  scene.simulation.seed = seed;
  scene.simulation.scenarioId = `riose-farm-v8-${seed}`;
  scene.sceneId = `riose-farm-final-v8-seed-${seed}`;
  scene.name = `Fazenda Riose · três pastagens · seed ${seed}`;
  scene.visualVariant = {...scene.visualVariant, id: `farm-final-v8-seed-${seed}`, label: `Fazenda V8 · seed ${seed}`};
  for (const row of scene.terrainV8.cells) for (const cell of row) cell.occupancy = null;
  for (const prefab of scene.prefabs) {
    const minX = Math.floor(prefab.position.x), minY = Math.floor(prefab.position.y);
    const maxX = Math.ceil(prefab.position.x + prefab.footprint.columns), maxY = Math.ceil(prefab.position.y + prefab.footprint.rows);
    for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      const cell = scene.terrainV8.cells[y]?.[x];
      if (!cell) continue;
      const occupants = Array.isArray(cell.occupancy) ? cell.occupancy : cell.occupancy ? [cell.occupancy] : [];
      occupants.push({prefabId: prefab.prefabId, assetId: prefab.assetId, blocking: prefab.blocking});
      cell.occupancy = occupants;
    }
  }
  for (const tile of scene.terrainTiles) tile.occupancy = scene.terrainV8.cells[tile.position.y][tile.position.x].occupancy;
  return {scene, decorativeAnchors: scene.prefabs.filter(item => item.prefabId === tree.prefabId || item.prefabId === extraId).map(item => [item.position.x, item.position.y])};
}
