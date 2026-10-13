/**
 * Renderer-only grouping for simulated animals. Group buckets use scene-space
 * positions, so camera pan, zoom and viewport dimensions cannot change the
 * member mapping. This module never writes to its input entries.
 */
export function clusterFarAnimals(entries, cellWidth = 48, cellHeight = 36) {
  if (!Array.isArray(entries)) throw new TypeError('Animal entries must be an array');
  if (!(cellWidth > 0) || !(cellHeight > 0)) throw new RangeError('Cluster cell dimensions must be positive');

  const individual = [], groups = new Map(), seen = new Set();
  for (const entry of entries) {
    const id = entry.animalId;
    // Unsimulated, hand-placed visual samples have no Worker ID and stay individual.
    if (!Number.isSafeInteger(id) || id < 0) {
      individual.push(entry);
      continue;
    }
    if (seen.has(id)) throw new TypeError(`Duplicate visual animal ID ${id}`);
    seen.add(id);
    if (entry.lod !== 'far') {
      individual.push(entry);
      continue;
    }
    if (!Number.isFinite(entry.x) || !Number.isFinite(entry.y)) throw new TypeError(`Animal ${id} requires finite scene-space coordinates`);
    const column = Math.floor(entry.x / cellWidth), row = Math.floor(entry.y / cellHeight), key = `${column}:${row}`;
    let group = groups.get(key);
    if (!group) {
      group = {id: `herd:${key}`, kind: 'herd-cluster', assetId: 'nelore-adult-low', lod: 'far', count: 0, animalIds: [], x: 0, y: 0, screenX: 0, screenY: 0, depth: 0};
      groups.set(key, group);
    }
    group.count++;
    group.animalIds.push(id);
    group.x += entry.x;
    group.y += entry.y;
    group.screenX += Number.isFinite(entry.screenX) ? entry.screenX : entry.x;
    group.screenY += Number.isFinite(entry.screenY) ? entry.screenY : entry.y;
    group.depth += entry.depth ?? entry.y;
  }
  const clusters = [...groups.values()];
  for (const group of clusters) {
    group.animalIds.sort((a, b) => a - b);
    group.x /= group.count;
    group.y /= group.count;
    group.screenX /= group.count;
    group.screenY /= group.count;
    group.depth /= group.count;
  }
  return {individual, clusters};
}

/** Return the exact simulated IDs represented by an individual or cluster. */
export function visualAnimalIds(entry) {
  if (entry?.kind === 'herd-cluster') return [...entry.animalIds].sort((a, b) => a - b);
  return Number.isSafeInteger(entry?.animalId) ? [entry.animalId] : [];
}

/**
 * Transfer a selection across LOD changes. An individual selection remains a
 * single ID; a group selection retains every member, even after it expands.
 */
export function selectionForVisualEntry(entry) {
  const animalIds = visualAnimalIds(entry);
  return animalIds.length
    ? {kind: animalIds.length > 1 ? 'group' : 'animal', visualId: entry.id, animalIds}
    : {kind: 'object', visualId: entry?.id ?? null, animalIds: []};
}

export function visualEntryContainsSelection(entry, selectedAnimalIds) {
  if (!Array.isArray(selectedAnimalIds) || selectedAnimalIds.length === 0) return false;
  const selected = new Set(selectedAnimalIds);
  return visualAnimalIds(entry).some(id => selected.has(id));
}

/** Assert conservation for viewport-visible simulated IDs; culled IDs remain separate. */
export function assertVisibleAnimalMembership(entries, individual, clusters) {
  const expected = entries.map(entry => entry.animalId).filter(Number.isSafeInteger);
  const result = accountAnimalVisibility(expected, individual, clusters);
  if (result.culledAnimalIds.length !== 0) {
    throw new Error('Visible animal IDs must be represented exactly once across individuals and groups');
  }
  return true;
}

/** Partition every stable Worker ID into exactly one visible representation or the culled set. */
export function accountAnimalVisibility(allAnimalIds, individual, clusters) {
  const all = [...allAnimalIds].sort((a, b) => a - b);
  if (all.some(id => !Number.isSafeInteger(id) || id < 0) || all.some((id, index) => index > 0 && id === all[index - 1])) {
    throw new Error('Simulated animal IDs must be unique non-negative integers');
  }
  const visible = [
    ...individual.map(entry => entry.animalId).filter(Number.isSafeInteger),
    ...clusters.flatMap(group => group.animalIds),
  ].sort((a, b) => a - b);
  if (visible.some((id, index) => index > 0 && id === visible[index - 1])) {
    throw new Error('A simulated animal ID appears in multiple visible render units');
  }
  const allSet = new Set(all);
  if (visible.some(id => !allSet.has(id))) throw new Error('A visible animal ID is absent from the Worker packet');
  const visibleSet = new Set(visible);
  return {visibleAnimalIds: visible, culledAnimalIds: all.filter(id => !visibleSet.has(id))};
}
