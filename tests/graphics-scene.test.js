import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import {createServer} from '../src/server/server.js';
import {normalizeSceneAssetReferences, sceneAssetReference} from '../graphics-poc/asset-contract.js';
import {adaptMainComposerScene} from '../graphics-poc/main-composer-adapter.js';
import {adaptComposerDocument} from '../graphics-poc/scene-adapter-v1.js';
import {assembleFarmMacrostructure, occupiedWorldCells} from '../graphics-poc/assembly-specs-v6.js';
import {buildFenceLoop, buildModularCorralPrefab, compileFenceNetwork, compileRoadNetwork, socketsConnect, solveMacroPlacement} from '../graphics-poc/spatial-assembly-v6.js';
import {enrichRendererManifest} from '../scripts/assets/runtime-asset-provenance.mjs';
import {buildAssetRegistry, validateAssetRegistry} from '../graphics-poc/asset-registry.js';
import {createWaterStressVisualVariant} from '../graphics-poc/visual-scenario-variants.js';
import {assertSceneCommandAllowed, sceneExecutionAvailability} from '../graphics-poc/execution-eligibility.js';
import {clusterFarAnimals, composePrefabs, distanceToViewportCenter, distributePrefab, farmPositionToGrid, intersectsViewport, paintZoneTerrainTiles, placementFits, placementValidation, projectIso, rotatePrefab, simulationPositionToScene, sortTerrainCellsBackToFront, terrainCells, toolAvailableInSystem, unprojectIso, visualLod, visualUpdateInterval, zoneGridCorners} from '../graphics-poc/contract.js';

const scene = JSON.parse(await readFile(new URL('../graphics-poc/scene.json', import.meta.url), 'utf8'));
const dairyScene = JSON.parse(await readFile(new URL('../graphics-poc/scenes/dairy.json', import.meta.url), 'utf8'));
const waterStressScene = JSON.parse(await readFile(new URL('../graphics-poc/scenes/water-stress-visual.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../schemas/visual-scene.schema.json', import.meta.url), 'utf8'));
const renderManifest = JSON.parse(await readFile(new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url), 'utf8'));
const assetSourceManifest = JSON.parse(await readFile(new URL('../graphics-poc/asset-sources.json', import.meta.url), 'utf8'));
const assetRegistry = JSON.parse(await readFile(new URL('../graphics-poc/asset-registry.json', import.meta.url), 'utf8'));
const compiledAssetGeometry = JSON.parse(await readFile(new URL('../graphics-poc/asset-geometry-v1.json', import.meta.url), 'utf8'));
const macroProposalManifest = JSON.parse(await readFile(new URL('../graphics-poc/generated/terrain-v5/composition-proposals/proposals.json', import.meta.url), 'utf8'));
const macroProposalSelection = JSON.parse(await readFile(new URL('../graphics-poc/generated/terrain-v5/composition-proposals/selection.json', import.meta.url), 'utf8'));
const terrainMaterialManifest = JSON.parse(await readFile(new URL('../graphics-poc/generated/terrain-v5/proposals.json', import.meta.url), 'utf8'));
const spatialV6TiledMap = JSON.parse(await readFile(new URL('../graphics-poc/generated/spatial-v6-beef-84018.tmj', import.meta.url), 'utf8'));
const validate = new Ajv2020({allErrors: true, strict: true, strictRequired: false}).compile(schema);

test('shared Composer tools remain available in both production-system scenes', () => {
  assert.equal(toolAvailableInSystem('both', 'beef'), true);
  assert.equal(toolAvailableInSystem('both', 'dairy'), true);
  assert.equal(toolAvailableInSystem('beef', 'dairy'), false);
  assert.equal(toolAvailableInSystem('dairy', 'beef'), false);
});

test('asset registry is reproducible and provides spatial metadata for every render-manifest sprite', () => {
  assert.deepEqual(validateAssetRegistry(assetRegistry), []);
  assert.deepEqual(assetRegistry, buildAssetRegistry(renderManifest, assetSourceManifest));
  const byId = new Map(assetRegistry.assets.map(asset => [asset.assetId, asset]));
  assert.equal(byId.size, renderManifest.assets.length);
  for (const candidate of [scene, dairyScene]) {
    for (const prefab of candidate.prefabs) {
      const asset = byId.get(prefab.assetId);
      assert.ok(asset, `${prefab.prefabId} references a registered asset`);
      assert.ok(asset.footprintCells.columns > 0 && asset.footprintCells.rows > 0);
      assert.ok(Number.isFinite(asset.pivot.x) && Number.isFinite(asset.pivot.y));
    }
  }
  assert.ok(assetRegistry.assets.some(asset => asset.reviewStatus === 'UNRESOLVED'));
  assert.ok(assetRegistry.assets.every(asset => asset.animations.length === 0), 'the registry does not invent animation clips absent from source manifests');
});

test('asset geometry compiler measures source alpha and flags uncertain physical dimensions for review', () => {
  assert.equal(compiledAssetGeometry.schemaVersion, '1.0.0');
  assert.equal(Object.keys(compiledAssetGeometry.assets).length, renderManifest.assets.length);
  for (const asset of assetRegistry.assets) {
    const geometry = asset.spatialGeometry;
    assert.equal(geometry.units, 'world-cell', `${asset.assetId} uses the shared world unit`);
    assert.ok(geometry.visualBoundingBoxPx?.width > 0 && geometry.visualBoundingBoxPx?.height > 0, `${asset.assetId} has measured alpha bounds`);
    assert.ok(geometry.collisionPolygonCandidate.length >= 3, `${asset.assetId} has a ground-contact candidate polygon`);
    if (geometry.geometryStatus === 'inferred-review-required') assert.equal(geometry.reviewRequired, true, `${asset.assetId} does not claim physical certainty from pixels alone`);
    else assert.equal(geometry.geometryStatus, 'annotated', `${asset.assetId} uses an explicit tilemap geometry contract`);
  }
  const farmhouse = assetRegistry.assets.find(asset => asset.assetId === 'building-farmhouse-imagegen-v1');
  assert.notDeepEqual(farmhouse.spatialGeometry.groundFootprintCandidate, {columns: 1, rows: 1}, 'the rendered building no longer inherits its one-cell image tag as physical geometry');
  assert.ok(farmhouse.spatialGeometry.supportRegionFootprintCandidate.columns > farmhouse.spatialGeometry.groundFootprintCandidate.columns,
    'the broad support silhouette is kept separately from the narrow contact trace');
  assert.equal(farmhouse.spatialGeometry.evidence.supportRegionIsPhysicalFootprintProof, false,
    'alpha support evidence is not silently promoted to a confirmed physical footprint');
  assert.equal(farmhouse.spatialGeometry.evidence.collisionCandidateIsPhysicalFootprintProof, false,
    'an unannotated alpha trace is not reported as a physical collision proof');
  assert.ok(farmhouse.spatialGeometry.supportRegionPolygonCandidate.length >= 3,
    'the browser annotator has broad support geometry available for visual comparison');
});

test('placement solver uses compiled collision polygons and rejects missing spatial geometry', () => {
  const triangleA = {prefabId: 'triangle-a', footprint: {columns: 2, rows: 2}, blocking: true,
    spatialGeometry: {units: 'world-cell', collisionPolygon: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 0, y: 2}]}};
  const triangleB = {prefabId: 'triangle-b', position: {x: 1, y: 1}, footprint: {columns: 2, rows: 2}, blocking: true,
    spatialGeometry: {units: 'world-cell', collisionPolygon: [{x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0}]}};
  assert.equal(placementValidation(triangleA, {x: 1, y: 1}, 8, 8, [triangleB]).valid, true, 'touching diagonal boundaries do not count as physical overlap');
  assert.equal(placementValidation(triangleA, {x: 1, y: 1}, 8, 8, [{...triangleB, position: {x: 0.5, y: 1}}]).reason, 'collision');
  assert.equal(placementValidation({prefabId: 'unknown'}, {x: 1, y: 1}, 8, 8).reason, 'geometry-missing');
});

test('V6 assembly is seeded, connects macro destinations, composes a closed boundary and supports dairy grammar', () => {
  const first = assembleFarmMacrostructure({system: 'beef', seed: 84201});
  const same = assembleFarmMacrostructure({system: 'beef', seed: 84201});
  const other = assembleFarmMacrostructure({system: 'beef', seed: 84202});
  const dairy = assembleFarmMacrostructure({system: 'dairy', seed: 84201});
  assert.deepEqual(first, same, 'the same seed serializes identically');
  assert.notDeepEqual(first.placements.map(item => item.position), other.placements.map(item => item.position), 'seed changes macro placements');
  assert.ok(first.roadPaths.length >= 3 && first.roadPaths.every(path => path.cells.length >= 2));
  assert.equal(first.roadNetwork.valid, true, 'A* routes compile into one socket-checked topological graph');
  assert.equal(first.roadNetwork.connectedComponentCount, 1);
  assert.ok(first.roadNetwork.modules.some(module => module.kind === 't-junction' || module.kind === 'x-junction'));
  assert.ok(first.roadNetwork.edges.every(edge => edge.connected && edge.render.assetId === null), 'topology is ready for rendering without promoting unreviewed road art');
  assert.ok(first.fence.length > 4 && first.fence.every(edge => edge.connected), 'the property boundary is assembled from connected fence modules');
  assert.equal(first.fence.filter(edge => edge.piece === 'gate').length, 1);
  assert.ok(first.paddocks.length >= 2 && first.paddocks.every(paddock => paddock.fence.closed && paddock.fence.gateCount === 1
    && paddock.fence.segments.every(segment => segment.connected) && paddock.connections.every(connection => connection.connected)),
  'paddocks compile into closed fence loops with one connected entrance each');
  assert.equal(first.corralPrefab.valid, true);
  assert.equal(first.corralPrefab.sourcePlacementId, 'handling-yard');
  assert.equal(first.fenceNetwork.valid, true);
  assert.equal(first.fenceNetwork.segments.length, new Set(first.fenceNetwork.segments.map(segment => segment.networkSegmentId)).size);
  assert.ok(first.fenceNetwork.sharedSegments.length > 0, 'the generated paddock grammar contains shared fence boundaries');
  assert.ok(first.paddocks.some(paddock => paddock.neighbors.length > 0), 'paddock adjacency is explicit in the semantic graph');
  assert.ok(first.paddocks.every(paddock => paddock.neighbors.every(neighbor => first.paddocks.find(other => other.zoneId === neighbor)?.neighbors.includes(paddock.zoneId))), 'paddock adjacency is reciprocal');
  assert.ok(first.paddocks.every(paddock => !paddock.sharedEdgeIndexes.includes(paddock.gate.edgeIndex)), 'paddock gates stay off shared partitions');
  assert.ok(first.vegetation.length > 0 && first.vegetation.every(item => item.reviewRequired));
  assert.ok(dairy.placements.some(item => item.id === 'milking-parlor'));
  assert.ok(dairy.specification.structures.every(item => item.reviewRequired), 'the solver preserves asset geometry review state');
});

test('V6 occupancy grid excludes semantic non-blocking fixtures from path obstacles', () => {
  const cells = occupiedWorldCells([
    {id: 'shed', worldPolygon: [{x: 1, y: 1}, {x: 3, y: 1}, {x: 3, y: 3}, {x: 1, y: 3}]},
    {id: 'water-point', blocking: false, worldPolygon: [{x: 4, y: 1}, {x: 6, y: 1}, {x: 6, y: 3}, {x: 4, y: 3}]},
  ]);
  assert.ok(cells.some(cell => cell.x === 1 && cell.y === 1 && cell.ownerId === 'shed'));
  assert.equal(cells.some(cell => cell.ownerId === 'water-point'), false);
});

test('macro placement evaluates terrain slope across the full physical candidate footprint', () => {
  const result = solveMacroPlacement({terrain: {columns: 8, rows: 8, slopeAt: x => x > 2.5 ? 0.4 : 0}, structures: [
    {id: 'wide-building', assetId: 'wide-building', collisionPolygon: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}, {x: 0, y: 2}],
      zone: {left: 1, right: 6, top: 1, bottom: 6}, maxSlope: 0.12},
  ]}, {seed: 3, maxExpansions: 200});
  assert.equal(result.valid, false, 'no candidate footprint can overlap the steep terrain strip');
  assert.equal(result.reason, 'no-feasible-layout');
});

test('V6 connection sockets enforce reciprocal types, orientation and positional tolerance', () => {
  const road = {type: 'road', x: 4, y: 8, orientation: 0, tolerance: 0.1};
  assert.equal(socketsConnect(road, {type: 'driveway', x: 4.05, y: 8, orientation: 180, tolerance: 0.1}), true);
  assert.equal(socketsConnect(road, {type: 'driveway', x: 4.5, y: 8, orientation: 180, tolerance: 0.1}), false);
  assert.equal(socketsConnect(road, {type: 'fence', x: 4, y: 8, orientation: 180, tolerance: 0.1}), false);
});

test('V6 modular corral prefab has typed entrance sockets, nested functional regions and a connected fence loop', () => {
  const prefab = buildModularCorralPrefab({origin: {x: 10, y: 7}, width: 8, height: 5, gateEdge: 3});
  assert.equal(prefab.valid, true);
  assert.equal(prefab.unit, 'world-cell');
  assert.deepEqual(prefab.children.map(child => child.kind), ['livestock-pen', 'sorting-pen', 'handling-lane']);
  assert.equal(prefab.boundary.gateCount, 1);
  assert.equal(prefab.boundary.closed, true);
  assert.ok(prefab.interiorRails.length > 4 && prefab.interiorRails.every(rail => rail.connected));
  assert.ok(prefab.connections.length >= prefab.interiorRails.length);
  assert.ok(prefab.connections.every(connection => connection.connected), 'rail segments, boundary tie-ins, gate access and the T-junction use checked socket pairs');
  assert.deepEqual(new Set(prefab.connections.map(connection => connection.kind)), new Set(['continuous-rail', 'boundary-anchor', 'gate-to-alley', 'rail-junction']));
  assert.equal(prefab.junctions.length, 3);
  assert.ok(prefab.junctions.every(junction => junction.connections.length >= 1 && junction.connections.every(connection => connection.connected)));
  assert.equal(prefab.gateCenter.x, prefab.origin.x);
  assert.equal(prefab.gateCenter.y, prefab.origin.y + prefab.footprint.height / 2);
  assert.equal(prefab.renderModules.length, prefab.boundary.segments.length + prefab.interiorRails.length);
  assert.ok(prefab.renderModules.every(module => module.assetId && module.worldAnchor && module.enabledByDefault === false && module.arbitraryRotationApproved === false));
  assert.equal(socketsConnect(prefab.sockets[0], prefab.sockets[1]), true);
  assert.throws(() => buildModularCorralPrefab({width: 2, height: 2}), /requires width/);
  assert.throws(() => buildModularCorralPrefab({gateEdge: 0}), /west boundary/);
});

test('V6 fence network shares coincident paddock boundaries as one owner-tagged module set', () => {
  const west = buildFenceLoop([{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 3}, {x: 0, y: 3}]);
  const east = buildFenceLoop([{x: 4, y: 0}, {x: 8, y: 0}, {x: 8, y: 3}, {x: 4, y: 3}]);
  const network = compileFenceNetwork([{ownerId: 'west', segments: west.segments}, {ownerId: 'east', segments: east.segments}]);
  assert.equal(network.valid, true);
  assert.equal(network.sharedSegments.length, 3);
  assert.ok(network.sharedSegments.every(segment => segment.owners.includes('west') && segment.owners.includes('east')));
  assert.equal(network.segments.length, west.segments.length + east.segments.length - 3);
  assert.equal(network.owners.length, 2);
});

test('V6 road compiler deduplicates shared A* edges, classifies typed entrances and validates a T junction', () => {
  const routes = [
    {routeId: 'farm-yard', from: 'farm', to: 'yard', cells: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}]},
    {routeId: 'water-yard', from: 'water', to: 'yard', cells: [{x: 1, y: -1}, {x: 1, y: 0}, {x: 2, y: 0}]},
  ];
  const network = compileRoadNetwork(routes);
  assert.equal(network.valid, true);
  assert.equal(network.connectedComponentCount, 1);
  assert.equal(network.summary.uniqueEdgeCount, 3);
  assert.equal(network.summary.sharedEdgeCount, 1);
  assert.equal(network.nodes.find(node => node.position.x === 1 && node.position.y === 0).kind, 't-junction');
  assert.equal(network.nodes.find(node => node.position.x === 2 && node.position.y === 0).kind, 'entrance');
  assert.ok(network.nodes.every(node => node.connections.every(connection => connection.connected)));
  assert.ok(network.edges.every(edge => edge.connected && edge.owners.length >= 1));
  assert.deepEqual(network.edges.find(edge => edge.owners.length === 2).owners.map(owner => owner.routeId), ['farm-yard', 'water-yard']);
  assert.ok(network.modules.some(module => module.kind === 't-junction'));
  assert.ok(network.modules.every(module => module.render.enabledByDefault === false && module.render.assetId === null));
});

test('V6 road compiler is order-independent, detects X and turn modules, and rejects invalid or disconnected routes', () => {
  const horizontal = {routeId: 'east-west', from: 'west-gate', to: 'east-gate', fromKind: 'entrance', toKind: 'entrance',
    cells: [{x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}]};
  const vertical = {routeId: 'north-south', from: 'north-gate', to: 'south-gate', fromKind: 'entrance', toKind: 'entrance',
    cells: [{x: 0, y: -1}, {x: 0, y: 0}, {x: 0, y: 1}]};
  const first = compileRoadNetwork([horizontal, vertical]);
  const reordered = compileRoadNetwork([vertical, horizontal]);
  assert.equal(first.valid, true);
  assert.deepEqual(first, reordered);
  assert.equal(first.nodes.find(node => node.position.x === 0 && node.position.y === 0).kind, 'x-junction');
  const turn = compileRoadNetwork([{routeId: 'turn', cells: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}]}]);
  assert.equal(turn.valid, true);
  assert.equal(turn.nodes.find(node => node.position.x === 1 && node.position.y === 0).kind, 'turn');
  assert.equal(compileRoadNetwork([{routeId: 'bad-step', cells: [{x: 0, y: 0}, {x: 2, y: 2}]}]).valid, false);
  const disconnected = compileRoadNetwork([
    {routeId: 'one', cells: [{x: 0, y: 0}, {x: 1, y: 0}]},
    {routeId: 'two', cells: [{x: 5, y: 5}, {x: 6, y: 5}]},
  ]);
  assert.equal(disconnected.valid, false);
  assert.ok(disconnected.violations.some(violation => violation.type === 'disconnected-road-components'));
});

test('V6 CP-SAT scene export is a valid Tiled map with semantic route, fence, and asset layers', () => {
  assert.equal(spatialV6TiledMap.orientation, 'isometric');
  assert.deepEqual([spatialV6TiledMap.tilewidth, spatialV6TiledMap.tileheight], [96, 48]);
  const layers = Object.fromEntries(spatialV6TiledMap.layers.map(layer => [layer.name, layer]));
  assert.equal(layers['Macro structures'].objects.length, 5);
  assert.equal(layers.Vegetation.objects.length, 14);
  assert.ok(layers['Road graph'].objects.length >= 5);
  assert.ok(layers['Road modules'].objects.length > layers['Road graph'].objects.length);
  const roadModuleKinds = layers['Road modules'].objects.map(object => Object.fromEntries(object.properties.map(property => [property.name, property.value])));
  assert.ok(roadModuleKinds.some(module => module.moduleKind === 't-junction'));
  assert.ok(roadModuleKinds.every(module => module.artReviewStatus === 'UNASSIGNED' && module.renderAssetId === ''));
  assert.ok(layers['Fence network'].objects.length > 100);
  const properties = Object.fromEntries(spatialV6TiledMap.properties.map(property => [property.name, property.value]));
  assert.equal(properties.sceneSchemaVersion, 'riose-compiled-farm-scene-v6');
  assert.equal(properties.solverEngine, 'ortools-cp-sat');
  assert.equal(properties.solverStatus, 'OPTIMAL');
  assert.ok(JSON.parse(properties.fenceNetworkJSON).sharedSegments.length > 0);
  const roadNetwork = JSON.parse(properties.roadNetworkJSON);
  assert.equal(roadNetwork.valid, true);
  assert.ok(roadNetwork.modules.some(module => module.kind === 't-junction'));
});

test('three terrain-backed macro proposals compile to distinct Tiled scenes and the reviewed choice is the main build', async () => {
  assert.equal(macroProposalManifest.proposals.length, 3);
  assert.equal(macroProposalManifest.seed, 84018);
  assert.equal(macroProposalSelection.selectedProposal, 'proposal-homestead-hub');
  const coordinateSets = [];
  for (const proposal of macroProposalManifest.proposals) {
    const scene = JSON.parse(await readFile(new URL(`../${proposal.scene}`, import.meta.url), 'utf8'));
    const map = JSON.parse(await readFile(new URL(`../graphics-poc/generated/${proposal.map}.tmj`, import.meta.url), 'utf8'));
    const placements = map.layers.filter(layer => layer.type === 'objectgroup').flatMap(layer => layer.objects ?? []).filter(object => object.gid);
    assert.equal(scene.placements.length, 82, `${proposal.id} preserves the semantic block inventory`);
    assert.equal(placements.length, 82, `${proposal.id} compiles every object through Tiled`);
    assert.equal(map.orientation, 'isometric');
    assert.ok(map.layers.some(layer => layer.type === 'imagelayer' && layer.image === 'terrain-v5/homestead-high-ground.png'));
    coordinateSets.push(new Set(placements.map(object => `${object.x},${object.y}`)));
  }
  assert.ok(coordinateSets[0].size > 30);
  assert.ok(coordinateSets.some(set => [...set].some(point => !coordinateSets[0].has(point))), 'macro alternatives change spatial placement, not only the seed');
  const selectedScene = JSON.parse(await readFile(new URL(`../${macroProposalSelection.selectedScene}`, import.meta.url), 'utf8'));
  const mainMap = JSON.parse(await readFile(new URL('../graphics-poc/generated/ranch-v4.tmj', import.meta.url), 'utf8'));
  const mainSceneId = mainMap.properties.find(property => property.name === 'sceneId').value;
  assert.equal(mainSceneId, selectedScene.sceneId, 'the default Tiled build uses the visually reviewed composition');
});

test('terrain surface materials use seeded organic zones sourced from existing art assets', async () => {
  assert.equal(terrainMaterialManifest.seed, 84018);
  assert.equal(terrainMaterialManifest.generator, 'riose-terrain-heightfield-v2');
  assert.equal(terrainMaterialManifest.cliffMaterial, 'assets/candidates/terrain-family-v7/ranch-cliff-side-material-v1.png');
  assert.equal(terrainMaterialManifest.surfaceMaterialZones.length, 7);
  assert.deepEqual(new Set(terrainMaterialManifest.surfaceMaterialZones.map(zone => zone.material)), new Set(['dry-pasture', 'compacted-ground', 'muddy-ground']));
  for (const zone of terrainMaterialManifest.surfaceMaterialZones) {
    assert.equal(zone.transition, 'seeded-multiscale-organic-mask');
    assert.ok(zone.source.startsWith('assets/candidates/terrain-family-v2/'));
    assert.ok(Number.isFinite(zone.world[0]) && Number.isFinite(zone.world[1]));
    await readFile(new URL(`../${zone.source}`, import.meta.url));
  }
  const image = await readFile(new URL('../assets/candidates/terrain-family-v7/ranch-top-surface-material-v1.png', import.meta.url));
  assert.ok(image.byteLength > 500_000, 'the composed surface image is present as a renderer input');
  const cliff = await readFile(new URL(`../${terrainMaterialManifest.cliffMaterial}`, import.meta.url));
  assert.ok(cliff.byteLength > 500, 'the side material is extracted from the source plate for Blender UV mapping');
  const map = JSON.parse(await readFile(new URL('../graphics-poc/generated/ranch-v4.tmj', import.meta.url), 'utf8'));
  const properties = Object.fromEntries(map.properties.map(property => [property.name, property.value]));
  assert.equal(properties.surfaceMaterialGrammar, 'pasture-ground-grammar-v1');
  assert.deepEqual(JSON.parse(properties.surfaceMaterialZones), terrainMaterialManifest.surfaceMaterialZones, 'Tiled carries the same semantic material zones into Pixi');
});

test('all generated heightfields obey the slope constraint while retaining real elevation range', async () => {
  for (const proposal of ['homestead-high-ground', 'cross-ridge-saddle', 'pasture-terraces']) {
    const terrain = JSON.parse(await readFile(new URL(`../graphics-poc/generated/terrain-v5/${proposal}.json`, import.meta.url), 'utf8'));
    const rows = terrain.heightmap;
    let maxNeighborDelta = 0;
    for (let row = 0; row < rows.length; row++) for (let column = 0; column < rows[row].length; column++) {
      if (row + 1 < rows.length) maxNeighborDelta = Math.max(maxNeighborDelta, Math.abs(rows[row + 1][column] - rows[row][column]));
      if (column + 1 < rows[row].length) maxNeighborDelta = Math.max(maxNeighborDelta, Math.abs(rows[row][column + 1] - rows[row][column]));
    }
    assert.ok(terrain.heightLevels.length >= 3, `${proposal} retains multiple height bands`);
    assert.ok(terrain.heightLevels.at(-1) - terrain.heightLevels[0] >= 0.16, `${proposal} retains a visible elevation range`);
    assert.ok(maxNeighborDelta <= terrain.grid.stepWorldUnits + 1e-8, `${proposal} stays slope-graded (max delta ${maxNeighborDelta})`);
  }
});

test('dry pasture is a deterministic visual-only variant and cannot issue simulation commands', () => {
  assert.equal(validate(waterStressScene), true, JSON.stringify(validate.errors));
  const reproduced = createWaterStressVisualVariant(scene, {rendererManifest: renderManifest, sourceManifest: assetSourceManifest});
  assert.deepEqual(waterStressScene, reproduced);
  assert.equal(waterStressScene.visualVariant.classification, 'visual-only-unvalidated');
  assert.ok(waterStressScene.terrainTiles.filter(tile => tile.assetId === 'soil-dry').length > 400);
  assert.equal(waterStressScene.entities.filter(entity => entity.kind === 'animal').length, 8);
  assert.equal(sceneExecutionAvailability(waterStressScene).available, false);
  assert.throws(() => assertSceneCommandAllowed(waterStressScene, 'tick'), /Execução numérica indisponível/);
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
  assert.equal(dairyScene.prefabs.length, 247);
  assert.equal(dairyScene.simulation.productionSystem, 'dairy');
  assert.equal(dairyScene.domainModule.status, 'in-progress');
  assert.equal(dairyScene.entities.filter(entity => entity.kind === 'animal').length, 14);
  assert.equal(dairyScene.visualGroups.reduce((sum, group) => sum + group.population, 0), 200);
  const dairyPastures = dairyScene.zones.filter(zone => zone.kind === 'pasture');
  assert.deepEqual(dairyPastures.map(zone => zone.zoneId).sort(), [
    'zone-pasture-north-east', 'zone-pasture-north-west', 'zone-pasture-south-east', 'zone-pasture-south-west',
  ]);
  assert.deepEqual(dairyPastures.map(zone => zone.footprint.columns * zone.footprint.rows).reduce((sum, area) => sum + area, 0), 306);
  assert.deepEqual(dairyScene.visualGroups.filter(group => group.zoneId.startsWith('zone-pasture-')).map(group => group.population), [45, 45, 45, 45]);
  const rotationFences = dairyScene.prefabs.filter(prefab => prefab.prefabId.startsWith('dairy-rotation-'));
  assert.equal(rotationFences.length, 20);
  assert.equal(rotationFences.filter(prefab => prefab.assetId === 'fence-gate-wood-imagegen-v1').length, 2);
  for (const group of dairyScene.visualGroups.filter(group => group.zoneId.startsWith('zone-pasture-'))) {
    assert.ok(group.visualEntityIds.length > 0, `${group.groupId} has a visual representative`);
    for (const id of group.visualEntityIds) {
      const entity = dairyScene.entities.find(candidate => candidate.entityId === id);
      assert.equal(entity.groupId, group.groupId);
      assert.ok(entity.position.x >= dairyScene.zones.find(zone => zone.zoneId === group.zoneId).origin.x);
    }
  }
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

test('zone overlays use the full grid-cell boundary for rectangular paddocks', () => {
  const west = dairyScene.zones.find(zone => zone.zoneId === 'zone-pasture-north-west');
  assert.deepEqual(zoneGridCorners(west), [
    {column: 1, row: 1}, {column: 10, row: 1},
    {column: 10, row: 10}, {column: 1, row: 10},
  ]);
});

test('paddock terrain editing paints its ground and transition ring without replacing unrelated tiles', () => {
  const tiles = Array.from({length: 36}, (_, index) => ({
    tileId: `tile-${index}`,
    position: {x: index % 6, y: Math.floor(index / 6), unit: 'grid-cell'},
    assetId: 'grass-light',
  }));
  const paddock = {zoneId: 'paddock-test', origin: {x: 1, y: 1}, footprint: {columns: 3, rows: 3}, groundAssetId: 'grass-mid', transitionAssetIds: {edge: 'soil-dry'}};
  const painted = paintZoneTerrainTiles(tiles, paddock, 6, 6);
  const tileAt = (column, row) => painted.find(tile => tile.position.x === column && tile.position.y === row);
  assert.equal(tileAt(2, 2).assetId, 'grass-mid');
  assert.equal(tileAt(2, 2).zoneId, paddock.zoneId);
  assert.equal(tileAt(1, 2).assetId, 'soil-dry', 'paddock border cells use the transition asset');
  assert.equal(tileAt(0, 2).assetId, 'soil-dry', 'outside transition ring follows the paddock boundary');
  assert.equal(tileAt(5, 5).assetId, 'grass-light', 'unrelated authored terrain stays intact');
  assert.equal(tiles.every(tile => tile.assetId === 'grass-light'), true, 'editing returns a copy and preserves the source snapshot');

  const editedScene = structuredClone(scene), editableZone = {
    zoneId: 'paddock-edit-test', kind: 'pasture', name: 'Piquete editável', color: '#83aa63',
    origin: {x: 25, y: 15, unit: 'grid-cell'}, footprint: {columns: 4, rows: 4},
    groundAssetId: 'grass-mid', transitionAssetIds: {edge: 'grass-light'},
  };
  editedScene.zones.unshift(editableZone);
  editedScene.terrainTiles = paintZoneTerrainTiles(editedScene.terrainTiles, editableZone, editedScene.projection.columns, editedScene.projection.rows);
  normalizeSceneAssetReferences(editedScene, renderManifest, assetSourceManifest);
  assert.equal(validate(editedScene), true, JSON.stringify(validate.errors));
  assert.ok(editedScene.assets.some(asset => asset.assetId === 'grass-mid'), 'new ground assets enter the same scene manifest');
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
  const [beefSource, dairySource, semanticManifest, dairyManifest] = await Promise.all([
    ...['beef', 'dairy'].map(name => readFile(new URL(`../graphics-poc/source/main-composer-v1/${name}.json`, import.meta.url), 'utf8').then(JSON.parse)),
    readFile(new URL('../assets/manifests/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../public/assets/modules/livestock-dairy/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const enrichedRendererManifest = enrichRendererManifest(renderManifest, {semanticManifest, dairyManifest});
  assert.deepEqual(adaptMainComposerScene(beefSource, enrichedRendererManifest), scene);
  assert.deepEqual(adaptMainComposerScene(dairySource, enrichedRendererManifest), dairyScene);
  const authoredDairy = adaptComposerDocument(dairySource, enrichedRendererManifest).scene;
  assert.equal(authoredDairy.representationRole, 'authored-preservation');
  assert.equal(dairyScene.representationRole, 'runtime-presentation');
  assert.equal(authoredDairy.zones.length, dairySource.scene.zones.length, 'preservation keeps source zones one-to-one');
  assert.notEqual(dairyScene.zones.length, authoredDairy.zones.length, 'runtime presentation may derive paddock zones');
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
  for (const path of ['/graphics-poc/index.html', '/graphics-poc/scene.json', '/graphics-poc/scenes/dairy.json', '/graphics-poc/scenes/water-stress-visual.json', '/graphics-poc/assets/main-composer-render-manifest.json', '/graphics-poc/asset-registry.json', '/graphics-poc/asset-geometry-v1.json', '/graphics-poc/asset-spatial-annotations-v1.json', '/graphics-poc/spatial-debug.html', '/graphics-poc/dist/spatial-debug.js', '/graphics-poc/asset-geometry-annotator.html', '/graphics-poc/asset-geometry-annotator.css', '/graphics-poc/asset-geometry-annotator.js', '/schemas/visual-scene.schema.json']) {
    const response = await fetch(origin + path); assert.equal(response.status, 200, path);
  }
  const treeSource = assetRegistry.assets.find(asset => asset.assetId === 'vegetation-tree-shade-imagegen-v1').source.file;
  assert.equal((await fetch(`${origin}/${treeSource}`)).status, 200, 'the V6 inspection view receives the registered source sprite');
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
  let bundleBuilt = true;
  try { await readFile(new URL('../graphics-poc/dist/app.js', import.meta.url)); } catch { bundleBuilt = false; }
  assert.equal((await fetch(origin + '/graphics-poc/dist/app.js')).status, bundleBuilt ? 200 : 404,
    'the generated bundle is served only when a local build exists');
});
