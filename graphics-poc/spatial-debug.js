import {Application, Assets, Container, Graphics, Rectangle, Sprite, Text} from 'pixi.js';
import {assembleFarmMacrostructure} from './assembly-specs-v6.js';
import {placementValidation} from './contract.js';
import geometryManifest from './asset-geometry-v1.json' with {type: 'json'};

const stage = document.querySelector('#stage'), details = document.querySelector('#details'), status = document.querySelector('#status'), health = document.querySelector('#assembly-health');
const app = new Application(), world = new Container(), camera = {x: 0, y: 0, zoom: 1};
let solution = null, registry = null, selected = null, drag = null, placedForValidation = [], probeMarker = null;
const importedSceneUrl = new URLSearchParams(location.search).get('scene');
const projection = {cellWidth: 96, cellHeight: 48, columns: 32, rows: 24};
const origin = {x: projection.columns * projection.cellWidth / 2, y: 48};
const overlays = Object.fromEntries([...document.querySelectorAll('[data-overlay]')].map(input => [input.dataset.overlay, input.checked]));

function project(point) { return {x: origin.x + (point.x - point.y) * projection.cellWidth / 2, y: origin.y + (point.x + point.y) * projection.cellHeight / 2}; }
function setDetails(value) { details.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function updateHealth(state, message) { health.dataset.state = state; health.textContent = message; }
function drawGround() {
  const graphics = new Graphics();
  graphics.eventMode = 'static'; graphics.cursor = 'crosshair';
  for (let row = 0; row < projection.rows; row++) for (let column = 0; column < projection.columns; column++) {
    const p = [project({x: column, y: row}), project({x: column + 1, y: row}), project({x: column + 1, y: row + 1}), project({x: column, y: row + 1})];
    graphics.poly(p.flatMap(point => [point.x, point.y]), true).fill((row + column) % 2 ? 0x526948 : 0x5b704f).stroke({color: 0x91a17c, alpha: .18, width: 1});
  }
  if (overlays.grid) {
    const grid = new Graphics(); grid.zIndex = 1;
    for (let row = 0; row <= projection.rows; row++) {
      const a = project({x: 0, y: row}), b = project({x: projection.columns, y: row}); grid.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    for (let column = 0; column <= projection.columns; column++) {
      const a = project({x: column, y: 0}), b = project({x: column, y: projection.rows}); grid.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    grid.stroke({color: 0xf3e7bd, alpha: .28, width: 1}); world.addChild(grid);
  }
  world.addChild(graphics);
}

function placementEnvelope(placement, geometry) {
  const worldPolygon = Array.isArray(placement.worldPolygon) && placement.worldPolygon.length >= 3
    ? placement.worldPolygon.map(point => ({x: point.x, y: point.y}))
    : geometry.collisionPolygonCandidate.map(point => ({x: placement.position.x + point.x, y: placement.position.y + point.y}));
  const collisionPolygon = worldPolygon.map(point => ({x: point.x - placement.position.x, y: point.y - placement.position.y}));
  const xs = collisionPolygon.map(point => point.x), ys = collisionPolygon.map(point => point.y);
  return {worldPolygon, collisionPolygon, bounds: {left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)}};
}

function placementDiagnostic(placement, geometry) {
  const envelope = placementEnvelope(placement, geometry), bounds = envelope.bounds;
  return {id: placement.id, assetId: placement.assetId, role: placement.role,
    position: {...placement.position, units: 'world-cell'},
    placementGeometry: {source: placement.placementGeometrySource ?? 'sprite-derived-candidate', status: placement.geometryStatus ?? geometry.geometryStatus,
      reviewRequired: placement.reviewRequired ?? geometry.reviewRequired, footprint: {columns: bounds.right - bounds.left, rows: bounds.bottom - bounds.top},
      localCollisionPolygon: envelope.collisionPolygon, worldPolygon: envelope.worldPolygon, physicalFootprintStatus: 'unverified'},
    alphaCandidate: {status: geometry.geometryStatus, reviewRequired: true, footprint: geometry.groundFootprintCandidate,
      collisionPolygon: geometry.collisionPolygonCandidate, supportRegionFootprint: geometry.supportRegionFootprintCandidate,
      supportRegionPolygon: geometry.supportRegionPolygonCandidate, source: 'sprite-alpha-inference-only', physicalFootprintStatus: 'unverified'},
    clearance: {center: {...placement.position}, radiusCells: placement.clearance ?? 0,
      appliesToIncompatibleTags: placement.incompatibleTags ?? [], units: 'world-cell'},
    visualHeightCells: geometry.visualHeightCells, groundContactAnchor: geometry.groundContactAnchor};
}

function footprintGraphics(placement, geometry) {
  const graphic = new Graphics();
  const envelope = placementEnvelope(placement, geometry), projectDelta = point => ({x: (point.x - point.y) * 48, y: (point.x + point.y) * 24});
  if (overlays.collision) {
    const envelopePoints = envelope.collisionPolygon.map(projectDelta), selectedColor = placement.id === selected?.id ? 0x55dbf0 : 0x63aee8;
    graphic.poly(envelopePoints.flatMap(point => [point.x, point.y]), true).fill({color: selectedColor, alpha: .13})
      .stroke({color: selectedColor, width: placement.id === selected?.id ? 3 : 2, alpha: .96});
    const alphaPoints = geometry.collisionPolygonCandidate.map(projectDelta);
    graphic.poly(alphaPoints.flatMap(point => [point.x, point.y]), true).fill({color: 0xffbd69, alpha: .08})
      .stroke({color: 0xffbd69, width: 1.5, alpha: .92});
  }
  if (overlays.support && geometry.supportRegionPolygonCandidate?.length >= 3) {
    const support = geometry.supportRegionPolygonCandidate.map(projectDelta);
    graphic.poly(support.flatMap(point => [point.x, point.y]), true).stroke({color: 0xf06a85, width: 1, alpha: .78});
  }
  const radius = placement.clearance ?? 0;
  if (overlays.clearance && radius > 0) {
    const points = Array.from({length: 48}, (_, index) => {
      const angle = index * Math.PI * 2 / 48;
      return projectDelta({x: radius * Math.cos(angle), y: radius * Math.sin(angle)});
    });
    graphic.poly(points.flatMap(point => [point.x, point.y]), true).stroke({color: 0xffdc81, alpha: .72, width: 1.5});
  }
  graphic.zIndex = 10000;
  return graphic;
}

function drawNetwork(options = {}) {
  const {roads: showRoads = true, fence: showFence = true} = options;
  const roadGraphics = new Graphics(); roadGraphics.zIndex = 9000;
  if (showRoads) for (const edge of solution.roadNetwork?.edges ?? []) {
    const a = project(edge.from), b = project(edge.to);
    roadGraphics.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  if (showRoads) { roadGraphics.stroke({color: 0xb48b57, width: 9, alpha: .76, cap: 'round', join: 'round'}); world.addChild(roadGraphics); }
  if (showRoads && overlays.roadModules) {
    const modules = new Graphics(); modules.zIndex = 9200;
    const colors = {straight: 0xdbc28b, turn: 0xf0a85e, 't-junction': 0x75d3c7, 'x-junction': 0xe783a3,
      entrance: 0xf2db75, endpoint: 0x91a9e8, junction: 0xd2a0e5};
    for (const module of solution.roadNetwork?.modules ?? []) {
      if (module.kind === 'straight') continue;
      const at = project(module.position);
      modules.circle(at.x, at.y, module.kind === 't-junction' || module.kind === 'x-junction' ? 6 : 4)
        .fill(colors[module.kind] ?? 0xf4f0dd).stroke({color: 0x1d251f, width: 1.5});
    }
    world.addChild(modules);
  }
  if (!showFence) return;
  const fences = new Graphics(); fences.zIndex = 9500;
  const compiledFence = solution.fenceNetwork?.segments;
  if (!overlays.fenceArt) for (const edge of compiledFence ?? solution.fence) {
    const a = project(edge.from), b = project(edge.to);
    const shared = (edge.owners?.length ?? 0) > 1;
    fences.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({color: edge.piece === 'gate' ? 0xf1c773 : shared ? 0x8ac7e4 : 0xd9d4b9, width: edge.piece === 'gate' ? 7 : shared ? 4 : 3, alpha: .95});
  }
  for (const paddock of solution.paddocks ?? []) {
    if (!compiledFence && !overlays.fenceArt) for (const edge of paddock.fence.segments) {
      const a = project(edge.from), b = project(edge.to);
      fences.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({color: edge.piece === 'gate' ? 0xffb84d : 0xc7dca9, width: edge.piece === 'gate' ? 8 : 2, alpha: .9});
    }
    const gate = project(paddock.gate.center);
    fences.circle(gate.x, gate.y, 5).fill(0xffe19a);
  }
  world.addChild(fences);
}

async function drawFenceArt() {
  const byId = new Map(registry.assets.map(asset => [asset.assetId, asset]));
  const wire = byId.get('fence-wire-wood-post-imagegen-v1'), gate = byId.get('fence-gate-wood-imagegen-v1');
  if (!wire || !gate) throw new Error('Asset Registry lacks the candidate wire fence or gate sprite.');
  const corralSegments = [
    ...(solution.corralPrefab?.boundary?.segments ?? []),
    ...(solution.corralPrefab?.interiorRails ?? []),
  ].map(segment => ({...segment, networkSegmentId: segment.segmentId, owners: ['handling-yard']}));
  for (const segment of [...(solution.fenceNetwork?.segments ?? []), ...corralSegments]) {
    const asset = segment.piece === 'gate' ? gate : wire;
    const texture = await Assets.load(`/${asset.source.file}`);
    const sprite = new Sprite(texture); sprite.anchor.set(asset.pivot.x, asset.pivot.y);
    const baseScale = Math.min(asset.displaySizePx.width / texture.width, asset.displaySizePx.height / texture.height);
    const worldLength = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
    const projectedLength = worldLength * Math.hypot(projection.cellWidth / 2, projection.cellHeight / 2);
    const scale = baseScale * projectedLength / asset.displaySizePx.width;
    const midpoint = project({x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2});
    sprite.position.set(midpoint.x, midpoint.y);
    sprite.scale.set(scale, scale);
    const alongX = Math.abs(segment.to.x - segment.from.x) >= Math.abs(segment.to.y - segment.from.y);
    const direction = alongX ? Math.sign(segment.to.x - segment.from.x) : -Math.sign(segment.to.y - segment.from.y);
    if (direction < 0) sprite.scale.x *= -1;
    sprite.zIndex = midpoint.y + 3;
    sprite.eventMode = 'static'; sprite.cursor = 'pointer';
    sprite.on('pointertap', event => { event.stopPropagation(); setDetails({networkSegmentId: segment.networkSegmentId,
      piece: segment.piece, from: segment.from, to: segment.to, owners: segment.owners, assetId: asset.assetId,
      reviewStatus: asset.reviewStatus, reviewRequired: true, connected: segment.connected}); });
    world.addChild(sprite);
  }
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function drawSockets() {
  if (!overlays.sockets) return;
  const markers = new Graphics(); markers.zIndex = 9900;
  const sockets = [];
  for (const paddock of solution.paddocks ?? []) sockets.push({type: 'paddock-entrance', ...paddock.gate.center});
  for (const path of solution.roadPaths ?? []) if (path.cells.length) {
    sockets.push({type: 'road-start', x: path.cells[0].x + .5, y: path.cells[0].y + .5});
    sockets.push({type: 'road-destination', x: path.cells.at(-1).x + .5, y: path.cells.at(-1).y + .5});
  }
  for (const socket of sockets) {
    const point = project(socket), radius = socket.type === 'paddock-entrance' ? 7 : 4;
    markers.circle(point.x, point.y, radius).fill(socket.type === 'paddock-entrance' ? 0xffd26b : 0x79d8ed).stroke({color: 0x172019, width: 1});
  }
  world.addChild(markers);
}

function drawOccupiedCells() {
  if (!overlays.cells) return;
  const cells = new Graphics(); cells.zIndex = 9700;
  for (const placement of placedForValidation.filter(item => item.blocking)) {
    const polygon = placement.spatialGeometry.collisionPolygon.map(point => ({x: point.x + placement.position.x, y: point.y + placement.position.y}));
    const xs = polygon.map(point => point.x), ys = polygon.map(point => point.y);
    for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
      if (!pointInPolygon({x: x + .5, y: y + .5}, polygon)) continue;
      const points = [project({x, y}), project({x: x + 1, y}), project({x: x + 1, y: y + 1}), project({x, y: y + 1})];
      cells.poly(points.flatMap(point => [point.x, point.y]), true).fill({color: 0xe75c5c, alpha: .2});
    }
  }
  world.addChild(cells);
}

async function drawAssembly() {
  for (const child of [...world.children]) child.destroy({children: true});
  const mode = document.querySelector('#stage-mode').value;
  drawGround();
  const modeRoads = ['roads', 'fences', 'environment', 'complete'].includes(mode);
  const modeFence = ['fences', 'environment', 'complete'].includes(mode);
  placedForValidation = [];
  const assetById = new Map(registry.assets.map(asset => [asset.assetId, asset]));
  const structural = mode === 'terrain' ? [] : solution.placements;
  const environment = ['environment', 'complete'].includes(mode) ? solution.vegetation ?? [] : [];
  const ordered = [...structural, ...environment].sort((a, b) => a.position.x + a.position.y - b.position.x - b.position.y);
  for (const placement of ordered) {
    const asset = assetById.get(placement.assetId), geometry = geometryManifest.assets[placement.assetId], projected = project(placement.position);
    const object = new Container(); object.position.set(projected.x, projected.y); object.zIndex = projected.y + 2; object.eventMode = 'static'; object.cursor = 'pointer';
    const texture = await Assets.load(`/${asset.source.file}`), sprite = new Sprite(texture); sprite.anchor.set(asset.pivot.x, asset.pivot.y);
    sprite.scale.set(Math.min(asset.displaySizePx.width / texture.width, asset.displaySizePx.height / texture.height)); object.addChild(sprite);
    if (geometry) object.addChild(footprintGraphics(placement, geometry));
    object.on('pointertap', event => { event.stopPropagation(); selected = placement; showPlacement(placement, asset, geometry); });
    if (overlays.height) {
      const height = Math.max(0, geometry.visualHeightCells ?? 0) * 24;
      const elevation = new Graphics(); elevation.moveTo(0, 0).lineTo(0, -height).stroke({color: 0x90dff0, width: 2});
      elevation.circle(0, -height, 3).fill(0x90dff0); object.addChild(elevation);
      const label = new Text({text: `${placement.id} · h ${geometry.visualHeightCells.toFixed(1)}`, style: {fontFamily: 'system-ui', fontSize: 12, fill: 0xfaf5e7, stroke: {color: 0x1d251f, width: 3}}});
      label.anchor.set(.5, 0); label.position.set(0, -height - 16); object.addChild(label);
    }
    object.hitArea = new Rectangle(-asset.displaySizePx.width / 2, -asset.displaySizePx.height, asset.displaySizePx.width, asset.displaySizePx.height);
    world.addChild(object);
    if (geometry) {
      const diagnostic = placementDiagnostic(placement, geometry);
      placedForValidation.push({prefabId: placement.id, assetId: placement.assetId, position: placement.position,
        footprint: diagnostic.placementGeometry.footprint,
        spatialGeometry: {collisionPolygon: diagnostic.placementGeometry.localCollisionPolygon, units: 'world-cell',
          source: diagnostic.placementGeometry.source, reviewRequired: true, physicalFootprintStatus: 'unverified'},
        alphaCandidate: diagnostic.alphaCandidate, blocking: placement.blocking ?? asset.spatialGeometry.collisionPolicy === 'blocking',
        tags: placement.tags ?? [], incompatibleTags: placement.incompatibleTags ?? [], clearance: placement.clearance ?? 0,
        worldPolygon: diagnostic.placementGeometry.worldPolygon});
    }
  }
  if (modeRoads || overlays.roads || modeFence || overlays.paddocks) drawNetwork({roads: overlays.roads, fence: modeFence || overlays.paddocks});
  if (overlays.fenceArt && (modeFence || overlays.paddocks)) await drawFenceArt();
  if (overlays.paddocks && !modeFence) {
    const boundaries = new Graphics(); boundaries.zIndex = 9400;
    for (const paddock of solution.paddocks ?? []) {
      const polygon = paddock.polygon.map(project);
      boundaries.poly(polygon.flatMap(point => [point.x, point.y]), true).fill({color: 0x8fd18c, alpha: .04}).stroke({color: 0x8fd18c, alpha: .6, width: 2});
    }
    world.addChild(boundaries);
  }
  drawOccupiedCells(); drawSockets();
  world.sortChildren(); fitCamera();
}

function showPlacement(placement, asset, geometry) {
  const isVegetation = placement.id.startsWith('vegetation-');
  setDetails({...placementDiagnostic(placement, geometry), solverStatus: placement.status ?? 'accepted',
    acceptedBy: isVegetation ? ['Poisson-disk spacing', 'building clearance', 'route clearance'] : ['placement envelope bounds', 'placement envelope collision polygon', 'semantic clearance radius'],
    searchOptimality: solution.optimality, visualBoundsPx: geometry.visualBoundingBoxPx, sourceFile: asset.source.file,
    note: 'Envelope e polígono de montagem vêm do prefab usado pelo solver. A geometria alfa é exibida à parte como candidata visual; nenhuma das duas representa medida física verificada.'});
}

function fitCamera() {
  const width = stage.clientWidth, height = stage.clientHeight, sceneW = projection.columns * 48 + projection.rows * 48, sceneH = (projection.columns + projection.rows) * 24 + 100;
  camera.zoom = Math.min(width * .9 / sceneW, height * .9 / sceneH); camera.x = (width - sceneW * camera.zoom) / 2; camera.y = (height - sceneH * camera.zoom) / 2;
  world.position.set(camera.x, camera.y); world.scale.set(camera.zoom);
}

function probeSpatialPosition(position) {
  const template = [...solution.placements, ...(solution.vegetation ?? [])].find(item => item.id === selected?.id) ?? solution.placements[0];
  const prefab = placedForValidation.find(item => item.prefabId === template.id);
  const others = placedForValidation.filter(item => item.prefabId !== prefab.prefabId), geometryResult = placementValidation(prefab, position, projection.columns, projection.rows, others);
  if (!geometryResult.valid) return geometryResult;
  const incompatible = others.find(other => prefab.incompatibleTags.some(tag => other.tags.includes(tag))
    && Math.hypot(position.x - other.position.x, position.y - other.position.y) < Math.max(prefab.clearance, other.clearance));
  return incompatible ? {valid: false, reason: 'clearance', conflictingPrefabId: incompatible.prefabId} : geometryResult;
}

function probePosition(event) {
  const local = world.toLocal(event.global), dx = (local.x - origin.x) / 48, dy = (local.y - origin.y) / 24;
  const position = {x: (dx + dy) / 2, y: (dy - dx) / 2};
  const template = [...solution.placements, ...(solution.vegetation ?? [])].find(item => item.id === selected?.id) ?? solution.placements[0];
  const prefab = placedForValidation.find(item => item.prefabId === template.id);
  const result = probeSpatialPosition(position);
  probeMarker?.destroy();
  probeMarker = null;
  if (overlays.errors) {
    probeMarker = new Graphics(); probeMarker.zIndex = 12000;
    const markerPoint = project(position);
    probeMarker.circle(markerPoint.x, markerPoint.y, 9).fill({color: result.valid ? 0x79e08b : 0xf06a72, alpha: .82}).stroke({color: 0xffffff, width: 2});
    probeMarker.moveTo(markerPoint.x - 13, markerPoint.y).lineTo(markerPoint.x + 13, markerPoint.y).moveTo(markerPoint.x, markerPoint.y - 13).lineTo(markerPoint.x, markerPoint.y + 13).stroke({color: 0x18201c, width: 2});
    world.addChild(probeMarker);
  }
  updateHealth(result.valid ? 'ok' : 'error', result.valid ? 'Probe aceito pelas restrições espaciais testadas.' : `Probe rejeitado: ${result.reason}.`);
  const asset = registry.assets.find(item => item.assetId === template.assetId), geometry = geometryManifest.assets[template.assetId];
  setDetails({...placementDiagnostic(template, geometry), probe: {position, units: 'world-cell'}, ...result,
    explanation: result.valid ? 'Probe aceito dentro dos limites e sem colisão do envelope de montagem; clearance semântico também foi checado.' : `Probe rejeitado pela regra: ${result.reason}.`,
    sourceFile: asset?.source.file, geometryReviewRequired: true});
}

async function generate() {
  const system = document.querySelector('#system').value, seed = Number(document.querySelector('#seed').value) || 1;
  status.textContent = `Resolvendo ${system === 'beef' ? 'corte' : 'leiteira'} · seed ${seed}…`;
  solution = importedSceneUrl ? await fetch(importedSceneUrl).then(response => {
    if (!response.ok) throw new Error(`Cena compilada não encontrada (${response.status}): ${importedSceneUrl}`);
    return response.json();
  }) : assembleFarmMacrostructure({system, seed});
  if (!solution.valid) {
    status.textContent = `Layout rejeitado · ${solution.reason}`;
    updateHealth('error', `${solution.violations?.length ?? 1} violação(ões) obrigatórias: ${solution.reason}`);
    setDetails(solution); return;
  }
  if (solution.solverIntegration) {
    document.querySelector('#seed').value = solution.solverIntegration.seed;
    document.querySelector('#system').value = solution.specification.sceneIntent.productionSystem;
  }
  selected = solution.placements[0]; await drawAssembly();
  const solverStatus = solution.solverIntegration ? ` · ${solution.solverIntegration.engine} ${solution.solverIntegration.status}` : ` · ${solution.expansions} expansões${solution.searchComplete ? '' : ' · limite de busca atingido'}`;
  status.textContent = `Aceito · ${solution.placements.length} estruturas · ${solution.paddocks?.length ?? 0} piquetes · ${solution.roadPaths.length} rotas${solverStatus}`;
  const unreviewed = new Set(solution.placements.filter(item => item.reviewRequired).map(item => item.assetId)).size;
  updateHealth(unreviewed ? 'warning' : 'ok', `${solution.violations?.length ?? 0} violações obrigatórias · ${unreviewed} geometria(s) física(s) aguardam revisão`);
  showPlacement(selected, assetBySelection(selected), geometryManifest.assets[selected.assetId]);
}

function assetBySelection(placement) { return registry.assets.find(asset => asset.assetId === placement.assetId); }

await app.init({resizeTo: stage, background: 0x252c28, antialias: false, roundPixels: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2)});
stage.append(app.canvas); app.stage.addChild(world); world.sortableChildren = true;
registry = await fetch('/graphics-poc/asset-registry.json').then(response => { if (!response.ok) throw Error('Asset Registry V6 indisponível'); return response.json(); });
document.querySelector('#generate').addEventListener('click', () => generate().catch(error => { status.textContent = `Erro: ${error.message}`; }));
document.querySelector('#system').addEventListener('change', () => generate().catch(error => { status.textContent = `Erro: ${error.message}`; }));
document.querySelector('#stage-mode').addEventListener('change', () => drawAssembly().catch(error => { status.textContent = `Erro: ${error.message}`; }));
document.querySelectorAll('[data-overlay]').forEach(input => input.addEventListener('change', () => {
  overlays[input.dataset.overlay] = input.checked;
  if (input.dataset.overlay === 'errors') {
    health.hidden = !overlays.errors;
    if (!overlays.errors) { probeMarker?.destroy(); probeMarker = null; }
  }
  drawAssembly().catch(error => { status.textContent = `Erro de camada: ${error.message}`; });
}));
app.stage.on('pointertap', event => { if (event.target?.cursor === 'crosshair' && solution) probePosition(event); });
stage.addEventListener('wheel', event => { event.preventDefault(); const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1; camera.zoom = Math.max(.2, Math.min(2, camera.zoom * factor)); world.scale.set(camera.zoom); }, {passive: false});
stage.addEventListener('pointerdown', event => { if (event.target !== app.canvas) return; drag = {x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y}; stage.setPointerCapture(event.pointerId); });
stage.addEventListener('pointermove', event => { if (!drag) return; camera.x = drag.cameraX + event.clientX - drag.x; camera.y = drag.cameraY + event.clientY - drag.y; world.position.set(camera.x, camera.y); });
stage.addEventListener('pointerup', () => drag = null); stage.addEventListener('pointercancel', () => drag = null); window.addEventListener('resize', fitCamera);
await generate();
window.__spatialDebug = {probe: probeSpatialPosition, getSolution: () => solution,
  getPlacementDiagnostics: id => {
    const placement = [...solution.placements, ...(solution.vegetation ?? [])].find(item => item.id === id);
    if (!placement) return null;
    return placementDiagnostic(placement, geometryManifest.assets[placement.assetId]);
  },
  selectPlacement: id => {
    const placement = [...solution.placements, ...(solution.vegetation ?? [])].find(item => item.id === id);
    if (!placement) return false;
    selected = placement; showPlacement(placement, assetBySelection(placement), geometryManifest.assets[placement.assetId]); return true;
  },
  getOverlays: () => ({...overlays}), setOverlay: (name, value) => {
    const input = document.querySelector(`[data-overlay="${name}"]`);
    if (!input) throw new TypeError(`Unknown debug overlay: ${name}`);
    input.checked = Boolean(value); overlays[name] = input.checked; return drawAssembly();
  }};
