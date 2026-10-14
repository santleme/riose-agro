import {AnimatedSprite, Application, Container, Graphics, Rectangle, Sprite, Texture} from 'pixi.js';

const MANIFEST_URL = '/graphics-poc/assets/main-composer-render-manifest.json';
const TERRAIN_URL = '/graphics-poc/generated/terrain-v5/homestead-high-ground-render.png';
const ANIMATION_URL = '/assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.json';
const ANIMATION_IMAGE_URL = '/assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.png';
const WIRE_FENCE_ID = 'fence-wire-wood-post-imagegen-v1';
const GATE_ID = 'fence-gate-wood-imagegen-v1';
const stage = document.querySelector('#stage');
const errorNode = document.querySelector('#scene-error');
const app = new Application();
const world = new Container();
world.sortableChildren = true;
const camera = {x: 0, y: 0, zoom: 1};
const terrainBounds = {width: 1774, height: 950};
const projection = {columns: 32, rows: 24, cellWidth: terrainBounds.width / 28, cellHeight: terrainBounds.width / 56};
let currentScene = null;
let drag = null;
let textureCache = new Map();
let animTicker = null;

function project({x, y}) {
  // The two world axes map to the 2:1 isometric diamond baked into the terrain proposal.
  return {x: (x - y + projection.rows) * projection.cellWidth / 2,
    y: (x + y) * projection.cellHeight / 2 + 22};
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Não foi possível carregar ${url}`));
    image.src = url;
  });
}

function trimTransparent(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(image, 0, 0);
  const {data, width, height} = ctx.getImageData(0, 0, image.width, image.height);
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 12) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1); }
  }
  if (right <= left || bottom <= top) return Texture.from(image);
  const crop = document.createElement('canvas'); crop.width = right - left; crop.height = bottom - top;
  crop.getContext('2d').drawImage(image, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return Texture.from(crop);
}

function loadTexture(url) {
  if (!textureCache.has(url)) textureCache.set(url, loadImage(url).then(trimTransparent));
  return textureCache.get(url);
}

function fitCamera() {
  const width = stage.clientWidth, height = stage.clientHeight;
  const bounds = terrainBounds;
  camera.zoom = Math.min(width * .94 / bounds.width, height * .92 / bounds.height);
  camera.x = (width - bounds.width * camera.zoom) / 2;
  camera.y = (height - bounds.height * camera.zoom) / 2;
  world.position.set(camera.x, camera.y); world.scale.set(camera.zoom);
  if (window.__ranchV6) window.__ranchV6.camera = {zoom: camera.zoom, boardOccupancy: Number((bounds.width * camera.zoom / width * 100).toFixed(1))};
}

function addSprite(texture, asset, screenAnchor, depth, requestedSize = asset.displaySize, anchor = asset.anchor ?? {x: .5, y: 1}) {
  const container = new Container(); container.position.set(screenAnchor.x, screenAnchor.y); container.zIndex = depth;
  const sprite = new Sprite(texture); sprite.anchor.set(anchor.x ?? .5, anchor.y ?? 1);
  const scale = Math.min(requestedSize[0] / texture.width, requestedSize[1] / texture.height);
  sprite.scale.set(scale); container.addChild(sprite); world.addChild(container);
  return {container, sprite};
}

function hashInt(text) {
  let value = 2166136261;
  for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

function randomFor(seed) {
  let state = hashInt(String(seed));
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function insidePolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function deriveVisualCattle(scene) {
  const random = randomFor(`v6-presentation:${scene.seed}:${scene.specification?.sceneIntent?.productionSystem ?? 'beef'}`);
  const occupied = [];
  const blockers = scene.placements.filter(item => item.blocking && item.worldPolygon?.length >= 3);
  const cattle = [];
  for (const paddock of scene.paddocks ?? []) {
    const polygon = paddock.polygon;
    const minX = Math.min(...polygon.map(p => p.x)), maxX = Math.max(...polygon.map(p => p.x));
    const minY = Math.min(...polygon.map(p => p.y)), maxY = Math.max(...polygon.map(p => p.y));
    let added = 0;
    // Presentation-only herd marks are sampled inside generated pasture polygons, with fence clearance.
    for (let attempt = 0; attempt < 1500 && added < 5; attempt++) {
      const point = {x: minX + .7 + random() * Math.max(.2, maxX - minX - 1.4), y: minY + .7 + random() * Math.max(.2, maxY - minY - 1.4)};
      if (!insidePolygon(point, polygon)) continue;
      if (polygon.some((a, i) => pointSegmentDistance(point, a, polygon[(i + 1) % polygon.length]) < .58)) continue;
      if (blockers.some(item => insidePolygon(point, item.worldPolygon))) continue;
      if (occupied.some(other => Math.hypot(point.x - other.x, point.y - other.y) < 1.4)) continue;
      occupied.push(point); cattle.push({id: `visual-${paddock.zoneId}-${added + 1}`, paddockId: paddock.zoneId, position: point, state: 'graze'}); added++;
    }
  }
  return cattle;
}

function drawTopology(scene) {
  const layer = new Graphics(); layer.label = 'diagnostic-topology'; layer.zIndex = 1e7;
  for (const edge of scene.roadNetwork?.edges ?? []) {
    const a = project(edge.from), b = project(edge.to);
    layer.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({color: 0x704b31, width: 7, alpha: .42});
    layer.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({color: 0xf2d5a0, width: 1.4, alpha: .55});
  }
  for (const segment of scene.fenceNetwork?.segments ?? []) {
    const a = project(segment.from), b = project(segment.to);
    layer.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({color: segment.piece === 'gate' ? 0xedd286 : 0x3d2720, width: segment.piece === 'gate' ? 3 : 1.5, alpha: .64});
  }
  for (const paddock of scene.paddocks ?? []) {
    const points = paddock.polygon.map(project);
    if (points.length < 3) continue;
    layer.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) layer.lineTo(point.x, point.y);
    layer.lineTo(points[0].x, points[0].y).stroke({color: 0xf6edc7, width: 2, alpha: .7});
  }
  return layer;
}

function macroLayoutSignatures(scene) {
  const stableLayout = JSON.stringify({
    structures: scene.placements.map(item => ({id: item.id, assetId: item.assetId,
      position: [item.position.x, item.position.y], polygon: (item.worldPolygon ?? []).map(point => [point.x, point.y])})).sort((a, b) => a.id.localeCompare(b.id)),
    paddocks: (scene.paddocks ?? []).map(item => ({id: item.zoneId, polygon: item.polygon.map(point => [point.x, point.y])})).sort((a, b) => a.id.localeCompare(b.id))
  });
  let value = 0x811c9dc5;
  for (let i = 0; i < stableLayout.length; i++) { value ^= stableLayout.charCodeAt(i); value = Math.imul(value, 0x01000193); }
  return `fnv1a32-${(value >>> 0).toString(16).padStart(8, '0')}`;
}

function addFenceSprites(scene, assetRecords) {
  const statuses = new Set();
  let gateCount = 0, cardinalFlipCount = 0;
  for (const segment of scene.fenceNetwork?.segments ?? []) {
    const isGate = segment.piece === 'gate';
    const record = assetRecords.get(isGate ? GATE_ID : WIRE_FENCE_ID);
    if (!record?.texture) throw new Error(`${isGate ? 'Gate' : 'Fence'} asset not loaded from the registry.`);
    const midpoint = {x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2};
    const anchor = project(midpoint), dx = segment.to.x - segment.from.x, dy = segment.to.y - segment.from.y;
    // Source art faces world +x (screen down-right). A horizontal mirror produces the
    // world +y (screen down-left) run; we do not apply arbitrary sprite rotation.
    const flipX = Math.abs(dy) > Math.abs(dx);
    const group = new Container(); group.label = `fence:${segment.segmentId}`; group.position.set(anchor.x, anchor.y); group.zIndex = anchor.y;
    const sprite = new Sprite(record.texture); sprite.anchor.set(.5, .5);
    const scale = Math.min(record.displaySize[0] / record.texture.width, record.displaySize[1] / record.texture.height);
    sprite.scale.set(flipX ? -scale : scale, scale);
    group.addChild(sprite); world.addChild(group);
    statuses.add(record.reviewStatus); if (isGate) gateCount++; if (flipX) cardinalFlipCount++;
  }
  return {count: scene.fenceNetwork?.segments?.length ?? 0, gateCount, cardinalFlipCount, reviewStatuses: [...statuses], transformPolicy: 'world-x source orientation; world-y horizontal flip; no arbitrary rotation', provenanceStatus: 'REVIEW'};
}

function sceneUrl(sceneKey) { return `/artifacts/graphics/spatial-assembly-v6/compiled-${sceneKey}.json`; }

async function renderScene(sceneKey) {
  const response = await fetch(sceneUrl(sceneKey));
  if (!response.ok) throw new Error(`Cena V6 ${sceneKey}: HTTP ${response.status}`);
  const scene = await response.json();
  if (!scene.valid || scene.solverStatus !== 'OPTIMAL') throw new Error(`A montagem ${sceneKey} não está aprovada pelo solver: ${scene.solverStatus ?? 'invalid'}`);
  if (scene.sceneSchemaVersion !== 'riose-compiled-farm-scene-v6') throw new Error(`Versão de cena inesperada: ${scene.sceneSchemaVersion}`);
  const [manifest, terrainTexture, animationManifest, animationAtlas] = await Promise.all([
    fetch(MANIFEST_URL).then(r => { if (!r.ok) throw Error(`Manifest HTTP ${r.status}`); return r.json(); }),
    loadTexture(TERRAIN_URL),
    fetch(ANIMATION_URL).then(r => { if (!r.ok) throw Error(`Atlas de animação HTTP ${r.status}`); return r.json(); }),
    loadTexture(ANIMATION_IMAGE_URL)
  ]);
  const assetRecords = new Map(manifest.assets.map(item => [item.assetId, item]));
  const assetIds = [...new Set([...scene.placements.map(item => item.assetId), ...scene.vegetation.map(item => item.assetId), WIRE_FENCE_ID, GATE_ID])];
  await Promise.all(assetIds.map(async id => {
    const record = assetRecords.get(id);
    if (!record?.sourceFile) throw new Error(`Asset ${id} sem arquivo fonte executável (status=${record?.reviewStatus ?? 'UNRESOLVED'}).`);
    const url = `/${record.sourceFile}`; record.texture = await loadTexture(url);
  }));
  currentScene?.cattleSprites.forEach(sprite => { sprite.stop(); sprite.destroy({children: true, texture: false, textureSource: false}); });
  world.removeChildren();
  const terrain = new Sprite(terrainTexture); terrain.position.set(0, 0); terrain.width = terrainBounds.width; terrain.height = terrainBounds.height; terrain.zIndex = -1e8; world.addChild(terrain);
  const drawItems = [];
  for (const placement of scene.placements) {
    const record = assetRecords.get(placement.assetId); if (!record?.texture) continue;
    let anchorPosition = placement.position, displaySize = record.displaySize;
    if (placement.id === 'handling-yard' && scene.corralPrefab?.footprint) {
      const {width, height} = scene.corralPrefab.footprint;
      anchorPosition = {x: scene.corralPrefab.origin.x + width, y: scene.corralPrefab.origin.y + height};
      const horizontal = (width + height) * projection.cellWidth / 2;
      const vertical = (width + height) * projection.cellHeight / 2;
      const aspect = record.texture.width / record.texture.height;
      displaySize = [horizontal, horizontal / aspect];
      displaySize[1] = Math.min(displaySize[1], vertical * 1.45);
    }
    const anchor = project(anchorPosition);
    drawItems.push({id: placement.id, assetId: placement.assetId, anchor, depth: anchor.y, record, displaySize, reviewStatus: record.reviewStatus});
  }
  for (const item of scene.vegetation ?? []) {
    const record = assetRecords.get(item.assetId); if (!record?.texture) continue;
    const anchor = project(item.position);
    drawItems.push({id: item.id, assetId: item.assetId, anchor, depth: anchor.y, record, displaySize: record.displaySize, reviewStatus: record.reviewStatus});
  }
  drawItems.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  for (const item of drawItems) addSprite(item.record.texture, item.record, item.anchor, item.depth, item.displaySize);
  const fenceArt = addFenceSprites(scene, assetRecords);

  const graze = animationManifest.clips.graze;
  if (!graze?.frames?.length) throw new Error('O atlas não possui clip graze com frames reais.');
  const cattleData = deriveVisualCattle(scene);
  const cattleSprites = [];
  for (const animal of cattleData) {
    const point = project(animal.position), sprite = new AnimatedSprite(graze.frames.map(frame => new Texture({source: animationAtlas.source, frame: new Rectangle(frame.contactBounds.x, frame.contactBounds.y, frame.contactBounds.width, frame.contactBounds.height)})));
    sprite.anchor.set(.5, 1); sprite.width = 42; sprite.height = 30; sprite.position.set(point.x, point.y); sprite.zIndex = point.y;
    sprite.animationSpeed = 1000 / graze.frameMs / 60; sprite.play(); world.addChild(sprite); cattleSprites.push(sprite);
  }
  const topology = drawTopology(scene); topology.visible = document.querySelector('#topology-toggle').checked; world.addChild(topology);
  currentScene = {scene, drawItems, cattleData, cattleSprites, topology, manifest, animationManifest};
  const statuses = [...new Set(drawItems.map(item => item.reviewStatus))];
  document.querySelector('#scene-seed').textContent = `SEED ${scene.seed}`;
  document.querySelector('#scene-summary').textContent = `${scene.placements.length} estruturas · ${scene.paddocks.length} piquetes · ${cattleSprites.length} bovinos demonstrativos`;
  document.querySelector('#asset-status').textContent = `ART ${statuses.join('/') || '—'} · CERCA ${fenceArt.reviewStatuses.join('/') || '—'} · SOLVER ${scene.solverStatus}`;
  const system = scene.specification?.sceneIntent?.productionSystem ?? scene.specification?.system ?? 'beef';
  document.querySelector('.scene-label h1').textContent = system === 'dairy' ? 'Fazenda leiteira' : 'Fazenda de corte';
  const mapMetrics = {sceneKey, seed: scene.seed, solverStatus: scene.solverStatus, sceneSchemaVersion: scene.sceneSchemaVersion,
    placementCount: scene.placements.length, vegetationCount: scene.vegetation.length, paddockCount: scene.paddocks.length,
    roadEdgeCount: scene.roadNetwork?.edges?.length ?? 0, fenceSegmentCount: scene.fenceNetwork?.segments?.length ?? 0,
    renderedAssetCount: drawItems.length, reviewStatuses: statuses, fenceArtCount: fenceArt.count,
    fenceGateSegmentCount: scene.fenceNetwork?.segments?.filter(segment => segment.piece === 'gate').length ?? 0,
    fenceGateArtCount: fenceArt.gateCount,
    fenceArtReviewStatuses: fenceArt.reviewStatuses, fenceCardinalFlipCount: fenceArt.cardinalFlipCount, fenceTransformPolicy: fenceArt.transformPolicy,
    macroLayoutSignature: macroLayoutSignatures(scene), macroStructureCount: scene.placements.length,
    paddockPolygonCount: scene.paddocks.length, paddockPolygonVertexCount: scene.paddocks.reduce((sum, item) => sum + item.polygon.length, 0), cattleCount: cattleData.length,
    cattleStates: [...new Set(cattleData.map(item => item.state))], animationState: 'graze', animationFrames: graze.frames.length,
    cattleMode: 'visual-demonstration-only', scientificStateWrites: 0, terrainSource: TERRAIN_URL};
  window.__ranchV6 = mapMetrics;
  fitCamera();
}

async function start() {
  try {
    await app.init({resizeTo: stage, background: 0x26392f, antialias: false, roundPixels: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), preference: 'webgl'});
    app.canvas.setAttribute('aria-label', 'Cena V6 compilada, PixiJS 8, sprites candidatos e terreno isométrico texturizado'); stage.prepend(app.canvas); app.stage.addChild(world);
    document.querySelector('#scene-select').addEventListener('change', async event => { try { await renderScene(event.target.value); } catch (error) { showError(error); } });
    document.querySelector('#camera-fit').addEventListener('click', fitCamera);
    document.querySelector('#topology-toggle').addEventListener('change', event => { if (currentScene) currentScene.topology.visible = event.target.checked; });
    const stageBox = () => stage.getBoundingClientRect();
    stage.addEventListener('wheel', event => { event.preventDefault(); const rect = stageBox(), px = event.clientX - rect.left, py = event.clientY - rect.top; const next = Math.max(.2, Math.min(2.3, camera.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08))); const wx = (px - camera.x) / camera.zoom, wy = (py - camera.y) / camera.zoom; camera.zoom = next; camera.x = px - wx * next; camera.y = py - wy * next; world.position.set(camera.x, camera.y); world.scale.set(next); }, {passive: false});
    stage.addEventListener('pointerdown', event => { drag = {x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y}; stage.setPointerCapture(event.pointerId); });
    stage.addEventListener('pointermove', event => { if (!drag) return; camera.x = drag.cameraX + event.clientX - drag.x; camera.y = drag.cameraY + event.clientY - drag.y; world.position.set(camera.x, camera.y); });
    stage.addEventListener('pointerup', () => drag = null); stage.addEventListener('pointercancel', () => drag = null);
    window.addEventListener('resize', fitCamera);
    await renderScene(new URLSearchParams(location.search).get('scene') || document.querySelector('#scene-select').value);
    window.__ranchV6Ready = true;
  } catch (error) { showError(error); }
}

function showError(error) { errorNode.hidden = false; errorNode.textContent = `Falha na cena V6:\n${error.stack ?? error}`; window.__ranchV6Error = String(error); }

start();
