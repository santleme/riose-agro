import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTerrainWorldV8, validateTerrainWorldV8} from '../src/client/terrain-world-v8.js';

test('V8 proof models materials, height, slope, occupancy and transitions per terrain cell', () => {
  const world = buildTerrainWorldV8();
  assert.equal(validateTerrainWorldV8(world).valid, true);
  assert.equal(world.cells.length, world.dimensions.rows);
  assert.equal(world.cells[0].length, world.dimensions.columns);
  assert.ok(world.cells.flat().every(cell => 'material' in cell && 'elevation' in cell && 'inclination' in cell
    && 'navigable' in cell && 'occupancy' in cell && Array.isArray(cell.connectivity) && 'transition' in cell));
  assert.ok(Math.max(...world.heightMap.flat()) > Math.min(...world.heightMap.flat()));
  assert.equal(Math.max(...world.cells.flat().map(cell => cell.inclination)), 1);
});

test('road uses the authored ramp and bridge crossing to stay connected', () => {
  const world = buildTerrainWorldV8();
  assert.deepEqual(world.routes.bridgeCrossing, [[9, 5], [10, 5], [11, 5]]);
  assert.ok(world.routes.navigable.length >= 10);
  assert.ok(world.routes.road.some(([x, y]) => world.cells[y][x].material === 'ramp'));
  assert.ok(world.cells[5][10].connectivity.some(next => next.x === 9 || next.x === 11));
});

test('cliff sprites, material transitions and the bridge have explicit geometry metadata', () => {
  const world = buildTerrainWorldV8();
  assert.ok(world.cliffSegments.length > 0);
  assert.ok(world.cells.flat().some(cell => cell.transition?.to === 'water'));
  assert.ok(world.bridges[0].collisionPolygon.length >= 4);
  assert.ok(world.bridges[0].sockets.length === 2);
});
