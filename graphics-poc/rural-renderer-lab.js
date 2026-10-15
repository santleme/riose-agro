import {Application as PixiApplication, Assets, Container, Rectangle, Sprite, Texture} from 'pixi.js';
import {Camera, Color3, Color4, Engine as BabylonEngine, FreeCamera, MeshBuilder, Scene as BabylonScene, StandardMaterial, Texture as BabylonTexture, Vector3} from '@babylonjs/core';

const $ = id => document.getElementById(id);
const viewport = $('viewport');
const image = url => new Promise((resolve, reject) => { const item = new Image(); item.onload = () => resolve(item); item.onerror = reject; item.src = url; });
const quantile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] : 0;
const state = {scene: null, worldManifest: null, composerManifest: null, atlasImages: {}, pixi: null, babylon: null, renderer: 'pixi', sprites: [], babylonMeshes: [], animFrames: {}, frameTimes: [], paintTimes: [], lastFrame: 0, camera: {x: 0, y: 0, zoom: 1}, drag: null};

function frameFor(assetId) {
  if (assetId.startsWith('world-v8-')) {
    const name = assetId.slice('world-v8-'.length), asset = state.worldManifest.assets[name];
    if (!asset) throw new Error(`Missing V8 frame ${assetId}`);
    const kindScale = {terrain: 96 / 128, road: 96 / 128, ramp: 96 / 128, water: 96 / 128, cliff: 1, bridge: 1, vegetation: .68, livestock: .46,
      'generated-decoration': .82, 'generated-building': .7, 'generated-ground': .7, 'generated-livestock': .38};
    return {frame: {x: asset.frame.x, y: asset.frame.y, w: asset.frame.width, h: asset.frame.height}, anchor: asset.anchor,
      scale: kindScale[asset.kind] ?? 1, atlasKey: asset.atlasKey ?? 'world-v8', kind: asset.kind, sourceSize: state.atlasImages[asset.atlasKey ?? 'world-v8']};
  }
  const asset = state.composerManifest.assets.find(item => item.assetId === assetId);
  if (!asset) throw new Error(`Missing Composer frame ${assetId}`);
  return {frame: asset.frame, anchor: asset.anchor, scale: asset.scale, atlasKey: asset.atlasKey, kind: asset.category, sourceSize: state.atlasImages[asset.atlasKey]};
}

function projectIso(x, y, width, height) { return {x: (x - y) * width / 2, y: (x + y) * height / 2}; }

function compileRenderItems(scene) {
  const items = [], {columns, rows} = scene.projection, cellW = scene.projection.cellWidth, cellH = scene.projection.cellHeight;
  const center = projectIso(columns / 2, rows / 2, cellW, cellH);
  const zAt = (x, y) => scene.terrainV8.heightMap[Math.max(0, Math.min(rows - 1, Math.floor(y)))]?.[Math.max(0, Math.min(columns - 1, Math.floor(x)))] ?? 0;
  const pos = (x, y, z = 0) => { const p = projectIso(x, y, cellW, cellH); return {x: p.x - center.x, y: p.y - center.y - z * scene.terrainV8.dimensions.elevationPxPerLevel}; };
  for (const cell of scene.terrainTiles) {
    const p = pos(cell.position.x + .5, cell.position.y + .5, cell.elevation ?? 0);
    items.push({id: `tile-${cell.position.x}-${cell.position.y}`, assetId: cell.assetId, kind: 'terrain', x: p.x, y: p.y - 18,
      visualScale: 1, depth: -20000 + p.y, rotation: 0, flipX: false});
  }
  for (const cliff of scene.terrainV8.cliffSegments) {
    const [x, y] = cliff.from, [nx, ny] = cliff.to ?? (cliff.direction === 'east' ? [x + 1, y] : [x, y + 1]);
    const a = pos(x + .5, y + .5), b = pos(nx + .5, ny + .5), xMid = (a.x + b.x) / 2, yMid = (a.y + b.y) / 2;
    for (let level = cliff.bottomElevation; level < cliff.topElevation; level++) items.push({id: `${cliff.id}-${level}`, assetId: cliff.assetId, kind: 'terrain',
      x: xMid, y: yMid - (level + 1) * scene.terrainV8.dimensions.elevationPxPerLevel - 8, visualScale: .75, depth: yMid + level, rotation: 0, flipX: false});
  }
  for (const prefab of scene.prefabs) {
    const {x, y} = prefab.position, f = prefab.footprint;
    const p = pos(x + f.columns / 2, y + f.rows / 2, zAt(x + f.columns / 2, y + f.rows / 2));
    const contact = pos(x + f.columns, y + f.rows, zAt(x + f.columns, y + f.rows));
    items.push({id: prefab.prefabId, assetId: prefab.assetId, kind: prefab.layer, x: p.x, y: p.y,
      visualScale: prefab.visualScale ?? 1, depth: prefab.depth ?? contact.y + (prefab.depthOffset ?? 0), rotation: (prefab.rotationDegrees ?? 0) * Math.PI / 180,
      flipX: Boolean(prefab.flipX), prefab});
  }
  return items.sort((a, b) => a.depth - b.depth || a.x - b.x);
}

function scaleFor(item, frame) { return frame.scale * item.visualScale * state.camera.zoom; }
function screenPose(item, frame, now) {
  let x = item.x, y = item.y;
  if (item.prefab?.visualRoute?.length) {
    const route = item.prefab.visualRoute, t = ((now + (item.prefab.animationPhaseMs ?? 0)) / 1000 * .45) % route.length;
    const i = Math.floor(t), f = t - i, from = route[i], to = route[(i + 1) % route.length];
    const gridX = from[0] + (to[0] - from[0]) * f, gridY = from[1] + (to[1] - from[1]) * f;
    const grid = projectIso(gridX, gridY, state.scene.projection.cellWidth, state.scene.projection.cellHeight);
    const center = projectIso(state.scene.projection.columns / 2, state.scene.projection.rows / 2, state.scene.projection.cellWidth, state.scene.projection.cellHeight);
    const elevation = state.scene.terrainV8.heightMap[Math.max(0, Math.min(state.scene.projection.rows - 1, Math.floor(gridY)))]?.[Math.max(0, Math.min(state.scene.projection.columns - 1, Math.floor(gridX)))] ?? 0;
    x = grid.x - center.x; y = grid.y - center.y - elevation * state.scene.terrainV8.dimensions.elevationPxPerLevel;
  }
  const w = frame.frame.w * scaleFor(item, frame), h = frame.frame.h * scaleFor(item, frame);
  return {x: viewport.clientWidth / 2 + state.camera.x + x * state.camera.zoom, y: viewport.clientHeight / 2 + state.camera.y + y * state.camera.zoom, w, h};
}

function textureKey(assetId) { return assetId; }

async function loadAssetAtlases() {
  const [worldManifest, composerManifest] = await Promise.all([
    fetch('/assets/generated/world-v8/terrain-atlas-v8.json').then(r => r.json()),
    fetch('/graphics-poc/assets/main-composer-render-manifest.json').then(r => r.json()),
  ]);
  state.worldManifest = worldManifest; state.composerManifest = composerManifest;
  const urls = {...composerManifest.atlases, ...Object.fromEntries(Object.entries(worldManifest.atlases).map(([key, url]) => [key, `/${url}`]))};
  await Promise.all(Object.entries(urls).map(async ([key, url]) => { try { state.atlasImages[key] = await image(url); } catch { /* unused families need not block the demo */ } }));
}

async function loadWorld(sceneId) {
  const response = await fetch(`/graphics-poc/scenes/${sceneId}.json`);
  if (!response.ok) throw new Error(`Scene ${sceneId} não encontrada. Execute npm run build:graphics-poc.`);
  state.scene = await response.json();
  const snapshotResponse = await fetch('/graphics-poc/snapshots/demo-herd-visual.json');
  if (!snapshotResponse.ok) throw new Error('Snapshot demonstrativo externo não encontrado.');
  state.demoSnapshot = await snapshotResponse.json();
  const visualStates = new Map(state.demoSnapshot.animals.map(animal => [animal.id, animal.displayState]));
  for (const animal of state.scene.prefabs.filter(item => item.layer === 'livestock')) {
    const displayState = visualStates.get(animal.prefabId);
    if (displayState === 'walking') animal.animationClip = 'walk';
    animal.visualStateSource = state.demoSnapshot.id;
  }
  state.items = compileRenderItems(state.scene);
  const width = viewport.clientWidth, height = viewport.clientHeight, {columns, rows, cellWidth, cellHeight} = state.scene.projection;
  const maxHeight = Math.max(...state.scene.terrainV8.heightMap.flat()) * state.scene.terrainV8.dimensions.elevationPxPerLevel;
  const worldWidth = (columns + rows) * cellWidth / 2, worldHeight = (columns + rows) * cellHeight / 2 + maxHeight;
  state.camera.zoom = Math.min(width * .94 / worldWidth, height * .9 / worldHeight);
  state.camera.x = 0; state.camera.y = 0;
}

function pixiTextureFor(assetId) {
  if (!state.pixiTextures.has(assetId)) {
    const meta = frameFor(assetId), texture = state.pixiAtlases[meta.atlasKey];
    state.pixiTextures.set(assetId, new Texture({source: texture.source, frame: new Rectangle(meta.frame.x, meta.frame.y, meta.frame.w, meta.frame.h)}));
  }
  return state.pixiTextures.get(assetId);
}

async function startPixi() {
  const canvas = document.createElement('canvas'); canvas.id = 'renderer-canvas'; viewport.append(canvas);
  const app = new PixiApplication();
  await app.init({canvas, width: viewport.clientWidth, height: viewport.clientHeight, background: '#dedccf', antialias: false, autoDensity: false, autoStart: false, resolution: 1, preference: 'webgl'});
  app.stage.sortableChildren = true;
  state.pixi = app; state.pixiAtlases = Object.fromEntries(await Promise.all(Object.entries(state.atlasImages).map(async ([key, source]) => [key, await Assets.load(source.src)])));
  state.pixiTextures = new Map(); state.sprites = [];
  for (const item of state.items) {
    const frame = frameFor(item.assetId), sprite = new Sprite(pixiTextureFor(item.assetId));
    sprite.anchor.set(frame.anchor.x, frame.anchor.y); sprite.scale.set(frame.scale * item.visualScale * (item.flipX ? -1 : 1), frame.scale * item.visualScale);
    sprite.rotation = item.rotation; sprite.zIndex = item.depth; sprite.eventMode = 'none'; app.stage.addChild(sprite);
    state.sprites.push({item, sprite});
  }
  return () => { if (state.pixi) { state.pixi.destroy(true, {children: true, texture: false, textureSource: false}); state.pixi = null; } };
}

function babylonMaterial(assetId) {
  if (state.babylonMaterials.has(assetId)) return state.babylonMaterials.get(assetId);
  const frame = frameFor(assetId), url = state.atlasImages[frame.atlasKey].src, atlas = state.atlasImages[frame.atlasKey];
  const texture = new BabylonTexture(url, state.babylon.scene, false, false, BabylonTexture.NEAREST_NEAREST);
  texture.hasAlpha = true; texture.wrapU = BabylonTexture.CLAMP_ADDRESSMODE; texture.wrapV = BabylonTexture.CLAMP_ADDRESSMODE;
  texture.uScale = frame.frame.w / atlas.naturalWidth; texture.uOffset = frame.frame.x / atlas.naturalWidth;
  texture.vScale = -frame.frame.h / atlas.naturalHeight; texture.vOffset = (frame.frame.y + frame.frame.h) / atlas.naturalHeight;
  const material = new StandardMaterial(`mat-${assetId}`, state.babylon.scene);
  material.diffuseTexture = texture; material.useAlphaFromDiffuseTexture = true; material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  material.alphaMode = BabylonEngine.ALPHA_COMBINE; material.backFaceCulling = false; material.disableDepthWrite = true;
  material.disableLighting = true; material.diffuseColor = Color3.White(); material.emissiveColor = Color3.White();
  state.babylonMaterials.set(assetId, material); return material;
}

function createBabylonSprite(item, index) {
  const frame = frameFor(item.assetId), mesh = MeshBuilder.CreatePlane(`sprite-${item.id}`, {width: 1, height: 1}, state.babylon.scene);
  mesh.rotation.y = Math.PI; mesh.material = babylonMaterial(item.assetId); mesh.isPickable = false; mesh.alphaIndex = index;
  const wrapped = {item, mesh}; state.babylonMeshes.push(wrapped); return wrapped;
}

async function startBabylon() {
  const canvas = document.createElement('canvas'); canvas.id = 'renderer-canvas'; viewport.append(canvas);
  const engine = new BabylonEngine(canvas, true, {antialias: false, stencil: false, preserveDrawingBuffer: true, adaptToDeviceRatio: false});
  const scene = new BabylonScene(engine); scene.clearColor = new Color4(222 / 255, 220 / 255, 207 / 255, 1); scene.useRightHandedSystem = false;
  const camera = new FreeCamera('iso-ortho-camera', new Vector3(0, 0, -100), scene); camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft = -viewport.clientWidth / 2; camera.orthoRight = viewport.clientWidth / 2; camera.orthoBottom = -viewport.clientHeight / 2; camera.orthoTop = viewport.clientHeight / 2;
  camera.minZ = .1; camera.maxZ = 200; camera.setTarget(Vector3.Zero()); scene.activeCamera = camera;
  state.babylon = {engine, scene, camera}; state.babylonMaterials = new Map(); state.babylonMeshes = [];
  state.items.forEach((item, index) => createBabylonSprite(item, index));
  return () => { if (state.babylon) { state.babylon.scene.dispose(); state.babylon.engine.dispose(); state.babylon = null; state.babylonMaterials = new Map(); state.babylonMeshes = []; } };
}

function drawFrame(now) {
  if (state.lastFrame) state.frameTimes.push(now - state.lastFrame);
  state.lastFrame = now;
  if (state.frameTimes.length > 600) state.frameTimes.shift();
  const started = performance.now();
  if (state.renderer === 'pixi' && state.pixi) {
    for (const {item, sprite} of state.sprites) {
      const meta = frameFor(item.assetId), pose = screenPose(item, meta, now);
      sprite.position.set(pose.x, pose.y); sprite.scale.set(meta.scale * item.visualScale * state.camera.zoom * (item.flipX ? -1 : 1), meta.scale * item.visualScale * state.camera.zoom);
      if (item.prefab?.animationClip === 'walk') {
        const clip = state.worldManifest.animationClips.walk, frameId = clip.frames[Math.floor((now + (item.prefab.animationPhaseMs ?? 0)) / clip.frameMs) % clip.frames.length];
        if (sprite.texture !== pixiTextureFor(frameId)) sprite.texture = pixiTextureFor(frameId);
      }
    }
    state.pixi.renderer.render({container: state.pixi.stage});
  } else if (state.renderer === 'babylon' && state.babylon) {
    const width = viewport.clientWidth, height = viewport.clientHeight; state.babylon.engine.setSize(width, height);
    const camera = state.babylon.camera; camera.orthoLeft = -width / 2; camera.orthoRight = width / 2; camera.orthoBottom = -height / 2; camera.orthoTop = height / 2;
    state.babylonMeshes.forEach(({item, mesh}, index) => {
      const meta = frameFor(item.assetId), pose = screenPose(item, meta, now);
      const centerX = pose.x + (.5 - meta.anchor.x) * pose.w;
      const centerY = pose.y + (.5 - meta.anchor.y) * pose.h;
      mesh.position.set(centerX - width / 2, height / 2 - centerY, -2 + index * .0001);
      mesh.scaling.set(pose.w * (item.flipX ? -1 : 1), pose.h, 1);
      mesh.rotation.z = -item.rotation;
      if (item.prefab?.animationClip === 'walk') {
        const clip = state.worldManifest.animationClips.walk, frameId = clip.frames[Math.floor((now + (item.prefab.animationPhaseMs ?? 0)) / clip.frameMs) % clip.frames.length];
        if (mesh.metadata?.frameId !== frameId) { mesh.material = babylonMaterial(frameId); mesh.metadata = {...mesh.metadata, frameId}; }
      }
    });
    state.babylon.scene.render();
  }
  state.paintTimes.push(performance.now() - started); if (state.paintTimes.length > 600) state.paintTimes.shift();
  requestAnimationFrame(drawFrame);
}

function stats() {
  return {renderer: state.renderer, meanFps: state.frameTimes.length ? 1000 / (state.frameTimes.reduce((a, b) => a + b, 0) / state.frameTimes.length) : 0,
    p95FrameMs: quantile(state.frameTimes, .95), medianRenderSubmissionMs: quantile(state.paintTimes, .5), p95RenderSubmissionMs: quantile(state.paintTimes, .95),
    viewport: {width: viewport.clientWidth, height: viewport.clientHeight}, sprites: state.items?.length ?? 0,
    animals: state.scene?.prefabs.filter(item => item.layer === 'livestock').length ?? 0};
}

let stopRenderer = null;
async function switchRenderer(name) {
  stopRenderer?.(); stopRenderer = null; viewport.querySelector('canvas')?.remove(); state.renderer = name; state.lastFrame = 0; state.frameTimes = []; state.paintTimes = [];
  stopRenderer = name === 'pixi' ? await startPixi() : await startBabylon();
  requestAnimationFrame(drawFrame); $('metrics').textContent = `${name === 'pixi' ? 'PixiJS 8' : 'Babylon.js 9'} · aguardando amostras`;
}

async function measure() {
  const button = $('measure'); button.disabled = true;
  await new Promise(resolve => setTimeout(resolve, 1500)); state.frameTimes = []; state.paintTimes = [];
  await new Promise(resolve => setTimeout(resolve, 4000));
  const result = stats(); $('metrics').textContent = `${result.meanFps.toFixed(1)} FPS · p95 ${result.p95FrameMs.toFixed(1)} ms · render p95 ${result.p95RenderSubmissionMs.toFixed(2)} ms`;
  window.__ruralRendererStats = result; button.disabled = false; return result;
}

async function reloadWorld() {
  stopRenderer?.(); stopRenderer = null; viewport.querySelector('canvas')?.remove();
  await loadWorld($('world').value); await switchRenderer($('renderer').value);
}

function installNavigation() {
  viewport.addEventListener('pointerdown', event => { state.drag = {x: event.clientX, y: event.clientY, cameraX: state.camera.x, cameraY: state.camera.y}; viewport.setPointerCapture(event.pointerId); });
  viewport.addEventListener('pointermove', event => { if (!state.drag) return; state.camera.x = state.drag.cameraX + event.clientX - state.drag.x; state.camera.y = state.drag.cameraY + event.clientY - state.drag.y; });
  viewport.addEventListener('pointerup', () => { state.drag = null; });
  viewport.addEventListener('wheel', event => { event.preventDefault(); state.camera.zoom = Math.max(.25, Math.min(2.5, state.camera.zoom * (event.deltaY < 0 ? 1.1 : .9))); }, {passive: false});
  $('renderer').addEventListener('change', event => switchRenderer(event.target.value));
  $('world').addEventListener('change', reloadWorld); $('measure').addEventListener('click', measure);
}

async function initialize() {
  installNavigation(); await loadAssetAtlases(); await loadWorld(new URLSearchParams(location.search).get('scene') ?? $('world').value);
  const params = new URLSearchParams(location.search);
  if (params.has('scene')) $('world').value = params.get('scene');
  if (params.has('renderer')) $('renderer').value = params.get('renderer');
  await switchRenderer($('renderer').value); $('loading').remove();
  window.__ruralRendererLab = {stats, measure, switchRenderer, selectWorld: async sceneId => { $('world').value = sceneId; await reloadWorld(); }, currentScene: () => state.scene.sceneId};
  if (params.has('capture')) document.body.classList.add('capture');
}

initialize().catch(error => { $('loading').textContent = `Falha ao inicializar: ${error.message}`; console.error(error); });
