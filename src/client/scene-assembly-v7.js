/**
 * Riose scene assembly V7. Pure, deterministic, presentation-only farm layout.
 * Spatial values are metres. Terrain cells are explicitly 2 x 2 metres.
 * This module does not read or write simulator state.
 */

export const SCENE_ASSEMBLY_V7 = Object.freeze({
  version: 'riose-scene-v7',
  units: 'm',
  terrainCellM: 2,
  world: Object.freeze({ widthM: 72, heightM: 48 }),
  projection: Object.freeze({ pixelsPerMeterX: 12, pixelsPerMeterY: 6, elevationPixelsPerMeter: 6 }),
});
export const SCENE_V7_WORLD = SCENE_ASSEMBLY_V7.world;
export const projectIso = worldToIsoV7;
export const unprojectIso = isoToWorldV7;

const EPS = 1e-8;
const SOCKET_COMPATIBILITY = Object.freeze({
  'road-end': ['driveway', 'paddock-access', 'handling-entry', 'handling-exit'],
  'road-intersection': ['road-end'],
  'building-entrance': ['driveway', 'handling-entry', 'handling-exit', 'pedestrian-path'],
  driveway: ['road-end', 'building-entrance'],
  'fence-end': ['fence-end', 'fence-corner', 'gate'],
  'fence-corner': ['fence-end', 'fence-corner'],
  gate: ['fence-end', 'paddock-access', 'handling-entry', 'handling-exit'],
  'paddock-access': ['road-end', 'gate', 'water-access'],
  'water-access': ['paddock-access', 'livestock-area'],
  'handling-entry': ['road-end', 'building-entrance', 'gate'],
  'handling-exit': ['road-end', 'building-entrance', 'gate'],
  'pedestrian-path': ['building-entrance'],
  'livestock-area': ['water-access'],
});

const point = (x, y) => ({ x, y });
const rect = (x, y, width, height) => ({ x, y, width, height });
const finite = (n) => Number.isFinite(n);
const mod = (n, d) => ((n % d) + d) % d;

export function worldToIsoV7({ x, y, elevation = 0 }, projection = SCENE_ASSEMBLY_V7.projection) {
  return {
    x: (x - y) * projection.pixelsPerMeterX / 2,
    y: (x + y) * projection.pixelsPerMeterY / 2 - elevation * projection.elevationPixelsPerMeter,
  };
}

export function isoToWorldV7({ x, y }, projection = SCENE_ASSEMBLY_V7.projection, elevation = 0) {
  const dx = 2 * x / projection.pixelsPerMeterX;
  const dy = 2 * (y + elevation * projection.elevationPixelsPerMeter) / projection.pixelsPerMeterY;
  return { x: (dx + dy) / 2, y: (dy - dx) / 2 };
}

export function worldToScreenV7(position, camera = {}, projection = SCENE_ASSEMBLY_V7.projection) {
  const iso = worldToIsoV7(position, projection);
  const zoom = finite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  return { x: (iso.x - (camera.centerX ?? 0)) * zoom + (camera.viewportX ?? 0),
    y: (iso.y - (camera.centerY ?? 0)) * zoom + (camera.viewportY ?? 0) };
}

export function screenToWorldV7(position, camera = {}, projection = SCENE_ASSEMBLY_V7.projection, elevation = 0) {
  const zoom = finite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  return isoToWorldV7({ x: (position.x - (camera.viewportX ?? 0)) / zoom + (camera.centerX ?? 0),
    y: (position.y - (camera.viewportY ?? 0)) / zoom + (camera.centerY ?? 0) }, projection, elevation);
}

export function snapToGridV7(position, cellM = SCENE_ASSEMBLY_V7.terrainCellM) {
  return { x: Math.round(position.x / cellM) * cellM, y: Math.round(position.y / cellM) * cellM };
}

export function snapToFootprintV7(position, footprint, cellM = SCENE_ASSEMBLY_V7.terrainCellM) {
  const snapped = snapToGridV7(position, cellM);
  return { x: snapped.x, y: snapped.y, width: footprint.width, height: footprint.height };
}

export function snapToTerrainV7(position, terrain = {}) {
  const cellM = terrain.cellM ?? SCENE_ASSEMBLY_V7.terrainCellM;
  const x = Math.max(0, Math.min(terrain.widthM ?? SCENE_ASSEMBLY_V7.world.widthM, position.x));
  const y = Math.max(0, Math.min(terrain.heightM ?? SCENE_ASSEMBLY_V7.world.heightM, position.y));
  return { ...snapToGridV7({ x, y }, cellM), material: terrain.materialAt?.(x, y) ?? 'pasture', elevation: terrain.elevationAt?.(x, y) ?? 0 };
}

export function snapToSocketV7(socket, candidate, toleranceM = socket.toleranceM ?? 0.05) {
  const compatible = (SOCKET_COMPATIBILITY[socket.type] ?? []).includes(candidate.type)
    || (SOCKET_COMPATIBILITY[candidate.type] ?? []).includes(socket.type);
  const distanceM = Math.hypot(socket.position.x - candidate.position.x, socket.position.y - candidate.position.y);
  const orientationErrorDeg = angularDifference(socket.orientationDeg ?? 0, (candidate.orientationDeg ?? 0) + 180);
  return { ...socket.position, compatible, connected: compatible && distanceM <= toleranceM && orientationErrorDeg <= (socket.orientationToleranceDeg ?? 5), distanceM, orientationErrorDeg };
}

function angularDifference(a, b) { const d = mod(a - b + 180, 360) - 180; return Math.abs(d); }

function geometry(footprint, source = 'candidate-unverified') {
  const { width, height } = footprint;
  return {
    groundFootprint: { width, height },
    visualBounds: { x: 0, y: -height * 2, width: width * 2, height: height * 2, confidence: 'candidate-unverified' },
    groundAnchor: { x: width / 2, y: height, confidence: 'candidate-unverified' },
    collisionPolygon: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }],
    height: { metres: null, status: 'uncalibrated' },
    orientation: { degrees: 0, supported: [0], status: 'candidate' },
    clearancePolygon: [],
    connectionSockets: [],
    occlusionGeometry: { type: 'ground-anchor-depth', confidence: 'candidate-unverified' },
    geometryStatus: source,
  };
}

function makeEntity({ id, kind, x, y, width, height, role, prefabId, sockets = [], geometryStatus }) {
  const geo = geometry(rect(0, 0, width, height), geometryStatus);
  return { id, kind, role, prefabId, assetId: null, x, y, worldPosition: point(x, y), ...geo,
    groundAnchor: { x: x + width / 2, y: y + height, confidence: 'candidate-unverified' },
    footprintMeters: { width, height }, visualSizePixels: null,
    connectionSockets: sockets.map((socket) => ({ ...socket, position: { ...socket.position }, state: 'open' })) };
}

function makeSocket(id, type, x, y, orientationDeg, extra = {}) {
  return { id, type, position: point(x, y), orientationDeg, toleranceM: 0.05, orientationToleranceDeg: 5, compatibility: SOCKET_COMPATIBILITY[type] ?? [], state: 'open', ...extra };
}

function edgeKey(a, b) {
  const one = `${a.x.toFixed(3)},${a.y.toFixed(3)}`;
  const two = `${b.x.toFixed(3)},${b.y.toFixed(3)}`;
  return one < two ? `${one}|${two}` : `${two}|${one}`;
}

function splitEdge(start, end, cellM) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy), count = Math.round(length / cellM);
  if (count < 1 || Math.abs(length / count - cellM) > EPS) return [];
  return Array.from({ length: count }, (_, index) => ({
    a: point(start.x + dx * index / count, start.y + dy * index / count),
    b: point(start.x + dx * (index + 1) / count, start.y + dy * (index + 1) / count),
  }));
}

/** Builds a deduplicated modular fence graph from polygon boundaries. */
export function buildFenceNetworkV7(zones, gateRequests = [], moduleLengthM = 3) {
  const edges = new Map();
  for (const zone of zones) {
    const { x, y, width, height } = zone.bounds;
    const corners = [point(x, y), point(x + width, y), point(x + width, y + height), point(x, y + height)];
    for (let i = 0; i < corners.length; i++) {
    for (const segment of splitEdge(corners[i], corners[(i + 1) % corners.length], moduleLengthM)) {
        const key = edgeKey(segment.a, segment.b);
        const current = edges.get(key) ?? { ...segment, owners: [] };
        current.owners.push(zone.id);
        edges.set(key, current);
      }
    }
  }
  const requests = new Map(gateRequests.map((request) => [edgeKey(request.a, request.b), request]));
  const segments = [...edges.entries()].map(([key, edge], index) => {
    const request = requests.get(key);
    const shared = edge.owners.length > 1;
    return { id: `fence-${String(index + 1).padStart(3, '0')}`, key, a: edge.a, b: edge.b,
      owners: [...edge.owners].sort(), sharedBoundary: shared, type: request ? 'gate' : 'fence-segment',
      lengthM: Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y),
      connectionStatus: request ? 'connected' : shared ? 'shared' : 'candidate-open-at-network-boundary',
      socketA: makeSocket(`fence-${index + 1}-a`, request ? 'gate' : 'fence-end', edge.a.x, edge.a.y, edgeOrientation(edge.a, edge.b)),
      socketB: makeSocket(`fence-${index + 1}-b`, request ? 'gate' : 'fence-end', edge.b.x, edge.b.y, edgeOrientation(edge.b, edge.a)),
      geometryStatus: 'candidate-unverified', ...(request ? { gateId: request.id, connectsTo: request.connectsTo } : {}) };
  });
  const requestedKeys = [...requests.keys()];
  const missingGateRequests = requestedKeys.filter((key) => !edges.has(key));
  return { version: 'fence-network-v7', unit: 'm', moduleLengthM, segments,
    gateOpenings: segments.filter((item) => item.type === 'gate').map(({ id, gateId, a, b, connectsTo }) => ({ id, gateId, a, b, connectsTo, status: 'connected' })),
    diagnostics: { duplicateBoundariesRemoved: segments.filter((item) => item.sharedBoundary).length,
      invalidGateRequests: missingGateRequests, invalidGateCount: missingGateRequests.length } };
}

function edgeOrientation(a, b) { return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }

function component(id, kind, x, y, width, height, sockets = [], parentId = null) {
  return { id, kind, parentId, x, y, ...geometry(rect(0, 0, width, height)), relativeTransform: parentId ? { x, y, rotationDeg: 0 } : null,
    connectionSockets: sockets, assemblyStatus: 'candidate-unverified', geometryStatus: 'candidate-unverified' };
}

function makePrefabAssemblies(scenarioId) {
  const dairy = scenarioId === 'dairy';
  const structures = [];
  const farmhouse = makeEntity({ id: 'farmstead', kind: 'farmhouse', role: 'visual-anchor', prefabId: 'rural-headquarters-v7', x: 54, y: 15, width: 12, height: 9,
    sockets: [makeSocket('farmstead-driveway', 'building-entrance', 54, 18, 180)] });
  const barn = makeEntity({ id: dairy ? 'milking-barn' : 'equipment-barn', kind: dairy ? 'milking-barn' : 'equipment-barn', role: 'secondary-anchor', prefabId: dairy ? 'dairy-unit-v7' : 'rural-headquarters-v7', x: 27, y: 15, width: 18, height: 12,
    sockets: [makeSocket('barn-driveway', 'building-entrance', 45, 21, 0), makeSocket('barn-handling', 'handling-entry', 36, 27, 90)] });
  structures.push(farmhouse, barn);

  const handling = { id: 'cattle-handling', kind: 'handling-facility', x: 30, y: 30, width: 12, height: 10, prefabId: 'cattle-handling-facility-v7', geometryStatus: 'candidate-unverified',
    parts: [
      component('holding-pen', 'waiting-pen', 0, 0, 12, 4, [], 'cattle-handling'),
      component('working-alley', 'handling-alley', 5, 4, 2, 4, [], 'cattle-handling'),
      component('handling-gate', 'gate-module', 5, 4, 2, 2, [makeSocket('handling-entry-socket', 'handling-entry', 5, 4, 90), makeSocket('handling-exit-socket', 'handling-exit', 7, 5, 0)], 'cattle-handling'),
      component('load-out', 'load-out-zone', 0, 8, 12, 2, [], 'cattle-handling'),
    ],
    sockets: [makeSocket('cattle-handling-road-access', 'handling-entry', 42, 35, 0), makeSocket('cattle-handling-paddock-access', 'handling-exit', 30, 32, 180)] };
  if (dairy) {
    handling.kind = 'dairy-handling';
    handling.prefabId = 'dairy-parlor-and-yard-v7';
    handling.parts.push(component('milking-parlor', 'milking-parlor', 0, 0, 12, 4, [makeSocket('parlor-entry', 'building-entrance', 12, 2, 0)], 'cattle-handling'));
  }
  return { structures, assemblies: [{ id: 'cattle-handling', kind: handling.kind, prefabId: handling.prefabId,
    x: handling.x, y: handling.y, width: handling.width, height: handling.height, worldPosition: point(handling.x, handling.y),
    footprintMeters: { width: handling.width, height: handling.height }, groundFootprint: { width: handling.width, height: handling.height },
    bounds: rect(handling.x, handling.y, handling.width, handling.height), geometryStatus: handling.geometryStatus,
    parts: handling.parts, connectionSockets: handling.sockets }] };
}

function makePaddocks() {
  return [
    { id: 'paddock-west-north', kind: 'grazing-paddock', bounds: rect(3, 3, 18, 12), pastureClass: 'managed', animalsAllowed: true },
    { id: 'paddock-west-south', kind: 'grazing-paddock', bounds: rect(3, 27, 18, 18), pastureClass: 'managed', animalsAllowed: true },
    { id: 'paddock-east-north', kind: 'grazing-paddock', bounds: rect(51, 3, 18, 12), pastureClass: 'managed', animalsAllowed: true },
    { id: 'paddock-east-south', kind: 'grazing-paddock', bounds: rect(51, 27, 18, 18), pastureClass: 'managed', animalsAllowed: true },
  ].map((zone) => ({ ...zone, geometryStatus: 'candidate-unverified', groundFootprint: { ...zone.bounds }, accessIds: [] }));
}

function makeRoadNetwork(gateRequests = []) {
  const nodes = [
    { id: 'public-entry', kind: 'road-end', position: point(36, 48) },
    { id: 'south-junction', kind: 'road-intersection', position: point(36, 47) },
    { id: 'east-spine-south', kind: 'road-end', position: point(48, 47) },
    { id: 'east-spine-north', kind: 'road-intersection', position: point(48, 1) },
    { id: 'farmstead-driveway', kind: 'driveway', position: point(54, 18) },
    { id: 'barn-driveway', kind: 'driveway', position: point(45, 21) },
    { id: 'handling-access', kind: 'handling-entry', position: point(42, 35) },
    { id: 'west-spine-south', kind: 'road-end', position: point(24, 47) },
    { id: 'west-spine-north', kind: 'road-end', position: point(24, 1) },
  ];
  const edges = [
    ['public-entry', 'south-junction'], ['south-junction', 'east-spine-south'], ['east-spine-south', 'east-spine-north'],
    ['east-spine-north', 'farmstead-driveway'], ['east-spine-north', 'barn-driveway'], ['handling-access', 'east-spine-south'],
    ['south-junction', 'west-spine-south'], ['west-spine-south', 'west-spine-north'],
  ].map(([from, to], index) => ({ id: `road-edge-${index + 1}`, from, to, widthM: 2, surface: 'compacted-earth', geometryStatus: 'candidate-unverified' }));
  const polylines = [
    { id: 'east-farm-spine', points: [point(36, 48), point(36, 47), point(48, 47), point(48, 1)], widthM: 2,
      sockets: [makeSocket('east-spine-entry', 'road-end', 36, 48, 0), makeSocket('east-spine-north-socket', 'road-intersection', 48, 1, 270)] },
    { id: 'farmstead-driveway-road', points: [point(48, 1), point(48, 18), point(54, 18)], widthM: 2,
      sockets: [makeSocket('farmstead-road-socket', 'driveway', 54, 18, 0)] },
    { id: 'barn-driveway-road', points: [point(48, 1), point(48, 21), point(45, 21)], widthM: 2,
      sockets: [makeSocket('barn-road-socket', 'driveway', 45, 21, 180)] },
    { id: 'handling-driveway-road', points: [point(48, 47), point(48, 35), point(42, 35)], widthM: 2,
      sockets: [makeSocket('handling-road-socket', 'handling-entry', 42, 35, 180)] },
    { id: 'west-farm-spine', points: [point(36, 47), point(24, 47), point(24, 1)], widthM: 2,
      sockets: [makeSocket('west-spine-south-socket', 'road-end', 24, 47, 270), makeSocket('west-spine-north-socket', 'road-end', 24, 1, 270)] },
  ];
  for (const gate of gateRequests) {
    const center = point((gate.a.x + gate.b.x) / 2, (gate.a.y + gate.b.y) / 2);
    const spineX = gate.zoneId.includes('west') ? 24 : 48;
    const id = `${gate.id}-access-road`;
    const roadEnd = makeSocket(`${id}-gate`, 'road-end', center.x, center.y, spineX > center.x ? 0 : 180);
    const gateSocket = makeSocket(`${gate.id}-road-access`, 'paddock-access', center.x, center.y, spineX > center.x ? 180 : 0);
    gate.roadSocket = gateSocket;
    polylines.push({ id, points: [center, point(spineX, center.y), point(spineX, gate.zoneId.includes('north') ? 1 : 47)], widthM: 2,
      sockets: [roadEnd], gateId: gate.id, geometryStatus: 'candidate-unverified' });
    nodes.push({ id: `${gate.id}-road-junction`, kind: 'road-intersection', position: point(spineX, center.y) });
    nodes.push({ id: `${gate.id}-road-end`, kind: 'road-end', position: center });
    edges.push({ id: `${id}-connector`, from: `${gate.id}-road-end`, to: `${gate.id}-road-junction`, widthM: 2, surface: 'compacted-earth', geometryStatus: 'candidate-unverified' });
  }
  return { version: 'farm-road-graph-v7', nodes, edges, polylines, routes: [
    { id: 'public-access-to-farmstead', from: 'public-entry', to: 'farmstead-driveway', edgeIds: ['road-edge-1', 'road-edge-2', 'road-edge-3', 'road-edge-4'] },
    { id: 'public-access-to-barn', from: 'public-entry', to: 'barn-driveway', edgeIds: ['road-edge-1', 'road-edge-2', 'road-edge-3', 'road-edge-5'] },
    { id: 'public-access-to-handling', from: 'public-entry', to: 'handling-access', edgeIds: ['road-edge-1', 'road-edge-2', 'road-edge-6'] },
    { id: 'west-pastures-access', from: 'public-entry', to: 'west-spine-north', edgeIds: ['road-edge-1', 'road-edge-7', 'road-edge-8'] },
  ] };
}

function makeGateRequests(paddocks) {
  const definitions = [
    ['gate-west-north', 'paddock-west-north', point(21, 6), point(21, 9), 'west-spine-north'],
    ['gate-west-south', 'paddock-west-south', point(21, 33), point(21, 36), 'west-spine-south'],
    ['gate-east-north', 'paddock-east-north', point(51, 6), point(51, 9), 'east-spine-north'],
    ['gate-east-south', 'paddock-east-south', point(51, 33), point(51, 36), 'east-spine-south'],
  ];
  for (const [id, zoneId, a, b, connectsTo] of definitions) {
    const zone = paddocks.find((item) => item.id === zoneId);
    zone.accessIds.push(id);
  }
  return definitions.map(([id, zoneId, a, b, connectsTo]) => ({ id, zoneId, a, b, connectsTo }));
}

function makeWaterPoints() {
  return [
    { id: 'water-west-north', x: 12, y: 9, zoneId: 'paddock-west-north', capacityL: null },
    { id: 'water-west-south', x: 12, y: 36, zoneId: 'paddock-west-south', capacityL: null },
    { id: 'water-east-north', x: 60, y: 9, zoneId: 'paddock-east-north', capacityL: null },
    { id: 'water-east-south', x: 60, y: 36, zoneId: 'paddock-east-south', capacityL: null },
  ].map((water) => ({ ...water, kind: 'livestock-water-point', groundFootprint: rect(water.x - 1, water.y - 1, 2, 2),
    geometryStatus: 'candidate-unverified', connectionSockets: [makeSocket(`${water.id}-access`, 'water-access', water.x, water.y, 0)] }));
}

function buildConnections(assemblies, structures, paddocks, roadNetwork, waterPoints, gates) {
  const links = [];
  const add = (id, type, from, to, status = 'connected', positions = null) => links.push({ id, type, from, to, status, toleranceM: 0.05, ...(positions ? { positions } : {}), geometryStatus: 'candidate-unverified' });
  for (const structure of structures) {
    const edgeId = structure.id === 'farmstead' ? 'road-edge-4' : 'road-edge-5';
    const nodeId = structure.connectionSockets[0]?.id;
    const entrance = structure.connectionSockets[0].position;
    add(`road-to-${structure.id}`, 'road-end/driveway/building-entrance', `road:${edgeId}`, `structure:${structure.id}:socket:${nodeId}`, 'connected', { road: entrance, structure: entrance });
  }
  add('road-to-cattle-handling', 'road-end/handling-entry', 'road:handling-driveway-road', 'assembly:cattle-handling:socket:cattle-handling-road-access', 'connected', { road: point(42, 35), assembly: point(42, 35) });
  for (const gate of gates) {
    const center = point((gate.a.x + gate.b.x) / 2, (gate.a.y + gate.b.y) / 2);
    add(`road-to-${gate.id}`, 'road-end/paddock-access/gate', `road:${gate.id}-access-road`, `gate:${gate.id}`, 'connected', { road: center, gate: center });
  }
  for (const water of waterPoints) add(`paddock-to-${water.id}`, 'livestock-area/water-access', `zone:${water.zoneId}`, `water:${water.id}`);
  for (const zone of paddocks) add(`${zone.id}-gate-access`, 'paddock-access/gate', `zone:${zone.id}`, `gate:${zone.accessIds[0]}`);
  return links;
}

function overlap(a, b) { return a.x < b.x + b.width - EPS && a.x + a.width > b.x + EPS && a.y < b.y + b.height - EPS && a.y + a.height > b.y + EPS; }

/** Flatten the compiled farm plan into render-ready world-space records.
 * Asset IDs and visual pixel sizes are intentionally null until a source sprite
 * is spatially calibrated; consumers must not infer them from PNG dimensions.
 */
export function sceneV7RenderDescriptors(scene) {
  const out = [];
  for (const entity of scene.structures ?? []) out.push({ id: entity.id, kind: entity.kind, assetId: entity.assetId ?? null,
    worldPosition: { ...entity.worldPosition }, groundAnchor: { ...entity.groundAnchor }, footprintMeters: { ...entity.footprintMeters },
    visualSizePixels: entity.visualSizePixels ?? null, geometryStatus: entity.geometryStatus, zOrderAnchor: { ...entity.groundAnchor } });
  for (const prefab of scene.assemblies ?? []) {
    const base = prefab.worldPosition ?? point(prefab.x, prefab.y);
    out.push({ id: prefab.id, kind: prefab.kind, assetId: prefab.assetId ?? null, worldPosition: { ...base },
      groundAnchor: { x: base.x + prefab.width / 2, y: base.y + prefab.height },
      footprintMeters: { ...prefab.footprintMeters }, visualSizePixels: null, geometryStatus: prefab.geometryStatus,
      zOrderAnchor: { x: base.x + prefab.width / 2, y: base.y + prefab.height } });
    for (const part of prefab.parts ?? []) {
      const worldPosition = { x: base.x + part.x, y: base.y + part.y };
      const footprintMeters = { width: part.groundFootprint.width, height: part.groundFootprint.height };
      const groundAnchor = { x: worldPosition.x + footprintMeters.width / 2, y: worldPosition.y + footprintMeters.height };
      out.push({ id: `${prefab.id}/${part.id}`, parentId: prefab.id, kind: part.kind, assetId: null, worldPosition,
        groundAnchor, footprintMeters, visualSizePixels: null, geometryStatus: part.geometryStatus,
        zOrderAnchor: { ...groundAnchor } });
    }
  }
  for (const segment of scene.fenceSegments ?? []) out.push({ id: segment.id, kind: segment.type, assetId: null,
    worldPosition: { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 },
    groundAnchor: { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 },
    footprintMeters: { width: segment.lengthM, height: 0 }, visualSizePixels: null,
    geometryStatus: segment.geometryStatus, zOrderAnchor: { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 },
    endpoints: [{ ...segment.a }, { ...segment.b }] });
  for (const water of scene.waterPoints ?? []) out.push({ id: water.id, kind: water.kind, assetId: null,
    worldPosition: { x: water.x, y: water.y }, groundAnchor: { x: water.x, y: water.y },
    footprintMeters: { width: water.groundFootprint.width, height: water.groundFootprint.height },
    visualSizePixels: null, geometryStatus: water.geometryStatus, zOrderAnchor: { x: water.x, y: water.y } });
  return out;
}

export function validateFarmSceneV7(scene) {
  const errors = [], warnings = [];
  const { widthM, heightM } = scene?.world ?? SCENE_ASSEMBLY_V7.world;
  const spatial = [ ...(scene?.structures ?? []).map((item) => ({ id: item.id, box: { x: item.x, y: item.y, ...item.groundFootprint } })),
    ...(scene?.assemblies ?? []).map((item) => ({ id: item.id, box: item.bounds })) ];
  for (const item of spatial) {
    const { x, y, width, height } = item.box;
    if (![x, y, width, height].every(finite) || width <= 0 || height <= 0) errors.push({ code: 'invalid-footprint', entity: item.id });
    else if (x < 0 || y < 0 || x + width > widthM || y + height > heightM) errors.push({ code: 'out-of-bounds', entity: item.id });
  }
  for (let i = 0; i < spatial.length; i++) for (let j = i + 1; j < spatial.length; j++) {
    if (overlap(spatial[i].box, spatial[j].box)) errors.push({ code: 'structure-overlap', entities: [spatial[i].id, spatial[j].id] });
  }
  for (const zone of scene?.paddocks ?? []) {
    const b = zone.bounds;
    if (b.x < 0 || b.y < 0 || b.x + b.width > widthM || b.y + b.height > heightM) errors.push({ code: 'paddock-out-of-bounds', entity: zone.id });
    if (!zone.accessIds?.length) errors.push({ code: 'paddock-no-access', entity: zone.id });
  }
  const fence = scene?.fenceNetwork;
  if (!fence) errors.push({ code: 'fence-network-missing' });
  else {
    const keys = new Set();
    for (const segment of fence.segments) {
      if (keys.has(segment.key)) errors.push({ code: 'duplicate-fence-segment', entity: segment.id });
      keys.add(segment.key);
      if (Math.abs(segment.lengthM - fence.moduleLengthM) > EPS) errors.push({ code: 'fence-module-length-invalid', entity: segment.id });
    }
    for (const id of fence.diagnostics.invalidGateRequests) errors.push({ code: 'gate-does-not-match-boundary', gate: id });
  }
  const edgeIds = new Set((scene?.roadNetwork?.edges ?? []).map((edge) => edge.id));
  const nodeIds = new Set((scene?.roadNetwork?.nodes ?? []).map((node) => node.id));
  for (const edge of scene?.roadNetwork?.edges ?? []) if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push({ code: 'road-endpoint-missing', entity: edge.id });
  for (const route of scene?.roadNetwork?.routes ?? []) for (const id of route.edgeIds) if (!edgeIds.has(id)) errors.push({ code: 'road-route-edge-missing', route: route.id, edge: id });
  for (const connection of scene?.connections ?? []) if (connection.status !== 'connected') errors.push({ code: 'required-connection-open', connection: connection.id });
  for (const connection of scene?.connections ?? []) {
    const positions = connection.positions;
    if (positions) {
      const keys = Object.keys(positions);
      for (let i = 1; i < keys.length; i++) {
        const a = positions[keys[0]], b = positions[keys[i]];
        if (Math.hypot(a.x - b.x, a.y - b.y) > connection.toleranceM) errors.push({ code: 'socket-position-mismatch', connection: connection.id });
      }
    }
  }
  for (const entity of [...(scene?.structures ?? []), ...(scene?.assemblies ?? []), ...(scene?.waterPoints ?? [])]) {
    if (entity.geometryStatus !== 'calibrated' && entity.geometryStatus !== 'verified') warnings.push({ code: 'geometry-candidate-requires-art-review', entity: entity.id, status: entity.geometryStatus });
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function compileFarmSceneV7({ seed = 1, scenarioId = 'beef' } = {}) {
  const numericSeed = Number.isFinite(Number(seed)) ? (Number(seed) >>> 0) : 1;
  const allowed = new Set(['beef', 'corte', 'dairy']);
  const normalizedScenario = scenarioId === 'corte' ? 'beef' : scenarioId;
  if (!allowed.has(scenarioId) || !allowed.has(normalizedScenario)) throw new RangeError(`Unsupported scenarioId: ${scenarioId}`);
  const { structures, assemblies } = makePrefabAssemblies(normalizedScenario);
  const paddocks = makePaddocks();
  const pastureVariants = ['cerrado-green-a', 'cerrado-green-b', 'late-rain-season'];
  const variantIndex = numericSeed % pastureVariants.length;
  paddocks.forEach((zone, index) => { zone.visualVariant = pastureVariants[(variantIndex + index) % pastureVariants.length]; });
  const gateRequests = makeGateRequests(paddocks);
  const roadNetwork = makeRoadNetwork(gateRequests);
  const fenceNetwork = buildFenceNetworkV7(paddocks.map(({ id, bounds }) => ({ id, bounds })), gateRequests, 3);
  const waterPoints = makeWaterPoints();
  const connections = buildConnections(assemblies, structures, paddocks, roadNetwork, waterPoints, gateRequests);
  const scene = {
    schemaVersion: SCENE_ASSEMBLY_V7.version,
    seed: numericSeed,
    scenarioId: normalizedScenario,
    presentationOnly: true,
    world: { ...SCENE_ASSEMBLY_V7.world, units: 'm', terrainCellM: SCENE_ASSEMBLY_V7.terrainCellM,
      terrainCells: { columns: 36, rows: 24 } },
    coordinates: { physical: 'metres', terrain: '2m cells', projection: 'isometric 2:1', image: 'asset pixels', screen: 'camera transformed pixels' },
    composition: { readingOrder: ['livestock-core', 'handling', 'house', 'pastures', 'landscape'],
      focalPoint: point(36, 24), reservedCirculation: [rect(21, 0, 3, 48), rect(45, 0, 3, 48)],
      macroOnly: true },
    paddocks, structures, assemblies, prefabInstances: [...structures, ...assemblies], roadNetwork,
    roads: roadNetwork.polylines, fenceNetwork, fenceSegments: fenceNetwork.segments, waterPoints, connections,
    assemblyReport: { hardConstraintStatus: 'checked', hardViolations: [], geometryReviewRequired: true,
      uncertainAssets: ['farmhouse', 'equipment-barn', 'handling-facility', 'livestock-water-point', 'fence-module'],
      visualApproval: 'not-reviewed' },
    decorations: [], variant: { method: 'seed-modulo-palette-selection', index: variantIndex,
      pasturePalette: pastureVariants[variantIndex], status: 'art-palette-candidate' },
  };
  scene.renderEntities = sceneV7RenderDescriptors(scene);
  scene.validation = validateFarmSceneV7(scene);
  return scene;
}

