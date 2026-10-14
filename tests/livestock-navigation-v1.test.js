import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceAgentMotion, createAgentMotion, createLivestockNavigationGrid, findWorldCellPath, gateLivestockAnimation, interpolateAgentPosition, planLivestockRoute, planLivestockRoutes} from '../graphics-poc/livestock-navigation-v1.js';

test('A* is deterministic and routes around cells and geometric obstacles', () => {
  const grid = createLivestockNavigationGrid({columns: 7, rows: 5, blockedCells: [{x: 3, y: 1}, {x: 3, y: 2}, {x: 3, y: 3}]});
  const first = findWorldCellPath(grid, {x: 0, y: 2}, {x: 6, y: 2});
  assert.deepEqual(first, findWorldCellPath(grid, {x: 0, y: 2}, {x: 6, y: 2}));
  assert.ok(first.every(cell => !grid.isBlocked(cell.x, cell.y)));
  assert.ok(first.some(cell => cell.y !== 2), 'the shortest feasible path detours around blocked cells');

  const polygonGrid = createLivestockNavigationGrid({columns: 5, rows: 3, blockedPolygons: [[{x: 2, y: 0}, {x: 3, y: 0}, {x: 3, y: 3}, {x: 2, y: 3}]]});
  assert.equal(findWorldCellPath(polygonGrid, {x: 0, y: 1}, {x: 4, y: 1}), null, 'full-height physical obstacle closes the route');
});

test('A* cannot cross fence geometry or explicitly blocked cell edges', () => {
  const fenced = createLivestockNavigationGrid({columns: 2, rows: 1, fences: [{from: {x: 1, y: 0}, to: {x: 1, y: 1}}]});
  assert.equal(findWorldCellPath(fenced, {x: 0, y: 0}, {x: 1, y: 0}), null);
  const edgeBlocked = createLivestockNavigationGrid({columns: 2, rows: 1, blockedEdges: [{from: {x: 0, y: 0}, to: {x: 1, y: 0}}]});
  assert.equal(findWorldCellPath(edgeBlocked, {x: 0, y: 0}, {x: 1, y: 0}), null);
});

test('multi-agent routes are stable, reserve prior routes and keep minimum separation', () => {
  const grid = createLivestockNavigationGrid({columns: 8, rows: 5});
  const agents = [
    {agentId: 'cow-b', position: {x: 0.5, y: 1.5}},
    {agentId: 'cow-a', position: {x: 0.5, y: 3.5}},
  ];
  const goals = [{x: 7.5, y: 1.5}, {x: 7.5, y: 3.5}];
  const plan = planLivestockRoutes({grid, agents, goals, minSeparation: 1.1});
  assert.equal(plan.valid, true);
  assert.deepEqual(plan, planLivestockRoutes({grid, agents, goals, minSeparation: 1.1}));
  assert.deepEqual(plan.routes.map(route => route.agentId), ['cow-a', 'cow-b'], 'priority order is deterministic by id');
  const a = new Set(plan.routes[0].pathCells.map(cell => `${cell.x},${cell.y}`));
  assert.ok(plan.routes[1].pathCells.every(cell => !a.has(`${cell.x},${cell.y}`)), 'agents never reserve the same cell on the planned routes');

  const crowded = planLivestockRoutes({grid: createLivestockNavigationGrid({columns: 3, rows: 1}),
    agents: [{agentId: 'a', position: {x: 0.5, y: 0.5}}, {agentId: 'b', position: {x: 2.5, y: 0.5}}],
    goals: [{x: 2.5, y: 0.5}, {x: 0.5, y: 0.5}], minSeparation: 1});
  assert.equal(crowded.valid, false, 'conflicting goals are rejected instead of silently overlapping agents');
});

test('route waypoints move at world-cell speed and interpolation follows corners', () => {
  const grid = createLivestockNavigationGrid({columns: 5, rows: 4, blockedCells: [{x: 1, y: 1}]});
  const planned = planLivestockRoute({grid, agent: {agentId: 'cow-1', position: {x: 0.5, y: 1.5}}, goal: {x: 3.5, y: 1.5}});
  assert.equal(planned.valid, true);
  assert.equal(planned.unit, 'world-cell');
  assert.equal(planned.motionSource, 'visual-demonstration');
  assert.equal(planned.visualDemonstration.source, 'visual-presentation-only');
  const motion0 = createAgentMotion(planned);
  const motion1 = advanceAgentMotion(planned, motion0, 1.25, 1);
  assert.equal(motion1.isTranslating, true);
  assert.ok(Math.abs(motion1.lastStep.distance - 1.25) < 1e-9);
  assert.equal(motion1.animation.animationState, 'walk');
  assert.equal(motion1.animation.animationStateSource, 'visual-demonstration');
  assert.equal(motion1.animation.walkFramesAdvance, true);
  const quarter = interpolateAgentPosition(motion1, 0.25);
  assert.deepEqual(quarter, {x: 0.5, y: 1.1875}, 'interpolation follows the first routed segment without cutting a corner');
  const stopped = advanceAgentMotion(planned, motion1, 0, 1);
  assert.equal(stopped.isTranslating, false);
  assert.equal(stopped.animation.walkFramesAdvance, false, 'walk frames pause when no position change occurs');
});

test('simulation-provided drink, graze and idle states freeze navigation and stay intact', () => {
  const grid = createLivestockNavigationGrid({columns: 4, rows: 1});
  for (const state of ['drink', 'graze', 'idle']) {
    const planned = planLivestockRoute({grid, agent: {agentId: `cow-${state}`, position: {x: 0.5, y: 0.5}, simulationState: state}, goal: {x: 3.5, y: 0.5}});
    assert.equal(planned.valid, true);
    const motion = advanceAgentMotion(planned, createAgentMotion(planned), 2, 1);
    assert.deepEqual(motion.position, {x: 0.5, y: 0.5});
    assert.equal(motion.isTranslating, false);
    assert.equal(motion.animation.animationState, state);
    assert.equal(motion.animation.animationStateSource, 'simulation-provided');
    assert.equal(motion.animation.translationAllowed, false);
    assert.deepEqual(motion.animation.simulationState, state);
  }
  const stationaryWalk = gateLivestockAnimation({simulationState: 'walk', isTranslating: false});
  assert.equal(stationaryWalk.animationState, 'walk', 'the module does not invent an idle model state');
  assert.equal(stationaryWalk.walkFramesAdvance, false);
});
