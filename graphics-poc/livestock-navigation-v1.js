/**
 * Deterministic visual navigation for livestock agents in world-cell units.
 *
 * This module only plans/interpolates presentation motion. It never writes to
 * scientific state. A simulation-provided non-walking state freezes movement;
 * a visual demo can request walking only when no simulation state is present.
 */

const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const EPSILON = 1e-9;

const cellKey = (x, y) => `${x},${y}`;
const point = value => ({x: Number(value.x), y: Number(value.y)});
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const euclidean = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function normalizeCells(cells = []) {
  return new Set(cells.map(cell => cellKey(Math.floor(cell.x), Math.floor(cell.y))));
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  return Math.abs(value) <= EPSILON ? 0 : Math.sign(value);
}

function onSegment(a, b, p) {
  return p.x >= Math.min(a.x, b.x) - EPSILON && p.x <= Math.max(a.x, b.x) + EPSILON
    && p.y >= Math.min(a.y, b.y) - EPSILON && p.y <= Math.max(a.y, b.y) + EPSILON;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  return (o1 === 0 && onSegment(a, b, c)) || (o2 === 0 && onSegment(a, b, d))
    || (o3 === 0 && onSegment(c, d, a)) || (o4 === 0 && onSegment(c, d, b));
}

function polygonsOverlap(first, second) {
  const axes = polygon => polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length]; return {x: -(end.y - start.y), y: end.x - start.x};
  });
  for (const axis of [...axes(first), ...axes(second)]) {
    const project = polygon => polygon.map(vertex => vertex.x * axis.x + vertex.y * axis.y);
    const a = project(first), b = project(second);
    if (Math.max(...a) <= Math.min(...b) + EPSILON || Math.max(...b) <= Math.min(...a) + EPSILON) return false;
  }
  return true;
}

function cellPolygon(x, y) { return [{x, y}, {x: x + 1, y}, {x: x + 1, y: y + 1}, {x, y: y + 1}]; }

function cellCenter(x, y) { return {x: x + 0.5, y: y + 0.5}; }

export function createLivestockNavigationGrid({columns, rows, blockedCells = [], blockedPolygons = [], fences = [], blockedEdges = [], costAt = () => 0}) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) throw new RangeError('Navigation grid dimensions must be positive integers.');
  if (typeof costAt !== 'function') throw new TypeError('Navigation costAt must be a function.');
  const polygons = blockedPolygons.map(polygon => (Array.isArray(polygon) ? polygon : polygon.polygon).map(point));
  if (polygons.some(polygon => polygon.length < 3 || polygon.some(vertex => !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)))) {
    throw new TypeError('Blocked polygons must contain at least three finite world-cell vertices.');
  }
  const fenceSegments = fences.map(segment => ({from: point(segment.from), to: point(segment.to)}));
  const edgeSet = new Set();
  for (const edge of blockedEdges) {
    const from = edge.from ?? edge[0], to = edge.to ?? edge[1];
    if (!from || !to || !Number.isInteger(from.x) || !Number.isInteger(from.y) || !Number.isInteger(to.x) || !Number.isInteger(to.y)
      || manhattan(from, to) !== 1) throw new TypeError('Blocked cell edges must connect cardinally adjacent integer cells.');
    edgeSet.add(edgeKey(from, to));
  }
  const cells = normalizeCells(blockedCells);
  const isBlocked = (x, y) => {
    if (x < 0 || y < 0 || x >= columns || y >= rows || cells.has(cellKey(x, y))) return true;
    const rect = cellPolygon(x, y);
    return polygons.some(polygon => polygonsOverlap(rect, polygon));
  };
  const canTraverse = (from, to) => {
    if (edgeSet.has(edgeKey(from, to))) return false;
    const start = cellCenter(from.x, from.y), end = cellCenter(to.x, to.y);
    return !fenceSegments.some(fence => segmentsIntersect(start, end, fence.from, fence.to));
  };
  return Object.freeze({columns, rows, blockedCells: cells, blockedPolygons: polygons, fences: fenceSegments, blockedEdges: edgeSet, costAt, isBlocked, canTraverse});
}

function edgeKey(a, b) {
  const first = cellKey(a.x, a.y), second = cellKey(b.x, b.y);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

class MinHeap {
  constructor(compare) { this.values = []; this.compare = compare; }
  get size() { return this.values.length; }
  push(value) {
    const values = this.values; values.push(value); let index = values.length - 1;
    while (index > 0) { const parent = Math.floor((index - 1) / 2); if (this.compare(values[parent], value) <= 0) break; values[index] = values[parent]; index = parent; }
    values[index] = value;
  }
  pop() {
    const values = this.values, first = values[0], last = values.pop();
    if (values.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1, right = left + 1;
        if (left >= values.length) break;
        const child = right < values.length && this.compare(values[right], values[left]) < 0 ? right : left;
        if (this.compare(values[child], last) >= 0) break;
        values[index] = values[child]; index = child;
      }
      values[index] = last;
    }
    return first;
  }
}

function normalizeOccupied(occupied, excludingAgentId) {
  return occupied.filter(agent => agent.agentId !== excludingAgentId).map(agent => ({
    agentId: agent.agentId, position: point(agent.position ?? agent),
  }));
}

function violatesSeparation(x, y, occupied, minSeparation, agentId) {
  if (minSeparation <= 0) return false;
  const center = cellCenter(x, y);
  return occupied.some(agent => agent.agentId !== agentId && euclidean(center, agent.position) < minSeparation - EPSILON);
}

/** Deterministic cardinal A*; returned integer coordinates identify cells. */
export function findWorldCellPath(grid, start, goal, {occupied = [], agentId = null, minSeparation = 0} = {}) {
  if (!grid?.isBlocked || !grid?.canTraverse) throw new TypeError('A compiled navigation grid is required.');
  if (![start?.x, start?.y, goal?.x, goal?.y].every(Number.isFinite)) throw new TypeError('A* start and goal must be finite world-cell coordinates.');
  if (!Number.isFinite(minSeparation) || minSeparation < 0) throw new RangeError('minSeparation must be a nonnegative world-cell distance.');
  const origin = {x: Math.floor(start.x), y: Math.floor(start.y)}, destination = {x: Math.floor(goal.x), y: Math.floor(goal.y)};
  const blockedByAgent = normalizeOccupied(occupied, agentId);
  if (grid.isBlocked(origin.x, origin.y) || grid.isBlocked(destination.x, destination.y)
    || violatesSeparation(destination.x, destination.y, blockedByAgent, minSeparation, agentId)) return null;
  const compare = (a, b) => a.f - b.f || a.h - b.h || a.y - b.y || a.x - b.x || a.order - b.order;
  const open = new MinHeap(compare), startKey = cellKey(origin.x, origin.y), scores = new Map([[startKey, 0]]), parents = new Map(), closed = new Set();
  let order = 0; const startH = manhattan(origin, destination);
  open.push({...origin, g: 0, h: startH, f: startH, order: order++});
  while (open.size) {
    const current = open.pop(), currentKey = cellKey(current.x, current.y);
    if (closed.has(currentKey)) continue;
    if (current.x === destination.x && current.y === destination.y) {
      const path = [destination]; let cursorKey = currentKey;
      while (cursorKey !== startKey) {
        const parent = parents.get(cursorKey); if (!parent) return null;
        path.push(parent.point); cursorKey = parent.key;
      }
      return path.reverse();
    }
    closed.add(currentKey);
    for (const [dx, dy] of DIRECTIONS) {
      const next = {x: current.x + dx, y: current.y + dy}, nextKey = cellKey(next.x, next.y);
      if (closed.has(nextKey) || grid.isBlocked(next.x, next.y) || violatesSeparation(next.x, next.y, blockedByAgent, minSeparation, agentId)
        || !grid.canTraverse(current, next)) continue;
      const extra = grid.costAt(next.x, next.y);
      if (!Number.isFinite(extra) || extra < 0) throw new RangeError(`A* costAt(${next.x}, ${next.y}) must be finite and nonnegative.`);
      const score = current.g + 1 + extra;
      if (score >= (scores.get(nextKey) ?? Infinity) - EPSILON) continue;
      scores.set(nextKey, score); parents.set(nextKey, {key: currentKey, point: {x: current.x, y: current.y}});
      const h = manhattan(next, destination); open.push({...next, g: score, h, f: score + h, order: order++});
    }
  }
  return null;
}

function routeFromCells(agent, cells, motionSource) {
  const initial = point(agent.position), centers = cells.map(cell => cellCenter(cell.x, cell.y));
  const waypoints = [initial];
  for (const center of centers) if (euclidean(center, waypoints.at(-1)) > EPSILON) waypoints.push(center);
  return {agentId: agent.agentId, unit: 'world-cell', pathCells: cells, waypoints,
    simulationState: agent.simulationState ?? null, motionSource,
    visualDemonstration: motionSource === 'visual-demonstration' ? {intent: 'walk', source: 'visual-presentation-only'} : null};
}

export function planLivestockRoute({grid, agent, goal, occupied = [], minSeparation = 0.9, motionSource = 'visual-demonstration'}) {
  if (!agent?.agentId || !agent.position || !goal) throw new TypeError('Route planning needs agentId, agent.position and goal.');
  const pathCells = findWorldCellPath(grid, agent.position, goal, {occupied, agentId: agent.agentId, minSeparation});
  return pathCells ? {valid: true, ...routeFromCells(agent, pathCells, motionSource)} : {valid: false, reason: 'no-navigable-route', agentId: agent.agentId};
}

/** Priority-plans agents in stable id order and reserves earlier full routes. */
export function planLivestockRoutes({grid, agents, goals, minSeparation = 0.9, motionSource = 'visual-demonstration'}) {
  if (!Array.isArray(agents) || !Array.isArray(goals) || agents.length !== goals.length) throw new TypeError('Multi-agent planning needs one goal per agent.');
  const ids = new Set(agents.map(agent => agent.agentId));
  if (ids.size !== agents.length || agents.some(agent => !agent.agentId)) throw new TypeError('Multi-agent ids must be present and unique.');
  const goalById = new Map(agents.map((agent, index) => [agent.agentId, goals[index]]));
  const stable = [...agents].sort((a, b) => a.agentId.localeCompare(b.agentId)), routes = [], reserved = [];
  for (const agent of stable) {
    const occupancy = [...agents.filter(other => other.agentId !== agent.agentId).map(other => ({agentId: other.agentId, position: other.position})), ...reserved];
    const route = planLivestockRoute({grid, agent, goal: goalById.get(agent.agentId), occupied: occupancy, minSeparation, motionSource});
    if (!route.valid) return {valid: false, reason: route.reason, failedAgentId: agent.agentId, routes};
    routes.push(route);
    for (const cell of route.pathCells) reserved.push({agentId: agent.agentId, position: cellCenter(cell.x, cell.y)});
  }
  return {valid: true, unit: 'world-cell', routes};
}

export function createAgentMotion(route) {
  if (!route?.valid || !Array.isArray(route.waypoints) || !route.waypoints.length) throw new TypeError('A valid route with waypoints is required.');
  const first = point(route.waypoints[0]);
  return {agentId: route.agentId, position: first, previousPosition: first, waypointIndex: 1,
    isTranslating: false, finished: route.waypoints.length <= 1, route, lastStep: {distance: 0, segments: []}};
}

function stateId(state) { return typeof state === 'string' ? state : state?.stateId ?? null; }

export function gateLivestockAnimation({simulationState = null, visualDemoAction = null, isTranslating = false} = {}) {
  const supplied = stateId(simulationState), walkingState = supplied === 'walk' || supplied === 'walking';
  const translationAllowed = supplied ? walkingState : visualDemoAction === 'walk';
  const animationState = supplied ?? (visualDemoAction === 'walk' && isTranslating ? 'walk' : null);
  const animationStateSource = supplied ? 'simulation-provided' : animationState ? 'visual-demonstration' : 'none';
  const walkFramesAdvance = animationState === 'walk' || animationState === 'walking'
    ? translationAllowed && isTranslating : false;
  return {simulationState, translationAllowed, animationState, animationStateSource, walkFramesAdvance,
    visualDemoAction: supplied ? null : visualDemoAction};
}

/** Move at constant world-cell speed; preserve each substep for render interpolation. */
export function advanceAgentMotion(route, motion, deltaSeconds, speedCellsPerSecond, {simulationState = route.simulationState, visualDemoAction = route.visualDemonstration?.intent ?? null} = {}) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || !Number.isFinite(speedCellsPerSecond) || speedCellsPerSecond < 0) {
    throw new RangeError('Motion delta and speed must be nonnegative finite numbers.');
  }
  const start = point(motion.position), gate = gateLivestockAnimation({simulationState, visualDemoAction, isTranslating: false});
  if (!gate.translationAllowed || motion.finished || speedCellsPerSecond === 0 || deltaSeconds === 0) {
    const animation = gateLivestockAnimation({simulationState, visualDemoAction, isTranslating: false});
    return {...motion, previousPosition: start, isTranslating: false, lastStep: {distance: 0, segments: []}, animation};
  }
  let position = start, waypointIndex = motion.waypointIndex, budget = deltaSeconds * speedCellsPerSecond;
  const segments = []; let traveled = 0;
  while (budget > EPSILON && waypointIndex < route.waypoints.length) {
    const target = point(route.waypoints[waypointIndex]), remaining = euclidean(position, target);
    if (remaining <= EPSILON) { position = target; waypointIndex++; continue; }
    const amount = Math.min(budget, remaining), next = {x: position.x + (target.x - position.x) * amount / remaining, y: position.y + (target.y - position.y) * amount / remaining};
    segments.push({from: position, to: next, startDistance: traveled, endDistance: traveled + amount});
    position = next; traveled += amount; budget -= amount;
    if (remaining - amount <= EPSILON) { position = target; waypointIndex++; }
  }
  const nextMotion = {...motion, previousPosition: start, position, waypointIndex,
    isTranslating: traveled > EPSILON, finished: waypointIndex >= route.waypoints.length,
    lastStep: {distance: traveled, segments}};
  nextMotion.animation = gateLivestockAnimation({simulationState, visualDemoAction, isTranslating: nextMotion.isTranslating});
  return nextMotion;
}

export function interpolateAgentPosition(motion, alpha) {
  if (!Number.isFinite(alpha)) throw new TypeError('Interpolation alpha must be finite.');
  const t = Math.max(0, Math.min(1, alpha)), distance = motion.lastStep.distance * t;
  const segment = motion.lastStep.segments.find(item => distance <= item.endDistance + EPSILON) ?? motion.lastStep.segments.at(-1);
  if (!segment) return point(motion.position);
  const span = segment.endDistance - segment.startDistance;
  const local = span <= EPSILON ? 1 : Math.max(0, Math.min(1, (distance - segment.startDistance) / span));
  return {x: segment.from.x + (segment.to.x - segment.from.x) * local, y: segment.from.y + (segment.to.y - segment.from.y) * local};
}
