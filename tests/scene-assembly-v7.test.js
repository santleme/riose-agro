import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFenceNetworkV7,
  compileFarmSceneV7,
  isoToWorldV7,
  screenToWorldV7,
  snapToGridV7,
  snapToSocketV7,
  validateFarmSceneV7,
  worldToIsoV7,
  worldToScreenV7,
} from '../src/client/scene-assembly-v7.js';

test('world, iso, camera and inverse conversions preserve physical metres', () => {
  const world = { x: 18.25, y: 10.5, elevation: 1.25 };
  const iso = worldToIsoV7(world);
  assert.deepEqual(worldToIsoV7({ x: 4, y: 0 }), { x: 24, y: 12 });
  const unprojected = isoToWorldV7(iso, undefined, world.elevation);
  assert.ok(Math.abs(unprojected.x - world.x) < 1e-9);
  assert.ok(Math.abs(unprojected.y - world.y) < 1e-9);
  const camera = { centerX: 12, centerY: 20, zoom: 1.4, viewportX: 288, viewportY: 168 };
  const screen = worldToScreenV7(world, camera);
  const back = screenToWorldV7(screen, camera, undefined, world.elevation);
  assert.ok(Math.abs(back.x - world.x) < 1e-9);
  assert.ok(Math.abs(back.y - world.y) < 1e-9);
});

test('grid and socket snapping return exact shared world positions', () => {
  assert.deepEqual(snapToGridV7({ x: 7.1, y: 3.2 }), { x: 8, y: 4 });
  const snapped = snapToSocketV7({ type: 'road-end', position: { x: 8, y: 4 }, orientationDeg: 0 },
    { type: 'driveway', position: { x: 8.01, y: 4 }, orientationDeg: 180 });
  assert.equal(snapped.connected, true);
  assert.deepEqual({ x: snapped.x, y: snapped.y }, { x: 8, y: 4 });
});

test('shared paddock boundaries are deduplicated and gates replace full edge modules', () => {
  const network = buildFenceNetworkV7([
    { id: 'a', bounds: { x: 0, y: 0, width: 6, height: 6 } },
    { id: 'b', bounds: { x: 6, y: 0, width: 6, height: 6 } },
  ], [{ id: 'gate-a', a: { x: 0, y: 3 }, b: { x: 0, y: 6 }, connectsTo: 'lane' }]);
  const shared = network.segments.filter((segment) => segment.sharedBoundary);
  assert.equal(shared.length, 2);
  assert.equal(network.segments.filter((segment) => segment.type === 'gate').length, 1);
  assert.equal(network.diagnostics.duplicateBoundariesRemoved, 2);
  assert.deepEqual(network.diagnostics.invalidGateRequests, []);
  assert.equal(network.moduleLengthM, 3);
  assert.ok(network.segments.every((segment) => segment.lengthM === 3));
});

test('cut farm macro plan compiles deterministically into metre geometry and connected prefab graph', () => {
  const a = compileFarmSceneV7({ seed: 17, scenarioId: 'corte' });
  const b = compileFarmSceneV7({ seed: 17, scenarioId: 'beef' });
  assert.deepEqual(a, b);
  assert.equal(a.schemaVersion, 'riose-scene-v7');
  assert.equal(a.world.widthM, 72);
  assert.equal(a.world.heightM, 48);
  assert.equal(a.world.terrainCells.columns, 36);
  assert.equal(a.world.terrainCells.rows, 24);
  assert.equal(a.paddocks.length, 4);
  assert.ok(a.assemblies[0].parts.length >= 4);
  assert.ok(a.roads.every((road) => road.points.length >= 2));
  assert.ok(a.fenceSegments.some((segment) => segment.type === 'gate'));
  assert.equal(a.fenceNetwork.moduleLengthM, 3);
  assert.ok(a.fenceSegments.every((segment) => segment.lengthM === 3));
  assert.ok(a.renderEntities.some((entity) => entity.id === 'farmstead' && entity.assetId === 'farmhouse' && entity.visualSizePixels));
  assert.ok(a.renderEntities.some((entity) => entity.id === 'grain-silo' && entity.assetId === 'silo'));
  assert.ok(a.renderEntities.some((entity) => entity.id === 'farm-tractor' && entity.assetId === 'tractor'));
  assert.ok(a.renderEntities.some((entity) => entity.id === 'cattle-handling/holding-pen' && entity.assetId === 'corral-wood-standard-imagegen-v1'));
  assert.ok(a.renderEntities.some((entity) => entity.id === 'maize-field-northwest/tile-0-0' && entity.assetId === 'field-maize-growing'));
  assert.equal(a.connections.every((connection) => connection.status === 'connected'), true);
  assert.equal(a.validation.valid, true, JSON.stringify(a.validation.errors));
  assert.equal(validateFarmSceneV7(a).valid, true);
});

test('candidate asset geometry stays explicitly uncalibrated instead of asserting false precision', () => {
  const scene = compileFarmSceneV7();
  const barn = scene.structures.find((item) => item.id === 'equipment-barn');
  assert.deepEqual(scene.structures.find((item) => item.id === 'farmstead').footprintMeters, { width: 12, height: 9 });
  assert.deepEqual(barn.footprintMeters, { width: 18, height: 12 });
  assert.deepEqual(scene.assemblies[0].footprintMeters, { width: 12, height: 10 });
  assert.equal(barn.geometryStatus, 'candidate-unverified');
  assert.equal(barn.height.metres, 5.5);
  assert.equal(barn.height.status, 'candidate-domain-estimate');
  assert.equal(barn.visualBounds.units, 'px');
  assert.equal(barn.groundAnchor.units, 'm');
  assert.equal(scene.assemblyReport.visualApproval, 'not-reviewed');
  assert.ok(scene.validation.warnings.length > 0);
});

test('dairy scenario reuses modular construction with dairy-specific semantic prefab', () => {
  const scene = compileFarmSceneV7({ seed: 8, scenarioId: 'dairy' });
  assert.equal(scene.structures.some((item) => item.kind === 'milking-barn'), true);
  assert.equal(scene.assemblies[0].parts.some((part) => part.kind === 'milking-parlor'), true);
  assert.equal(scene.validation.valid, true, JSON.stringify(scene.validation.errors));
});
