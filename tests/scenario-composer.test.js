import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBeefFarmScene, createDairyFarmScene, projectIso, unprojectIso} from '../public/assets/scenario-editor/scene-layout.js';

const manifest = JSON.parse(await readFile(new URL('../public/assets/manifest.json', import.meta.url), 'utf8'));
const prefabDoc = JSON.parse(await readFile(new URL('../public/assets/scenario-editor/prefabs.json', import.meta.url), 'utf8'));
const prefabById = new Map(prefabDoc.prefabs.map((prefab) => [prefab.id, prefab]));
const assetIds = new Set(manifest.assets.map((asset) => asset.id));

function sceneAnimals(scene) {
  return scene.placements.filter((placement) => placement.layer === 'animals').length
    + scene.prefabInstances.reduce((sum, instance) => sum + (prefabById.get(instance.prefabId)?.placements.filter((placement) => placement.layer === 'animals').length ?? 0), 0);
}

for (const [name, create, maxVisible] of [
  ['beef', createBeefFarmScene, 16],
  ['dairy', createDairyFarmScene, 15],
]) {
  test(`${name} diorama is deterministic and separates visual samples from population`, () => {
    const scene = create(prefabDoc.prefabs, 20261012);
    assert.deepEqual(scene, create(prefabDoc.prefabs, 20261012));
    assert.equal(sceneAnimals(scene), scene.metadata.visibleAnimalCount);
    assert.ok(sceneAnimals(scene) <= maxVisible);
    assert.equal(scene.visualGroups.reduce((total, group) => total + group.population, 0), scene.metadata.animalCount);
    assert.ok(scene.visualGroups.every((group) => group.visualIds.length <= group.maxSprites));
    const visualIds = new Set(scene.visualGroups.flatMap((group) => group.visualIds));
    const animalPlacements = scene.placements.filter((placement) => placement.layer === 'animals');
    for (const placement of animalPlacements) {
      assert.equal(placement.properties.sourceKind, 'lot-representative');
      assert.equal(placement.properties.animalId, undefined);
      assert.ok(visualIds.has(placement.properties.visualId));
    }
  });
}

test('scenario placements and prefab children resolve through existing manifests', () => {
  for (const scene of [createBeefFarmScene(prefabDoc.prefabs), createDairyFarmScene(prefabDoc.prefabs)]) {
    for (const placement of scene.placements) assert.ok(assetIds.has(placement.assetId), `${placement.assetId} missing from manifest`);
    for (const instance of scene.prefabInstances) {
      const prefab = prefabById.get(instance.prefabId);
      assert.ok(prefab, `${instance.prefabId} missing from prefab library`);
      for (const placement of prefab.placements) assert.ok(assetIds.has(placement.assetId), `${placement.assetId} missing from manifest`);
    }
  }
});

test('2:1 isometric coordinates round-trip without drift', () => {
  const grid = {tileWidth: 96, tileHeight: 48};
  for (const [col, row] of [[0, 0], [1.25, 7.5], [35, 23], [18, 11]]) {
    const projected = projectIso(col, row, grid);
    const restored = unprojectIso(projected.x, projected.y, grid);
    assert.ok(Math.abs(restored.col - col) < 1e-9);
    assert.ok(Math.abs(restored.row - row) < 1e-9);
  }
});
