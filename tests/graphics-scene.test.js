import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import {createServer} from '../server.js';
import {farmPositionToGrid, placementFits, projectIso, terrainCells, unprojectIso} from '../graphics-poc/contract.js';

const scene = JSON.parse(await readFile(new URL('../graphics-poc/scene.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../schemas/visual-scene.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({allErrors: true, strict: true, strictRequired: false}).compile(schema);

test('renderer-independent scene schema supports beef and in-progress dairy scenarios', () => {
  assert.equal(validate(scene), true, JSON.stringify(validate.errors));
  const dairy = structuredClone(scene);
  dairy.sceneId = 'riose-dairy-layout-contract-example';
  dairy.domainModule = {moduleId: 'livestock-dairy', version: '0.1.0', status: 'in-progress', modelIds: []};
  dairy.simulation.scenarioId = 'dairy-layout-only-in-progress'; dairy.simulation.productionSystem = 'dairy';
  assert.equal(validate(dairy), true, JSON.stringify(validate.errors));

  const rendererCoupled = structuredClone(scene); rendererCoupled.renderer = 'pixi';
  assert.equal(validate(rendererCoupled), false, 'renderer implementation details must stay out of scenario JSON');
});

test('isometric projection and inverse preserve editable grid positions', () => {
  for (const cell of [{x: 0, y: 0}, {x: 4.25, y: 7.75}, {x: 14, y: 10}]) {
    const projected = projectIso(cell.x, cell.y, 64, 32);
    const restored = unprojectIso(projected.x, projected.y, 64, 32);
    assert.ok(Math.abs(restored.column - cell.x) < 1e-9);
    assert.ok(Math.abs(restored.row - cell.y) < 1e-9);
  }
  assert.deepEqual(farmPositionToGrid(288, 168, 14, 10), {column: 7, row: 5});
});

test('prefab snapping rejects out-of-bounds and overlapping blocking footprints', () => {
  const home = scene.prefabs[0];
  assert.equal(placementFits(home, {x: 2, y: 2}, 14, 10, scene.prefabs), true);
  assert.equal(placementFits(home, {x: 1, y: 6}, 14, 10, scene.prefabs), false, 'pond overlaps the home');
  assert.equal(placementFits(home, {x: 13, y: 9}, 14, 10, []), false);
});

test('zone ground selection exposes terrain transition cells for auto-tiling', () => {
  const cells = terrainCells(scene), north = cells.filter(cell => cell.zoneId === 'north-paddock');
  assert.equal(cells.length, scene.projection.columns * scene.projection.rows);
  assert.ok(north.some(cell => cell.assetId === 'grass-mid'), 'edge mask resolves the declared transition asset');
  assert.ok(north.some(cell => cell.assetId === 'grass-light'), 'interior keeps the zone ground asset');
  assert.ok(cells.some(cell => cell.zoneId === 'handling-yard' && cell.assetId === 'soil-dry'));
});

test('the Graphics Lab server publishes its scene, schema and source art with explicit PNG MIME', async t => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/graphics-poc/index.html', '/graphics-poc/scene.json', '/schemas/visual-scene.schema.json']) {
    const response = await fetch(origin + path); assert.equal(response.status, 200, path);
  }
  const image = await fetch(origin + '/graphics-poc/assets/nelore-adult-idle-v1.png');
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
  const digest = createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex');
  assert.equal(digest, '975ed9aa2891ddd4991c19e50def5f55ad99466a8a2d3213d0d99d25c1d3ec43');
  assert.equal((await fetch(origin + '/graphics-poc/app.js')).status, 404, 'source modules remain outside the static allowlist');
});
