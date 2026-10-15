import {Application, Assets, CanvasSource, Container, Graphics as PixiGraphicsClass, Rectangle, Sprite, Text as PixiText, Texture} from 'pixi.js';
import {composePrefabs, distanceToViewportCenter, distributePrefab, intersectsViewport, paintZoneTerrainTiles, placementValidation, projectIso, rotatePrefab, simulationPositionToScene, sortTerrainCellsBackToFront, terrainCells, toolAvailableInSystem, unprojectIso, visualLod, visualUpdateInterval, zoneGridCorners} from './contract.js';
import {accountAnimalVisibility, assertVisibleAnimalMembership, clusterFarAnimals, selectionForVisualEntry, visualEntryContainsSelection} from './herd-visual-model.js';
import {normalizeSceneAssetReferences, sceneAssetReference} from './asset-contract.js';
import {assertSceneCommandAllowed, sceneExecutionAvailability, terminateNumericWorker, unavailableExecutionState} from './execution-eligibility.js';
import {composeFarmSceneV8} from '../src/client/farm-scene-composer-v8.js';

const $ = id => document.getElementById(id);
const sceneUrl = '/graphics-poc/scene.json';
const dairySceneUrl = '/graphics-poc/scenes/dairy.json';
const waterStressSceneUrl = '/graphics-poc/scenes/water-stress-visual.json';
const terrainV8SceneUrl = '/graphics-poc/scenes/terrain-v8.json';
const farmAssemblyV8SceneUrl = '/graphics-poc/scenes/farm-assembly-v8.json';
const farmFinalV8SceneUrl = '/graphics-poc/scenes/farm-final-v8.json';
const ruralSmallV9SceneUrl = '/graphics-poc/scenes/rural-small-v9.json';
const ruralPropertyV9SceneUrl = '/graphics-poc/scenes/rural-property-v9.json';
const farmAtlasUrl = '/graphics-poc/assets/farm-starter-atlas.png';
const neloreUrl = '/graphics-poc/assets/nelore-adult-idle-v1.png';
const frames = {
  'grass-light': {x: 0, y: 0, w: 384, h: 256, anchor: {x: .5, y: .82}, scale: 64 / 384, kind: 'terrain'},
  'grass-mid': {x: 384, y: 0, w: 384, h: 256, anchor: {x: .5, y: .82}, scale: 64 / 384, kind: 'terrain'},
  'soil-dry': {x: 768, y: 0, w: 384, h: 256, anchor: {x: .5, y: .82}, scale: 64 / 384, kind: 'terrain'},
  'road-straight': {x: 0, y: 256, w: 384, h: 256, anchor: {x: .5, y: .82}, scale: 64 / 384, kind: 'infrastructure'},
  'road-turn': {x: 384, y: 256, w: 384, h: 256, anchor: {x: .5, y: .82}, scale: 64 / 384, kind: 'infrastructure'},
  'fence-straight': {x: 768, y: 256, w: 384, h: 256, anchor: {x: .5, y: .86}, scale: .22, kind: 'infrastructure'},
  'fence-gate': {x: 1152, y: 256, w: 384, h: 256, anchor: {x: .5, y: .86}, scale: .22, kind: 'infrastructure'},
  'shade-tree': {x: 0, y: 512, w: 384, h: 256, anchor: {x: .5, y: .9}, scale: .22, kind: 'infrastructure'},
  'fruit-tree': {x: 384, y: 512, w: 384, h: 256, anchor: {x: .5, y: .9}, scale: .2, kind: 'infrastructure'},
  'shrub': {x: 768, y: 512, w: 384, h: 256, anchor: {x: .5, y: .9}, scale: .16, kind: 'infrastructure'},
  'pond': {x: 1152, y: 512, w: 384, h: 256, anchor: {x: .5, y: .78}, scale: .24, kind: 'infrastructure'},
  'farmhouse': {x: 0, y: 768, w: 384, h: 256, anchor: {x: .5, y: .9}, scale: .28, kind: 'infrastructure'},
  'farm-shed': {x: 384, y: 768, w: 384, h: 256, anchor: {x: .5, y: .9}, scale: .25, kind: 'infrastructure'},
  'grain-silo': {x: 768, y: 768, w: 384, h: 256, anchor: {x: .5, y: .9}, scale: .22, kind: 'infrastructure'},
  'nelore-adult': {x: 0, y: 0, w: 1536, h: 1024, anchor: {x: .5, y: 1}, scale: .04, kind: 'livestock'},
  'nelore-adult-low': {x: 0, y: 0, w: 384, h: 256, anchor: {x: .5, y: 1}, scale: .16, kind: 'livestock', lowResolution: true},
  'dairy-holstein-cow': {imageKey: 'dairy-holstein-cow', w: 1087, h: 771, anchor: {x: .5, y: 1}, scale: .045, kind: 'livestock'},
  'dairy-girolando-cow': {imageKey: 'dairy-girolando-cow', w: 1164, h: 831, anchor: {x: .5, y: 1}, scale: .042, kind: 'livestock'},
  'dairy-heifer': {imageKey: 'dairy-heifer', w: 1070, h: 782, anchor: {x: .5, y: 1}, scale: .04, kind: 'livestock'},
  'dairy-heifer-calf': {imageKey: 'dairy-heifer-calf', w: 909, h: 750, anchor: {x: .5, y: 1}, scale: .032, kind: 'livestock'},
  'dairy-barn': {imageKey: 'dairy-barn', w: 843, h: 514, anchor: {x: .5, y: 1}, scale: .11, kind: 'infrastructure'},
  'dairy-milking-parlor': {imageKey: 'dairy-milking-parlor', w: 894, h: 559, anchor: {x: .5, y: 1}, scale: .09, kind: 'infrastructure'},
  'dairy-milk-chilling-tank': {imageKey: 'dairy-milk-chilling-tank', w: 580, h: 439, anchor: {x: .5, y: 1}, scale: .11, kind: 'infrastructure'},
  'dairy-waiting-pen': {imageKey: 'dairy-waiting-pen', w: 688, h: 424, anchor: {x: .5, y: 1}, scale: .1, kind: 'infrastructure'},
  'dairy-activity-collar': {imageKey: 'dairy-activity-collar', w: 1120, h: 663, anchor: {x: .5, y: 1}, scale: .045, kind: 'infrastructure'},
  'water-trough': {x: 1537, y: 387, w: 462, h: 237, anchor: {x: .5, y: 1}, scale: .22, kind: 'infrastructure', atlasKey: 'handling'},
  'feed-trough': {x: 1106, y: 387, w: 423, h: 261, anchor: {x: .5, y: 1}, scale: .23, kind: 'infrastructure', atlasKey: 'handling'}
};
const startedAt = performance.now();
let originalBeefModule, originalBeefScenario;
const state = {scene: null, scenes: {}, view: null, renderer: 'canvas', context: null, camera: {x: 0, y: 0, zoom: 1.35}, activeLayers: {terrain: true, infrastructure: true, livestock: true, overlays: true, grid: false}, selection: null, selectedAnimalIds: [], tool: null, pixi: null, pixiTextures: new Map(), pixiTerrain: [], pixiPrefabs: new Map(), pixiAnimals: new Map(), pixiWaterSprites: [], pixiWaterFrame: -1, visible: [], visibleAnimalCount: 0, culledAnimalCount: 0, visibleByLod: {near: 0, medium: 0, far: 0}, animalRenderUnits: 0, herdClusterCount: 0, lodUpdates: 0, motionById: new Map(), updateMs: 0, motionUpdateMs: 0, paintMs: 0, frameTimes: [], paintTimes: [], updateTimes: [], motionUpdateTimes: [], lodUpdateTimes: [], lastFrame: 0, lastAnimatedDepthSort: 0, lastHud: 0, worker: null, workerReady: false, pending: [], running: false, timer: null, drawCount: 0, selectedDomain: 'beef', sceneSelectionGeneration: 0, assetImages: {}, assetFrames: {}, assetAtlasUrls: {}, terrainV8AssetManifest: null, renderManifest: null, assetSourceManifest: null, canvasSizing: {width: 0, height: 0, ratio: 1}};

function image(url) {
  return new Promise((resolve, reject) => {
    const result = new Image(); result.onload = () => resolve(result); result.onerror = reject; result.src = url;
  });
}

function makeLowResolutionCow(source) {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 256;
  const context = canvas.getContext('2d'); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function makeView(snapshot) {
  const animals = snapshot.animals, ids = new Uint32Array(animals.length), values = new Float64Array(animals.length * 4), actions = new Uint8Array(animals.length);
  const actionCodes = {grazing: 0, feeding: 1, drinking: 2, resting: 3};
  animals.forEach((animal, index) => { const offset = index * 4; ids[index] = animal.id; values[offset] = animal.x; values[offset + 1] = animal.y; values[offset + 2] = animal.weight; values[offset + 3] = animal.initialWeight; actions[index] = actionCodes[animal.action] ?? 0; });
  return {type: 'view', hour: snapshot.hour, config: snapshot.config, events: snapshot.events, animalIds: ids, animalValues: values, animalActions: actions, selectedAnimalId: state.view?.selectedAnimalId ?? 1, engineImplementation: 'javascript-fallback'};
}

function askWorker(message) {
  assertSceneCommandAllowed(state.scene, message.type);
  return new Promise((resolve, reject) => { state.pending.push({resolve, reject, messageType: message.type, generation: state.sceneSelectionGeneration, started: performance.now()}); state.worker.postMessage(message); });
}

function acceptSnapshot(snapshot) {
  state.view = makeView(snapshot);
  refreshScene(); updateHud();
}

function workerMessage(event) {
  const message = event.data, pending = state.pending.shift();
  if (pending && pending.generation !== state.sceneSelectionGeneration) { pending.resolve({type: 'stale'}); return; }
  if (!sceneExecutionAvailability(state.scene).available) { pending?.resolve({type: 'ignored'}); return; }
  if (message.type === 'error') { pending?.reject(new Error(message.message)); return; }
  if (message.type === 'state') acceptSnapshot(message.state);
  else if (message.type === 'view') { state.view = message; refreshScene(); updateHud(); }
  if (pending) { state.lastWorkerRoundTripMs = performance.now() - pending.started; pending.resolve(message); }
}

function sceneCenter() {
  const {columns, rows, cellWidth, cellHeight} = state.scene.projection;
  return projectIso(columns / 2, rows / 2, cellWidth, cellHeight);
}

function fitSceneZoom() {
  const {columns, rows, cellWidth, cellHeight} = state.scene.projection;
  const width = (columns + rows) * cellWidth / 2;
  const maxHeight = state.scene.terrainV8 ? Math.max(0, ...state.scene.terrainV8.heightMap.flat()) : 0;
  const height = (columns + rows) * cellHeight / 2 + (state.scene.terrainV8?.dimensions.elevationPxPerLevel ?? 0) * maxHeight;
  const stage = $('stage');
  return Math.max(.15, Math.min(4, Math.min(stage.clientWidth * .98 / width, stage.clientHeight * .9 / height)));
}

function isoPosition(column, row) {
  const p = projectIso(column, row, state.scene.projection.cellWidth, state.scene.projection.cellHeight), center = sceneCenter();
  const model = state.scene.terrainV8;
  let elevation = 0;
  if (model) {
    const x = Math.max(0, Math.min(model.dimensions.columns - 1, Math.floor(column)));
    const y = Math.max(0, Math.min(model.dimensions.rows - 1, Math.floor(row)));
    elevation = model.heightMap[y][x] * model.dimensions.elevationPxPerLevel;
  }
  return {x: p.x - center.x, y: p.y - center.y - elevation};
}

function sceneTerrainCells(scene) {
  return sortTerrainCellsBackToFront(terrainCells(scene), scene.projection.cellWidth, scene.projection.cellHeight);
}

function entityEntries() {
  const entries = [];
  if (state.view && state.selectedDomain === 'beef') {
    const count = state.view.animalActions.length;
    for (let index = 0; index < count; index++) {
      const offset = index * 4, grid = simulationPositionToScene(state.view.animalValues[offset], state.view.animalValues[offset + 1], state.scene, state.view.config.housing);
      const position = isoPosition(grid.column + visualJitter(index, .28), grid.row + visualJitter(index + 901, .22)), id = state.view.animalIds[index];
      entries.push({id: `animal-${id}`, kind: 'livestock', assetId: 'nelore-adult', x: position.x, y: position.y, depth: position.y, animationOffset: state.motionById.get(`animal-${id}`)?.offset ?? 0, animalId: id, actionCode: state.view.animalActions[index], weight: state.view.animalValues[offset + 2]});
    }
  }
  for (const entity of state.scene.entities) {
    if (entity.kind !== 'animal' || entity.position.unit !== 'grid-cell') continue;
    const position = isoPosition(entity.position.x, entity.position.y);
    entries.push({id: entity.entityId, kind: 'livestock', assetId: entity.asset.assetId, x: position.x, y: position.y, depth: position.y, entity});
  }
  for (const prefab of state.scene.prefabs) {
    const centerX = prefab.position.x + prefab.footprint.columns / 2, centerY = prefab.position.y + prefab.footprint.rows / 2;
    const position = isoPosition(centerX, centerY);
    // The front corner of the ground footprint is the contact point that determines occlusion.
    // isoPosition reads the logical elevation map, so raised prefabs sort at their actual z.
    const contact = isoPosition(prefab.position.x + prefab.footprint.columns, prefab.position.y + prefab.footprint.rows);
    entries.push({id: prefab.prefabId, kind: prefab.layer, assetId: prefab.assetId, x: position.x, y: position.y,
      depth: prefab.depth ?? contact.y + (prefab.depthOffset ?? 0), visualScale: prefab.visualScale ?? 1, prefab});
  }
  return entries;
}

function visualJitter(seed, range) {
  const value = Math.sin((seed + 1) * 127.1) * 43758.5453123;
  return (value - Math.floor(value) - .5) * range;
}

function screenPoint(x, y) { return {x: state.camera.x + x * state.camera.zoom, y: state.camera.y + y * state.camera.zoom}; }
function focusAnimal(animalId) {
  const index = state.view?.animalIds.indexOf(animalId) ?? -1;
  if (index < 0) return false;
  const offset = index * 4, grid = simulationPositionToScene(state.view.animalValues[offset], state.view.animalValues[offset + 1], state.scene, state.view.config.housing);
  const target = isoPosition(grid.column + visualJitter(index, .28), grid.row + visualJitter(index + 901, .22));
  state.camera.x = state.canvasSizing.width / 2 - target.x * state.camera.zoom;
  state.camera.y = state.canvasSizing.height / 2 - target.y * state.camera.zoom;
  refreshScene();
  return true;
}
function prefabRotation(entry) {
  return Number.isFinite(entry.prefab?.rotationDegrees)
    ? entry.prefab.rotationDegrees * Math.PI / 180
    : ((entry.prefab?.rotationSteps ?? 0) % 4) * Math.PI / 2;
}
function prefabFlipX(entry) { return Boolean(entry.prefab?.flipX); }

function screenBounds(entry) {
  const meta = frameBox(entry.assetId), p = screenPoint(entry.x, entry.y);
  const visualScale = entry.visualScale ?? 1, width = meta.w * meta.scale * visualScale * (entry.visualScaleX ?? 1) * state.camera.zoom, height = meta.h * meta.scale * visualScale * (entry.visualScaleY ?? 1) * state.camera.zoom;
  const rotation = prefabRotation(entry), flip = prefabFlipX(entry) ? -1 : 1;
  const motionEnvelope = entry.animalId ? .55 * state.camera.zoom : 0;
  if (rotation === 0 && flip === 1) {
    const left = p.x - width * meta.anchor.x, top = p.y - height * meta.anchor.y;
    return {left, top: top - motionEnvelope, right: left + width, bottom: top + height + motionEnvelope};
  }
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const corners = [[-width * meta.anchor.x, -height * meta.anchor.y], [width * (1 - meta.anchor.x), -height * meta.anchor.y], [-width * meta.anchor.x, height * (1 - meta.anchor.y)], [width * (1 - meta.anchor.x), height * (1 - meta.anchor.y)]]
    .map(([x, y]) => ({x: p.x + x * flip * cos - y * sin, y: p.y + x * flip * sin + y * cos}));
  return {left: Math.min(...corners.map(point => point.x)), top: Math.min(...corners.map(point => point.y)) - motionEnvelope, right: Math.max(...corners.map(point => point.x)), bottom: Math.max(...corners.map(point => point.y)) + motionEnvelope};
}

function isVisible(entry) {
  const {width, height} = state.canvasSizing;
  return intersectsViewport(screenBounds(entry), width, height);
}

function refreshScene() {
  if (!state.scene) return;
  const started = performance.now(), terrain = [], objects = [], animals = [], visibleByLod = {near: 0, medium: 0, far: 0};
  if (state.activeLayers.terrain) {
    if (state.scene.terrainV8) {
      for (const cell of state.terrainCells) {
        if (!cell.elevation) continue;
        const ground = projectIso(cell.column + .5, cell.row + .5, state.scene.projection.cellWidth, state.scene.projection.cellHeight), center = sceneCenter();
        const entry = {id: `underlay-${cell.column}-${cell.row}`, kind: 'terrain', assetId: 'world-v8-grass', x: ground.x - center.x, y: ground.y - center.y, depth: -30000 + ground.y, cell};
        if (isVisible(entry)) terrain.push(entry);
      }
    }
    for (const cell of state.terrainCells) {
      const position = isoPosition(cell.column + .5, cell.row + .5);
      const groundPosition = projectIso(cell.column + .5, cell.row + .5, state.scene.projection.cellWidth, state.scene.projection.cellHeight);
      const depthLayer = cell.elevation ? 10000 : -20000;
      const entry = {id: `tile-${cell.column}-${cell.row}`, kind: 'terrain', assetId: cell.assetId, x: position.x, y: position.y, depth: depthLayer + groundPosition.y - sceneCenter().y - 18, cell};
      if (isVisible(entry)) terrain.push(entry);
    }
    terrain.push(...terrainV8CliffEntries());
  }
  const allEntries = entityEntries(), simulatedAnimalIds = allEntries.map(entry => entry.animalId).filter(Number.isSafeInteger);
  for (const entry of allEntries) {
    if (!state.activeLayers[entry.kind]) continue;
    if (!isVisible(entry)) continue;
    if (entry.kind === 'livestock') {
      const point = screenPoint(entry.x, entry.y);
      if (entry.animalId) {
        const distance = distanceToViewportCenter(point.x, point.y, state.canvasSizing.width, state.canvasSizing.height);
        const zoomScale = Math.min(1, state.camera.zoom);
        entry.screenX = point.x; entry.screenY = point.y; entry.lod = visualLod(distance, 100 * zoomScale, 220 * zoomScale);
        entry.assetId = entry.lod === 'near' ? 'nelore-adult' : 'nelore-adult-low';
      } else entry.lod = 'near';
      visibleByLod[entry.lod]++;
      animals.push(entry);
    } else objects.push(entry);
  }
  const {individual, clusters} = clusterFarAnimals(animals);
  assertVisibleAnimalMembership(animals, individual, clusters);
  const accounting = accountAnimalVisibility(simulatedAnimalIds, individual, clusters);
  const ordered = [...objects, ...individual, ...clusters].sort((a, b) => a.depth - b.depth || a.x - b.x);
  state.visible = [...terrain.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id)), ...ordered];
  state.updateMs = performance.now() - started;
  state.visibleAnimalCount = accounting.visibleAnimalIds.length;
  state.culledAnimalCount = accounting.culledAnimalIds.length;
  state.visibleByLod = visibleByLod;
  state.herdClusterCount = clusters.length;
  state.animalRenderUnits = individual.length + clusters.length;
  state.accountedAnimalCount = individual.filter(entry => entry.animalId).length + clusters.reduce((sum, entry) => sum + entry.count, 0);
  state.drawCount = state.animalRenderUnits;
  if (state.renderer === 'pixi' && state.pixi) syncPixiScene();
}

function terrainV8CliffEntries() {
  const model = state.scene.terrainV8;
  if (!model) return [];
  const entries = [], heightPx = model.dimensions.elevationPxPerLevel, center = sceneCenter();
  for (const cliff of model.cliffSegments) {
    const [column, row] = cliff.from;
    const a = projectIso(column + .5, row + .5, state.scene.projection.cellWidth, state.scene.projection.cellHeight);
    const [nextColumn, nextRow] = cliff.to ?? (cliff.direction === 'east' ? [column + 1, row] : [column, row + 1]);
    const b = projectIso(nextColumn + .5, nextRow + .5, state.scene.projection.cellWidth, state.scene.projection.cellHeight);
    const edgeX = (a.x + b.x) / 2 - center.x;
    const edgeY = (a.y + b.y) / 2 - center.y;
    for (let level = cliff.bottomElevation; level < cliff.topElevation; level++) {
      const entry = {
        id: `${cliff.id}-${level}`, kind: 'terrain', assetId: cliff.assetId,
        x: edgeX, y: edgeY - (level + 1) * heightPx, depth: edgeY + level,
        visualScale: .75, cliff,
      };
      if (isVisible(entry)) entries.push(entry);
    }
  }
  return entries;
}

function frameBox(assetId) { return state.assetFrames[assetId] ?? frames[assetId] ?? frames['grass-light']; }

function drawCanvasEntry(ctx, entry, time) {
  const meta = frameBox(entry.assetId), atlas = meta.imageKey ? state.assetImages[meta.imageKey] : meta.atlasKey ? state.assetImages[meta.atlasKey] : meta.kind === 'livestock' ? (meta.lowResolution ? state.assetImages.neloreLow : state.assetImages.nelore) : state.assetImages.farm;
  const p = screenPoint(entry.x, entry.y + (entry.animationOffset ?? 0)), scale = meta.scale * (entry.visualScale ?? 1) * state.camera.zoom, width = meta.w * scale * (entry.visualScaleX ?? 1), height = meta.h * scale * (entry.visualScaleY ?? 1);
  const x = -width * meta.anchor.x, y = -height * meta.anchor.y, rotation = prefabRotation(entry);
  const screenY = p.y + y;
  if (rotation !== 0 || prefabFlipX(entry)) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(rotation); if (prefabFlipX(entry)) ctx.scale(-1, 1);
    if (meta.imageKey) ctx.drawImage(atlas, x, y, width, height);
    else ctx.drawImage(atlas, meta.x, meta.y, meta.w, meta.h, x, y, width, height);
    ctx.restore();
  } else if (meta.imageKey) ctx.drawImage(atlas, p.x + x, p.y + y, width, height);
  else ctx.drawImage(atlas, meta.x, meta.y, meta.w, meta.h, p.x + x, p.y + y, width, height);
  if (entry.kind === 'herd-cluster' && entry.count > 1 && state.activeLayers.overlays) {
    const label = entry.count.toLocaleString('pt-BR'); ctx.font = 'bold 9px system-ui';
    const badgeWidth = Math.max(18, ctx.measureText(label).width + 8), badgeX = p.x - badgeWidth / 2, badgeY = screenY - 16;
    ctx.fillStyle = 'rgba(23, 62, 50, .94)'; ctx.beginPath(); ctx.roundRect(badgeX, badgeY, badgeWidth, 14, 6); ctx.fill();
    ctx.fillStyle = '#f7f4dc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, p.x, badgeY + 7);
  }
  if ((state.selection === entry.id || visualEntryContainsSelection(entry, state.selectedAnimalIds)) && state.activeLayers.overlays) {
    const bounds = screenBounds(entry);
    ctx.strokeStyle = '#fff0a6'; ctx.lineWidth = 2; ctx.strokeRect(bounds.left - 4, bounds.top - 4, bounds.right - bounds.left + 8, bounds.bottom - bounds.top + 8);
  }
}

function drawCanvasZoneOverlays(ctx) {
  if (!state.activeLayers.overlays) return;
  for (const zone of state.scene.zones) {
    const points = zoneGridCorners(zone).map(point => {
      const world = isoPosition(point.column, point.row);
      return screenPoint(world.x, world.y);
    });
    const color = /^#[\da-f]{6}$/i.test(zone.color ?? '') ? zone.color : '#83aa63';
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath(); ctx.fillStyle = color; ctx.globalAlpha = .045; ctx.fill();
    ctx.globalAlpha = .72; ctx.lineWidth = 3; ctx.strokeStyle = '#173e32'; ctx.stroke();
    ctx.globalAlpha = .95; ctx.lineWidth = 1.2; ctx.strokeStyle = color; ctx.stroke();
    if (zone.kind === 'pasture' && zone.name) {
      const center = isoPosition(zone.origin.x + zone.footprint.columns / 2, zone.origin.y + zone.footprint.rows / 2);
      const labelPosition = screenPoint(center.x, center.y), label = zone.name;
      ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const width = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(23, 62, 50, .88)'; ctx.beginPath(); ctx.roundRect(labelPosition.x - width / 2, labelPosition.y - 8, width, 16, 7); ctx.fill();
      ctx.fillStyle = '#f7f4dc'; ctx.fillText(label, labelPosition.x, labelPosition.y + .5);
    }
  }
  ctx.globalAlpha = 1;
}

function updateVisualMotion(time) {
  const started = performance.now(); let updates = 0;
  for (const entry of state.visible) {
    if (entry.kind !== 'livestock' || !entry.animalId) continue;
    const zoomScale = Math.min(1, state.camera.zoom), interval = visualUpdateInterval(distanceToViewportCenter(entry.screenX, entry.screenY, state.canvasSizing.width, state.canvasSizing.height), 100 * zoomScale, 220 * zoomScale), motion = state.motionById.get(entry.id) ?? {updatedAt: -Infinity, offset: 0};
    if (time - motion.updatedAt >= interval) { motion.updatedAt = time; motion.offset = Math.sin(time * .002 + entry.animalId * .71) * .55; state.motionById.set(entry.id, motion); updates++; }
    entry.animationOffset = motion.offset;
    if (state.renderer === 'pixi') { const sprite = state.pixiPrefabs.get(entry.id); if (sprite) sprite.y = entry.y + motion.offset; }
  }
  state.lodUpdates = updates; state.motionUpdateMs = performance.now() - started;
}

function drawCanvas(time) {
  if (state.renderer !== 'canvas') return;
  const {canvasSizing: size, context: ctx} = state;
  updateVisualMotion(time);
  const start = performance.now();
  ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
  ctx.imageSmoothingEnabled = state.camera.zoom < .8;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size.width, size.height); ctx.fillStyle = '#7c9562'; ctx.fillRect(0, 0, size.width, size.height);
  for (const entry of state.visible) if (entry.kind !== 'livestock' || state.activeLayers.livestock) drawCanvasEntry(ctx, entry, time);
  drawCanvasZoneOverlays(ctx);
  state.paintMs = performance.now() - start;
  recordFrame(time);
  requestAnimationFrame(drawCanvas);
}

function recordFrame(time) {
  if (state.lastFrame) state.frameTimes.push(time - state.lastFrame);
  state.lastFrame = time;
  state.paintTimes.push(state.paintMs); state.updateTimes.push(state.updateMs);
  state.motionUpdateTimes.push(state.motionUpdateMs);
  state.lodUpdateTimes.push(state.lodUpdates);
  if (state.frameTimes.length > 240) state.frameTimes.shift();
  if (state.paintTimes.length > 240) state.paintTimes.shift();
  if (state.updateTimes.length > 240) state.updateTimes.shift();
  if (state.motionUpdateTimes.length > 240) state.motionUpdateTimes.shift();
  if (state.lodUpdateTimes.length > 240) state.lodUpdateTimes.shift();
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
  await app.init({background: state.scene?.terrainV8 ? '#dedccf' : '#7c9562', resizeTo: $('stage'), antialias: false, autoDensity: true, autoStart: false, resolution: Math.min(devicePixelRatio || 1, 1.5), preference: 'webgl', eventMode: 'static'});
  app.canvas.id = 'pixi-canvas'; app.canvas.setAttribute('aria-label', 'Mapa isométrico da fazenda em PixiJS'); $('stage').append(app.canvas); app.stop();
  state.pixi = app;
  const farmTexture = await Assets.load(farmAtlasUrl), cowTexture = await Assets.load(neloreUrl), handlingTexture = await Assets.load('/graphics-poc/assets/handling-review-atlas-v1.png');
  const atlasTextures = Object.fromEntries(await Promise.all(Object.entries(state.assetAtlasUrls).map(async ([key, url]) => [key, await Assets.load(url)])));
  const makeFrame = meta => new Texture({source: (meta.atlasKey === 'handling' ? handlingTexture : meta.kind === 'livestock' ? cowTexture : farmTexture).source, frame: new Rectangle(meta.x, meta.y, meta.w, meta.h)});
  for (const [id, meta] of Object.entries(frames)) if (!meta.lowResolution && !state.assetFrames[id]) state.pixiTextures.set(id, meta.imageKey ? Texture.from(state.assetImages[meta.imageKey]) : makeFrame(meta));
  state.pixiTextures.set('nelore-adult-low', new Texture({source: new CanvasSource({resource: state.assetImages.neloreLow})}));
  for (const [id, meta] of Object.entries(state.assetFrames)) {
    const atlas = atlasTextures[meta.atlasKey];
    if (atlas) state.pixiTextures.set(id, new Texture({source: atlas.source, frame: new Rectangle(meta.x, meta.y, meta.w, meta.h)}));
  }
  const terrainLayer = new Container(), depthLayer = new Container(), overlayLayer = new Container();
  terrainLayer.label = 'terrain'; depthLayer.label = 'depth-sorted-world'; overlayLayer.label = 'interaction-overlays'; terrainLayer.sortableChildren = true; depthLayer.sortableChildren = true;
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
  state.pixiWaterSprites = [];
  for (const entry of state.visible) {
    if (entry.kind !== 'terrain') continue;
    const sprite = new Sprite(state.pixiTextures.get(entry.assetId));
    setSprite(sprite, entry, true); layers.terrain.addChild(sprite);
    if (entry.cell?.material === 'water') state.pixiWaterSprites.push(sprite);
  }
  layers.terrain.sortChildren();
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
  if (state.activeLayers.overlays) {
    for (const zone of state.scene.zones) {
      const points = zoneGridCorners(zone).flatMap(point => {
        const world = isoPosition(point.column, point.row);
        return [world.x, world.y];
      });
      const color = /^#[\da-f]{6}$/i.test(zone.color ?? '') ? Number.parseInt(zone.color.slice(1), 16) : 0x83aa63;
      const outline = new PixiGraphicsClass();
      outline.poly(points).fill({color, alpha: .045}).stroke({color: 0x173e32, alpha: .72, width: 3 / state.camera.zoom});
      outline.poly(points).stroke({color, alpha: .95, width: 1.2 / state.camera.zoom});
      layers.overlays.addChild(outline);
      if (zone.kind === 'pasture' && zone.name) {
        const label = new PixiText({text: zone.name, style: {fontFamily: 'Arial', fontSize: 11, fontWeight: '600', fill: '#f7f4dc'}});
        label.anchor.set(.5);
        const width = label.width + 12, badge = new Container(), background = new PixiGraphicsClass();
        background.roundRect(-width / 2, -8, width, 16, 7).fill({color: 0x173e32, alpha: .88}); badge.addChild(background, label);
        badge.position.set(...points.reduce((center, value, index) => { center[index % 2] += value / 4; return center; }, [0, 0]));
        badge.scale.set(1 / state.camera.zoom); layers.overlays.addChild(badge);
      }
    }
    for (const entry of state.visible) {
      if (entry.kind !== 'herd-cluster' || entry.count < 2) continue;
      const badge = new Container(), background = new PixiGraphicsClass(), label = new PixiText({text: entry.count.toLocaleString('pt-BR'), style: {fontFamily: 'Arial', fontSize: 9, fontWeight: 'bold', fill: '#f7f4dc'}});
      label.anchor.set(.5); const badgeWidth = Math.max(18, label.width + 8);
      background.roundRect(-badgeWidth / 2, -7, badgeWidth, 14, 6).fill({color: 0x173e32, alpha: .94}); badge.addChild(background, label);
      const meta = frameBox(entry.assetId), spriteHeight = meta.h * meta.scale;
      badge.position.set(entry.x, entry.y - spriteHeight - 15 / state.camera.zoom); badge.scale.set(1 / state.camera.zoom); layers.overlays.addChild(badge);
    }
    if (state.activeLayers.grid && state.scene.terrainV8) {
      const {columns, rows} = state.scene.terrainV8.dimensions;
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const points = [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]].flatMap(([x, y]) => {
          const point = isoPosition(x, y); return [point.x, point.y];
        });
        const cell = state.scene.terrainV8.cells[row][column], grid = new PixiGraphicsClass();
        grid.poly(points).stroke({color: cell.material === 'water' ? 0x61a9b0 : cell.elevation ? 0xf1d68e : 0x253d2c, alpha: .5, width: 1 / state.camera.zoom});
        layers.overlays.addChild(grid);
      }
    }
  }
  if (state.activeLayers.overlays && (state.selection || state.selectedAnimalIds.length)) {
    const selected = state.visible.filter(item => item.id === state.selection || visualEntryContainsSelection(item, state.selectedAnimalIds));
    for (const entry of selected) {
      const selected = entry;
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
  const meta = frameBox(entry.assetId), scale = meta.scale * (entry.visualScale ?? 1); sprite.anchor.set(meta.anchor.x, meta.anchor.y); sprite.scale.set(scale * (entry.visualScaleX ?? 1) * (prefabFlipX(entry) ? -1 : 1), scale * (entry.visualScaleY ?? 1));
  sprite.position.set(entry.x, entry.y + (entry.animationOffset ?? 0)); sprite.rotation = prefabRotation(entry); sprite.zIndex = entry.depth; sprite.visible = true; sprite.renderable = true;
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
  const movable = !state.tool && (hit?.prefab ?? hit?.entity);
  state.drag = {clientX: event.clientX, clientY: event.clientY, cameraX: state.camera.x, cameraY: state.camera.y, moved: false, world, cell, movable, originalPosition: movable ? {...movable.position} : null};
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function movePointer(event) {
  if (!state.drag) return;
  if (Math.hypot(event.clientX - state.drag.clientX, event.clientY - state.drag.clientY) > 4) state.drag.moved = true;
  if (state.drag.moved) {
    if (state.tool === 'zone') return;
    if (state.drag.movable) {
      const cell = eventCell(event.clientX, event.clientY), candidate = {x: cell.x, y: cell.y};
      const movable = state.drag.movable, footprint = movable.footprint ?? {columns: 1, rows: 1};
      if (placementValidation({...movable, footprint, blocking: movable.blocking ?? false}, candidate, state.scene.projection.columns, state.scene.projection.rows, state.scene.prefabs, state.scene.zones).valid) {
        movable.position.x = candidate.x; movable.position.y = candidate.y; refreshScene();
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
  const paddockNumber = state.scene.zones.filter(zone => zone.kind === 'pasture').length + 1;
  const zone = {zoneId: `paddock-${Date.now()}`, kind: 'pasture', name: `Piquete ${paddockNumber}`, color: '#83aa63', origin: {x, y, unit: 'grid-cell'}, footprint: {columns, rows}, groundAssetId: 'grass-mid', transitionAssetIds: {edge: 'grass-light'}};
  state.scene.zones.unshift(zone);
  state.scene.terrainTiles = paintZoneTerrainTiles(state.scene.terrainTiles, zone, state.scene.projection.columns, state.scene.projection.rows);
  normalizeSceneAssetReferences(state.scene, state.renderManifest, state.assetSourceManifest);
  state.terrainCells = sceneTerrainCells(state.scene); state.tool = null; $('scene-status').textContent = 'Piquete criado com snapping isométrico e borda de transição.'; persistScene(); refreshScene();
}

async function endPointer(event) {
  if (!state.drag) return;
  const drag = state.drag; state.drag = null;
  if (drag.moved && state.tool === 'zone') { finishZone(drag.cell, eventCell(event.clientX, event.clientY)); return; }
  if (drag.moved && drag.movable) { persistScene(); $('scene-status').textContent = 'Objeto movido com snapping; limites do mapa respeitados.'; updateHud(); return; }
  if (drag.moved) { state.tool = null; refreshScene(); return; }
  const cell = eventCell(event.clientX, event.clientY);
  if (state.tool === 'zone') { state.zoneStart = cell; $('scene-status').textContent = 'Arraste do primeiro ao último tile do piquete.'; return; }
  if (state.tool?.assetId) {
    const meta = state.tool;
    if (meta.kind === 'livestock') {
      const id = `${meta.assetId}-${Date.now()}`;
      state.scene.entities.push({entityId: id, kind: 'animal', position: {x: cell.x + .5, y: cell.y + .5, unit: 'grid-cell'}, asset: sceneAssetReference(meta.assetId, state.renderManifest, state.assetSourceManifest), state: {stateId: 'idle'}, representationMode: 'sampled-miniature'});
      state.selection = id; state.selectedAnimalIds = []; state.tool = null; persistScene(); refreshScene(); updateHud(); return;
    }
    const prefab = {prefabId: `${meta.assetId}-${Date.now()}`, assetId: meta.assetId, position: {x: cell.x, y: cell.y, unit: 'grid-cell'}, footprint: meta.footprint, layer: 'infrastructure', state: {stateId: 'default'}, blocking: meta.blocking};
    const validation = placementValidation(prefab, prefab.position, state.scene.projection.columns, state.scene.projection.rows, state.scene.prefabs, state.scene.zones);
    if (!validation.valid) { $('scene-status').textContent = placementMessage(validation.reason); return; }
    state.scene.prefabs.push(prefab); state.selection = prefab.prefabId; state.selectedAnimalIds = []; state.tool = null; persistScene(); refreshScene(); updateHud(); return;
  }
  if (state.tool?.compositionId === 'dairy-service') {
    const recipe = [
      {assetId: 'dairy-barn', footprint: {columns: 3, rows: 2}, layer: 'infrastructure', state: {stateId: 'default'}, blocking: true, placementRules: {alignment: {axis: 'row', value: cell.y}}, offset: {x: 0, y: 0}},
      {assetId: 'dairy-milking-parlor', footprint: {columns: 3, rows: 2}, layer: 'infrastructure', state: {stateId: 'milking-ready'}, blocking: true, placementRules: {adjacentTo: ['dairy-barn'], alignment: {axis: 'row', value: cell.y}}, offset: {x: 3, y: 0}},
      {assetId: 'dairy-milk-chilling-tank', footprint: {columns: 2, rows: 1}, layer: 'infrastructure', state: {stateId: 'cooling'}, blocking: true, placementRules: {adjacentTo: ['dairy-milking-parlor'], alignment: {axis: 'row', value: cell.y}}, offset: {x: 6, y: 0}},
      {assetId: 'dairy-waiting-pen', footprint: {columns: 2, rows: 2}, layer: 'infrastructure', state: {stateId: 'waiting'}, blocking: true, placementRules: {adjacentTo: ['dairy-milk-chilling-tank'], alignment: {axis: 'row', value: cell.y}}, offset: {x: 8, y: 0}}
    ];
    const result = composePrefabs(recipe, cell, state.scene.projection.columns, state.scene.projection.rows, state.scene.prefabs);
    if (!result.valid) { $('scene-status').textContent = placementMessage(result.reason); return; }
    state.scene.prefabs.push(...result.prefabs); state.tool = null; persistScene(); refreshScene(); updateHud();
    $('scene-status').textContent = 'Núcleo de ordenha colocado em uma linha alinhada: galpão, ordenha, tanque e espera.'; return;
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
  const visualSelection = selectionForVisualEntry(nearest);
  const animalId = visualSelection.kind === 'animal' ? visualSelection.animalIds[0] : null;
  state.selectedAnimalIds = visualSelection.animalIds;
  state.selection = nearest?.kind === 'herd-cluster' ? nearest.id : animalId ? `animal-${animalId}` : nearest?.id ?? null;
  updateSelectionActions();
  $('selected-members').textContent = state.selectedAnimalIds.length
    ? state.selectedAnimalIds.join(', ')
    : 'Nenhum animal selecionado.';
  if (nearest?.kind === 'herd-cluster') {
    state.camera.zoom = Math.min(4, Math.max(state.camera.zoom + .4, state.camera.zoom * 1.25));
    state.camera.x = state.canvasSizing.width / 2 - nearest.x * state.camera.zoom;
    state.camera.y = state.canvasSizing.height / 2 - nearest.y * state.camera.zoom;
    $('selected-label').textContent = `Lote com ${nearest.count.toLocaleString('pt-BR')} animais · IDs preservados ao aproximar`;
  } else $('selected-label').textContent = nearest ? (nearest.animalId ? `Animal #${nearest.animalId} · ${nearest.weight.toFixed(1)} kg · estado ${nearest.actionCode}` : `Objeto ${nearest.id} · ${nearest.assetId}`) : 'Nenhum objeto nesta posição';
  refreshScene();
  if (animalId) state.worker?.postMessage({type: 'select', animalId});
}

function quantile(values, percentile) {
  if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile))];
}

function placementMessage(reason) {
  return ({'out-of-bounds': 'O objeto ultrapassa os limites do mapa.', collision: 'Esse objeto sobrepõe uma estrutura bloqueante.', zone: 'Esse objeto precisa ficar dentro de uma zona compatível.', adjacency: 'Esse objeto precisa tocar a estrutura indicada.', alignment: 'Esse objeto precisa seguir a linha de alinhamento configurada.'})[reason] ?? 'Posição inválida para esse objeto.';
}

function updateSelectionActions() {
  $('rotate-selection').disabled = !state.scene?.prefabs.some(item => item.prefabId === state.selection);
  const members = $('selected-members');
  if (members) members.textContent = state.selectedAnimalIds.length ? state.selectedAnimalIds.join(', ') : 'Nenhum animal selecionado.';
}

function rotateSelection() {
  const selected = state.scene?.prefabs.find(item => item.prefabId === state.selection);
  if (!selected) return;
  const candidate = rotatePrefab(selected);
  const validation = placementValidation(candidate, candidate.position, state.scene.projection.columns, state.scene.projection.rows, state.scene.prefabs, state.scene.zones);
  if (!validation.valid) { $('scene-status').textContent = placementMessage(validation.reason); return; }
  Object.assign(selected, candidate); persistScene(); refreshScene(); updateHud();
  $('scene-status').textContent = 'Prefab girado em 90°; footprint, colisões e regras de zona continuam válidos.';
}

function updateHud() {
  if (!state.scene) return;
  const execution = sceneExecutionAvailability(state.scene);
  updateSelectionActions();
  state.lastHud = performance.now();
  $('scene-name').textContent = state.scene.name;
  $('seed-label').textContent = `${state.scene.simulation.seed} · ${state.scene.simulation.scenarioId}`;
  $('prefab-count').textContent = String(state.scene.prefabs.length + state.scene.entities.length);
  $('sim-count').textContent = execution.available ? state.view ? state.view.animalActions.length.toLocaleString('pt-BR') : '—' : 'indisponível · módulo em progresso';
  $('run-simulation').disabled = !execution.available; $('reset-simulation').disabled = !execution.available; $('herd-size').disabled = !execution.available; $('run-benchmark').disabled = !execution.available;
  $('visible-count').textContent = !execution.available
    ? `${state.visibleAnimalCount.toLocaleString('pt-BR')} animais no layout · sem simulação`
    : `${state.visibleAnimalCount.toLocaleString('pt-BR')} / ${state.view?.animalActions.length?.toLocaleString('pt-BR') ?? '0'} bovinos · ${state.animalRenderUnits.toLocaleString('pt-BR')} visuais`;
  const framesMs = state.frameTimes.slice(-120), fps = framesMs.length ? 1000 / (framesMs.reduce((sum, value) => sum + value, 0) / framesMs.length) : 0;
  $('fps-label').textContent = framesMs.length ? `${fps.toFixed(1)} / ${quantile(framesMs, .95).toFixed(1)} ms` : 'a medir';
  $('cost-label').textContent = `${state.updateMs.toFixed(2)} / ${state.paintMs.toFixed(2)} ms`;
  $('load-label').textContent = `${state.imageLoadMs?.toFixed(0) ?? '—'} ms assets · ${state.pixiLoadMs?.toFixed(0) ?? '—'} ms Pixi`;
  $('engine-badge').textContent = execution.available ? (state.view?.engineImplementation ?? execution.status) : `EXECUÇÃO NUMÉRICA INDISPONÍVEL · ${execution.moduleId ?? 'modelo'} · ${execution.moduleStatus}`;
}

function persistScene() { try { normalizeSceneAssetReferences(state.scene, state.renderManifest, state.assetSourceManifest); localStorage.setItem(`riose-graphics-scene-v1:${state.scene.sceneId}`, JSON.stringify(state.scene)); } catch (error) { $('scene-status').textContent = `Não foi possível salvar as referências da cena: ${error.message}`; } }

async function selectScene(domain) {
  const generation = ++state.sceneSelectionGeneration;
  const base = state.scenes[domain];
  const stored = localStorage.getItem(`riose-graphics-scene-v1:${base.sceneId}`) ?? (domain === 'beef' ? localStorage.getItem('riose-graphics-scene-v1') : null);
  const savedScene = stored ? JSON.parse(stored) : null;
  const sameGrid = savedScene?.projection?.columns === base.projection.columns && savedScene?.projection?.rows === base.projection.rows;
  state.scene = savedScene?.schemaVersion === base.schemaVersion && sameGrid ? savedScene : structuredClone(base);
  if (!state.scene.terrainV8) normalizeSceneAssetReferences(state.scene, state.renderManifest, state.assetSourceManifest);
  state.selectedDomain = state.scene.simulation.productionSystem === 'dairy' ? 'dairy' : 'beef'; state.selection = null; state.selectedAnimalIds = []; state.tool = null; state.view = null;
  $('domain-module').value = state.selectedDomain;
  $('scene-picker').value = domain;
  document.body.classList.toggle('terrain-v8-mode', Boolean(state.scene.terrainV8));
  for (const item of document.querySelectorAll('[data-system]')) item.classList.toggle('hidden', !toolAvailableInSystem(item.dataset.system, state.selectedDomain));
  state.terrainCells = sceneTerrainCells(state.scene);
  setSimulationRunning(false);
  if (state.scene.terrainV8 && state.renderer !== 'pixi') { $('renderer').value = 'pixi'; switchRenderer('pixi'); }
  if (domain === 'beef' && sceneExecutionAvailability(state.scene).available) {
    state.worker ??= new Worker('/src/client/worker.js', {type: 'module'});
    state.worker.onmessage = workerMessage;
    await askWorker({type: 'reset', seed: state.scene.simulation.seed, count: state.scene.simulation.populationCount});
    if (generation !== state.sceneSelectionGeneration) return;
    $('scene-status').textContent = 'Fazenda de corte · motor demonstrativo no Worker · cena editável.';
  } else {
    terminateNumericWorker(state.worker, state.pending); state.worker = null; state.workerReady = false;
    const unavailable = unavailableExecutionState(state.scene);
    $('scene-status').textContent = state.scene.visualVariant
      ? `${state.scene.visualVariant.label} · execução numérica bloqueada: ${unavailable.reason}`
      : `Cena visual carregada · execução numérica indisponível: ${unavailable.reason}`;
    refreshScene(); updateHud();
  }
  refreshScene(); updateHud();
}

function distributeShade() {
  const assetId = 'vegetation-tree-shade-imagegen-v1', meta = frameBox(assetId);
  const template = {assetId, footprint: meta.footprint ?? {columns: 1, rows: 1}, layer: 'infrastructure', state: {stateId: 'default'}, blocking: meta.blocking};
  const placed = [];
  for (const zone of state.scene.zones.filter(item => item.kind === 'pasture')) {
    placed.push(...distributePrefab(template, zone, state.scene.projection.columns, state.scene.projection.rows, [...state.scene.prefabs, ...placed], 3, state.scene.simulation.seed));
  }
  if (!placed.length) { $('scene-status').textContent = 'Não há posições livres para distribuir árvores nos piquetes.'; return; }
  state.scene.prefabs.push(...placed); persistScene(); refreshScene(); updateHud();
  $('scene-status').textContent = `${placed.length} árvores distribuídas de forma determinística nos piquetes.`;
}

function canvasToBlob(canvas, name) {
  normalizeSceneAssetReferences(state.scene, state.renderManifest, state.assetSourceManifest);
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
  const framesMs = state.frameTimes.slice(-600), paintMs = state.paintTimes.slice(-600), updateMs = state.updateTimes.slice(-600), motionMs = state.motionUpdateTimes.slice(-600), lodUpdates = state.lodUpdateTimes.slice(-600);
  return {meanFps: framesMs.length ? 1000 / (framesMs.reduce((sum, value) => sum + value, 0) / framesMs.length) : 0, p95FrameMs: quantile(framesMs, .95), medianPaintMs: quantile(paintMs, .5), p95PaintMs: quantile(paintMs, .95), medianSceneUpdateMs: quantile(updateMs, .5), p95SceneUpdateMs: quantile(updateMs, .95), medianMotionUpdateMs: quantile(motionMs, .5), meanLodVisualUpdates: lodUpdates.length ? lodUpdates.reduce((sum, value) => sum + value, 0) / lodUpdates.length : 0, simulatedAnimals: sceneExecutionAvailability(state.scene).available ? state.view?.animalActions.length ?? 0 : 0, visibleAnimals: state.visibleAnimalCount, culledAnimals: state.culledAnimalCount, visibleByLod: {...state.visibleByLod}, accountedAnimals: state.accountedAnimalCount, animalRenderUnits: state.animalRenderUnits, herdClusters: state.herdClusterCount, visibleSprites: state.visible.length, viewportWidth: state.canvasSizing.width, viewportHeight: state.canvasSizing.height, cameraZoom: state.camera.zoom, renderer: state.renderer};
}

function pixiFrame(time) {
  if (state.renderer !== 'pixi' || !state.pixi) return;
  updateVisualMotion(time);
  let animatedDepth = false;
  for (const entry of state.visible) {
    const clip = entry.prefab?.animationClip;
    if (!clip) continue;
    const animation = state.terrainV8AssetManifest.animationClips?.[clip];
    if (!animation?.frames?.length) continue;
    const animationTime = time + (entry.prefab.animationPhaseMs ?? 0);
    const frameIndex = Math.floor(animationTime / animation.frameMs) % animation.frames.length;
    const sprite = state.pixiPrefabs.get(entry.id);
    if (!sprite) continue;
    const texture = state.pixiTextures.get(animation.frames[frameIndex]);
    if (texture && sprite.texture !== texture) sprite.texture = texture;
    if (entry.prefab.visualRoute?.length) {
      const route = entry.prefab.visualRoute, routePosition = (animationTime / 1000 * .45) % route.length;
      const pointIndex = Math.floor(routePosition), fraction = routePosition - pointIndex;
      const from = route[pointIndex], to = route[(pointIndex + 1) % route.length];
      const world = isoPosition(from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction);
      sprite.position.set(world.x, world.y);
      const foot = entry.prefab.footprint;
      const contact = isoPosition(from[0] + (to[0] - from[0]) * fraction + foot.columns / 2,
        from[1] + (to[1] - from[1]) * fraction + foot.rows / 2);
      sprite.zIndex = contact.y;
      animatedDepth = true;
    }
  }
  // The contact-depth keys change continuously while cattle walk, but their
  // relative occlusion only needs a bounded refresh cadence. Sorting every
  // sprite every RAF dominated the scene cost without improving the image.
  if (animatedDepth && time - state.lastAnimatedDepthSort >= 100) {
    state.pixiLayers.depth.sortChildren(); state.lastAnimatedDepthSort = time;
  }
  if (state.scene.terrainV8 && Math.floor(time / 330) !== state.pixiWaterFrame) {
    state.pixiWaterFrame = Math.floor(time / 330);
    const frame = state.pixiTextures.get(`world-v8-water-${state.pixiWaterFrame % 3}`);
    for (const sprite of state.pixiWaterSprites) sprite.texture = frame;
  }
  const start = performance.now();
  state.pixi.renderer.render({container: state.pixi.stage});
  state.paintMs = performance.now() - start;
  recordFrame(time);
  state.pixiFrameId = requestAnimationFrame(pixiFrame);
}

async function resetSimulation(count = Number($('herd-size').value)) {
  if (!sceneExecutionAvailability(state.scene).available) { assertSceneCommandAllowed(state.scene, 'reset'); return; }
  const generation = state.sceneSelectionGeneration;
  state.scene.simulation.populationCount = count;
  state.scene.simulation.seed = 20261012;
  state.scene.simulation.scenarioId = `beef-rotation-demo-${count}-${state.scene.simulation.seed}`;
  await askWorker({type: 'reset', seed: state.scene.simulation.seed, count});
  if (generation !== state.sceneSelectionGeneration || state.selectedDomain !== 'beef') return;
  persistScene(); refreshScene();
}

function setSimulationRunning(value) {
  if (value && !sceneExecutionAvailability(state.scene).available) return;
  clearInterval(state.timer); state.running = value;
  if (value && state.selectedDomain === 'beef') state.timer = setInterval(() => {
    if (state.selectedDomain !== 'beef') { setSimulationRunning(false); return; }
    Promise.resolve().then(() => askWorker({type: 'tick', hours: 1})).catch(error => { setSimulationRunning(false); $('scene-status').textContent = error.message; });
  }, 700);
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
  assertSceneCommandAllowed(state.scene, 'reset');
  const generation = state.sceneSelectionGeneration;
  const ensureBeefBenchmark = () => {
    if (generation !== state.sceneSelectionGeneration || state.selectedDomain !== 'beef') {
      throw new Error('Benchmark numérico cancelado: a cena visual não executa simulação.');
    }
    assertSceneCommandAllowed(state.scene, 'reset');
  };
  setSimulationRunning(false);
  const results = [];
  for (const renderer of ['canvas', 'pixi']) {
    ensureBeefBenchmark();
    $('renderer').value = renderer; switchRenderer(renderer);
    if (renderer === 'pixi') await initPixi();
    for (const count of counts) {
      ensureBeefBenchmark();
      $('herd-size').value = String(count); await resetSimulation(count); state.camera.zoom = 2; syncCanvasSize();
      if (!focusAnimal(1)) throw new Error(`Não foi possível enquadrar o animal #1 no benchmark de ${count} bovinos.`);
      await captureFrames(warmupMs); state.frameTimes = []; state.paintTimes = []; state.updateTimes = []; state.motionUpdateTimes = []; state.lodUpdateTimes = []; state.lastFrame = 0;
      const frames = await captureFrames(durationMs); state.frameTimes = frames;
      const record = frameStats(); record.count = count; record.workerRoundTripMs = state.lastWorkerRoundTripMs; record.memorySource = 'Use Chromium Performance.getMetrics for post-GC JS heap; GPU memory is not exposed by this harness.';
      results.push(record);
    }
  }
  $('renderer').value = 'canvas'; switchRenderer('canvas'); state.camera.zoom = 1.35; syncCanvasSize(); refreshScene();
  const report = {browser: navigator.userAgent, measuredAt: new Date().toISOString(), durationMs, warmupMs, assetLoadMs: state.imageLoadMs, pixiInitMs: state.pixiLoadMs, sourceSimulation: 'Existing FarmEngine Worker; one 1-hour tick is separate from renderer frame samples.', results};
  $('benchmark-output').textContent = JSON.stringify(report, null, 2);
  return report;
}

async function initialize() {
  window.__graphicsInitStage = 'loading-assets';
  const [scene, dairyScene, waterStressScene, terrainV8Scene, farmAssemblyV8Scene, farmFinalV8Scene, ruralSmallV9Scene, ruralPropertyV9Scene, terrainV8AssetManifest, renderManifest, assetSourceManifest, farmImage, neloreImage, handlingImage, dairyHeiferImage, dairyCollarImage] = await Promise.all([
    fetch(sceneUrl).then(response => { if (!response.ok) throw new Error('Scene de corte não encontrada'); return response.json(); }),
    fetch(dairySceneUrl).then(response => { if (!response.ok) throw new Error('Scene leiteira não encontrada'); return response.json(); }),
    fetch(waterStressSceneUrl).then(response => { if (!response.ok) throw new Error('Variante visual seca não encontrada'); return response.json(); }),
    fetch(terrainV8SceneUrl).then(response => { if (!response.ok) throw new Error('Prova de terreno V8 não encontrada'); return response.json(); }),
    fetch(farmAssemblyV8SceneUrl).then(response => { if (!response.ok) throw new Error('Montagem rural V8 não encontrada'); return response.json(); }),
    fetch(farmFinalV8SceneUrl).then(response => { if (!response.ok) throw new Error('Fazenda completa V8 não encontrada'); return response.json(); }),
    fetch(ruralSmallV9SceneUrl).then(response => { if (!response.ok) throw new Error('Piquete gerado V9 não encontrado'); return response.json(); }),
    fetch(ruralPropertyV9SceneUrl).then(response => { if (!response.ok) throw new Error('Propriedade gerada V9 não encontrada'); return response.json(); }),
    fetch('/assets/generated/world-v8/terrain-atlas-v8.json').then(response => { if (!response.ok) throw new Error('Manifesto do atlas de terreno V8 ausente'); return response.json(); }),
    fetch('/graphics-poc/assets/main-composer-render-manifest.json').then(response => { if (!response.ok) throw new Error('Manifesto de renderização do Composer ausente'); return response.json(); }),
    fetch('/graphics-poc/asset-sources.json').then(response => { if (!response.ok) throw new Error('Manifesto de proveniência local ausente'); return response.json(); }),
    image(farmAtlasUrl), image(neloreUrl), image('/graphics-poc/assets/handling-review-atlas-v1.png'),
    image('/graphics-poc/assets/dairy/dairy-heifer.png'), image('/graphics-poc/assets/dairy/dairy-activity-collar.png')
  ]);
  state.renderManifest = renderManifest; state.assetSourceManifest = assetSourceManifest;
  const dynamicAtlases = await Promise.all(Object.entries({...renderManifest.atlases, 'world-v8': '/assets/generated/world-v8/terrain-atlas-v8.png'}).map(async ([key, url]) => [key, await image(url)]));
  state.scenes = {beef: scene, dairy: dairyScene, 'water-stress': waterStressScene, 'terrain-v8': terrainV8Scene, 'farm-assembly-v8': farmAssemblyV8Scene, 'farm-final-v8': farmFinalV8Scene, 'rural-small-v9': ruralSmallV9Scene, 'rural-property-v9': ruralPropertyV9Scene};
  state.terrainV8AssetManifest = terrainV8AssetManifest;
  const requestedScene = new URLSearchParams(location.search).get('scene');
  const initialDomain = ['beef', 'dairy', 'water-stress', 'terrain-v8', 'farm-assembly-v8', 'farm-final-v8', 'rural-small-v9', 'rural-property-v9'].includes(requestedScene) ? requestedScene : 'beef';
  const requestedSeed = new URLSearchParams(location.search).get('seed');
  const parsedSeed = requestedSeed === null ? null : Number(requestedSeed);
  const seededFarmScene = initialDomain === 'farm-final-v8' && parsedSeed !== null && Number.isSafeInteger(parsedSeed) && parsedSeed >= 0
    ? composeFarmSceneV8(farmFinalV8Scene, parsedSeed).scene : null;
  const baseScene = seededFarmScene ?? state.scenes[initialDomain], stored = localStorage.getItem(`riose-graphics-scene-v1:${baseScene.sceneId}`) ?? (initialDomain === 'beef' ? localStorage.getItem('riose-graphics-scene-v1') : null);
  const savedScene = stored ? JSON.parse(stored) : null;
  const sameGrid = savedScene?.projection?.columns === baseScene.projection.columns && savedScene?.projection?.rows === baseScene.projection.rows;
  state.scene = savedScene?.schemaVersion === baseScene.schemaVersion && sameGrid ? savedScene : structuredClone(baseScene);
  if (!state.scene.terrainV8) normalizeSceneAssetReferences(state.scene, renderManifest, assetSourceManifest);
  originalBeefModule = structuredClone(scene.domainModule); originalBeefScenario = scene.simulation.scenarioId;
  state.selectedDomain = state.scene.simulation.productionSystem === 'dairy' ? 'dairy' : 'beef'; $('domain-module').value = state.selectedDomain; $('scene-picker').value = initialDomain;
  document.body.classList.toggle('terrain-v8-mode', Boolean(state.scene.terrainV8));
  for (const item of document.querySelectorAll('[data-system]')) item.classList.toggle('hidden', !toolAvailableInSystem(item.dataset.system, state.selectedDomain));
  state.assetImages = {farm: farmImage, nelore: neloreImage, neloreLow: makeLowResolutionCow(neloreImage), handling: handlingImage, 'dairy-heifer': dairyHeiferImage, 'dairy-activity-collar': dairyCollarImage, ...Object.fromEntries(dynamicAtlases)};
  state.assetAtlasUrls = {...renderManifest.atlases, ...Object.fromEntries(Object.entries(terrainV8AssetManifest.atlases ?? {}).map(([key, url]) => [key, `/${url}`]))};
  state.assetFrames = Object.fromEntries(renderManifest.assets.map(asset => [asset.assetId, {x: asset.frame.x, y: asset.frame.y, w: asset.frame.w, h: asset.frame.h, anchor: asset.anchor, scale: asset.scale, atlasKey: asset.atlasKey, kind: asset.category === 'livestock' ? 'livestock' : 'infrastructure', reviewStatus: asset.reviewStatus, footprint: {columns: asset.footprint[0], rows: asset.footprint[1]}, blocking: asset.blocking}]));
  const v8ScaleByKind = {terrain: 96 / 128, road: 96 / 128, ramp: 96 / 128, water: 96 / 128, cliff: 1, bridge: 1, vegetation: .68, livestock: .46,
    'generated-decoration': .82, 'generated-building': .7, 'generated-ground': .7, 'generated-livestock': .38};
  for (const [name, asset] of Object.entries(terrainV8AssetManifest.assets)) {
    state.assetFrames[`world-v8-${name}`] = {x: asset.frame.x, y: asset.frame.y, w: asset.frame.width, h: asset.frame.height, anchor: asset.anchor, scale: v8ScaleByKind[asset.kind] ?? 1, atlasKey: asset.atlasKey ?? 'world-v8', kind: asset.kind, footprint: asset.footprint, blocking: asset.kind === 'bridge'};
  }
  for (const [assetId, override] of Object.entries(terrainV8AssetManifest.assetOverrides ?? {})) {
    if (state.assetFrames[assetId]) state.assetFrames[assetId] = {...state.assetFrames[assetId], ...override};
  }
  state.imageLoadMs = performance.now() - startedAt;
  state.terrainCells = sceneTerrainCells(state.scene);
  state.context = $('canvas-renderer').getContext('2d', {alpha: false});
  if (state.selectedDomain === 'beef' && sceneExecutionAvailability(state.scene).available) {
    window.__graphicsInitStage = 'starting-simulation-worker';
    state.worker = new Worker('/src/client/worker.js', {type: 'module'}); state.worker.onmessage = workerMessage;
    state.worker.onerror = event => {
      const location = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '/src/client/worker.js (unknown script location)';
      const cause = event.message || event.error?.message || `Worker ${event.type} event`;
      const resources = performance.getEntriesByType('resource')
        .filter(entry => /worker|engine|metabolism/i.test(entry.name))
        .map(entry => ({url: entry.name, responseStatus: entry.responseStatus ?? null, durationMs: Math.round(entry.duration), transferSize: entry.transferSize}));
      const error = new Error(`Simulation Worker failed at ${location}: ${cause}; resource requests=${JSON.stringify(resources)}`);
      for (const pending of state.pending.splice(0)) pending.reject(error);
    };
    window.__graphicsInitStage = 'resetting-simulation-worker';
    await askWorker({type: 'reset', seed: state.scene.simulation.seed, count: state.scene.simulation.populationCount});
    window.__graphicsInitStage = 'simulation-worker-ready';
  }
  state.canvasSizing = {width: $('stage').clientWidth, height: $('stage').clientHeight, ratio: Math.min(devicePixelRatio || 1, 1.5)};
  syncCanvasSize(); state.camera.zoom = fitSceneZoom(); refreshScene(); requestAnimationFrame(drawCanvas); updateHud();
  $('scene-status').textContent = state.scene.visualVariant
    ? `${state.scene.visualVariant.label} · execução numérica bloqueada: ${unavailableExecutionState(state.scene).reason}`
    : state.selectedDomain === 'dairy'
      ? `Cena visual carregada · execução numérica indisponível: ${unavailableExecutionState(state.scene).reason}`
      : `Cena v${state.scene.schemaVersion} · seed fixo · ${state.view.animalActions.length} animais no Worker.`;
  $('renderer').addEventListener('change', event => switchRenderer(event.target.value));
  $('herd-size').addEventListener('change', event => resetSimulation(Number(event.target.value)));
  $('reset-simulation').addEventListener('click', () => resetSimulation());
  $('run-simulation').addEventListener('click', () => setSimulationRunning(!state.running));
  $('scene-picker').addEventListener('change', event => selectScene(event.target.value));
  $('domain-module').addEventListener('change', event => { $('scene-picker').value = event.target.value; selectScene(event.target.value); });
  for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => {
    const assetId = button.dataset.tool, meta = frameBox(assetId), footprint = meta.footprint ?? ({'dairy-barn': {columns: 3, rows: 2}, 'dairy-milking-parlor': {columns: 3, rows: 2}, 'dairy-milk-chilling-tank': {columns: 2, rows: 1}, 'dairy-waiting-pen': {columns: 2, rows: 2}})[assetId] ?? {columns: 1, rows: 1};
    const adjacentTo = ({'dairy-milking-parlor': ['dairy-barn'], 'dairy-milk-chilling-tank': ['dairy-milking-parlor'], 'dairy-waiting-pen': ['dairy-milk-chilling-tank']})[assetId];
    state.tool = {assetId, footprint, blocking: meta.blocking ?? meta.kind !== 'livestock', kind: meta.kind, ...(adjacentTo ? {placementRules: {adjacentTo}} : {})}; $('scene-status').textContent = `Clique no mapa para colocar ${assetId}; snapping de 1 célula.`;
  });
  $('compose-dairy-core').addEventListener('click', () => { state.tool = {compositionId: 'dairy-service'}; $('scene-status').textContent = 'Clique na célula superior esquerda. O núcleo precisa de 10 colunas livres e coloca estruturas adjacentes e alinhadas.'; });
  $('rotate-selection').addEventListener('click', rotateSelection);
  $('draw-zone').addEventListener('click', () => { state.tool = 'zone'; state.zoneStart = null; $('scene-status').textContent = 'Clique no primeiro canto e arraste para criar um piquete.'; });
  $('distribute-shade').addEventListener('click', distributeShade);
  $('save-scene').addEventListener('click', () => { persistScene(); $('scene-status').textContent = 'Layout salvo no navegador; snapshot de simulação continua separado.'; });
  $('export-scene').addEventListener('click', () => canvasToBlob(null, `${state.scene.sceneId}.json`));
  $('run-benchmark').addEventListener('click', async () => { try { $('scene-status').textContent = 'Benchmark Chromium em andamento…'; const report = await runGraphicsBenchmark(); $('scene-status').textContent = `Benchmark concluído: ${report.results.length} cargas, ambos renderizadores.`; } catch (error) { $('scene-status').textContent = error.message; } });
  for (const input of document.querySelectorAll('[data-layer]')) input.addEventListener('change', () => { state.activeLayers[input.dataset.layer] = input.checked; refreshScene(); });
  $('zoom-in').addEventListener('click', () => { state.camera.zoom = Math.min(4, state.camera.zoom * 1.2); refreshScene(); });
  $('zoom-out').addEventListener('click', () => { state.camera.zoom = Math.max(.15, state.camera.zoom / 1.2); refreshScene(); });
  $('zoom-home').addEventListener('click', () => { state.camera.zoom = fitSceneZoom(); syncCanvasSize(); refreshScene(); });
  $('canvas-renderer').addEventListener('pointerdown', beginPointer); $('canvas-renderer').addEventListener('pointermove', movePointer); $('canvas-renderer').addEventListener('pointerup', endPointer); $('canvas-renderer').addEventListener('pointercancel', () => { state.drag = null; });
  $('stage').addEventListener('wheel', event => { event.preventDefault(); state.camera.zoom = Math.min(4, Math.max(.15, state.camera.zoom * (event.deltaY < 0 ? 1.1 : .9))); refreshScene(); }, {passive: false});
  window.addEventListener('resize', () => { syncCanvasSize(); refreshScene(); });
  window.__graphicsInitStage = 'ready';
  window.__graphicsReady = true; window.__runGraphicsBenchmark = runGraphicsBenchmark; window.__graphicsStats = frameStats;
  window.__terrainV8 = state.scene.terrainV8 ? {
    sceneId: state.scene.sceneId, projection: state.scene.projection, model: state.scene.terrainV8,
    assembly: {prefabs: state.scene.prefabs.length, fences: state.scene.prefabs.filter(item => item.assetId.includes('fence-') || item.assetId.includes('corral-')).length,
      modularFenceSegments: state.scene.prefabs.filter(item => item.modularType === 'fence-segment').length,
      pastureGates: state.scene.prefabs.filter(item => item.modularType === 'fence-gate').length,
      animals: state.scene.prefabs.filter(item => item.layer === 'livestock').length, pastures: state.scene.zones.filter(item => item.kind === 'pasture').length},
    getVisibleSprites: () => state.visible.length, getRenderer: () => state.renderer,
  } : null;
  if (new URLSearchParams(location.search).get('renderer') === 'pixi') switchRenderer('pixi');
  window.__graphicsControl = {
    setRenderer: renderer => { switchRenderer(renderer); return renderer === 'pixi' ? initPixi() : Promise.resolve(); },
    selectScene: domain => selectScene(domain),
    reset: count => resetSimulation(count),
    setCameraZoom: zoom => { state.camera.zoom = zoom; syncCanvasSize(); refreshScene(); },
    fitScene: () => { state.camera.zoom = fitSceneZoom(); syncCanvasSize(); refreshScene(); return state.camera.zoom; },
    setLayer: (layer, visible) => { if (!(layer in state.activeLayers)) return false; state.activeLayers[layer] = Boolean(visible); const input = document.querySelector(`[data-layer="${layer}"]`); if (input) input.checked = Boolean(visible); refreshScene(); return true; },
    focusAnimal,
    clearStats: () => { state.frameTimes = []; state.paintTimes = []; state.updateTimes = []; state.motionUpdateTimes = []; state.lodUpdateTimes = []; state.lastFrame = 0; },
    stats: frameStats,
    tick: async () => { const result = await askWorker({type: 'tick', hours: 1}); return {roundTripMs: state.lastWorkerRoundTripMs, implementation: result.engineImplementation}; },
    load: () => ({assetsMs: state.imageLoadMs, pixiInitMs: state.pixiLoadMs ?? null}),
  };
}

// The runtime atlas uses semantic frame IDs; its unapproved entries remain review-only.
PixiGraphics = PixiGraphicsClass;
initialize().catch(error => { $('scene-status').textContent = `Falha: ${error.message}`; window.__graphicsError = String(error); });
