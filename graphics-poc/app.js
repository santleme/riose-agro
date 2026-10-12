import {Application, Assets, Container, Graphics as PixiGraphicsClass, Rectangle, Sprite, Texture} from 'pixi.js';
import {distributePrefab, farmPositionToGrid, placementFits, projectIso, terrainCells, unprojectIso} from './contract.js';

const $ = id => document.getElementById(id);
const sceneUrl = '/graphics-poc/scene.json';
const farmAtlasUrl = '/graphics-poc/assets/farm-starter-atlas.png';
const neloreUrl = '/graphics-poc/assets/nelore-adult-idle-v1.png';
const frames = {
  'grass-light': {x: 0, y: 0, w: 384, h: 256, anchor: {x: .5, y: .82}, scale: 64 / 384, kind: 'terrain'},
  'grass-mid': {x: 384, y: 0, w: 384, h: 256, anchor: {x: .5, y: .82}, scale: 64 / 384, kind: 'terrain'},
  'soil-dry': {x: 768, y: 0, w: 384, h: 256, anchor: {x: .5, y: .82}, scale: 64 / 384, kind: 'terrain'},
  'fence-straight': {x: 768, y: 256, w: 384, h: 256, anchor: {x: .5, y: .86}, scale: .22, kind: 'infrastructure'},
  'shade-tree': {x: 0, y: 512, w: 384, h: 256, anchor: {x: .5, y: .9}, scale: .22, kind: 'infrastructure'},
  'pond': {x: 1152, y: 512, w: 384, h: 256, anchor: {x: .5, y: .78}, scale: .24, kind: 'infrastructure'},
  'farmhouse': {x: 0, y: 768, w: 384, h: 256, anchor: {x: .5, y: .9}, scale: .28, kind: 'infrastructure'},
  'nelore-adult': {x: 0, y: 0, w: 1536, h: 1024, anchor: {x: .5, y: 1}, scale: .04, kind: 'livestock'}
};
const startedAt = performance.now();
let originalBeefModule, originalBeefScenario;
const state = {scene: null, view: null, renderer: 'canvas', context: null, camera: {x: 0, y: 0, zoom: 1.35}, activeLayers: {terrain: true, infrastructure: true, livestock: true, overlays: true}, selection: null, tool: null, pixi: null, pixiTextures: new Map(), pixiTerrain: [], pixiPrefabs: new Map(), pixiAnimals: new Map(), visible: [], updateMs: 0, paintMs: 0, frameTimes: [], paintTimes: [], updateTimes: [], lastFrame: 0, lastHud: 0, worker: null, workerReady: false, pending: [], running: false, timer: null, drawCount: 0, selectedDomain: 'beef', assetImages: {}, canvasSizing: {width: 0, height: 0, ratio: 1}};

function image(url) {
  return new Promise((resolve, reject) => {
    const result = new Image(); result.onload = () => resolve(result); result.onerror = reject; result.src = url;
  });
}

function makeView(snapshot) {
  const animals = snapshot.animals, ids = new Uint32Array(animals.length), values = new Float64Array(animals.length * 4), actions = new Uint8Array(animals.length);
  const actionCodes = {grazing: 0, feeding: 1, drinking: 2, resting: 3};
  animals.forEach((animal, index) => { const offset = index * 4; ids[index] = animal.id; values[offset] = animal.x; values[offset + 1] = animal.y; values[offset + 2] = animal.weight; values[offset + 3] = animal.initialWeight; actions[index] = actionCodes[animal.action] ?? 0; });
  return {type: 'view', hour: snapshot.hour, config: snapshot.config, events: snapshot.events, animalIds: ids, animalValues: values, animalActions: actions, selectedAnimalId: state.view?.selectedAnimalId ?? 1, engineImplementation: 'javascript-fallback'};
}

function askWorker(message) {
  return new Promise((resolve, reject) => { state.pending.push({resolve, reject, messageType: message.type, started: performance.now()}); state.worker.postMessage(message); });
}

function acceptSnapshot(snapshot) {
  state.view = makeView(snapshot);
  refreshScene(); updateHud();
}

function workerMessage(event) {
  const message = event.data, pending = state.pending.shift();
  if (message.type === 'error') { pending?.reject(new Error(message.message)); return; }
  if (message.type === 'state') acceptSnapshot(message.state);
  else if (message.type === 'view') { state.view = message; refreshScene(); updateHud(); }
  if (pending) { state.lastWorkerRoundTripMs = performance.now() - pending.started; pending.resolve(message); }
}

function sceneCenter() {
  const {columns, rows, cellWidth, cellHeight} = state.scene.projection;
  return projectIso(columns / 2, rows / 2, cellWidth, cellHeight);
}

function isoPosition(column, row) {
  const p = projectIso(column, row, state.scene.projection.cellWidth, state.scene.projection.cellHeight), center = sceneCenter();
  return {x: p.x - center.x, y: p.y - center.y};
}

function entityEntries() {
  if (!state.view || state.selectedDomain !== 'beef') return [];
  const count = state.view.animalActions.length, entries = [], origin = sceneCenter();
  for (let index = 0; index < count; index++) {
    const offset = index * 4, grid = farmPositionToGrid(state.view.animalValues[offset], state.view.animalValues[offset + 1], state.scene.projection.columns, state.scene.projection.rows);
    const position = isoPosition(grid.column, grid.row), id = state.view.animalIds[index];
    entries.push({id: `animal-${id}`, kind: 'livestock', assetId: 'nelore-adult', x: position.x, y: position.y, depth: position.y, animalId: id, actionCode: state.view.animalActions[index], weight: state.view.animalValues[offset + 2]});
  }
  for (const prefab of state.scene.prefabs) {
    const position = isoPosition(prefab.position.x + prefab.footprint.columns / 2, prefab.position.y + prefab.footprint.rows / 2);
    entries.push({id: prefab.prefabId, kind: prefab.layer, assetId: prefab.assetId, x: position.x, y: position.y, depth: position.y, prefab});
  }
  entries.sort((a, b) => a.depth - b.depth || a.x - b.x);
  return entries;
}

function screenPoint(x, y) { return {x: state.camera.x + x * state.camera.zoom, y: state.camera.y + y * state.camera.zoom}; }

function onScreen(x, y, pad = 58) {
  const {width, height} = state.canvasSizing, p = screenPoint(x, y);
  return p.x >= -pad && p.x <= width + pad && p.y >= -pad && p.y <= height + pad;
}

function refreshScene() {
  if (!state.scene) return;
  const started = performance.now(), visible = [];
  if (state.activeLayers.terrain) {
    for (const cell of state.terrainCells) {
      const position = isoPosition(cell.column + .5, cell.row + .5);
      if (onScreen(position.x, position.y)) visible.push({id: `tile-${cell.column}-${cell.row}`, kind: 'terrain', assetId: cell.assetId, x: position.x, y: position.y, depth: position.y - 18, cell});
    }
  }
  for (const entry of entityEntries()) {
    if (!state.activeLayers[entry.kind] || !onScreen(entry.x, entry.y, entry.kind === 'livestock' ? 70 : 110)) continue;
    visible.push(entry);
  }
  state.visible = visible;
  state.updateMs = performance.now() - started;
  state.drawCount = visible.filter(item => item.kind === 'livestock').length;
  if (state.renderer === 'pixi' && state.pixi) syncPixiScene();
}

function frameBox(assetId) { return frames[assetId] ?? frames['grass-light']; }

function drawCanvasEntry(ctx, entry, time) {
  const meta = frameBox(entry.assetId), atlas = meta.kind === 'livestock' ? state.assetImages.nelore : state.assetImages.farm;
  const p = screenPoint(entry.x, entry.y), scale = meta.scale * state.camera.zoom, width = meta.w * scale, height = meta.h * scale;
  let x = p.x - width * meta.anchor.x, y = p.y - height * meta.anchor.y;
  if (entry.kind === 'livestock') y += Math.sin(time * .002 + entry.animalId * .71) * .55;
  ctx.drawImage(atlas, meta.x, meta.y, meta.w, meta.h, x, y, width, height);
  if (state.selection === entry.id && state.activeLayers.overlays) {
    ctx.strokeStyle = '#fff0a6'; ctx.lineWidth = 2; ctx.strokeRect(x - 4, y - 4, width + 8, height + 8);
  }
}

function drawCanvas(time) {
  if (state.renderer !== 'canvas') return;
  const {canvasSizing: size, context: ctx} = state;
  const start = performance.now();
  ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size.width, size.height); ctx.fillStyle = '#7c9562'; ctx.fillRect(0, 0, size.width, size.height);
  for (const entry of state.visible) if (entry.kind !== 'livestock' || state.activeLayers.livestock) drawCanvasEntry(ctx, entry, time);
  state.paintMs = performance.now() - start;
  recordFrame(time);
  requestAnimationFrame(drawCanvas);
}

function recordFrame(time) {
  if (state.lastFrame) state.frameTimes.push(time - state.lastFrame);
  state.lastFrame = time;
  state.paintTimes.push(state.paintMs); state.updateTimes.push(state.updateMs);
  if (state.frameTimes.length > 240) state.frameTimes.shift();
  if (state.paintTimes.length > 240) state.paintTimes.shift();
  if (state.updateTimes.length > 240) state.updateTimes.shift();
  if (time - state.lastHud > 500) updateHud();
}

async function initPixi() {
  if (state.pixi) return;
  if (state.pixiPromise) return state.pixiPromise;
  state.pixiPromise = createPixi();
  try { await state.pixiPromise; } finally { state.pixiPromise = null; }
}

async function createPixi() {
  const started = performance.now(), app = new Application();
  await app.init({background: '#7c9562', resizeTo: $('stage'), antialias: false, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 1.5), preference: 'webgl', eventMode: 'static'});
  app.canvas.id = 'pixi-canvas'; app.canvas.setAttribute('aria-label', 'Mapa isométrico da fazenda em PixiJS'); $('stage').append(app.canvas); app.stop();
  state.pixi = app;
  const farmTexture = await Assets.load(farmAtlasUrl), cowTexture = await Assets.load(neloreUrl);
  const makeFrame = meta => new Texture({source: (meta.kind === 'livestock' ? cowTexture : farmTexture).source, frame: new Rectangle(meta.x, meta.y, meta.w, meta.h)});
  for (const [id, meta] of Object.entries(frames)) state.pixiTextures.set(id, makeFrame(meta));
  const terrainLayer = new Container(), depthLayer = new Container(), overlayLayer = new Container();
  terrainLayer.label = 'terrain'; depthLayer.label = 'depth-sorted-world'; overlayLayer.label = 'interaction-overlays'; depthLayer.sortableChildren = true;
  app.stage.addChild(terrainLayer, depthLayer, overlayLayer);
  state.pixiLayers = {terrain: terrainLayer, depth: depthLayer, overlays: overlayLayer};
  state.pixiLoadMs = performance.now() - started;
  syncCanvasSize();
  $('pixi-canvas').addEventListener('pointerdown', beginPointer);
  $('pixi-canvas').addEventListener('pointermove', movePointer);
  $('pixi-canvas').addEventListener('pointerup', endPointer);
  $('pixi-canvas').addEventListener('pointercancel', () => { state.drag = null; });
  refreshScene();
}

function syncPixiScene() {
  const layers = state.pixiLayers, app = state.pixi;
  if (!layers || !app) return;
  layers.terrain.visible = state.activeLayers.terrain;
  layers.overlays.visible = state.activeLayers.overlays;
  layers.depth.visible = true;
  layers.terrain.removeChildren();
  for (const entry of state.visible) {
    if (entry.kind !== 'terrain') continue;
    const sprite = new Sprite(state.pixiTextures.get(entry.assetId));
    setSprite(sprite, entry, true); layers.terrain.addChild(sprite);
  }
  const stillVisible = new Set();
  for (const entry of state.visible) {
    if (entry.kind === 'terrain') continue;
    stillVisible.add(entry.id);
    let sprite = state.pixiPrefabs.get(entry.id);
    if (!sprite) { sprite = new Sprite(state.pixiTextures.get(entry.assetId)); state.pixiPrefabs.set(entry.id, sprite); layers.depth.addChild(sprite); }
    setSprite(sprite, entry, false); sprite.zIndex = entry.depth;
  }
  for (const [id, sprite] of state.pixiPrefabs) sprite.visible = stillVisible.has(id);
  layers.depth.sortChildren();
  layers.depth.position.set(state.camera.x, state.camera.y); layers.depth.scale.set(state.camera.zoom);
  layers.terrain.position.set(state.camera.x, state.camera.y); layers.terrain.scale.set(state.camera.zoom);
  layers.overlays.position.set(state.camera.x, state.camera.y); layers.overlays.scale.set(state.camera.zoom);
  layers.overlays.removeChildren();
  if (state.activeLayers.overlays && state.selection) {
    const selected = state.visible.find(item => item.id === state.selection);
    if (selected) {
      const meta = frameBox(selected.assetId), outline = new (awaitGraphics())();
      const w = meta.w * meta.scale, h = meta.h * meta.scale;
      outline.rect(selected.x - w * meta.anchor.x - 4, selected.y - h * meta.anchor.y - 4, w + 8, h + 8).stroke({color: 0xffeaa0, width: 2});
      layers.overlays.addChild(outline);
    }
  }
}

let PixiGraphics;
function awaitGraphics() { return PixiGraphics; }

function setSprite(sprite, entry, terrain) {
  const meta = frameBox(entry.assetId); sprite.anchor.set(meta.anchor.x, meta.anchor.y); sprite.scale.set(meta.scale);
  sprite.position.set(entry.x, entry.y); sprite.zIndex = entry.depth; sprite.visible = true; sprite.renderable = true;
  if (!terrain && entry.kind === 'livestock') sprite.y += Math.sin(performance.now() * .002 + entry.animalId * .71) * .55;
  if (!terrain) sprite.eventMode = 'none';
}

function syncCanvasSize() {
  const target = state.renderer === 'pixi' ? $('pixi-canvas') : $('canvas-renderer');
  if (!target) return;
  const rect = $('stage').getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(1, rect.height), ratio = Math.min(devicePixelRatio || 1, 1.5);
  state.canvasSizing = {width, height, ratio};
  const canvas = $('canvas-renderer');
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
  if (state.pixi && target === $('pixi-canvas')) state.pixi.renderer.resize(width, height);
  state.camera.x = width / 2; state.camera.y = height / 2;
}

function worldFromClient(clientX, clientY) {
  const rect = $('stage').getBoundingClientRect(), sx = clientX - rect.left, sy = clientY - rect.top;
  return {x: (sx - state.camera.x) / state.camera.zoom, y: (sy - state.camera.y) / state.camera.zoom};
}

function eventCell(clientX, clientY) {
  const world = worldFromClient(clientX, clientY), center = sceneCenter();
  const cell = unprojectIso(world.x + center.x, world.y + center.y, state.scene.projection.cellWidth, state.scene.projection.cellHeight);
  return {x: Math.floor(cell.column), y: Math.floor(cell.row)};
}

function beginPointer(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const world = worldFromClient(event.clientX, event.clientY), cell = eventCell(event.clientX, event.clientY), hit = [...state.visible].reverse().find(entry => entry.kind !== 'terrain' && Math.hypot(entry.x - world.x, entry.y - world.y) < (entry.kind === 'livestock' ? 26 : 45));
  const prefab = !state.tool && hit?.prefab ? hit.prefab : null;
  state.drag = {clientX: event.clientX, clientY: event.clientY, cameraX: state.camera.x, cameraY: state.camera.y, moved: false, world, cell, prefab, originalPosition: prefab ? {...prefab.position} : null};
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function movePointer(event) {
  if (!state.drag) return;
  if (Math.hypot(event.clientX - state.drag.clientX, event.clientY - state.drag.clientY) > 4) state.drag.moved = true;
  if (state.drag.moved) {
    if (state.tool === 'zone') return;
    if (state.drag.prefab) {
      const cell = eventCell(event.clientX, event.clientY), candidate = {x: cell.x, y: cell.y};
      if (placementFits(state.drag.prefab, candidate, state.scene.projection.columns, state.scene.projection.rows, state.scene.prefabs)) {
        state.drag.prefab.position.x = candidate.x; state.drag.prefab.position.y = candidate.y; refreshScene();
      }
      return;
    }
    state.camera.x = state.drag.cameraX + event.clientX - state.drag.clientX;
    state.camera.y = state.drag.cameraY + event.clientY - state.drag.clientY;
    refreshScene();
  }
}

function finishZone(start, end) {
  const maxX = state.scene.projection.columns - 1, maxY = state.scene.projection.rows - 1;
  const x0 = Math.max(0, Math.min(maxX, start.x)), x1 = Math.max(0, Math.min(maxX, end.x));
  const y0 = Math.max(0, Math.min(maxY, start.y)), y1 = Math.max(0, Math.min(maxY, end.y));
  const x = Math.min(x0, x1), y = Math.min(y0, y1), columns = Math.abs(x1 - x0) + 1, rows = Math.abs(y1 - y0) + 1;
  state.scene.zones.push({zoneId: `paddock-${Date.now()}`, kind: 'pasture', origin: {x, y, unit: 'grid-cell'}, footprint: {columns, rows}, groundAssetId: 'grass-mid', transitionAssetIds: {edge: 'grass-light'}});
  state.terrainCells = terrainCells(state.scene); state.tool = null; $('scene-status').textContent = 'Piquete criado com snapping isométrico e borda de transição.'; persistScene(); refreshScene();
}

async function endPointer(event) {
  if (!state.drag) return;
  const drag = state.drag; state.drag = null;
  if (drag.moved && state.tool === 'zone') { finishZone(drag.cell, eventCell(event.clientX, event.clientY)); return; }
  if (drag.moved && drag.prefab) { persistScene(); $('scene-status').textContent = 'Prefab movido com snapping; sobreposições bloqueantes evitadas.'; updateHud(); return; }
  if (drag.moved) { state.tool = null; refreshScene(); return; }
  const cell = eventCell(event.clientX, event.clientY);
  if (state.tool === 'zone') { state.zoneStart = cell; $('scene-status').textContent = 'Arraste do primeiro ao último tile do piquete.'; return; }
  if (state.tool?.assetId) {
    const meta = state.tool;
    const prefab = {prefabId: `${meta.assetId}-${Date.now()}`, assetId: meta.assetId, position: {x: cell.x, y: cell.y, unit: 'grid-cell'}, footprint: meta.footprint, layer: 'infrastructure', state: {stateId: 'default'}, blocking: true};
    if (!placementFits(prefab, prefab.position, state.scene.projection.columns, state.scene.projection.rows, state.scene.prefabs)) { $('scene-status').textContent = 'Esse prefab sai do mapa ou sobrepõe outro objeto.'; return; }
    state.scene.prefabs.push(prefab); state.selection = prefab.prefabId; state.tool = null; persistScene(); refreshScene(); updateHud(); return;
  }
  if (state.zoneStart) { finishZone(state.zoneStart, cell); state.zoneStart = null; return; }
  selectAt(worldFromClient(event.clientX, event.clientY));
}

function selectAt(world) {
  let nearest = null, min = Infinity;
  for (const entry of state.visible.filter(item => item.kind !== 'terrain')) {
    const d = Math.hypot(entry.x - world.x, entry.y - world.y);
    if (d < min && d < (entry.kind === 'livestock' ? 26 : 45)) { min = d; nearest = entry; }
  }
  state.selection = nearest?.id ?? null;
  $('selected-label').textContent = nearest ? (nearest.animalId ? `Animal #${nearest.animalId} · ${nearest.weight.toFixed(1)} kg · estado ${nearest.actionCode}` : `Prefab ${nearest.id} · ${nearest.assetId}`) : 'Nenhum objeto nesta posição';
  refreshScene();
  if (nearest?.animalId) state.worker?.postMessage({type: 'select', animalId: nearest.animalId});
}

function quantile(values, percentile) {
  if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile))];
}

function updateHud() {
  if (!state.scene) return;
  state.lastHud = performance.now();
  $('scene-name').textContent = state.scene.name;
  $('seed-label').textContent = `${state.scene.simulation.seed} · ${state.scene.simulation.scenarioId}`;
  $('prefab-count').textContent = String(state.scene.prefabs.length);
  $('sim-count').textContent = state.selectedDomain === 'dairy' ? 'suspensa · módulo em progresso' : state.view ? state.view.animalActions.length.toLocaleString('pt-BR') : '—';
  $('visible-count').textContent = `${state.drawCount.toLocaleString('pt-BR')} bovinos / ${state.visible.length.toLocaleString('pt-BR')} sprites`;
  const framesMs = state.frameTimes.slice(-120), fps = framesMs.length ? 1000 / (framesMs.reduce((sum, value) => sum + value, 0) / framesMs.length) : 0;
  $('fps-label').textContent = framesMs.length ? `${fps.toFixed(1)} / ${quantile(framesMs, .95).toFixed(1)} ms` : 'a medir';
  $('cost-label').textContent = `${state.updateMs.toFixed(2)} / ${state.paintMs.toFixed(2)} ms`;
  $('load-label').textContent = `${state.imageLoadMs?.toFixed(0) ?? '—'} ms assets · ${state.pixiLoadMs?.toFixed(0) ?? '—'} ms Pixi`;
  $('engine-badge').textContent = state.selectedDomain === 'dairy' ? 'livestock-dairy · in-progress' : (state.view?.engineImplementation ?? 'Simulation Worker');
}

function persistScene() { try { localStorage.setItem('riose-graphics-scene-v1', JSON.stringify(state.scene)); } catch { $('scene-status').textContent = 'Não foi possível salvar esta cena no navegador.'; } }

function distributeShade() {
  const template = {assetId: 'shade-tree', footprint: {columns: 1, rows: 1}, layer: 'infrastructure', state: {stateId: 'default'}, blocking: true};
  const placed = [];
  for (const zone of state.scene.zones.filter(item => item.kind === 'pasture')) {
    placed.push(...distributePrefab(template, zone, state.scene.projection.columns, state.scene.projection.rows, [...state.scene.prefabs, ...placed]));
  }
  if (!placed.length) { $('scene-status').textContent = 'Não há posições livres para distribuir árvores nos piquetes.'; return; }
  state.scene.prefabs.push(...placed); persistScene(); refreshScene(); updateHud();
  $('scene-status').textContent = `${placed.length} árvores distribuídas de forma determinística nos piquetes.`;
}

function canvasToBlob(canvas, name) {
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(state.scene, null, 2)], {type: 'application/json'})); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function switchRenderer(renderer) {
  state.renderer = renderer;
  const canvas = $('canvas-renderer'); canvas.classList.toggle('hidden', renderer !== 'canvas');
  if (renderer === 'pixi') {
    initPixi().then(() => { $('pixi-canvas').classList.remove('hidden'); syncCanvasSize(); refreshScene(); state.lastFrame = 0; cancelAnimationFrame(state.pixiFrameId); state.pixiFrameId = requestAnimationFrame(pixiFrame); });
  } else {
    $('pixi-canvas')?.classList.add('hidden'); cancelAnimationFrame(state.pixiFrameId); syncCanvasSize(); refreshScene(); state.lastFrame = 0; requestAnimationFrame(drawCanvas);
  }
}

function frameStats() {
  const framesMs = state.frameTimes.slice(-600), paintMs = state.paintTimes.slice(-600), updateMs = state.updateTimes.slice(-600);
  return {meanFps: framesMs.length ? 1000 / (framesMs.reduce((sum, value) => sum + value, 0) / framesMs.length) : 0, p95FrameMs: quantile(framesMs, .95), medianPaintMs: quantile(paintMs, .5), p95PaintMs: quantile(paintMs, .95), medianSceneUpdateMs: quantile(updateMs, .5), p95SceneUpdateMs: quantile(updateMs, .95), simulatedAnimals: state.selectedDomain === 'dairy' ? 0 : state.view?.animalActions.length ?? 0, visibleAnimals: state.drawCount, visibleSprites: state.visible.length, renderer: state.renderer};
}

function pixiFrame(time) {
  if (state.renderer !== 'pixi' || !state.pixi) return;
  const start = performance.now();
  state.pixi.renderer.render({container: state.pixi.stage});
  state.paintMs = performance.now() - start;
  recordFrame(time);
  state.pixiFrameId = requestAnimationFrame(pixiFrame);
}

async function resetSimulation(count = Number($('herd-size').value)) {
  if (state.selectedDomain !== 'beef') return;
  state.scene.simulation.populationCount = count;
  state.scene.simulation.seed = 20261012;
  state.scene.simulation.scenarioId = `beef-rotation-demo-${count}-${state.scene.simulation.seed}`;
  await askWorker({type: 'reset', seed: state.scene.simulation.seed, count});
  persistScene(); refreshScene();
}

function setSimulationRunning(value) {
  clearInterval(state.timer); state.running = value;
  if (value && state.selectedDomain === 'beef') state.timer = setInterval(() => state.worker.postMessage({type: 'tick', hours: 1}), 700);
  $('run-simulation').textContent = state.running ? 'Ⅱ Pausar' : '▶ Simular';
}

function captureFrames(durationMs) {
  return new Promise(resolve => {
    const frames = [], started = performance.now(); let last = 0;
    const frame = now => { if (last) frames.push(now - last); last = now; if (now - started >= durationMs) resolve(frames); else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
}

async function runGraphicsBenchmark({counts = [100, 1000, 10000], durationMs = 3000, warmupMs = 800} = {}) {
  setSimulationRunning(false);
  const results = [];
  for (const renderer of ['canvas', 'pixi']) {
    $('renderer').value = renderer; switchRenderer(renderer);
    if (renderer === 'pixi') await initPixi();
    for (const count of counts) {
      $('herd-size').value = String(count); await resetSimulation(count); state.camera.zoom = 2; syncCanvasSize(); refreshScene();
      await captureFrames(warmupMs); state.frameTimes = []; state.paintTimes = []; state.updateTimes = []; state.lastFrame = 0;
      const frames = await captureFrames(durationMs); state.frameTimes = frames;
      const record = frameStats(); record.count = count; record.workerRoundTripMs = state.lastWorkerRoundTripMs; record.memorySource = 'Use Chromium Performance.getMetrics for post-GC JS heap; GPU memory is not exposed by this harness.';
      results.push(record);
    }
  }
  $('renderer').value = 'canvas'; switchRenderer('canvas'); state.camera.zoom = 1.35; refreshScene();
  const report = {browser: navigator.userAgent, measuredAt: new Date().toISOString(), durationMs, warmupMs, assetLoadMs: state.imageLoadMs, pixiInitMs: state.pixiLoadMs, sourceSimulation: 'Existing FarmEngine Worker; one 1-hour tick is separate from renderer frame samples.', results};
  $('benchmark-output').textContent = JSON.stringify(report, null, 2);
  return report;
}

async function initialize() {
  const [scene, farmImage, neloreImage] = await Promise.all([fetch(sceneUrl).then(response => { if (!response.ok) throw new Error('Scene JSON não encontrado'); return response.json(); }), image(farmAtlasUrl), image(neloreUrl)]);
  const stored = localStorage.getItem('riose-graphics-scene-v1');
  state.scene = stored ? JSON.parse(stored) : scene;
  originalBeefModule = structuredClone(scene.domainModule); originalBeefScenario = scene.simulation.scenarioId;
  state.selectedDomain = state.scene.simulation.productionSystem === 'dairy' ? 'dairy' : 'beef'; $('domain-module').value = state.selectedDomain;
  state.assetImages = {farm: farmImage, nelore: neloreImage}; state.imageLoadMs = performance.now() - startedAt;
  state.terrainCells = terrainCells(state.scene);
  state.context = $('canvas-renderer').getContext('2d', {alpha: false});
  if (state.selectedDomain === 'beef') {
    state.worker = new Worker('/worker.js', {type: 'module'}); state.worker.onmessage = workerMessage;
    await askWorker({type: 'reset', seed: state.scene.simulation.seed, count: state.scene.simulation.populationCount});
  }
  state.canvasSizing = {width: $('stage').clientWidth, height: $('stage').clientHeight, ratio: Math.min(devicePixelRatio || 1, 1.5)};
  syncCanvasSize(); state.camera.zoom = 1.35; refreshScene(); requestAnimationFrame(drawCanvas); updateHud();
  $('scene-status').textContent = `Cena v${state.scene.schemaVersion} · seed fixo · ${state.view.animalActions.length} animais no Worker.`;
  $('renderer').addEventListener('change', event => switchRenderer(event.target.value));
  $('herd-size').addEventListener('change', event => resetSimulation(Number(event.target.value)));
  $('reset-simulation').addEventListener('click', () => resetSimulation());
  $('run-simulation').addEventListener('click', () => setSimulationRunning(!state.running));
  $('domain-module').addEventListener('change', event => {
    state.selectedDomain = event.target.value; setSimulationRunning(false);
    if (state.selectedDomain === 'dairy') {
      state.scene.domainModule = {moduleId: 'livestock-dairy', version: '0.1.0', status: 'in-progress', modelIds: []};
      state.scene.simulation.productionSystem = 'dairy'; state.scene.simulation.scenarioId = 'dairy-layout-only-in-progress';
      $('scene-status').textContent = 'Layout leiteiro representável; catálogo visual/científico in-progress. O Worker de corte fica suspenso e nenhum resultado leiteiro é simulado.';
    } else {
      state.scene.domainModule = originalBeefModule; state.scene.simulation.productionSystem = 'beef'; state.scene.simulation.scenarioId = originalBeefScenario;
      $('scene-status').textContent = 'Módulo de corte demonstrativo conectado ao Worker.'; resetSimulation();
    }
    persistScene(); refreshScene(); updateHud();
  });
  for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => {
    const assetId = button.dataset.tool, footprint = assetId === 'farmhouse' ? {columns: 2, rows: 2} : assetId === 'pond' ? {columns: 2, rows: 2} : {columns: 1, rows: 1};
    state.tool = {assetId, footprint, blocking: true}; $('scene-status').textContent = `Clique no mapa para colocar ${assetId}; snapping de 1 célula.`;
  });
  $('draw-zone').addEventListener('click', () => { state.tool = 'zone'; state.zoneStart = null; $('scene-status').textContent = 'Clique no primeiro canto e arraste para criar um piquete.'; });
  $('distribute-shade').addEventListener('click', distributeShade);
  $('save-scene').addEventListener('click', () => { persistScene(); $('scene-status').textContent = 'Layout salvo no navegador; snapshot de simulação continua separado.'; });
  $('export-scene').addEventListener('click', () => canvasToBlob(null, `${state.scene.sceneId}.json`));
  $('run-benchmark').addEventListener('click', async () => { $('scene-status').textContent = 'Benchmark Chromium em andamento…'; const report = await runGraphicsBenchmark(); $('scene-status').textContent = `Benchmark concluído: ${report.results.length} cargas, ambos renderizadores.`; });
  for (const input of document.querySelectorAll('[data-layer]')) input.addEventListener('change', () => { state.activeLayers[input.dataset.layer] = input.checked; refreshScene(); });
  $('zoom-in').addEventListener('click', () => { state.camera.zoom = Math.min(4, state.camera.zoom * 1.2); refreshScene(); });
  $('zoom-out').addEventListener('click', () => { state.camera.zoom = Math.max(.45, state.camera.zoom / 1.2); refreshScene(); });
  $('zoom-home').addEventListener('click', () => { state.camera.zoom = 1.35; syncCanvasSize(); refreshScene(); });
  $('canvas-renderer').addEventListener('pointerdown', beginPointer); $('canvas-renderer').addEventListener('pointermove', movePointer); $('canvas-renderer').addEventListener('pointerup', endPointer); $('canvas-renderer').addEventListener('pointercancel', () => { state.drag = null; });
  $('stage').addEventListener('wheel', event => { event.preventDefault(); state.camera.zoom = Math.min(4, Math.max(.45, state.camera.zoom * (event.deltaY < 0 ? 1.1 : .9))); refreshScene(); }, {passive: false});
  window.addEventListener('resize', () => { syncCanvasSize(); refreshScene(); });
  window.__graphicsReady = true; window.__runGraphicsBenchmark = runGraphicsBenchmark; window.__graphicsStats = frameStats;
  window.__graphicsControl = {
    setRenderer: renderer => { switchRenderer(renderer); return renderer === 'pixi' ? initPixi() : Promise.resolve(); },
    reset: count => resetSimulation(count),
    setCameraZoom: zoom => { state.camera.zoom = zoom; syncCanvasSize(); refreshScene(); },
    clearStats: () => { state.frameTimes = []; state.paintTimes = []; state.updateTimes = []; state.lastFrame = 0; },
    stats: frameStats,
    tick: async () => { const result = await askWorker({type: 'tick', hours: 1}); return {roundTripMs: state.lastWorkerRoundTripMs, implementation: result.engineImplementation}; },
    load: () => ({assetsMs: state.imageLoadMs, pixiInitMs: state.pixiLoadMs ?? null}),
  };
}

// The runtime atlas uses semantic frame IDs; its unapproved entries remain review-only.
PixiGraphics = PixiGraphicsClass;
initialize().catch(error => { $('scene-status').textContent = `Falha: ${error.message}`; window.__graphicsError = String(error); });
