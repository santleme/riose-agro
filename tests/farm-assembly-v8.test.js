import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const scene = JSON.parse(readFileSync(new URL('../graphics-poc/scenes/farm-assembly-v8.json', import.meta.url), 'utf8'));
const prefab = id => scene.prefabs.find(item => item.prefabId === id);

test('farm assembly uses a raised homestead and keeps the road, compound pen and trough connected', () => {
  const house = prefab('homestead-main-house'), shed = prefab('homestead-machine-shed'), gate = prefab('beef-pen-gate'), trough = prefab('pen-water-trough');
  const pen = scene.zones.find(item => item.zoneId === 'beef-paddock-v8');
  assert.ok(house && shed && gate && pen && trough);
  assert.equal(scene.terrainV8.cells[1][3].elevation, 1);
  assert.ok(['road', 'ramp'].includes(scene.terrainV8.cells[5][7].material));
  assert.ok(gate.sockets.some(socket => socket.type === 'road' && socket.id === 'gate-to-access-road'));
  const roadSocket = gate.sockets.find(socket => socket.type === 'road');
  const roadX = Math.floor(gate.position.x + roadSocket.position[0]), roadY = Math.floor(gate.position.y + roadSocket.position[1]);
  assert.ok(['road', 'ramp'].includes(scene.terrainV8.cells[roadY][roadX].material));
  assert.equal(scene.prefabs.filter(item => item.modularType === 'fence-segment').length, 9);
  assert.ok(trough.sockets.some(socket => socket.type === 'livestock'));
  assert.ok(scene.terrainV8.cells[7][8].occupancy.some(item => item.prefabId === 'pen-water-trough'));
  assert.ok(scene.terrainV8.cells[1][3].occupancy.some(item => item.prefabId === house.prefabId));
  assert.ok(house.position.x + house.footprint.columns <= shed.position.x);
});

test('five bovines occupy the pen footprint and can approach its trough', () => {
  const pen = scene.zones.find(item => item.zoneId === 'beef-paddock-v8'), trough = prefab('pen-water-trough');
  const cattle = scene.prefabs.filter(item => item.layer === 'livestock');
  assert.equal(cattle.length, 5);
  for (const animal of cattle) {
    assert.ok(animal.position.x >= pen.origin.x && animal.position.y >= pen.origin.y);
    assert.ok(animal.position.x + animal.footprint.columns <= pen.origin.x + pen.footprint.columns);
    assert.ok(animal.position.y + animal.footprint.rows <= pen.origin.y + pen.footprint.rows);
  }
  assert.ok(cattle.some(animal => Math.hypot(animal.position.x - trough.position.x, animal.position.y - trough.position.y) < 1));
});

test('the pen gate closes the fence ring and connects to a road cell', () => {
  const gate = scene.prefabs.find(item => item.prefabId === 'beef-pen-gate');
  assert.equal(gate.modularType, 'fence-gate');
  assert.deepEqual(Object.keys(gate.socketConnections).sort(), ['left', 'right']);
  const [x, y] = gate.roadConnectionCell;
  assert.ok(['road', 'ramp'].includes(scene.terrainV8.cells[y][x].material));
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
  const pen = scene.zones.find(item => item.zoneId === 'beef-paddock-v8');
  const walkers = scene.prefabs.filter(item => item.animationClip === 'walk');
  assert.equal(walkers.length, 2);
  for (const animal of walkers) for (const [x, y] of animal.visualRoute) {
    assert.ok(x >= pen.origin.x && x <= pen.origin.x + pen.footprint.columns);
    assert.ok(y >= pen.origin.y && y <= pen.origin.y + pen.footprint.rows);
    assert.notEqual(scene.terrainV8.cells[Math.floor(y)][Math.floor(x)].material, 'water');
  }
});
