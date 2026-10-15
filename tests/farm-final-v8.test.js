import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composeFarmSceneV8} from '../src/client/farm-scene-composer-v8.js';

const scene = JSON.parse(readFileSync(new URL('../graphics-poc/scenes/farm-final-v8.json', import.meta.url), 'utf8'));

test('final farm has three pastures, a raised homestead, service pen, and nine cattle', () => {
  const pastures = scene.zones.filter(zone => zone.kind === 'pasture');
  assert.equal(pastures.length, 3);
  assert.ok(scene.zones.some(zone => zone.kind === 'service'));
  assert.equal(scene.prefabs.filter(item => item.layer === 'livestock').length, 9);
  assert.equal(scene.prefabs.filter(item => item.assetId.includes('corral-')).length, 3);
  assert.ok(scene.terrainV8.heightMap.flat().some(level => level === 1));
  assert.ok(scene.terrainV8.heightMap.flat().some(level => level === 0));
  assert.ok(scene.prefabs.some(item => item.prefabId === 'homestead-main-house'));
  assert.ok(scene.prefabs.some(item => item.prefabId === 'homestead-machine-shed'));
});

test('farm access branches and compound gates have road sockets on navigable cells', () => {
  const road = scene.terrainV8.cells.flat().filter(cell => ['road', 'ramp'].includes(cell.material));
  const roadKeys = new Set([
    ...road.map(cell => `${cell.x},${cell.y}`),
    ...scene.terrainV8.routes.bridgeCrossing.map(([x, y]) => `${x},${y}`),
  ]);
  const seen = new Set(['3,7']), queue = [[3, 7]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const key = `${nx},${ny}`;
      if (roadKeys.has(key) && !seen.has(key)) { seen.add(key); queue.push([nx, ny]); }
    }
  }
  assert.ok(seen.has('12,7'));
  for (const pen of scene.prefabs.filter(item => item.assetId.includes('corral-'))) {
    assert.ok(pen.sockets.some(socket => socket.type === 'road'));
  }
});

test('seed variation repositions only valid decorative trees and preserves the authored farm graph', () => {
  const first = composeFarmSceneV8(scene, 84018), second = composeFarmSceneV8(scene, 84019), repeated = composeFarmSceneV8(scene, 84018);
  assert.notDeepEqual(first.decorativeAnchors, second.decorativeAnchors);
  assert.deepEqual(first.decorativeAnchors, repeated.decorativeAnchors);
  assert.deepEqual(first.scene.terrainV8.routes, second.scene.terrainV8.routes);
  assert.deepEqual(first.scene.zones, second.scene.zones);
  for (const variant of [first, second]) {
    assert.equal(variant.scene.prefabs.filter(item => item.layer === 'livestock').length, 9);
    for (const [x, y] of variant.decorativeAnchors) {
      const cell = variant.scene.terrainV8.cells[y][x];
      assert.equal(cell.material, 'grass');
      assert.ok(cell.navigable);
    }
  }
});
