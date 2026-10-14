/** Deterministic macro-assembly primitives for the V6 spatial world builder. */

export function seededRandom(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), state | 1) + 0x6d2b79f5) | 0;
    state = Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

export const SOCKET_COMPATIBILITY = Object.freeze({
  road: new Set(['driveway', 'path', 'road']),
  driveway: new Set(['road', 'gate']),
  path: new Set(['road', 'entrance', 'path']),
  entrance: new Set(['path']),
  fence: new Set(['fence-corner', 'gate', 'fence']),
  'fence-corner': new Set(['fence', 'fence-end', 'gate-end']),
  'fence-end': new Set(['fence-end', 'fence-corner', 'gate-end', 'gate', 'fence-junction']),
  'gate-end': new Set(['fence-end', 'fence-corner']),
  'fence-junction': new Set(['fence-end', 'fence-junction', 'gate']),
  gate: new Set(['fence', 'fence-end', 'paddock-entrance', 'driveway']),
  'paddock-entrance': new Set(['gate', 'livestock-access']),
  'livestock-access': new Set(['paddock-entrance', 'water-access']),
  'water-access': new Set(['livestock-access']),
});

export function socketsConnect(a, b, tolerance = 0.08) {
  if (!SOCKET_COMPATIBILITY[a.type]?.has(b.type) || !SOCKET_COMPATIBILITY[b.type]?.has(a.type)) return false;
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const orientationDelta = Math.abs(((a.orientation - b.orientation + 180) % 360 + 360) % 360 - 180);
  return distance <= Math.min(a.tolerance ?? tolerance, b.tolerance ?? tolerance) && Math.abs(orientationDelta - 180) <= 5;
}

export function rectanglePolygon(width, height, origin = {x: 0, y: 0}) {
  return [{x: origin.x, y: origin.y}, {x: origin.x + width, y: origin.y},
    {x: origin.x + width, y: origin.y + height}, {x: origin.x, y: origin.y + height}];
}

function overlaps(a, b) {
  for (const polygon of [a, b]) for (let index = 0; index < polygon.length; index++) {
    const p = polygon[index], q = polygon[(index + 1) % polygon.length], axis = {x: q.y - p.y, y: p.x - q.x};
    const project = shape => shape.map(point => point.x * axis.x + point.y * axis.y);
    const first = project(a), second = project(b);
    if (Math.max(...first) <= Math.min(...second) || Math.max(...second) <= Math.min(...first)) return false;
  }
  return true;
}

function translatePolygon(polygon, x, y) { return polygon.map(point => ({x: point.x + x, y: point.y + y})); }
function bounds(polygon) { return {left: Math.min(...polygon.map(p => p.x)), right: Math.max(...polygon.map(p => p.x)), top: Math.min(...polygon.map(p => p.y)), bottom: Math.max(...polygon.map(p => p.y))}; }

function pointAllowed(point, terrain, requirements) {
  const polygon = translatePolygon(requirements.collisionPolygon, point.x, point.y), box = bounds(polygon);
  if (box.left < 0 || box.top < 0 || box.right > terrain.columns || box.bottom > terrain.rows) return {valid: false, reason: 'out-of-bounds'};
  if (terrain.slopeAt) {
    const samples = [...polygon];
    for (let y = Math.max(0, Math.floor(box.top)); y < Math.min(terrain.rows, Math.ceil(box.bottom)); y++) {
      for (let x = Math.max(0, Math.floor(box.left)); x < Math.min(terrain.columns, Math.ceil(box.right)); x++) {
        const center = {x: x + 0.5, y: y + 0.5}; let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const a = polygon[i], b = polygon[j];
          if ((a.y > center.y) !== (b.y > center.y) && center.x < (b.x - a.x) * (center.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        }
        if (inside) samples.push(center);
      }
    }
    const maxFootprintSlope = Math.max(...samples.map(sample => Math.abs(terrain.slopeAt(sample.x, sample.y))));
    if (maxFootprintSlope > (requirements.maxSlope ?? 0.12)) return {valid: false, reason: 'slope', maxFootprintSlope};
  }
  for (const previous of point.placed) {
    if (previous.blocking !== false && requirements.blocking !== false && overlaps(polygon, previous.worldPolygon)) return {valid: false, reason: 'collision'};
    if (previous.incompatibleTags?.some(tag => requirements.tags?.includes(tag)) && Math.hypot(point.x - previous.position.x, point.y - previous.position.y) < Math.max(previous.clearance ?? 0, requirements.clearance ?? 0)) return {valid: false, reason: 'clearance'};
  }
  return {valid: true, reason: null, polygon, bounds: box};
}

/** Bounded deterministic constraint search for a small set of major structures. */
export function solveMacroPlacement(specification, {seed = 1, maxExpansions = 6000} = {}) {
  const terrain = specification.terrain;
  const random = seededRandom(seed);
  const placed = [];
  const requirements = [...specification.structures].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
  let best = null, expansions = 0;
  const domains = new Map(requirements.map(item => {
    const candidates = [];
    for (let row = 1; row < terrain.rows - 1; row += item.gridStep ?? 1) for (let column = 1; column < terrain.columns - 1; column += item.gridStep ?? 1) {
      const x = column + random() * 0.17, y = row + random() * 0.17;
      if (item.zone && (x < item.zone.left || x > item.zone.right || y < item.zone.top || y > item.zone.bottom)) continue;
      const tested = pointAllowed({x, y, placed}, terrain, item);
      if (!tested.valid) continue;
      const center = {x: terrain.columns * (item.target?.x ?? 0.5), y: terrain.rows * (item.target?.y ?? 0.5)};
      const targetCost = Math.hypot(x - center.x, y - center.y);
      const edgeBalance = Math.abs((x / terrain.columns) - (item.target?.x ?? 0.5)) + Math.abs((y / terrain.rows) - (item.target?.y ?? 0.5));
      candidates.push({x, y, score: targetCost * (item.targetWeight ?? 0.2) + edgeBalance + random() * (item.variation ?? 1.2), tested});
    }
    candidates.sort((a, b) => a.score - b.score);
    return [item.id, candidates.slice(0, item.candidateLimit ?? 28)];
  }));

  function search(index, score) {
    if (expansions >= maxExpansions) return;
    expansions++;
    if (best && score >= best.score) return;
    if (index === requirements.length) {
      best = {score, placements: placed.map(item => ({id: item.id, assetId: item.assetId, position: {...item.position}, worldPolygon: item.worldPolygon,
        blocking: item.blocking, clearance: item.clearance, incompatibleTags: item.incompatibleTags, status: 'accepted'}))};
      return;
    }
    const item = requirements[index];
    for (const candidate of domains.get(item.id)) {
      const tested = pointAllowed({...candidate, placed}, terrain, item);
      if (!tested.valid) continue;
      const placement = {id: item.id, assetId: item.assetId, position: {x: candidate.x, y: candidate.y}, worldPolygon: tested.polygon,
        blocking: item.blocking, clearance: item.clearance, incompatibleTags: item.incompatibleTags};
      placed.push(placement); search(index + 1, score + candidate.score); placed.pop();
      if (expansions >= maxExpansions) break;
    }
  }
  search(0, 0);
  if (!best) {
    const exhausted = expansions >= maxExpansions;
    return {valid: false, reason: exhausted ? 'search-budget-exhausted' : 'no-feasible-layout', violations: [{type: exhausted ? 'search-limit' : 'mandatory-constraint', rule: 'macro-placement', detail: exhausted ? 'The search budget ended before a feasible arrangement was found.' : 'No arrangement satisfies boundaries, slope, collisions and clearance.'}], expansions};
  }
  return {valid: true, seed: seed >>> 0, score: best.score, expansions, searchComplete: expansions < maxExpansions,
    optimality: expansions < maxExpansions ? 'exhaustive-best' : 'best-feasible-within-budget', placements: best.placements};
}

const GRID_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A* network path between semantic endpoints; scenery is added after this pass. */
export function routeNetwork(terrain, start, goal, {blocked = [], costAt = () => 0} = {}) {
  const blockedKeys = new Set(blocked.map(point => `${point.x},${point.y}`));
  const key = point => `${point.x},${point.y}`;
  const open = [{...start, g: 0, f: Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y), parent: null}];
  const byKey = new Map([[key(start), open[0]]]), closed = new Set();
  while (open.length) {
    open.sort((a, b) => a.f - b.f || a.g - b.g || a.y - b.y || a.x - b.x);
    const current = open.shift(), currentKey = key(current);
    if (currentKey === key(goal)) {
      const path = []; let node = current;
      while (node) { path.push({x: node.x, y: node.y}); node = node.parent; }
      return path.reverse();
    }
    closed.add(currentKey);
    for (const [dx, dy] of GRID_DIRECTIONS) {
      const next = {x: current.x + dx, y: current.y + dy}, nextKey = key(next);
      if (next.x < 0 || next.y < 0 || next.x >= terrain.columns || next.y >= terrain.rows || blockedKeys.has(nextKey) || closed.has(nextKey)) continue;
      const g = current.g + 1 + Math.max(0, costAt(next));
      const prior = byKey.get(nextKey);
      if (prior && g >= prior.g) continue;
      const node = {x: next.x, y: next.y, g, f: g + Math.abs(goal.x - next.x) + Math.abs(goal.y - next.y), parent: current};
      byKey.set(nextKey, node); open.push(node);
    }
  }
  return null;
}

/**
 * Compile overlapping A* cell paths into one deterministic, socket-checked road
 * graph. Coordinates are cell centers in world-cell units. Art assets remain
 * unassigned until a matching road kit has passed visual review.
 */
export function compileRoadNetwork(paths, {endpointKinds = {}, tolerance = 0.08} = {}) {
  const violations = [];
  if (!Array.isArray(paths) || paths.length === 0) return {unit: 'world-cell', valid: false, violations: [{type: 'empty-road-network'}], nodes: [], edges: [], modules: [], routes: []};
  const pointKey = point => `${point.x},${point.y}`;
  const edgeKey = (a, b) => pointKey(a) < pointKey(b) ? `${pointKey(a)}>${pointKey(b)}` : `${pointKey(b)}>${pointKey(a)}`;
  const nodeMap = new Map(), edgeMap = new Map(), routes = [];
  const getNode = point => {
    const key = pointKey(point);
    if (!nodeMap.has(key)) nodeMap.set(key, {nodeId: `road-node-${key.replace(',', '-')}`, key, position: {x: point.x, y: point.y}, incident: [], endpointOwners: []});
    return nodeMap.get(key);
  };
  const endpointKind = (route, side, ownerId) => route[`${side}Kind`] ?? endpointKinds[ownerId] ?? (ownerId == null ? 'endpoint' : 'entrance');
  for (let routeIndex = 0; routeIndex < paths.length; routeIndex++) {
    const route = paths[routeIndex], routeId = String(route.routeId ?? `${route.from ?? 'start'}->${route.to ?? 'end'}:${(route.cells ?? []).map(pointKey).join(';')}`);
    const cells = route.cells;
    if (!Array.isArray(cells) || cells.length < 2 || cells.some(point => !Number.isInteger(point.x) || !Number.isInteger(point.y))) {
      violations.push({type: 'invalid-route-cells', routeId}); continue;
    }
    let invalidStep = false;
    for (let index = 1; index < cells.length; index++) {
      const distance = Math.abs(cells[index].x - cells[index - 1].x) + Math.abs(cells[index].y - cells[index - 1].y);
      if (distance !== 1) { violations.push({type: 'non-cardinal-road-step', routeId, index, distance}); invalidStep = true; break; }
    }
    if (invalidStep) continue;
    const fromId = route.from ?? route.sourceId ?? null, toId = route.to ?? route.destinationId ?? null;
    const routeRecord = {routeId, from: fromId, to: toId, cells: cells.map(point => ({x: point.x, y: point.y}))};
    routes.push(routeRecord);
    const first = getNode(cells[0]), last = getNode(cells.at(-1));
    first.endpointOwners.push({routeId, ownerId: fromId, kind: endpointKind(route, 'from', fromId)});
    last.endpointOwners.push({routeId, ownerId: toId, kind: endpointKind(route, 'to', toId)});
    for (let index = 1; index < cells.length; index++) {
      const a = cells[index - 1], b = cells[index], key = edgeKey(a, b);
      const forward = pointKey(a) < pointKey(b);
      let edge = edgeMap.get(key);
      if (!edge) {
        const from = forward ? {...a} : {...b}, to = forward ? {...b} : {...a};
        const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
        edge = {edgeId: `road-edge-${key.replace(/[>,]/g, '-')}`, key, from, to, orientation: (angle + 360) % 360,
          sockets: {start: {type: 'road', x: from.x, y: from.y, orientation: (angle + 180 + 360) % 360, tolerance},
            end: {type: 'road', x: to.x, y: to.y, orientation: (angle + 360) % 360, tolerance}}, owners: []};
        edgeMap.set(key, edge);
        getNode(from).incident.push({edge, side: 'start', neighbor: to});
        getNode(to).incident.push({edge, side: 'end', neighbor: from});
      }
      if (!edge.owners.some(owner => owner.routeId === routeId)) edge.owners.push({routeId, from: fromId, to: toId});
      // Keep node creation explicit for single-cell intersections and stable edge direction.
      getNode(a); getNode(b);
    }
  }
  const nodes = [...nodeMap.values()].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const edges = [...edgeMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const modules = [];
  for (const node of nodes) {
    node.incident.sort((a, b) => a.edge.edgeId.localeCompare(b.edge.edgeId));
    const degree = node.incident.length;
    let kind;
    if (degree === 0) kind = 'isolated';
    else if (degree === 1 && node.endpointOwners.some(owner => owner.kind === 'entrance' || owner.kind === 'driveway')) kind = 'entrance';
    else if (degree === 1) {
      kind = 'endpoint';
    } else if (degree === 2) {
      const [a, b] = node.incident.map(item => item.neighbor);
      kind = a.x === b.x || a.y === b.y ? 'straight' : 'turn';
    } else if (degree === 3) kind = 't-junction';
    else if (degree === 4) kind = 'x-junction';
    else kind = 'junction';
    const sockets = node.incident.map((item, index) => {
      const orientation = (Math.atan2(item.neighbor.y - node.position.y, item.neighbor.x - node.position.x) * 180 / Math.PI + 360) % 360;
      return {socketId: `${node.nodeId}-socket-${index}`, type: kind === 'entrance' ? 'driveway' : 'road', x: node.position.x, y: node.position.y, orientation, tolerance};
    });
    const nodeConnections = node.incident.map((item, index) => {
      const edgeSocket = item.edge.sockets[item.side];
      const connected = socketsConnect(edgeSocket, sockets[index]);
      if (!connected) violations.push({type: 'road-socket-disconnected', nodeId: node.nodeId, edgeId: item.edge.edgeId, routeIds: item.edge.owners.map(owner => owner.routeId)});
      return {edgeId: item.edge.edgeId, socketId: sockets[index].socketId, edgeSocket, nodeSocket: sockets[index], connected};
    });
    node.kind = kind;
    node.endpointOwners.sort((a, b) => String(a.ownerId).localeCompare(String(b.ownerId)) || a.routeId.localeCompare(b.routeId));
    node.connections = nodeConnections;
    node.sockets = sockets;
    delete node.incident;
    modules.push({moduleId: node.nodeId, kind, position: {...node.position}, sockets, connections: nodeConnections,
      endpointOwners: node.endpointOwners, render: {assetId: null, reviewStatus: 'unassigned', enabledByDefault: false}});
  }
  for (const edge of edges) {
    edge.owners.sort((a, b) => a.routeId.localeCompare(b.routeId));
    edge.kind = 'straight';
    edge.connections = ['start', 'end'].map(side => ({nodeId: getNode(edge[side === 'start' ? 'from' : 'to']).nodeId, side,
      connected: nodes.find(node => node.nodeId === getNode(edge[side === 'start' ? 'from' : 'to']).nodeId)?.connections.some(connection => connection.edgeId === edge.edgeId && connection.connected) ?? false}));
    edge.connected = edge.connections.every(connection => connection.connected);
    edge.render = {assetId: null, reviewStatus: 'unassigned', enabledByDefault: false};
    if (!edge.connected) violations.push({type: 'road-edge-unconnected', edgeId: edge.edgeId});
    modules.push({moduleId: edge.edgeId, kind: 'straight', from: {...edge.from}, to: {...edge.to}, orientation: edge.orientation,
      sockets: edge.sockets, owners: edge.owners, connected: edge.connected, render: edge.render});
  }
  const componentByNode = new Map();
  let component = 0;
  for (const node of nodes) {
    if (componentByNode.has(node.nodeId)) continue;
    component++;
    const queue = [node.nodeId]; componentByNode.set(node.nodeId, component);
    while (queue.length) {
      const currentId = queue.shift(), current = nodes.find(candidate => candidate.nodeId === currentId);
      for (const connection of current.connections) {
        const edge = edgeMap.get(edges.find(candidate => candidate.edgeId === connection.edgeId)?.key);
        if (!edge) continue;
        const otherPoint = current.position.x === edge.from.x && current.position.y === edge.from.y ? edge.to : edge.from;
        const otherId = getNode(otherPoint).nodeId;
        if (!componentByNode.has(otherId)) { componentByNode.set(otherId, component); queue.push(otherId); }
      }
    }
  }
  routes.sort((a, b) => a.routeId.localeCompare(b.routeId));
  const connectedComponentCount = new Set(componentByNode.values()).size;
  if (connectedComponentCount > 1) violations.push({type: 'disconnected-road-components', connectedComponentCount});
  const routeConnectivity = routes.map(route => {
    const startId = getNode(route.cells[0]).nodeId, endId = getNode(route.cells.at(-1)).nodeId;
    const connected = componentByNode.get(startId) === componentByNode.get(endId);
    if (!connected) violations.push({type: 'route-disconnected', routeId: route.routeId, from: route.from, to: route.to});
    return {routeId: route.routeId, from: route.from, to: route.to, connected};
  });
  const valid = routes.length === paths.length && edges.length > 0 && connectedComponentCount === 1 && nodes.every(node => node.kind !== 'isolated')
    && edges.every(edge => edge.connected) && routeConnectivity.every(route => route.connected) && violations.length === 0;
  return {unit: 'world-cell', valid, violations, nodes, edges, modules, routes, routeConnectivity,
    connectedComponentCount,
    summary: {routeCount: routes.length, uniqueEdgeCount: edges.length, nodeCount: nodes.length,
      sharedEdgeCount: edges.filter(edge => edge.owners.length > 1).length,
      moduleCounts: Object.fromEntries(['straight', 'turn', 't-junction', 'x-junction', 'entrance', 'endpoint'].map(kind => [kind,
        modules.filter(module => module.kind === kind).length]))}};
}

/** Compile a polygon boundary into reusable fence modules and corner joints. */
export function buildFenceLoop(vertices, gateSegments = [], segmentLength = 1) {
  if (!Array.isArray(vertices) || vertices.length < 3 || !(segmentLength > 0)) throw new TypeError('A fence loop requires a polygon and positive segment length.');
  const gated = new Set(gateSegments.filter(item => typeof item !== 'number').map(item => `${item.edgeIndex}:${item.segmentIndex}`));
  const wholeEdgeGates = new Set(gateSegments.filter(item => typeof item === 'number'));
  const segments = [], joints = [];
  for (let edgeIndex = 0; edgeIndex < vertices.length; edgeIndex++) {
    const from = vertices[edgeIndex], to = vertices[(edgeIndex + 1) % vertices.length];
    const length = Math.hypot(to.x - from.x, to.y - from.y), count = Math.max(1, Math.ceil(length / segmentLength));
    const orientation = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    for (let segmentIndex = 0; segmentIndex < count; segmentIndex++) {
      const t0 = segmentIndex / count, t1 = (segmentIndex + 1) / count;
      const a = {x: from.x + (to.x - from.x) * t0, y: from.y + (to.y - from.y) * t0};
      const b = {x: from.x + (to.x - from.x) * t1, y: from.y + (to.y - from.y) * t1};
      const hasGate = gated.has(`${edgeIndex}:${segmentIndex}`) || (wholeEdgeGates.has(edgeIndex) && segmentIndex === Math.floor(count / 2));
      segments.push({segmentId: `fence-edge-${edgeIndex}-${segmentIndex}`, edgeIndex, segmentIndex, from: a, to: b,
        piece: hasGate ? 'gate' : 'fence', connected: true, sockets: {
          start: {type: hasGate ? 'gate-end' : 'fence-end', x: a.x, y: a.y, orientation: (orientation + 180 + 360) % 360, tolerance: 0.08},
          end: {type: hasGate ? 'gate-end' : 'fence-end', x: b.x, y: b.y, orientation: (orientation + 360) % 360, tolerance: 0.08},
        }});
    }
  }
  for (let index = 0; index < vertices.length; index++) {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length], point = vertices[index], next = vertices[(index + 1) % vertices.length];
    const incoming = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
    const outgoing = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
    joints.push({jointId: `fence-corner-${index}`, position: {...point}, type: 'fence-corner', sockets: [
      {type: 'fence-corner', x: point.x, y: point.y, orientation: (incoming + 180 + 360) % 360, tolerance: 0.08},
      {type: 'fence-corner', x: point.x, y: point.y, orientation: (outgoing + 360) % 360, tolerance: 0.08},
    ]});
  }
  const connections = [];
  for (let index = 0; index < segments.length; index++) {
    const current = segments[index], next = segments[(index + 1) % segments.length];
    let connected;
    if (current.edgeIndex === next.edgeIndex) {
      connected = socketsConnect(current.sockets.end, next.sockets.start);
    } else {
      const joint = joints[(current.edgeIndex + 1) % vertices.length];
      connected = socketsConnect(current.sockets.end, joint.sockets[0]) && socketsConnect(joint.sockets[1], next.sockets.start);
    }
    current.connected = connected;
    connections.push({from: current.segmentId, to: next.segmentId, connected});
  }
  return {segments, joints, connections, closed: segments.length > 0 && joints.length === vertices.length && connections.every(item => item.connected),
    gateCount: segments.filter(segment => segment.piece === 'gate').length, sharedUnit: 'world-cell'};
}

/** Backwards-compatible segment list for simple callers. */
export function buildFenceBoundary(vertices, gateEdges = []) {
  return buildFenceLoop(vertices, gateEdges).segments;
}

/**
 * Assemble a small, hierarchical cattle-handling prefab in world-cell units.
 * Geometry is declarative: consumers can render approved fence modules when
 * they exist, while the parent composite sprite remains the only visual until
 * those module assets are reviewed.
 */
export function buildModularCorralPrefab({origin = {x: 0, y: 0}, width = 8, height = 5, gateEdge = 0, gateSegment = null, segmentLength = 1} = {}) {
  if (!(width >= 5 && height >= 3 && segmentLength > 0)) throw new RangeError('Corral prefab requires width >= 5, height >= 3 and positive segment length.');
  if (gateEdge !== 3) throw new RangeError('The current corral grammar supports an entrance on its west boundary (gateEdge 3).');
  const bounds = {left: origin.x, top: origin.y, right: origin.x + width, bottom: origin.y + height};
  const entranceIndex = gateSegment ?? Math.floor((gateEdge === 0 || gateEdge === 2 ? width : height) / (2 * segmentLength));
  const outline = buildFenceLoop([
    {x: bounds.left, y: bounds.top}, {x: bounds.right, y: bounds.top},
    {x: bounds.right, y: bounds.bottom}, {x: bounds.left, y: bounds.bottom},
  ], [{edgeIndex: gateEdge, segmentIndex: entranceIndex}], segmentLength);
  const parentGate = outline.segments.find(segment => segment.piece === 'gate');
  if (!parentGate) throw new RangeError('Corral entrance segment does not fit the west boundary.');
  const gateCenter = {x: (parentGate.from.x + parentGate.to.x) / 2, y: (parentGate.from.y + parentGate.to.y) / 2};
  const dividerX = bounds.left + Math.max(2, Math.floor(width * 0.56));
  const alleyY = gateCenter.y;
  const railSpecs = [
    {id: 'sorting-divider', from: {x: dividerX, y: bounds.top}, to: {x: dividerX, y: alleyY}},
    {id: 'handling-alley-west', from: {x: bounds.left, y: alleyY}, to: {x: dividerX, y: alleyY}},
    {id: 'handling-alley-east', from: {x: dividerX, y: alleyY}, to: {x: bounds.right, y: alleyY}},
  ];
  const interiorRails = railSpecs.flatMap(rail => {
    const length = Math.hypot(rail.to.x - rail.from.x, rail.to.y - rail.from.y), count = Math.max(1, Math.ceil(length / segmentLength));
    const angle = Math.atan2(rail.to.y - rail.from.y, rail.to.x - rail.from.x) * 180 / Math.PI;
    return Array.from({length: count}, (_, index) => {
      const t0 = index / count, t1 = (index + 1) / count;
      const from = {x: rail.from.x + (rail.to.x - rail.from.x) * t0, y: rail.from.y + (rail.to.y - rail.from.y) * t0};
      const to = {x: rail.from.x + (rail.to.x - rail.from.x) * t1, y: rail.from.y + (rail.to.y - rail.from.y) * t1};
      return {segmentId: `corral-${rail.id}-${index}`, parentId: rail.id, piece: 'fence', from, to, connected: false,
        render: {assetId: 'fence-wire-wood-post-imagegen-v1', assetReviewStatus: 'REVIEW', worldAnchor: {x: (from.x + to.x) / 2, y: (from.y + to.y) / 2},
          worldOrientationDegrees: angle, arbitraryRotationApproved: false}, sockets: {
        start: {type: 'fence-end', x: from.x, y: from.y, orientation: (angle + 180 + 360) % 360, tolerance: 0.08},
        end: {type: 'fence-end', x: to.x, y: to.y, orientation: (angle + 360) % 360, tolerance: 0.08},
      }};
    });
  });
  const children = [
    {id: 'holding-pen', kind: 'livestock-pen', polygon: rectanglePolygon(dividerX - bounds.left, alleyY - bounds.top, origin), access: 'sorting-divider'},
    {id: 'sorting-pen', kind: 'sorting-pen', polygon: rectanglePolygon(bounds.right - dividerX, alleyY - bounds.top, {x: dividerX, y: bounds.top}), access: 'handling-alley-east'},
    {id: 'handling-lane', kind: 'handling-lane', polygon: rectanglePolygon(width, bounds.bottom - alleyY, {x: bounds.left, y: alleyY}), access: 'entrance-gate'},
  ];
  const gateSocket = parentGate ? {type: 'gate', x: (parentGate.from.x + parentGate.to.x) / 2, y: (parentGate.from.y + parentGate.to.y) / 2,
    orientation: (Math.atan2(parentGate.to.y - parentGate.from.y, parentGate.to.x - parentGate.from.x) * 180 / Math.PI + 90 + 360) % 360, tolerance: 0.5} : null;
  const prefab = {prefabId: 'cattle-handling-yard-v1', kind: 'handling-yard', unit: 'world-cell', origin: {...origin}, footprint: {width, height},
    children, boundary: outline, interiorRails, sockets: gateSocket ? [{id: 'entrance', ...gateSocket},
      {id: 'livestock-access', type: 'paddock-entrance', x: gateSocket.x, y: gateSocket.y, orientation: (gateSocket.orientation + 180) % 360, tolerance: 0.5}] : [],
    connections: [], junctions: [], renderPolicy: 'parent-composite-only-until-modules-are-art-reviewed', status: 'assembled'};
  const connect = (fromId, toId, a, b, kind) => {
    const connected = socketsConnect(a, b);
    prefab.connections.push({from: fromId, to: toId, fromSocket: a, toSocket: b, kind, connected});
    return connected;
  };
  for (const railSpec of railSpecs) {
    const group = interiorRails.filter(segment => segment.parentId === railSpec.id);
    for (let index = 1; index < group.length; index++) connect(group[index - 1].segmentId, group[index].segmentId, group[index - 1].sockets.end, group[index].sockets.start, 'continuous-rail');
  }
  const junction = (id, position, endpoints, kind) => {
    const sockets = endpoints.map((endpoint, index) => ({type: 'fence-junction', x: position.x, y: position.y,
      orientation: (endpoint.socket.orientation + 180) % 360, tolerance: endpoint.socket.tolerance ?? 0.08, socketId: `${id}-${index}`}));
    const node = {junctionId: id, kind, position: {...position}, sockets, connections: []};
    endpoints.forEach((endpoint, index) => {
      const connected = connect(endpoint.segment.segmentId, id, endpoint.socket, sockets[index], kind === 'boundary-tie-in' ? 'boundary-anchor' : 'rail-junction');
      node.connections.push({segmentId: endpoint.segment.segmentId, socketIndex: index, connected});
    });
    prefab.junctions.push(node);
  };
  const boundaryEndpointsAt = point => outline.segments.flatMap(segment => {
    const matches = [];
    if (Math.hypot(segment.from.x - point.x, segment.from.y - point.y) <= 0.001) matches.push({segment, socket: segment.sockets.start});
    if (Math.hypot(segment.to.x - point.x, segment.to.y - point.y) <= 0.001) matches.push({segment, socket: segment.sockets.end});
    return matches;
  });
  const topDivider = interiorRails.find(segment => segment.parentId === 'sorting-divider' && segment.sockets.start.y === bounds.top);
  const westAlley = interiorRails.find(segment => segment.parentId === 'handling-alley-west' && segment.sockets.start.x === bounds.left);
  const eastAlley = interiorRails.findLast(segment => segment.parentId === 'handling-alley-east' && segment.sockets.end.x === bounds.right);
  const tWest = interiorRails.findLast(segment => segment.parentId === 'handling-alley-west');
  const tEast = interiorRails.find(segment => segment.parentId === 'handling-alley-east');
  const dividerEnd = interiorRails.findLast(segment => segment.parentId === 'sorting-divider');
  if (topDivider) junction('boundary-top', topDivider.from, [
    ...boundaryEndpointsAt(topDivider.from), {segment: topDivider, socket: topDivider.sockets.start},
  ], 'boundary-tie-in');
  if (westAlley) {
    const gateConnection = socketsConnect(gateSocket, westAlley.sockets.start);
    prefab.connections.push({from: 'entrance-gate', to: westAlley.segmentId, fromSocket: gateSocket, toSocket: westAlley.sockets.start, kind: 'gate-to-alley', connected: gateConnection});
    if (!gateConnection) junction('boundary-west', westAlley.from, [{segment: westAlley, socket: westAlley.sockets.start}], 'boundary-tie-in');
    else prefab.gateCenter = gateCenter;
  }
  if (eastAlley) junction('boundary-east', eastAlley.to, [
    ...boundaryEndpointsAt(eastAlley.to), {segment: eastAlley, socket: eastAlley.sockets.end},
  ], 'boundary-tie-in');
  if (tWest && tEast && dividerEnd) junction('alley-crossing', {x: dividerX, y: alleyY}, [
    {segment: tWest, socket: tWest.sockets.end}, {segment: tEast, socket: tEast.sockets.start}, {segment: dividerEnd, socket: dividerEnd.sockets.end},
  ], 'three-way-rail');
  const boundaryRenderModules = outline.segments.map(segment => ({moduleId: segment.segmentId, kind: segment.piece,
    assetId: segment.piece === 'gate' ? 'fence-gate-wood-imagegen-v1' : 'fence-wire-wood-post-imagegen-v1',
    worldAnchor: {x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2},
    worldOrientationDegrees: Math.atan2(segment.to.y - segment.from.y, segment.to.x - segment.from.x) * 180 / Math.PI,
    assetReviewStatus: 'REVIEW', enabledByDefault: false, arbitraryRotationApproved: false}));
  prefab.renderModules = [...boundaryRenderModules, ...interiorRails.map(segment => ({moduleId: segment.segmentId,
    kind: 'fence', assetId: segment.render.assetId, worldAnchor: segment.render.worldAnchor,
    worldOrientationDegrees: segment.render.worldOrientationDegrees, assetReviewStatus: segment.render.assetReviewStatus,
    enabledByDefault: false, arbitraryRotationApproved: false}))];
  const allConnected = prefab.connections.length > 0 && prefab.connections.every(connection => connection.connected)
    && prefab.junctions.every(node => node.connections.length > 0 && node.connections.every(connection => connection.connected));
  for (const rail of interiorRails) rail.connected = allConnected;
  prefab.valid = outline.closed && outline.gateCount === 1 && allConnected
    && prefab.renderModules.length === outline.segments.length + interiorRails.length
    && prefab.sockets.length === 2 && socketsConnect(prefab.sockets[0], prefab.sockets[1]);
  return prefab;
}

/**
 * Deduplicate coincident fence pieces across polygon loops. Each paddock keeps
 * its own closed-loop references, while this compiled network stores a shared
 * boundary once and records all owning paddocks.
 */
export function compileFenceNetwork(loops, precision = 1000) {
  const quantize = point => ({x: Math.round(point.x * precision) / precision, y: Math.round(point.y * precision) / precision});
  const keyPoint = point => `${point.x},${point.y}`;
  const modules = new Map();
  for (const loop of loops) for (const segment of loop.segments) {
    const from = quantize(segment.from), to = quantize(segment.to);
    const forward = `${keyPoint(from)}>${keyPoint(to)}`, reverse = `${keyPoint(to)}>${keyPoint(from)}`;
    const key = forward < reverse ? forward : reverse;
    const existing = modules.get(key);
    if (existing) {
      existing.owners.push(loop.ownerId);
      if (segment.piece === 'gate') existing.piece = 'gate';
    } else modules.set(key, {...segment, from, to, networkSegmentId: `fence-network-${modules.size}`, owners: [loop.ownerId]});
  }
  const segments = [...modules.values()];
  return {unit: 'world-cell', segments, sharedSegments: segments.filter(segment => new Set(segment.owners).size > 1),
    owners: loops.map(loop => ({ownerId: loop.ownerId, segmentIds: loop.segments.map(segment => {
      const from = quantize(segment.from), to = quantize(segment.to);
      const a = `${keyPoint(from)}>${keyPoint(to)}`, b = `${keyPoint(to)}>${keyPoint(from)}`;
      const key = a < b ? a : b;
      return modules.get(key).networkSegmentId;
    })})), valid: segments.every(segment => segment.connected)};
}

/** Bridson-like Poisson sampling in semantic zones, with deterministic ordering. */
export function poissonDiskPoints(zone, {radius, seed = 1, blocked = [], count = 32} = {}) {
  const random = seededRandom(seed), points = [], obstacle = blocked.map(item => ({box: bounds(item.polygon ?? item), clearance: item.clearance ?? radius}));
  const gridSize = radius / Math.SQRT2;
  const valid = point => point.x >= zone.left && point.x <= zone.right && point.y >= zone.top && point.y <= zone.bottom
    && !obstacle.some(({box, clearance}) => point.x >= box.left - clearance && point.x <= box.right + clearance && point.y >= box.top - clearance && point.y <= box.bottom + clearance)
    && points.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= radius);
  for (let attempt = 0; attempt < 80 && !points.length; attempt++) {
    const first = {x: zone.left + random() * (zone.right - zone.left), y: zone.top + random() * (zone.bottom - zone.top)};
    if (valid(first)) points.push(first);
  }
  const active = [...points];
  while (active.length && points.length < count) {
    const base = active[Math.floor(random() * active.length)]; let found = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = random() * Math.PI * 2, distance = radius * (1 + random());
      const candidate = {x: base.x + Math.cos(angle) * distance, y: base.y + Math.sin(angle) * distance};
      if (!valid(candidate)) continue;
      points.push(candidate); active.push(candidate); found = true; break;
    }
    if (!found) active.splice(active.indexOf(base), 1);
  }
  return points;
}
