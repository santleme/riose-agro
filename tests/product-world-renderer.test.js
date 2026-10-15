import test from 'node:test';
import assert from 'node:assert/strict';
import {productFenceRuns, productGroundTiles, productWorldFrontEdges, productWorldOutline, PRODUCT_BLOCKOUT, worldToScreen} from '../src/client/product/spatial.js';
import {productFarmEntityAt} from '../src/client/product/scene.js';
import {productWorldAnimalAt, productWorldAnimalById, productWorldEntityFromHit, productWorldVegetationAt} from '../src/client/product/world-contract.js';

test('isometric scene hits resolve to the Product UI entity IDs and supported types', () => {
  const centers = [
    ['paddock-a', 'paddock-a'],
    ['farmstead', 'farmstead'],
    ['pond', 'pond'],
    ['barn-corral', 'cattle-shed'],
    ['crop-block', 'crop-block'],
  ];
  for (const [sceneId, expectedId] of centers) {
    const item = [...PRODUCT_BLOCKOUT.zones, ...PRODUCT_BLOCKOUT.structures].find(candidate => candidate.id === sceneId);
    const point = worldToScreen(item.x + item.w / 2, item.y + item.h / 2);
    const selected = productWorldEntityFromHit(productFarmEntityAt(point.x, point.y));
    assert.equal(selected?.id, expectedId, sceneId);
    assert.ok(selected?.type, sceneId);
  }
  const pasture = productWorldEntityFromHit(productFarmEntityAt(...Object.values(worldToScreen(4, 3))));
  assert.deepEqual({id: pasture.id, type: pasture.type, name: pasture.name, index: pasture.index}, {
    id: 'paddock-a', type: 'paddock', name: 'Pasture A', index: 0,
  });
  assert.equal(productWorldEntityFromHit(productFarmEntityAt(...Object.values(worldToScreen(18, 10.5))))?.id, 'cattle-shed');
  assert.equal(productWorldEntityFromHit(productFarmEntityAt(...Object.values(worldToScreen(31.5, 9.5))))?.type, 'crop');
  assert.equal(productWorldEntityFromHit(null), null);
});

test('visual animal selection returns the original Worker model record by stable ID', () => {
  const animals = [{id: 1, patch: 0, x: 100, y: 100}, {id: 24, patch: 3, x: 900, y: 600}];
  const hit = {...animals[1], visualPosition: {x: 350, y: 180}, displayOffset: {x: -1.2, y: .4}};
  assert.equal(productWorldAnimalById(animals, hit.id), animals[1]);
  assert.equal(productWorldAnimalById(animals, 404), null);
  assert.deepEqual(animals[1], {id: 24, patch: 3, x: 900, y: 600}, 'camera projection must not write back into the Worker record');
});

test('animal picking follows the visible sprite bounds instead of blocking most of a paddock', () => {
  const animal = {id: 24, visualPosition: {x: 350, y: 180}};
  const asset = {displaySize: [76, 58], anchor: {x: .5, y: 1}};
  assert.equal(productWorldAnimalAt({x: 350, y: 170}, [animal], asset, .36), animal);
  assert.equal(productWorldAnimalAt({x: 370, y: 161}, [animal], asset, .36), null);
});

test('tree hit testing uses the rendered scene placements and keeps their stable IDs', () => {
  const placements = [{id: 'oak-west', asset: 'tree', x: 4, y: 3}];
  const assets = new Map([['tree', {displaySize: [40, 50], anchor: {x: .5, y: 1}}]]);
  const project = (x, y) => worldToScreen(x, y);
  const point = project(4, 3);
  assert.deepEqual(productWorldVegetationAt({x: point.x, y: point.y - 25}, placements, project, assets, () => 1), {
    id: 'oak-west', type: 'tree', name: 'Shade tree', asset: 'tree', position: {x: 4, y: 3},
  });
  assert.equal(productWorldVegetationAt({x: point.x + 30, y: point.y - 25}, placements, project, assets), null);
});

test('Product ground tiles are deterministic, bounded, and trace back to a scene zone', () => {
  const first = productGroundTiles(), second = productGroundTiles();
  assert.deepEqual(first, second);
  assert.equal(first.length, 144);
  assert.equal(new Set(first.map(tile => tile.id)).size, first.length);
  assert.ok(first.every(tile => tile.x >= 0 && tile.x < PRODUCT_BLOCKOUT.world.width
    && tile.y >= 0 && tile.y < PRODUCT_BLOCKOUT.world.height
    && PRODUCT_BLOCKOUT.zones.some(zone => zone.id === tile.zoneId)));
  assert.ok(first.some(tile => tile.assetId === 'grass-light'));
  assert.ok(first.some(tile => tile.assetId === 'grass-mid'));
});

test('world perimeter is an irregular scene outline rather than a rectangular frame', () => {
  const outline = productWorldOutline();
  assert.ok(outline.length >= 8);
  assert.ok(outline.some(point => point.x === 0 && point.y !== 0));
  assert.ok(outline.some(point => point.y === 0 && point.x !== 0));
  assert.ok(outline.every(point => point.x >= 0 && point.x <= PRODUCT_BLOCKOUT.world.width
    && point.y >= 0 && point.y <= PRODUCT_BLOCKOUT.world.height));
  const front = productWorldFrontEdges();
  assert.ok(front.length > 0 && front.length < outline.length, 'soil faces follow only the visible contour, not a closed rectangular frame');
});

test('decorative tree anchors stay inside the authored island contour', () => {
  const outline = productWorldOutline();
  const contains = ({x, y}) => outline.reduce((inside, point, index) => {
    const previous = outline[(index + outline.length - 1) % outline.length];
    const crosses = (point.y > y) !== (previous.y > y)
      && x < (previous.x - point.x) * (y - point.y) / (previous.y - point.y) + point.x;
    return crosses ? !inside : inside;
  }, false);
  assert.ok(PRODUCT_BLOCKOUT.vegetation.every(placement => contains(placement)),
    'tree ground contacts should not float outside the island silhouette');
});

test('fence runs use one continuous sprite span per edge and preserve actual gate openings', () => {
  const scene = {
    zones: [{id: 'test-paddock', x: 2, y: 3, w: 6, h: 4}],
    gates: [{id: 'test-gate', zone: 'test-paddock', a: {x: 4, y: 3}, b: {x: 5, y: 3}}],
  };
  const runs = productFenceRuns(scene);
  const north = runs.filter(run => run.edge === 'north');
  assert.equal(runs.length, 5, 'four boundaries split only where the one gate cuts the north side');
  assert.deepEqual(north.map(run => [run.from.x, run.to.x]), [[2, 4], [5, 8]]);
  assert.equal(north.some(run => run.from.x < 5 && run.to.x > 4), false, 'no fence run spans the gate');
  assert.ok(runs.filter(run => run.edge === 'east').every(run => run.from.x === 8 && run.to.x === 8));
  assert.ok(runs.filter(run => run.edge === 'west').every(run => run.from.x === 2 && run.to.x === 2));
  assert.ok(runs.filter(run => run.edge === 'south').every(run => run.from.y === 7 && run.to.y === 7));

  const actualRuns = productFenceRuns();
  assert.equal(actualRuns.length, 25, 'the five existing gates each split one of five paddock boundaries');
  assert.equal(new Set(actualRuns.map(run => run.id)).size, actualRuns.length);

});
