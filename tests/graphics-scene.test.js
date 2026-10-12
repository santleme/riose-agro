import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import {createServer} from '../server.js';
import {normalizeSceneAssetReferences, sceneAssetReference} from '../graphics-poc/asset-contract.js';
import {adaptMainComposerScene} from '../graphics-poc/main-composer-adapter.js';
import {clusterFarAnimals, composePrefabs, distanceToViewportCenter, distributePrefab, farmPositionToGrid, intersectsViewport, placementFits, placementValidation, projectIso, rotatePrefab, simulationPositionToScene, sortTerrainCellsBackToFront, terrainCells, toolAvailableInSystem, unprojectIso, visualLod, visualUpdateInterval} from '../graphics-poc/contract.js';

const scene = JSON.parse(await readFile(new URL('../graphics-poc/scene.json', import.meta.url), 'utf8'));
const dairyScene = JSON.parse(await readFile(new URL('../graphics-poc/scenes/dairy.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../schemas/visual-scene.schema.json', import.meta.url), 'utf8'));
const renderManifest = JSON.parse(await readFile(new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url), 'utf8'));
const assetSourceManifest = JSON.parse(await readFile(new URL('../graphics-poc/asset-sources.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({allErrors: true, strict: true, strictRequired: false}).compile(schema);

test('shared Composer tools remain available in both production-system scenes', () => {
  assert.equal(toolAvailableInSystem('both', 'beef'), true);
  assert.equal(toolAvailableInSystem('both', 'dairy'), true);
  assert.equal(toolAvailableInSystem('beef', 'dairy'), false);
  assert.equal(toolAvailableInSystem('dairy', 'beef'), false);
});

test('screen-space LOD distance is measured from the viewport center, not camera translation', () => {
  assert.equal(distanceToViewportCenter(367.5, 189, 735, 378), 0);
  assert.equal(distanceToViewportCenter(0, 0, 735, 378), Math.hypot(367.5, 189));
});

test('renderer-independent scene schema supports beef and in-progress dairy scenarios', () => {
  assert.equal(validate(scene), true, JSON.stringify(validate.errors));
  assert.equal(validate(dairyScene), true, JSON.stringify(validate.errors));
  for (const candidate of [scene, dairyScene]) {
    const declaredAssets = new Set(candidate.assets.map(asset => asset.assetId));
    for (const prefab of candidate.prefabs) assert.ok(declaredAssets.has(prefab.assetId), `${candidate.sceneId} missing ${prefab.assetId}`);
    for (const entity of candidate.entities) if (entity.asset) assert.ok(declaredAssets.has(entity.asset.assetId), `${candidate.sceneId} missing ${entity.asset.assetId}`);
  }
  for (const candidate of [scene, dairyScene]) {
    assert.equal(candidate.projection.columns, 36);
    assert.equal(candidate.projection.rows, 24);
    assert.equal(candidate.terrainTiles.length, 36 * 24);
    assert.equal(candidate.provenance.sourceId, 'scenario-composer-v1');
    assert.match(candidate.provenance.sourceCommit, /^[a-f0-9]{40}$/);
    assert.equal(candidate.assets.every(asset => ['APPROVED', 'REVIEW', 'UNRESOLVED'].includes(asset.reviewStatus)), true);
  }
  assert.equal(scene.prefabs.length, 219);
  assert.equal(scene.entities.filter(entity => entity.kind === 'animal').length, 0, 'the Worker provides operational beef animals without visual duplicates');
  assert.equal(dairyScene.prefabs.length, 227);
  assert.equal(dairyScene.simulation.productionSystem, 'dairy');
  assert.equal(dairyScene.domainModule.status, 'in-progress');
  assert.equal(dairyScene.entities.filter(entity => entity.kind === 'animal').length, 14);
  assert.equal(dairyScene.visualGroups.reduce((sum, group) => sum + group.population, 0), 200);
  assert.ok(dairyScene.entities.some(entity => entity.representationMode === 'sampled-miniature'));
  assert.ok(dairyScene.entities.some(entity => entity.representationMode === 'operational'));
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

test('Composer farm layouts preserve zones and keep blocking structures collision-free', () => {
  for (const candidate of [scene, dairyScene]) {
    const pastureZones = candidate.zones.filter(zone => zone.kind === 'pasture');
    assert.ok(pastureZones.length >= 2);
    for (const zone of pastureZones) {
      assert.ok(candidate.terrainTiles.some(tile => tile.zoneId === zone.zoneId), `${zone.zoneId} retains source terrain assignment`);
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

test('simulation coordinates map into Composer pastures and the service zone without changing the engine model', () => {
  const north = scene.zones.filter(zone => zone.kind === 'pasture').sort((a, b) => a.origin.y - b.origin.y)[0];
  const south = scene.zones.filter(zone => zone.kind === 'pasture').sort((a, b) => a.origin.y - b.origin.y)[1];
  const service = scene.zones.find(zone => zone.kind === 'service');
  assert.deepEqual(simulationPositionToScene(35, 45, scene), {column: north.origin.x, row: north.origin.y});
  assert.deepEqual(simulationPositionToScene(335, 180, scene), {column: south.origin.x + south.footprint.columns - 1, row: south.origin.y});
  assert.deepEqual(simulationPositionToScene(392, 186, scene, 'barn'), {column: service.origin.x, row: service.origin.y});
  assert.deepEqual(simulationPositionToScene(10000, 10000, scene), {column: north.origin.x + north.footprint.columns - 1, row: south.origin.y + south.footprint.rows - 1});
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

test('visual update cadence slows smoothly with distance and caps at the far LOD boundary', () => {
  const samples = [0, 50, 100, 130, 160, 190, 220].map(distance => visualUpdateInterval(distance));
  assert.equal(samples[0], 1000 / 60);
  assert.ok(samples.every((value, index) => index === 0 || value >= samples[index - 1]));
  assert.ok(samples[3] > samples[2] && samples[3] < samples.at(-1));
  assert.equal(samples.at(-1), 120);
  assert.equal(visualUpdateInterval(Number.NaN), 120);
  assert.equal(visualLod(40, 28, 61.6), 'medium', 'map-fit zoom tightens the near-detail threshold');
  assert.equal(visualLod(80, 28, 61.6), 'far', 'map-fit zoom groups animals outside the readable detail range');
  assert.equal(visualUpdateInterval(80, 28, 61.6), 120, 'far visual motion uses the capped update cadence');
});

test('prefab snapping rejects out-of-bounds and overlapping blocking footprints', () => {
  const home = {prefabId: 'home', assetId: 'farmhouse', position: {x: 0, y: 0}, footprint: {columns: 2, rows: 2}, blocking: true};
  const pond = {prefabId: 'pond', assetId: 'pond', position: {x: 4, y: 4}, footprint: {columns: 3, rows: 2}, blocking: true};
  assert.equal(placementFits(home, {x: 0, y: 3}, 14, 10, [pond]), true);
  assert.equal(placementFits(home, {x: 4, y: 4}, 14, 10, [pond]), false, 'placement overlaps existing footprint');
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
  const {columns, rows} = scene.projection;
  const first = distributePrefab(template, paddock, columns, rows, scene.prefabs, 3, scene.simulation.seed);
  const second = distributePrefab(template, paddock, columns, rows, scene.prefabs, 3, scene.simulation.seed);
  assert.ok(first.length > 0);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, distributePrefab(template, paddock, columns, rows, scene.prefabs, 3, scene.simulation.seed + 1));
  assert.ok(first.some(prefab => prefab.position.x % 1 !== 0 || prefab.position.y % 1 !== 0), 'seeded placement should not form a fixed integer grid');
  const nearestDistances = first.map(prefab => Math.min(...first.filter(other => other !== prefab).map(other => Math.hypot(prefab.position.x - other.position.x, prefab.position.y - other.position.y))));
  const meanNearestDistance = nearestDistances.reduce((sum, distance) => sum + distance, 0) / nearestDistances.length;
  const nearestDistanceCv = Math.sqrt(nearestDistances.reduce((sum, distance) => sum + (distance - meanNearestDistance) ** 2, 0) / nearestDistances.length) / meanNearestDistance;
  assert.ok(nearestDistanceCv > .2, `seeded clustering should avoid near-uniform spacing; observed CV ${nearestDistanceCv.toFixed(2)}`);
  assert.ok(Math.min(...nearestDistances) >= 1.25, 'clustered trees still keep a minimum separation');
  for (const prefab of first) {
    assert.ok(prefab.position.x > paddock.origin.x);
    assert.ok(prefab.position.y > paddock.origin.y);
    assert.equal(placementFits(prefab, prefab.position, columns, rows, [...scene.prefabs, ...first.filter(item => item !== prefab)]), true);
  }
});

test('zone ground selection exposes terrain transition cells for auto-tiling', () => {
  const cells = terrainCells(scene);
  assert.equal(cells.length, scene.projection.columns * scene.projection.rows);
  assert.deepEqual(cells.map(cell => cell.assetId), scene.terrainTiles.map(tile => tile.assetId), 'imported tile atlas IDs stay in source order');
  assert.ok(cells.some(cell => cell.zoneId && cell.assetId !== 'grass-light'), 'Composer terrain preserves distinct ground surfaces');
});

test('terrain render order follows isometric depth and preserves authored source order', () => {
  const sourceOrder = terrainCells(scene), sorted = sortTerrainCellsBackToFront(sourceOrder, scene.projection.cellWidth, scene.projection.cellHeight);
  assert.deepEqual(sourceOrder.map(cell => [cell.column, cell.row]), scene.terrainTiles.map(tile => [tile.position.x, tile.position.y]), 'sorting must not mutate Composer-authored tile order');
  assert.deepEqual(sorted.map(cell => `${cell.column},${cell.row}`), [...sourceOrder]
    .sort((a, b) => a.column + a.row - b.column - b.row || a.column - a.row - b.column + b.row)
    .map(cell => `${cell.column},${cell.row}`));
  assert.notDeepEqual(sorted.map(cell => `${cell.column},${cell.row}`), sourceOrder.map(cell => `${cell.column},${cell.row}`), 'row-major source order is not the isometric painter order');
  assert.equal(new Set(sorted.map(cell => `${cell.column},${cell.row}`)).size, scene.projection.columns * scene.projection.rows);
});

test('checked-in beef and dairy scenes are reproducible adaptations of pinned Composer exports', async () => {
  const [beefSource, dairySource] = await Promise.all(['beef', 'dairy'].map(name => readFile(new URL(`../graphics-poc/source/main-composer-v1/${name}.json`, import.meta.url), 'utf8').then(JSON.parse)));
  assert.deepEqual(adaptMainComposerScene(beefSource, renderManifest), scene);
  assert.deepEqual(adaptMainComposerScene(dairySource, renderManifest), dairyScene);
});

test('scene edits resolve canonical asset references and preserve review status in the shared manifest contract', () => {
  const scene = structuredClone(dairyScene);
  scene.entities.push({entityId: 'heifer-tool-test', kind: 'animal', position: {x: 24.5, y: 8.5, unit: 'grid-cell'}, asset: sceneAssetReference('dairy-heifer', renderManifest, assetSourceManifest), state: {stateId: 'idle'}, representationMode: 'sampled-miniature'});
  scene.prefabs.push(
    {prefabId: 'headquarters-tool-test', assetId: 'farmhouse', position: {x: 0, y: 0, unit: 'grid-cell'}, footprint: {columns: 1, rows: 1}, layer: 'infrastructure', state: {stateId: 'default'}, blocking: true},
    {prefabId: 'fruit-tree-legacy', assetId: 'fruit-tree', position: {x: 1, y: 0, unit: 'grid-cell'}, footprint: {columns: 1, rows: 1}, layer: 'infrastructure', state: {stateId: 'default'}, blocking: false},
  );
  normalizeSceneAssetReferences(scene, renderManifest, assetSourceManifest);
  assert.equal(validate(scene), true, JSON.stringify(validate.errors));
  const editedHeifer = scene.entities.find(entity => entity.entityId === 'heifer-tool-test');
  assert.equal(scene.prefabs.find(prefab => prefab.prefabId === 'headquarters-tool-test')?.assetId, 'building-farmhouse-imagegen-v1', 'legacy tool IDs resolve to current semantic Composer IDs');
  assert.equal(scene.assets.find(asset => asset.assetId === 'fruit-tree')?.reviewStatus, 'UNRESOLVED', 'unmapped legacy art stays explicitly unresolved');
  assert.equal(editedHeifer.asset.manifestUri, '/graphics-poc/asset-sources.json');
  assert.equal(editedHeifer.asset.manifestVersion, assetSourceManifest.sourceRevision.commit);
  assert.equal(editedHeifer.asset.reviewStatus, 'REVIEW');
  assert.ok(scene.assets.some(asset => asset.assetId === 'building-farmhouse-imagegen-v1'));
  assert.ok(scene.assets.some(asset => asset.assetId === 'dairy-heifer' && asset.reviewStatus === 'REVIEW'));
  assert.ok(scene.assets.every(asset => !asset.manifestUri.startsWith('parallel:')));
});

test('composer palette exposes corral and technology prefabs through the shared scene schema', async () => {
  const index = await readFile(new URL('../graphics-poc/index.html', import.meta.url), 'utf8');
  const scene = structuredClone(dairyScene);
  const assetIds = [
    'corral-wood-standard-imagegen-v1',
    'technology-scale-electronic-full-imagegen-v1',
    'technology-gateway-antenna-imagegen-v1',
    'technology-traceability-system-imagegen-v1',
  ];

  for (const assetId of assetIds) {
    const metadata = renderManifest.assets.find(asset => asset.assetId === assetId);
    assert.ok(metadata, `${assetId} is declared by the renderer manifest`);
    assert.match(index, new RegExp(`data-tool="${assetId}"`), `${assetId} is available from the Composer palette`);
    if (metadata.category === 'technology') assert.match(index, new RegExp(`data-tool="${assetId}" data-system="both"`));
    scene.prefabs.push({
      prefabId: `palette-${assetId}`,
      assetId,
      position: {x: 2, y: 2, unit: 'grid-cell'},
      footprint: {columns: metadata.footprint[0], rows: metadata.footprint[1]},
      layer: 'infrastructure',
      state: {stateId: 'default'},
      blocking: metadata.blocking,
    });
  }

  normalizeSceneAssetReferences(scene, renderManifest, assetSourceManifest);
  assert.equal(validate(scene), true, JSON.stringify(validate.errors));
  assert.ok(assetIds.every(assetId => scene.assets.some(asset => asset.assetId === assetId)));
});

test('the Graphics Lab serves both editable schema-valid scenes and dairy source art with provenance', async t => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/graphics-poc/index.html', '/graphics-poc/scene.json', '/graphics-poc/scenes/dairy.json', '/graphics-poc/assets/main-composer-render-manifest.json', '/schemas/visual-scene.schema.json']) {
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
  for (const [atlasKey, url] of Object.entries(renderManifest.atlases)) {
    const file = url.replace('/graphics-poc/assets/', ''), response = await fetch(`${origin}${url}`);
    assert.equal(response.status, 200, file); assert.equal(response.headers.get('content-type'), 'image/png', file);
    const digest = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    assert.equal(digest, renderManifest.atlasSha256[atlasKey], `${atlasKey} atlas matches its pinned SHA-256`);
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
