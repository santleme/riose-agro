import test from 'node:test';
import assert from 'node:assert/strict';
import {accountAnimalVisibility, assertVisibleAnimalMembership, clusterFarAnimals, selectionForVisualEntry, visualEntryContainsSelection} from '../graphics-poc/herd-visual-model.js';

function herd(count) {
  return Array.from({length: count}, (_, index) => {
    const x = (index % 120) * 8 + Math.floor(index / 120) * 1.7;
    const y = (index % 83) * 5 + Math.floor(index / 83) * 1.3;
    return {id: `animal-${index + 1}`, animalId: index + 1, kind: 'livestock', lod: 'far', x, y, screenX: x, screenY: y, depth: y};
  });
}

function membership(result) {
  return result.clusters.map(group => [group.id, [...group.animalIds]]).sort((a, b) => a[0].localeCompare(b[0]));
}

for (const count of [100, 1000, 10000]) {
  test(`herd grouping conserves all ${count} visible IDs exactly once`, () => {
    const entries = herd(count), result = clusterFarAnimals(entries);
    assert.equal(assertVisibleAnimalMembership(entries, result.individual, result.clusters), true);
    const ids = result.clusters.flatMap(group => group.animalIds);
    assert.equal(ids.length, count);
    assert.equal(new Set(ids).size, count);
    assert.equal(result.clusters.reduce((total, group) => total + group.count, 0), count);
  });
}

test('cluster IDs and member mapping are independent of camera pan and zoom transforms', () => {
  const entries = herd(1000), first = clusterFarAnimals(entries);
  const changedCamera = entries.map(entry => ({...entry, screenX: 1920 - entry.x * 3.2, screenY: -840 + entry.y * 3.2}));
  const second = clusterFarAnimals(changedCamera);
  assert.deepEqual(membership(second), membership(first));
  assert.deepEqual(entries[0], {id: 'animal-1', animalId: 1, kind: 'livestock', lod: 'far', x: 0, y: 0, screenX: 0, screenY: 0, depth: 0});
});

test('group selection retains exact IDs and transfers to individual render entries after LOD changes', () => {
  const entries = herd(100), {clusters} = clusterFarAnimals(entries), selectedGroup = clusters[0];
  const selection = selectionForVisualEntry(selectedGroup);
  assert.equal(selection.kind, 'group');
  assert.deepEqual(selection.animalIds, selectedGroup.animalIds);
  const zoomedEntries = entries.filter(entry => selection.animalIds.includes(entry.animalId)).map(entry => ({...entry, lod: 'near'}));
  const zoomed = clusterFarAnimals(zoomedEntries);
  assert.deepEqual(zoomed.individual.map(entry => entry.animalId), selection.animalIds);
  assert.ok(zoomed.individual.every(entry => visualEntryContainsSelection(entry, selection.animalIds)));
  assertVisibleAnimalMembership(zoomedEntries, zoomed.individual, zoomed.clusters);
});

test('group selection stores IDs, not visual coordinates or engine objects', () => {
  const entries = herd(100), result = clusterFarAnimals(entries), selection = selectionForVisualEntry(result.clusters[0]);
  assert.deepEqual(Object.keys(selection), ['kind', 'visualId', 'animalIds']);
  assert.equal(selection.animalIds.some(id => typeof id !== 'number'), false);
});

test('duplicate stable IDs and invalid cluster dimensions are rejected', () => {
  const entries = herd(2);
  entries[1].animalId = entries[0].animalId;
  assert.throws(() => clusterFarAnimals(entries), /Duplicate visual animal ID/);
  assert.throws(() => clusterFarAnimals([], 0, 36), /dimensions must be positive/);
});

test('viewport and disabled-layer culling partition the full Worker ID set', () => {
  const entries = herd(100), visibleEntries = entries.slice(0, 63), groups = clusterFarAnimals(visibleEntries);
  const accounting = accountAnimalVisibility(entries.map(entry => entry.animalId), groups.individual, groups.clusters);
  assert.equal(accounting.visibleAnimalIds.length, 63);
  assert.deepEqual(accounting.culledAnimalIds, entries.slice(63).map(entry => entry.animalId));
  assert.throws(() => accountAnimalVisibility([1, 2], [{animalId: 1}, {animalId: 1}], []), /multiple visible render units/);
});
