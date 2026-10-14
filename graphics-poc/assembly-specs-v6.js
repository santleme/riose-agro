import compiledGeometry from './asset-geometry-v1.json' with {type: 'json'};
import {buildFenceLoop, buildModularCorralPrefab, compileFenceNetwork, compileRoadNetwork, poissonDiskPoints, rectanglePolygon, routeNetwork, socketsConnect, solveMacroPlacement} from './spatial-assembly-v6.js';

const FENCE_MODULE_LENGTH = 2;

function pointInside(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function nearestAccessCell(placement, all, terrain) {
  const candidates = [];
  for (let y = 1; y < terrain.rows - 1; y++) for (let x = 1; x < terrain.columns - 1; x++) {
    const blocked = all.some(item => item.blocking !== false && item.worldPolygon && pointInside({x: x + 0.5, y: y + 0.5}, item.worldPolygon));
    if (!blocked) candidates.push({x, y, distance: Math.hypot(x + 0.5 - placement.position.x, y + 0.5 - placement.position.y)});
  }
  candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return candidates[0] && {x: candidates[0].x, y: candidates[0].y};
}

export function occupiedWorldCells(placements) {
  const cells = [];
  for (const placement of placements) {
    if (placement.blocking === false) continue;
    const polygon = placement.worldPolygon;
    const minX = Math.floor(Math.min(...polygon.map(point => point.x))), maxX = Math.ceil(Math.max(...polygon.map(point => point.x)));
    const minY = Math.floor(Math.min(...polygon.map(point => point.y))), maxY = Math.ceil(Math.max(...polygon.map(point => point.y)));
    for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      if (pointInside({x: x + 0.5, y: y + 0.5}, polygon)) cells.push({x, y, ownerId: placement.id});
    }
  }
  return cells;
}

function polygonBounds(polygon) {
  return {left: Math.min(...polygon.map(point => point.x)), right: Math.max(...polygon.map(point => point.x)),
    top: Math.min(...polygon.map(point => point.y)), bottom: Math.max(...polygon.map(point => point.y))};
}

function fenceClearancePolygon(segment) {
  const horizontal = Math.abs(segment.to.x - segment.from.x) >= Math.abs(segment.to.y - segment.from.y);
  const left = Math.min(segment.from.x, segment.to.x), top = Math.min(segment.from.y, segment.to.y);
  return horizontal ? rectanglePolygon(Math.max(0.1, Math.abs(segment.to.x - segment.from.x)), 0.12, {x: left, y: top - 0.06})
    : rectanglePolygon(0.12, Math.max(0.1, Math.abs(segment.to.y - segment.from.y)), {x: left - 0.06, y: top});
}

function derivePastureRegions(placements, terrain) {
  const service = placements.filter(item => item.blocking !== false);
  const extents = service.map(item => polygonBounds(item.worldPolygon));
  const bounds = {left: Math.min(...extents.map(box => box.left)), right: Math.max(...extents.map(box => box.right)),
    top: Math.min(...extents.map(box => box.top)), bottom: Math.max(...extents.map(box => box.bottom))};
  const margin = 1.2, left = Math.max(1, Math.ceil(bounds.left - margin)), right = Math.min(terrain.columns - 1, Math.floor(bounds.right + margin));
  const top = Math.max(1, Math.ceil(bounds.top - margin)), bottom = Math.min(terrain.rows - 1, Math.floor(bounds.bottom + margin));
  const candidates = [
    {zoneId: 'paddock-north', polygon: [{x: 2, y: 2}, {x: terrain.columns - 2, y: 2}, {x: terrain.columns - 2, y: top - 1}, {x: 2, y: top - 1}]},
    {zoneId: 'paddock-south', polygon: [{x: 2, y: bottom + 1}, {x: terrain.columns - 2, y: bottom + 1}, {x: terrain.columns - 2, y: terrain.rows - 2}, {x: 2, y: terrain.rows - 2}]},
    {zoneId: 'paddock-west', polygon: [{x: 2, y: top + 1}, {x: left - 1, y: top + 1}, {x: left - 1, y: bottom - 1}, {x: 2, y: bottom - 1}]},
    {zoneId: 'paddock-east', polygon: [{x: right + 1, y: top + 1}, {x: terrain.columns - 2, y: top + 1}, {x: terrain.columns - 2, y: bottom - 1}, {x: right + 1, y: bottom - 1}]},
  ];
  const feasible = candidates.filter(region => {
    const box = polygonBounds(region.polygon);
    return box.right - box.left >= 2 && box.bottom - box.top >= 2 && (box.right - box.left) * (box.bottom - box.top) >= 8;
  });
  const splitCandidate = feasible.map((region, index) => {
    const box = polygonBounds(region.polygon), width = box.right - box.left, height = box.bottom - box.top;
    return {region, index, score: width * height, width, height, box};
  }).filter(item => Math.max(item.width, item.height) >= 8).sort((a, b) => b.score - a.score || a.region.zoneId.localeCompare(b.region.zoneId))[0];
  if (!splitCandidate) return markSharedPaddockEdges(feasible);
  const {region, index, width, height, box} = splitCandidate;
  const result = feasible.filter((_, candidateIndex) => candidateIndex !== index);
  if (width >= height) {
    const middle = Math.floor((box.left + box.right) / 2);
    result.push(
      {zoneId: `${region.zoneId}-west`, polygon: [{x: box.left, y: box.top}, {x: middle, y: box.top}, {x: middle, y: box.bottom}, {x: box.left, y: box.bottom}]},
      {zoneId: `${region.zoneId}-east`, polygon: [{x: middle, y: box.top}, {x: box.right, y: box.top}, {x: box.right, y: box.bottom}, {x: middle, y: box.bottom}]},
    );
  } else {
    const middle = Math.floor((box.top + box.bottom) / 2);
    result.push(
      {zoneId: `${region.zoneId}-north`, polygon: [{x: box.left, y: box.top}, {x: box.right, y: box.top}, {x: box.right, y: middle}, {x: box.left, y: middle}]},
      {zoneId: `${region.zoneId}-south`, polygon: [{x: box.left, y: middle}, {x: box.right, y: middle}, {x: box.right, y: box.bottom}, {x: box.left, y: box.bottom}]},
    );
  }
  return markSharedPaddockEdges(result);
}

function samePoint(a, b) { return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6; }
function markSharedPaddockEdges(regions) {
  for (const region of regions) { region.sharedEdgeIndexes = []; region.neighbors = []; }
  for (let first = 0; first < regions.length; first++) for (let second = first + 1; second < regions.length; second++) {
    const a = regions[first].polygon, b = regions[second].polygon;
    for (let ai = 0; ai < a.length; ai++) for (let bi = 0; bi < b.length; bi++) {
      const a0 = a[ai], a1 = a[(ai + 1) % a.length], b0 = b[bi], b1 = b[(bi + 1) % b.length];
      if ((samePoint(a0, b1) && samePoint(a1, b0)) || (samePoint(a0, b0) && samePoint(a1, b1))) {
        regions[first].sharedEdgeIndexes.push(ai); regions[second].sharedEdgeIndexes.push(bi);
        regions[first].neighbors.push(regions[second].zoneId); regions[second].neighbors.push(regions[first].zoneId);
      }
    }
  }
  return regions;
}

function boundaryGateCandidates(vertices, segmentLength = FENCE_MODULE_LENGTH) {
  const candidates = [];
  for (let edgeIndex = 0; edgeIndex < vertices.length; edgeIndex++) {
    const from = vertices[edgeIndex], to = vertices[(edgeIndex + 1) % vertices.length];
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / segmentLength));
    for (let segmentIndex = 0; segmentIndex < count; segmentIndex++) {
      const t = (segmentIndex + 0.5) / count;
      const center = {x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t};
      const normal = {x: Math.sign((from.y - to.y)), y: Math.sign((to.x - from.x))};
      candidates.push({edgeIndex, segmentIndex, center, normal});
    }
  }
  return candidates;
}

function assemblePaddockNetworks(placements, roadPaths, terrain, blocked) {
  const roadCells = roadPaths.flatMap(path => path.cells);
  const regions = derivePastureRegions(placements, terrain), paddocks = [];
  for (const region of regions) {
    const gateOptions = boundaryGateCandidates(region.polygon).filter(candidate => !region.sharedEdgeIndexes.includes(candidate.edgeIndex)).map(candidate => ({...candidate,
      nearestRoad: roadCells.reduce((best, cell) => Math.min(best, Math.hypot(cell.x + 0.5 - candidate.center.x, cell.y + 0.5 - candidate.center.y)), Infinity)}));
    gateOptions.sort((a, b) => a.nearestRoad - b.nearestRoad || a.edgeIndex - b.edgeIndex || a.segmentIndex - b.segmentIndex);
    let accepted = null;
    for (const gate of gateOptions) {
      const outsidePoint = {x: gate.center.x + gate.normal.x * 0.75, y: gate.center.y + gate.normal.y * 0.75};
      const insidePoint = {x: gate.center.x - gate.normal.x * 0.75, y: gate.center.y - gate.normal.y * 0.75};
      const outsideCell = {x: Math.floor(outsidePoint.x), y: Math.floor(outsidePoint.y)};
      const insideCell = {x: Math.floor(insidePoint.x), y: Math.floor(insidePoint.y)};
      if (outsideCell.x < 0 || outsideCell.y < 0 || outsideCell.x >= terrain.columns || outsideCell.y >= terrain.rows
        || insideCell.x < 0 || insideCell.y < 0 || insideCell.x >= terrain.columns || insideCell.y >= terrain.rows) continue;
      const anchor = roadCells.reduce((best, cell) => !best || Math.hypot(cell.x - outsideCell.x, cell.y - outsideCell.y) < Math.hypot(best.x - outsideCell.x, best.y - outsideCell.y) ? cell : best, null);
      const path = routeNetwork(terrain, anchor, outsideCell, {blocked, costAt: point => Math.abs(terrain.slopeAt(point.x, point.y)) * 6});
      if (!path) continue;
      const roadSocket = {type: 'road', x: path.at(-1).x + 0.5, y: path.at(-1).y + 0.5,
        orientation: Math.atan2(gate.center.y - (path.at(-1).y + 0.5), gate.center.x - (path.at(-1).x + 0.5)) * 180 / Math.PI, tolerance: 1};
      const drivewaySocket = {type: 'driveway', x: gate.center.x, y: gate.center.y,
        orientation: (roadSocket.orientation + 180) % 360, tolerance: 1};
      const paddockSocket = {type: 'paddock-entrance', x: gate.center.x, y: gate.center.y,
        orientation: (Math.atan2(insidePoint.y - gate.center.y, insidePoint.x - gate.center.x) * 180 / Math.PI + 360) % 360, tolerance: 0.08};
      const livestockSocket = {type: 'livestock-access', x: gate.center.x, y: gate.center.y,
        orientation: (paddockSocket.orientation + 180) % 360, tolerance: 1};
      if (!socketsConnect(roadSocket, drivewaySocket) || !socketsConnect(paddockSocket, livestockSocket)) continue;
      accepted = {...gate, outsideCell, insideCell, path: [...path, ...(path.at(-1).x === insideCell.x && path.at(-1).y === insideCell.y ? [] : [insideCell])], connections: [
        {from: roadSocket, to: drivewaySocket, connected: true},
        {from: paddockSocket, to: livestockSocket, connected: true},
      ]};
      break;
    }
    if (!accepted) return {valid: false, reason: 'paddock-access-unreachable', violations: [{type: 'connectivity', zoneId: region.zoneId}]};
    const fence = buildFenceLoop(region.polygon, [{edgeIndex: accepted.edgeIndex, segmentIndex: accepted.segmentIndex}], FENCE_MODULE_LENGTH);
    paddocks.push({...region, area: (polygonBounds(region.polygon).right - polygonBounds(region.polygon).left) * (polygonBounds(region.polygon).bottom - polygonBounds(region.polygon).top),
      fence, gate: {center: accepted.center, edgeIndex: accepted.edgeIndex, segmentIndex: accepted.segmentIndex},
      accessPath: accepted.path, connections: accepted.connections, status: 'accepted'});
    roadPaths.push({from: 'farm-network', to: region.zoneId, cells: accepted.path});
  }
  if (paddocks.length < 2) return {valid: false, reason: 'insufficient-pasture-regions', violations: [{type: 'mandatory-constraint', rule: 'paddock-count', expected: 2, actual: paddocks.length}]};
  return {valid: true, paddocks};
}

const SYSTEMS = {
  beef: [
    {id: 'farmhouse', assetId: 'building-farmhouse-imagegen-v1', role: 'farmstead', target: {x: 0.42, y: 0.30}, priority: 12, tags: ['residential'], incompatibleTags: ['handling'], clearance: 2.2},
    {id: 'shelter', assetId: 'building-shed-imagegen-v1', role: 'service', target: {x: 0.68, y: 0.34}, priority: 9, tags: ['service'], clearance: 1.2},
    {id: 'handling-yard', assetId: 'corral-wood-standard-imagegen-v1', role: 'handling', prefabFootprint: {width: 8, height: 5}, target: {x: 0.67, y: 0.66}, priority: 8, tags: ['handling'], incompatibleTags: ['residential'], clearance: 2.2},
    {id: 'feed-store', assetId: 'feed-salt-roofed-imagegen-v1', role: 'feed', target: {x: 0.43, y: 0.63}, priority: 5, tags: ['feed'], clearance: 0.6},
    {id: 'water-point', assetId: 'water-trough-round-imagegen-v1', role: 'water', target: {x: 0.27, y: 0.70}, priority: 4, tags: ['water'], clearance: 0.6, blocking: false},
  ],
  dairy: [
    {id: 'farmhouse', assetId: 'building-farmhouse-imagegen-v1', role: 'farmstead', target: {x: 0.26, y: 0.28}, priority: 12, tags: ['residential'], incompatibleTags: ['handling'], clearance: 2.2},
    {id: 'milking-parlor', assetId: 'dairy-milking-parlor', role: 'milking', target: {x: 0.63, y: 0.34}, priority: 10, tags: ['handling'], incompatibleTags: ['residential'], clearance: 1.8},
    {id: 'waiting-pen', assetId: 'dairy-waiting-pen', role: 'holding', target: {x: 0.68, y: 0.59}, priority: 8, tags: ['handling'], clearance: 1.0},
    {id: 'milk-cooling', assetId: 'dairy-milk-chilling-tank', role: 'milk-storage', target: {x: 0.46, y: 0.34}, priority: 7, tags: ['service'], clearance: 0.8},
    {id: 'water-point', assetId: 'water-trough-round-imagegen-v1', role: 'water', target: {x: 0.32, y: 0.69}, priority: 4, tags: ['water'], clearance: 0.6, blocking: false},
  ],
};

export function createFarmAssemblySpecification({system = 'beef', terrain = {}, geometry = compiledGeometry} = {}) {
  const templates = SYSTEMS[system];
  if (!templates) throw new TypeError(`Unknown production system: ${system}`);
  const width = terrain.columns ?? 32, height = terrain.rows ?? 24;
  const slopeAt = terrain.slopeAt ?? ((x, y) => Math.abs(Math.sin(x * 0.19) * Math.cos(y * 0.27)) * 0.075);
  return {
    schemaVersion: 'riose-spatial-assembly-v6',
    sceneIntent: {productionSystem: system, landUse: 'pasture', assembly: 'farmstead-with-operational-yard'},
    terrain: {columns: width, rows: height, slopeAt},
    structures: templates.map(item => {
      const spatial = geometry.assets[item.assetId];
      if (!spatial || spatial.geometryStatus === 'missing-source') throw new TypeError(`Asset ${item.assetId} has no measured geometry`);
      const collisionPolygon = item.prefabFootprint
        ? rectanglePolygon(item.prefabFootprint.width, item.prefabFootprint.height)
        : spatial.collisionPolygonCandidate;
      return {...item, collisionPolygon, geometryStatus: item.prefabFootprint ? 'logical-prefab-envelope-review-required' : spatial.geometryStatus,
        placementGeometrySource: item.prefabFootprint ? 'semantic-prefab-envelope' : 'sprite-derived-candidate',
        clearance: Math.max(item.clearance ?? 0, spatial.clearanceCells ?? 0),
        zone: {left: 2, right: width - 2, top: 2, bottom: height - 2}, targetWeight: 0.07, variation: 2.8, gridStep: 1,
        reviewRequired: true};
    }),
  };
}

export function assembleFarmMacrostructure(options = {}) {
  const specification = createFarmAssemblySpecification(options);
  const solverOutput = options.solverResult ?? solveMacroPlacement(specification, {seed: options.seed ?? 1, maxExpansions: options.maxExpansions ?? 5000});
  let solved = solverOutput;
  if (solverOutput.valid) {
    const requiredIds = new Set(specification.structures.map(item => item.id));
    const actualIds = new Set((solverOutput.placements ?? []).map(item => item.id));
    if (requiredIds.size !== actualIds.size || [...requiredIds].some(id => !actualIds.has(id))) {
      return {valid: false, reason: 'solver-result-structure-mismatch', violations: [{type: 'solver-contract', required: [...requiredIds], actual: [...actualIds]}]};
    }
    for (const placement of solverOutput.placements) if (!placement.worldPolygon || !placement.position) {
      return {valid: false, reason: 'solver-result-geometry-missing', violations: [{type: 'solver-contract', objectId: placement.id}]};
    }
    const requirements = new Map(specification.structures.map(item => [item.id, item]));
    solved = {...solverOutput, placements: solverOutput.placements.map(placement => {
      const requirement = requirements.get(placement.id);
      return {...placement, role: requirement.role, geometryStatus: requirement.geometryStatus, reviewRequired: requirement.reviewRequired,
        placementGeometrySource: requirement.placementGeometrySource, prefabFootprint: requirement.prefabFootprint,
        tags: requirement.tags, incompatibleTags: requirement.incompatibleTags, clearance: requirement.clearance};
    })};
  }
  if (!solved.valid) return {...solved, specification: {schemaVersion: specification.schemaVersion, sceneIntent: specification.sceneIntent}};
  const blocked = occupiedWorldCells(solved.placements).map(({x, y}) => ({x, y}));
  const home = solved.placements.find(item => item.id === 'farmhouse');
  const networkTargets = solved.placements.filter(item => item.id !== 'farmhouse' && item.id !== 'feed-store');
  const roadPaths = [];
  let networkAnchor = nearestAccessCell(home, solved.placements, specification.terrain);
  for (const destination of networkTargets) {
    const goal = nearestAccessCell(destination, solved.placements, specification.terrain);
    const path = routeNetwork(specification.terrain, networkAnchor, goal, {blocked, costAt: point => Math.abs(specification.terrain.slopeAt(point.x, point.y)) * 6});
    if (!path) return {valid: false, reason: 'disconnected-access', violations: [{type: 'connectivity', from: home.id, to: destination.id}], expansions: solved.expansions};
    roadPaths.push({from: home.id, to: destination.id, cells: path});
    networkAnchor = path.at(-1);
  }
  const fenceCorners = [{x: 1, y: 1}, {x: specification.terrain.columns - 1, y: 1},
    {x: specification.terrain.columns - 1, y: specification.terrain.rows - 1}, {x: 1, y: specification.terrain.rows - 1}];
  const gateCenters = fenceCorners.map((point, index) => {
    const next = fenceCorners[(index + 1) % fenceCorners.length];
    return {x: Math.round((point.x + next.x) / 2), y: Math.round((point.y + next.y) / 2), edgeIndex: index};
  });
  const roadCells = roadPaths.flatMap(path => path.cells);
  gateCenters.sort((a, b) => Math.min(...roadCells.map(cell => Math.abs(cell.x - a.x) + Math.abs(cell.y - a.y)))
    - Math.min(...roadCells.map(cell => Math.abs(cell.x - b.x) + Math.abs(cell.y - b.y))));
  const gate = gateCenters[0], roadTail = roadCells.reduce((best, cell) => !best || Math.hypot(cell.x - gate.x, cell.y - gate.y) < Math.hypot(best.x - gate.x, best.y - gate.y) ? cell : best, null);
  const gatePath = routeNetwork(specification.terrain, roadTail, gate, {blocked, costAt: point => Math.abs(specification.terrain.slopeAt(point.x, point.y)) * 6});
  if (!gatePath) return {valid: false, reason: 'disconnected-gate', violations: [{type: 'connectivity', to: 'property-gate'}], expansions: solved.expansions};
  roadPaths.push({from: 'farm-network', to: 'property-gate', cells: gatePath});
  const propertyFenceLoop = buildFenceLoop(fenceCorners, [gate.edgeIndex], FENCE_MODULE_LENGTH);
  const fence = propertyFenceLoop.segments;
  const paddockAssembly = assemblePaddockNetworks(solved.placements, roadPaths, specification.terrain, blocked);
  if (!paddockAssembly.valid) return {...paddockAssembly, expansions: solved.expansions};
  const roadNetwork = compileRoadNetwork(roadPaths, {
    endpointKinds: {'property-gate': 'entrance', 'farm-network': 'road'},
  });
  if (!roadNetwork.valid) return {valid: false, reason: 'road-topology-invalid', violations: roadNetwork.violations, expansions: solved.expansions};
  const yard = solved.placements.find(item => item.id === 'handling-yard');
  const corralPrefab = yard ? buildModularCorralPrefab({origin: yard.position, width: 8, height: 5, gateEdge: 3, segmentLength: FENCE_MODULE_LENGTH}) : null;
  if (corralPrefab) {
    corralPrefab.sourcePlacementId = yard.id;
    corralPrefab.sourceAssetId = yard.assetId;
    corralPrefab.geometryStatus = 'composite-source-review-required';
    corralPrefab.visualPolicy = 'parent-composite-only-until-reviewed-modules-exist';
  }
  const fenceNetwork = compileFenceNetwork([
    {ownerId: 'property', segments: propertyFenceLoop.segments},
    ...paddockAssembly.paddocks.map(paddock => ({ownerId: paddock.zoneId, segments: paddock.fence.segments})),
  ]);
  const treeId = 'vegetation-tree-shade-imagegen-v1';
  const fenceSegments = [...fence, ...paddockAssembly.paddocks.flatMap(paddock => paddock.fence.segments)];
  const routeObstacles = [...roadPaths.flatMap(path => path.cells.map(cell => ({polygon: rectanglePolygon(1, 1, cell), clearance: 1.4}))),
    ...fenceSegments.map(segment => ({polygon: fenceClearancePolygon(segment), clearance: 0.35}))];
  const vegetationObstacles = [...solved.placements.map(item => ({polygon: item.worldPolygon, clearance: 2.2})), ...routeObstacles];
  const vegetationPoints = poissonDiskPoints({left: 2, right: specification.terrain.columns - 2, top: 2, bottom: specification.terrain.rows - 2}, {
    radius: 3.5, seed: ((options.seed ?? 1) ^ 0x51f15e) >>> 0, count: 14,
    blocked: vegetationObstacles,
  });
  const vegetation = vegetationPoints.map((position, index) => ({id: `vegetation-${index + 1}`, assetId: treeId, position, blocking: false, status: 'accepted', reviewRequired: true}));
  return {...solved, roadPaths, roadNetwork, fence, fenceNetwork, corralPrefab, paddocks: paddockAssembly.paddocks, violations: [], specification: {schemaVersion: specification.schemaVersion, sceneIntent: specification.sceneIntent,
    terrain: {columns: specification.terrain.columns, rows: specification.terrain.rows},
    structures: specification.structures.map(({id, assetId, role, geometryStatus, placementGeometrySource, prefabFootprint, reviewRequired}) => ({id, assetId, role, geometryStatus, placementGeometrySource, prefabFootprint, reviewRequired}))}, vegetation};
}
