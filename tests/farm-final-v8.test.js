import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composeFarmSceneV8} from '../src/client/farm-scene-composer-v8.js';
import {waterTileAssetId} from '../src/client/terrain-world-v8.js';

const scene = JSON.parse(readFileSync(new URL('../graphics-poc/scenes/farm-final-v8.json', import.meta.url), 'utf8'));
const assetManifest = JSON.parse(readFileSync(new URL('../assets/generated/world-v8/terrain-atlas-v8.json', import.meta.url), 'utf8'));

test('final farm reconstructs the authored composition over a large three-level terrain', () => {
  const pastures = scene.zones.filter(zone => zone.kind === 'pasture');
  assert.equal(pastures.length, 3);
  assert.ok(scene.zones.some(zone => zone.kind === 'service'));
  assert.equal(scene.prefabs.filter(item => item.layer === 'livestock').length, 20);
  assert.deepEqual([...new Set(scene.prefabs.filter(item => item.layer === 'livestock').map(item => item.animationClip))].sort(), ['drink', 'graze', 'idle', 'walk']);
  assert.equal(scene.prefabs.filter(item => item.assetId.includes('corral-')).length, 1);
  assert.deepEqual([...new Set(scene.terrainV8.heightMap.flat())].sort(), [0, 1, 2]);
  assert.equal(scene.projection.columns, 20);
  assert.equal(scene.projection.rows, 18);
  assert.ok(scene.prefabs.filter(item => item.modularType === 'fence-segment').length >= 20);
  assert.ok(scene.prefabs.some(item => item.assetId === 'world-v8-farm-crop-field'));
  assert.ok(scene.prefabs.some(item => item.assetId === 'world-v8-farm-windmill'));
  assert.ok(scene.terrainV8.heightMap.flat().some(level => level === 1));
  assert.ok(scene.terrainV8.heightMap.flat().some(level => level === 0));
  assert.ok(scene.prefabs.some(item => item.assetId === 'building-farmhouse-imagegen-v1'));
  assert.ok(scene.prefabs.some(item => item.assetId === 'building-shed-imagegen-v1'));
});

test('farm roads and bridge form a navigable route across the three height levels', () => {
  const road = scene.terrainV8.cells.flat().filter(cell => ['road', 'ramp'].includes(cell.material));
  const route = scene.terrainV8.routes.navigable;
  assert.ok(road.length >= 45);
  assert.ok(route.length >= 20);
  assert.deepEqual(route[0], [2, 16]);
  assert.deepEqual(route.at(-1), [16, 12]);
  for (let index = 1; index < route.length; index++) {
    const [x, y] = route[index - 1], [nx, ny] = route[index];
    assert.equal(Math.abs(x - nx) + Math.abs(y - ny), 1);
    const current = scene.terrainV8.cells[y][x], next = scene.terrainV8.cells[ny][nx];
    assert.ok(current.connectivity.some(edge => edge.x === nx && edge.y === ny));
    assert.ok(Math.abs(current.elevation - next.elevation) <= 1);
  }
  assert.ok(scene.prefabs.some(item => item.modularType === 'fence-gate' && item.sockets.some(socket => socket.type === 'road')));
  const roadArt = new Set(scene.terrainTiles.filter(tile => tile.material === 'road').map(tile => tile.assetId));
  assert.ok(roadArt.has('world-v8-road-row'));
  assert.ok(roadArt.has('world-v8-road-cross'));
  for (const cell of scene.terrainV8.cells.flat().filter(item => item.material === 'water' && item.navigable)) {
    assert.ok(scene.terrainV8.bridges.some(bridge => bridge.links.some(([x, y]) => x === cell.x && y === cell.y)));
  }
  for (const prefabId of ['v4-placement-001', 'v4-placement-013']) {
    const building = scene.prefabs.find(item => item.prefabId === prefabId);
    const [x, y] = building.roadConnectionCell;
    assert.ok(building.sockets.some(socket => socket.type === 'road'));
    assert.ok(['road', 'ramp'].includes(scene.terrainV8.cells[y][x].material));
    assert.ok(route.some(([routeX, routeY]) => routeX === x && routeY === y));
    const centerX = building.position.x + building.footprint.columns / 2;
    const centerY = building.position.y + building.footprint.rows / 2;
    assert.ok(Math.hypot(x + .5 - centerX, y + .5 - centerY) <= 1.5);
  }
});

test('all three pasture fence rings connect their segments and gates', () => {
  for (const zoneId of ['piquete-oeste', 'pasto-norte', 'piquete-leste']) {
    const ring = scene.prefabs.filter(item => item.prefabId.startsWith(`fence-${zoneId}-`) || item.prefabId === `gate-${zoneId}`);
    assert.equal(ring.length, 8);
    assert.equal(ring.filter(item => item.modularType === 'fence-segment').length, 7);
    assert.equal(ring.filter(item => item.modularType === 'fence-gate').length, 1);
    for (const piece of ring) {
      assert.ok(piece.spatialGeometry.collisionPolygon.length >= 4);
      const neighbors = Object.values(piece.socketConnections);
      assert.equal(neighbors.length, 2);
      assert.ok(neighbors.every(id => ring.some(other => other.prefabId === id)));
      assert.equal(piece.sockets.length, piece.modularType === 'fence-gate' ? 3 : 2);
    }
    const gate = ring.find(item => item.modularType === 'fence-gate'), [roadX, roadY] = gate.roadConnectionCell;
    const gateCenter = {x: gate.position.x + gate.footprint.columns / 2, y: gate.position.y + gate.footprint.rows / 2};
    assert.ok(['road', 'ramp'].includes(scene.terrainV8.cells[roadY][roadX].material));
    assert.ok(Math.hypot(roadX + .5 - gateCenter.x, roadY + .5 - gateCenter.y) <= 1);
  }
});

test('every farm prefab carries a non-empty collision footprint', () => {
  for (const prefab of scene.prefabs) {
    assert.ok(prefab.spatialGeometry.collisionPolygon.length >= 4, `${prefab.prefabId} collision polygon`);
  }
});

test('final river cells form one continuous channel along the lower farm edge', () => {
  const water = scene.terrainV8.cells.flat().filter(cell => cell.material === 'water');
  const seen = new Set([`${water[0].x},${water[0].y}`]), queue = [water[0]];
  while (queue.length) {
    const cell = queue.shift();
    for (const [x, y] of [[cell.x - 1, cell.y], [cell.x + 1, cell.y], [cell.x, cell.y - 1], [cell.x, cell.y + 1]]) {
      const key = `${x},${y}`;
      const next = scene.terrainV8.cells[y]?.[x];
      if (next?.material === 'water' && !seen.has(key)) { seen.add(key); queue.push(next); }
    }
  }
  assert.equal(seen.size, water.length);
  assert.ok(water.length >= 25);
});

test('water shoreline sprites follow the logical neighbor mask', () => {
  for (const cell of scene.terrainV8.cells.flat().filter(item => item.material === 'water')) {
    const tile = scene.terrainTiles.find(item => item.position.x === cell.x && item.position.y === cell.y);
    assert.equal(tile.assetId, waterTileAssetId(scene.terrainV8.cells, cell.x, cell.y));
  }
  assert.ok(scene.terrainTiles.some(tile => tile.assetId.startsWith('world-v8-water-edge-')));
});

test('natural grass decals use a separate raster tile without changing terrain geometry', () => {
  const lushTiles = scene.terrainTiles.filter(tile => tile.assetId === 'world-v8-grass-natural');
  assert.ok(lushTiles.length >= 12 && lushTiles.length <= 30);
  for (const tile of lushTiles) assert.equal(tile.material, 'grass');
  assert.equal(scene.terrainV8.cells.flat().filter(cell => cell.material === 'grass').length,
    scene.terrainTiles.filter(tile => tile.material === 'grass').length);
});

test('world V8 atlas records provenance and pending visual review per asset', () => {
  const frames = Object.entries(assetManifest.assets);
  assert.ok(frames.length >= 40);
  for (const [id, asset] of frames) {
    assert.ok(asset.revision >= 1, `${id} revision`);
    assert.equal(asset.status, 'REVIEW', `${id} status`);
    assert.ok(['ai-generated', 'hand-authored', 'edited'].includes(asset.source), `${id} source`);
    assert.ok(asset.sourceAsset, `${id} source asset`);
    assert.ok(asset.reference_versions.length > 0, `${id} reference versions`);
    assert.equal(asset.visual_review.score, null, `${id} must stay unapproved without human review`);
  }
});

test('seed variation repositions only valid decorative trees and preserves the authored farm graph', () => {
  const first = composeFarmSceneV8(scene, 84018), second = composeFarmSceneV8(scene, 84019), repeated = composeFarmSceneV8(scene, 84018);
  assert.notDeepEqual(first.decorativeAnchors, second.decorativeAnchors);
  assert.deepEqual(first.decorativeAnchors, repeated.decorativeAnchors);
  assert.deepEqual(first.scene.terrainV8.routes, second.scene.terrainV8.routes);
  assert.deepEqual(first.scene.zones, second.scene.zones);
  for (const variant of [first, second]) {
    assert.equal(variant.scene.prefabs.filter(item => item.layer === 'livestock').length, 20);
    for (const [x, y] of variant.decorativeAnchors) {
      const cell = variant.scene.terrainV8.cells[y][x];
      assert.equal(cell.material, 'grass');
      assert.ok(cell.navigable);
    }
  }
});
