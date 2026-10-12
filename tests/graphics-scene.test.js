import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import {createServer} from '../server.js';
import {clusterFarAnimals, composePrefabs, distributePrefab, farmPositionToGrid, intersectsViewport, placementFits, placementValidation, projectIso, rotatePrefab, terrainCells, unprojectIso, visualLod} from '../graphics-poc/contract.js';

const scene = JSON.parse(await readFile(new URL('../graphics-poc/scene.json', import.meta.url), 'utf8'));
const dairyScene = JSON.parse(await readFile(new URL('../graphics-poc/scenes/dairy.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../schemas/visual-scene.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({allErrors: true, strict: true, strictRequired: false}).compile(schema);

test('renderer-independent scene schema supports beef and in-progress dairy scenarios', () => {
  assert.equal(validate(scene), true, JSON.stringify(validate.errors));
  assert.equal(validate(dairyScene), true, JSON.stringify(validate.errors));
  for (const candidate of [scene, dairyScene]) {
    const declaredAssets = new Set(candidate.assets.map(asset => asset.assetId));
    for (const prefab of candidate.prefabs) assert.ok(declaredAssets.has(prefab.assetId), `${candidate.sceneId} missing ${prefab.assetId}`);
    for (const entity of candidate.entities) if (entity.asset) assert.ok(declaredAssets.has(entity.asset.assetId), `${candidate.sceneId} missing ${entity.asset.assetId}`);
  }
  assert.equal(dairyScene.simulation.productionSystem, 'dairy');
  assert.equal(dairyScene.domainModule.status, 'in-progress');
  assert.equal(dairyScene.entities.filter(entity => entity.kind === 'animal').length, 12);
  assert.ok(dairyScene.prefabs.some(prefab => prefab.assetId === 'dairy-milking-parlor'));
  assert.ok(dairyScene.prefabs.some(prefab => prefab.assetId === 'dairy-milk-chilling-tank'));
  assert.ok(dairyScene.prefabs.some(prefab => prefab.assetId === 'dairy-waiting-pen'));
  let placed = [];
  for (const prefab of dairyScene.prefabs) {
    const result = placementValidation(prefab, prefab.position, dairyScene.projection.columns, dairyScene.projection.rows, placed, dairyScene.zones);
    assert.equal(result.valid, true, `${prefab.prefabId}: ${result.reason}`);
    placed.push(prefab);
  }

  const withAnimal = structuredClone(scene);
  withAnimal.entities.push({entityId: 'animal-17', kind: 'animal', domainEntityId: '17', position: {x: 12.5, y: 8.25, unit: 'world-meter'}, asset: withAnimal.assets.at(-1), state: {stateId: 'grazing'}});
  assert.equal(validate(withAnimal), true, JSON.stringify(validate.errors));
  withAnimal.entities[0].renderer = 'pixi';
  assert.equal(validate(withAnimal), false, 'visual entities must stay renderer-independent');

  const rendererCoupled = structuredClone(scene); rendererCoupled.renderer = 'pixi';
  assert.equal(validate(rendererCoupled), false, 'renderer implementation details must stay out of scenario JSON');
});

test('both farm layouts fence every pasture and keep blocking structures collision-free', () => {
  for (const candidate of [scene, dairyScene]) {
    const pastureZones = candidate.zones.filter(zone => zone.kind === 'pasture');
    assert.ok(pastureZones.length >= 2);
    for (const zone of pastureZones) {
      const local = candidate.prefabs.filter(prefab => prefab.position.x >= zone.origin.x - 0.01
        && prefab.position.x <= zone.origin.x + zone.footprint.columns
        && prefab.position.y >= zone.origin.y - 0.01
        && prefab.position.y <= zone.origin.y + zone.footprint.rows);
      assert.ok(local.some(prefab => prefab.assetId === 'fence-straight'), `${zone.zoneId} needs fence runs`);
      assert.ok(local.some(prefab => prefab.assetId === 'fence-gate'), `${zone.zoneId} needs an access gate`);
      for (const side of ['north', 'south', 'west', 'east']) {
        const run = candidate.prefabs.filter(prefab => prefab.prefabId.startsWith(zone.zoneId + '-' + side + '-'))
          .sort((a, b) => (side === 'north' || side === 'south' ? a.position.x - b.position.x : a.position.y - b.position.y));
        assert.ok(run.length >= 2, `${zone.zoneId} ${side} fence needs connected segments`);
        assert.ok(run.every((prefab, index) => index === 0
          || (side === 'north' || side === 'south' ? prefab.position.x - run[index - 1].position.x : prefab.position.y - run[index - 1].position.y) <= 1.75), `${zone.zoneId} ${side} fence has a visual gap`);
        assert.ok(run.every(prefab => prefab.rotationDegrees === 0), `${zone.zoneId} fence pieces follow the isometric source art orientation`);
        assert.ok(run.every(prefab => Boolean(prefab.flipX) === (side === 'west' || side === 'east')), `${zone.zoneId} ${side} fence uses the matching isometric edge direction`);
      }
    }
    const blocking = candidate.prefabs.filter(prefab => prefab.blocking !== false);
    for (let first = 0; first < blocking.length; first++) for (let second = first + 1; second < blocking.length; second++) {
      const a = blocking[first], b = blocking[second];
      const overlap = a.position.x < b.position.x + b.footprint.columns
        && a.position.x + a.footprint.columns > b.position.x
        && a.position.y < b.position.y + b.footprint.rows
        && a.position.y + a.footprint.rows > b.position.y;
      assert.equal(overlap, false, `${candidate.sceneId}: ${a.prefabId} overlaps ${b.prefabId}`);
    }
  }
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

test('sprite culling keeps partial edge intersections and rejects off-screen bounds', () => {
  assert.equal(intersectsViewport({left: -20, top: 20, right: 15, bottom: 60}, 100, 80), true);
  assert.equal(intersectsViewport({left: -40, top: 20, right: -1, bottom: 60}, 100, 80), false);
  assert.equal(intersectsViewport({left: 105, top: 20, right: 150, bottom: 60}, 100, 80), false);
});

test('distance LOD reduces far draw units while preserving every stable animal ID', () => {
  const animals = [
    {id: 'animal-1', animalId: 1, x: 0, y: 0, depth: 0, screenX: 50, screenY: 50, lod: visualLod(40)},
    {id: 'animal-2', animalId: 2, x: 1, y: 1, depth: 1, screenX: 400, screenY: 300, lod: visualLod(140)},
    {id: 'animal-3', animalId: 3, x: 2, y: 2, depth: 2, screenX: 410, screenY: 305, lod: visualLod(300)},
    {id: 'animal-4', animalId: 4, x: 3, y: 3, depth: 3, screenX: 420, screenY: 310, lod: visualLod(320)},
  ];
  const result = clusterFarAnimals(animals, 48, 36);
  assert.deepEqual(result.individual.map(item => item.animalId), [1, 2]);
  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].count, 2);
  assert.deepEqual(result.clusters[0].animalIds, [3, 4]);
  assert.deepEqual([...result.individual.map(item => item.animalId), ...result.clusters.flatMap(item => item.animalIds)].sort((a, b) => a - b), [1, 2, 3, 4]);
  assert.equal(visualLod(100), 'near'); assert.equal(visualLod(101), 'medium'); assert.equal(visualLod(221), 'far');
});

test('prefab snapping rejects out-of-bounds and overlapping blocking footprints', () => {
  const home = scene.prefabs[0];
  assert.equal(placementFits(home, {x: 0, y: 3}, 14, 10, scene.prefabs), true);
  assert.equal(placementFits(home, {x: 1, y: 6}, 14, 10, scene.prefabs), false, 'pond overlaps the home');
  assert.equal(placementFits(home, {x: 13, y: 9}, 14, 10, []), false);
});

test('quarter-turn rotation swaps prefab footprint for bounds, collision, zones and adjacency', () => {
  const rotated = {assetId: 'handling-review-atlas-v1', footprint: {columns: 3, rows: 1}, rotationSteps: 1, blocking: true,
    placementRules: {allowedZoneKinds: ['handling'], adjacentTo: ['dairy-barn']}};
  const neighbor = {assetId: 'dairy-barn', position: {x: 5, y: 5}, footprint: {columns: 1, rows: 3}, blocking: true};
  const handling = {kind: 'handling', origin: {x: 4, y: 4}, footprint: {columns: 1, rows: 4}};
  assert.deepEqual(placementValidation(rotated, {x: 4, y: 5}, 14, 10, [neighbor], [handling]), {valid: true, reason: null});
  assert.deepEqual(placementValidation({...rotated, placementRules: {}}, {x: 13, y: 7}, 14, 10), {valid: true, reason: null}, 'the rotated 1×3 footprint fits the map edge');
  assert.equal(placementValidation({...rotated, rotationSteps: 0}, {x: 13, y: 7}, 14, 10).reason, 'out-of-bounds');
  assert.equal(rotatePrefab(rotated).rotationSteps, 2);
  assert.equal(rotatePrefab({...rotated, rotationDegrees: 270}).rotationDegrees, 0);
});

test('placement rules enforce allowed zones, adjacency and alignment; composition stamps an atomic aligned service line', () => {
  const barn = {prefabId: 'barn-1', assetId: 'dairy-barn', position: {x: 0, y: 0}, footprint: {columns: 3, rows: 2}, blocking: true};
  const parlor = {assetId: 'dairy-milking-parlor', footprint: {columns: 3, rows: 2}, blocking: true, placementRules: {adjacentTo: ['dairy-barn'], alignment: {axis: 'row', value: 0}}};
  assert.deepEqual(placementValidation(parlor, {x: 3, y: 0}, 14, 10, [barn]), {valid: true, reason: null});
  assert.equal(placementValidation(parlor, {x: 4, y: 0}, 14, 10, [barn]).reason, 'adjacency');
  assert.equal(placementValidation(parlor, {x: 3, y: 1}, 14, 10, [barn]).reason, 'alignment');
  assert.equal(placementValidation({...parlor, placementRules: {allowedZoneKinds: ['handling']}}, {x: 3, y: 0}, 14, 10, [barn], [{kind: 'pasture', origin: {x: 0, y: 0}, footprint: {columns: 8, rows: 4}}]).reason, 'zone');
  const recipe = [
    {...barn, offset: {x: 0, y: 0}},
    {assetId: 'dairy-milking-parlor', footprint: {columns: 3, rows: 2}, blocking: true, placementRules: {adjacentTo: ['dairy-barn']}, offset: {x: 3, y: 0}},
    {assetId: 'dairy-milk-chilling-tank', footprint: {columns: 2, rows: 1}, blocking: true, placementRules: {adjacentTo: ['dairy-milking-parlor']}, offset: {x: 6, y: 0}}
  ];
  const placed = composePrefabs(recipe, {x: 0, y: 0}, 14, 10);
  assert.equal(placed.valid, true); assert.equal(placed.prefabs.length, 3);
  assert.equal(composePrefabs(recipe, {x: 5, y: 9}, 14, 10).reason, 'out-of-bounds');
});

test('prefab distribution is deterministic, stays inside the pasture, and avoids overlaps', () => {
  const template = {assetId: 'shade-tree', footprint: {columns: 1, rows: 1}, layer: 'infrastructure', state: {stateId: 'default'}, blocking: true};
  const paddock = scene.zones.find(zone => zone.kind === 'pasture');
  const first = distributePrefab(template, paddock, 14, 10, scene.prefabs, 3, scene.simulation.seed);
  const second = distributePrefab(template, paddock, 14, 10, scene.prefabs, 3, scene.simulation.seed);
  assert.ok(first.length > 0);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, distributePrefab(template, paddock, 14, 10, scene.prefabs, 3, scene.simulation.seed + 1));
  assert.ok(first.some(prefab => prefab.position.x % 1 !== 0 || prefab.position.y % 1 !== 0), 'seeded placement should not form a fixed integer grid');
  for (const prefab of first) {
    assert.ok(prefab.position.x > paddock.origin.x);
    assert.ok(prefab.position.y > paddock.origin.y);
    assert.equal(placementFits(prefab, prefab.position, 14, 10, [...scene.prefabs, ...first.filter(item => item !== prefab)]), true);
  }
});

test('zone ground selection exposes terrain transition cells for auto-tiling', () => {
  const cells = terrainCells(scene), north = cells.filter(cell => cell.zoneId === 'north-paddock');
  assert.equal(cells.length, scene.projection.columns * scene.projection.rows);
  assert.ok(north.some(cell => cell.assetId === 'grass-mid'), 'edge mask resolves the declared transition asset');
  assert.ok(north.some(cell => cell.assetId === 'grass-light'), 'interior keeps the zone ground asset');
  assert.ok(cells.some(cell => cell.zoneId === null && cell.transitionZoneId === 'north-paddock' && cell.assetId === 'grass-mid'), 'terrain transition extends one cell beyond the zone boundary');
  assert.ok(cells.some(cell => cell.zoneId === 'handling-yard' && cell.assetId === 'soil-dry'));
});

test('the Graphics Lab serves both editable schema-valid scenes and dairy source art with provenance', async t => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/graphics-poc/index.html', '/graphics-poc/scene.json', '/graphics-poc/scenes/dairy.json', '/schemas/visual-scene.schema.json']) {
    const response = await fetch(origin + path); assert.equal(response.status, 200, path);
  }
  assert.match(await (await fetch(origin + '/graphics-poc/index.html')).text(), /id="rotate-selection"/, 'the composer exposes a selected-prefab rotation action');
  const image = await fetch(origin + '/graphics-poc/assets/nelore-adult-idle-v1.png');
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
  const digest = createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex');
  assert.equal(digest, '975ed9aa2891ddd4991c19e50def5f55ad99466a8a2d3213d0d99d25c1d3ec43');
  for (const file of ['dairy/dairy-holstein-cow.png', 'dairy/dairy-girolando-cow.png', 'dairy/dairy-heifer.png', 'dairy/dairy-heifer-calf.png', 'dairy/dairy-barn.png', 'dairy/dairy-milking-parlor.png', 'dairy/dairy-milk-chilling-tank.png', 'dairy/dairy-waiting-pen.png', 'dairy/dairy-activity-collar.png', 'handling-review-atlas-v1.png']) {
    const response = await fetch(`${origin}/graphics-poc/assets/${file}`);
    assert.equal(response.status, 200, file); assert.equal(response.headers.get('content-type'), 'image/png', file);
  }
  const provenance = JSON.parse(await readFile(new URL('../graphics-poc/asset-sources.json', import.meta.url), 'utf8'));
  assert.equal(provenance.sourceRevision.commit, '2a360cd60bfd3f98d598e12ad5774f5ff4bb8fb7');
  assert.ok(provenance.assetSources.every(item => !('sourceWorktree' in item)), 'asset provenance must not depend on a temporary worktree name');
  const dairySources = provenance.assetSources.filter(item => item.assetId.startsWith('dairy-'));
  assert.equal(dairySources.length, 9);
  assert.ok(dairySources.every(item => item.status === 'REVIEW' && /^[a-f0-9]{64}$/.test(item.sha256)));
  assert.ok(dairySources.every(item => item.sourceManifest === 'public/assets/modules/livestock-dairy/manifest.json'
    && item.sourceManifestStatus === 'candidate-integration'
    && item.sourceReview?.art === 'pending' && item.sourceReview?.technical === 'pass'));
  for (const item of [...dairySources, provenance.assetSources.find(source => source.assetId === 'handling-review-atlas-v1')]) {
    const bytes = await readFile(new URL(`../graphics-poc/${item.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.assetId);
  }
  assert.equal((await fetch(origin + '/graphics-poc/app.js')).status, 404, 'source modules remain outside the static allowlist');
});
