import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const scene = JSON.parse(readFileSync(new URL('../graphics-poc/scenes/farm-assembly-v8.json', import.meta.url), 'utf8'));
const prefab = id => scene.prefabs.find(item => item.prefabId === id);

test('farm assembly uses a raised homestead and keeps the road, compound pen and trough connected', () => {
  const house = prefab('homestead-main-house'), shed = prefab('homestead-machine-shed'), pen = prefab('beef-pen-and-gate'), trough = prefab('pen-water-trough');
  assert.ok(house && shed && pen && trough);
  assert.equal(scene.terrainV8.cells[1][3].elevation, 1);
  assert.equal(scene.terrainV8.cells[7][12].material, 'road');
  assert.ok(pen.sockets.some(socket => socket.type === 'road' && socket.id === 'gate-to-access-road'));
  assert.ok(trough.sockets.some(socket => socket.type === 'livestock'));
  assert.ok(scene.terrainV8.cells[9][13].occupancy.some(item => item.prefabId === 'pen-water-trough'));
  assert.ok(scene.terrainV8.cells[1][3].occupancy.some(item => item.prefabId === house.prefabId));
  assert.ok(house.position.x + house.footprint.columns <= shed.position.x);
});

test('five bovines occupy the pen footprint and can approach its trough', () => {
  const pen = prefab('beef-pen-and-gate'), trough = prefab('pen-water-trough');
  const cattle = scene.prefabs.filter(item => item.layer === 'livestock');
  assert.equal(cattle.length, 5);
  for (const animal of cattle) {
    assert.ok(animal.position.x >= pen.position.x && animal.position.y >= pen.position.y);
    assert.ok(animal.position.x + animal.footprint.columns <= pen.position.x + pen.footprint.columns);
    assert.ok(animal.position.y + animal.footprint.rows <= pen.position.y + pen.footprint.rows);
  }
  assert.ok(cattle.some(animal => Math.hypot(animal.position.x - trough.position.x, animal.position.y - trough.position.y) < 1));
});

test('visual bovine clips contain distinct raster frames and stay separate from the science scene', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/generated/world-v8/terrain-atlas-v8.json', import.meta.url), 'utf8'));
  for (const name of ['idle', 'walk', 'graze', 'drink']) {
    const clip = manifest.animationClips[name];
    assert.ok(clip && clip.frames.length >= 1);
    assert.equal(clip.sourceReviewStatus, name === 'idle' ? 'APPROVED_STATIC' : 'REVIEW');
    if (clip.frames.length > 1) {
      const hashes = clip.frames.map(frame => createHash('sha256').update(readFileSync(new URL(`../assets/generated/world-v8/${frame.replace('world-v8-', '')}.png`, import.meta.url))).digest('hex'));
      assert.ok(new Set(hashes).size > 1, `${name} frames should be visibly different`);
    }
  }
  assert.equal(scene.simulation.productionSystem, 'visual-only');
  assert.equal(scene.simulation.populationCount, 0);
});

test('walking display routes remain inside the navigable pen terrain', () => {
  const pen = prefab('beef-pen-and-gate');
  const walkers = scene.prefabs.filter(item => item.animationClip === 'walk');
  assert.equal(walkers.length, 2);
  for (const animal of walkers) for (const [x, y] of animal.visualRoute) {
    assert.ok(x >= pen.position.x && x <= pen.position.x + pen.footprint.columns);
    assert.ok(y >= pen.position.y && y <= pen.position.y + pen.footprint.rows);
    assert.notEqual(scene.terrainV8.cells[Math.floor(y)][Math.floor(x)].material, 'water');
  }
});
