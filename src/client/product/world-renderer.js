import {Application, Assets, Container, Graphics, Rectangle, Sprite, Texture} from 'pixi.js';
import {productFarmEntityAt, PRODUCT_SCENE_SIZE} from './scene.js';
import {productWorldAnimalAt, productWorldAnimalById, productWorldEntityFromHit, productWorldVegetationAt} from './world-contract.js';
import {animalWorldPosition, PRODUCT_BLOCKOUT, PRODUCT_WORLD, separateAnimalVisuals, worldToScreen} from './spatial.js';
import {productSceneGeometry} from './scene-geometry.js';

const ARTWORK = {
  'nelore-adult': {scale: .36},
  'building-farmhouse-imagegen-v1': {scale: .62},
  'building-shed-imagegen-v1': {scale: .62},
  'vegetation-tree-shade-imagegen-v1': {scale: .38},
  'vehicle-tractor-imagegen-v1': {scale: .3},
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sceneCorners = (x, y, width, height) => [worldToScreen(x, y), worldToScreen(x + width, y), worldToScreen(x + width, y + height), worldToScreen(x, y + height)];

async function fetchAssetManifest() {
  let assetBase = '';
  let response = await fetch('/assets/manifest.json');
  if (!response.ok) {
    assetBase = '/public';
    response = await fetch(`${assetBase}/assets/manifest.json`);
  }
  if (!response.ok) throw new Error('Could not load the Riose asset manifest');
  return {manifest: await response.json(), assetBase};
}

function drawPoly(graphics, points, fill, stroke = null) {
  graphics.poly(points.flatMap(point => [point.x, point.y])).fill(fill);
  if (stroke) graphics.poly(points.flatMap(point => [point.x, point.y])).stroke(stroke);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function stableNoise(x, y, seed = 0) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function addContinuousGrass(graphics, outline) {
  const bounds = outline.reduce((result, point) => ({
    left: Math.min(result.left, point.x), right: Math.max(result.right, point.x),
    top: Math.min(result.top, point.y), bottom: Math.max(result.bottom, point.y),
  }), {left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity});
  const step = 8;
  for (let y = bounds.top + 3; y < bounds.bottom; y += step) {
    for (let x = bounds.left + 3; x < bounds.right; x += step) {
      const jitterX = (stableNoise(x, y) - .5) * 3.5;
      const jitterY = (stableNoise(x, y, 1) - .5) * 3.5;
      const px = x + jitterX, py = y + jitterY;
      if (!pointInPolygon({x: px, y: py}, outline)) continue;
      const noise = stableNoise(x, y, 2);
      const radius = .55 + noise * .65;
      const color = noise > .72 ? 0xd2d99a : noise < .2 ? 0x455d37 : 0xb2c584;
      graphics.circle(px, py, radius).fill({color, alpha: noise > .72 ? .21 : .17});
      if (noise > .86) graphics.rect(px + 1, py - 1, 1.1, 2.6).fill({color: 0xd3da9b, alpha: .23});
    }
  }
}

function addPond(depthLayer, pond) {
  // Existing pond and crop atlases are complete diorama patches with soil
  // platforms baked in. Draw these site features on the shared terrain so
  // they read as part of one farm instead of separate floating islands.
  const corners = sceneCorners(pond.x, pond.y, pond.w, pond.h);
  const center = worldToScreen(pond.x + pond.w / 2, pond.y + pond.h / 2);
  const bank = new Graphics();
  drawPoly(bank, corners, 0x9a9a65, {color: 0x6e7650, alpha: .6, width: 1.2});
  const water = new Graphics();
  const inset = sceneCorners(pond.x + .22, pond.y + .2, Math.max(.5, pond.w - .44), Math.max(.4, pond.h - .4));
  drawPoly(water, inset, 0x57999a, {color: 0xd3ce98, alpha: .88, width: 1});
  const glint = new Graphics();
  glint.moveTo(center.x - 12, center.y - 2).lineTo(center.x + 6, center.y + 2)
    .stroke({color: 0xb7dbca, alpha: .65, width: 1.4});
  bank.zIndex = center.y - 1;
  water.zIndex = center.y - .5;
  glint.zIndex = center.y;
  depthLayer.addChild(bank, water, glint);
}

function addCropRows(depthLayer, field) {
  const corners = sceneCorners(field.x, field.y, field.w, field.h);
  const center = worldToScreen(field.x + field.w / 2, field.y + field.h);
  const soil = new Graphics();
  drawPoly(soil, corners, 0x7c7545, {color: 0x657044, alpha: .8, width: 1});
  const rows = new Graphics();
  const count = Math.max(5, Math.round(field.w * 1.7));
  for (let index = 0; index < count; index++) {
    const t = (index + .5) / count;
    const from = worldToScreen(field.x + field.w * t, field.y + .18);
    const to = worldToScreen(field.x + field.w * t, field.y + field.h - .18);
    rows.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({color: 0x443e2d, alpha: .5, width: 1});
    const plants = Math.max(2, Math.round(field.h * 1.45));
    for (let plant = 0; plant < plants; plant++) {
      const ratio = (plant + .45 + stableNoise(index, plant) * .25) / plants;
      const px = from.x + (to.x - from.x) * ratio, py = from.y + (to.y - from.y) * ratio;
      const shade = stableNoise(index, plant, 3) > .5 ? 0x77934a : 0x9fae5b;
      rows.rect(px - .65, py - 1.4, 1.3, 2.8).fill({color: shade, alpha: .9});
    }
  }
  soil.zIndex = center.y - 1;
  rows.zIndex = center.y;
  depthLayer.addChild(soil, rows);
}

function sizeSprite(sprite, asset, factor = 1) {
  const [width, height] = asset.displaySize ?? [asset.frame.w, asset.frame.h];
  sprite.width = width * factor;
  sprite.height = height * factor;
}

function buildFences(depthLayer, geometry) {
  const postPositions = new Map();
  const rememberPost = point => postPositions.set(`${point.x.toFixed(4)},${point.y.toFixed(4)}`, point);
  for (const run of geometry.fenceRuns) {
    const from = run.screenFrom, to = run.screenTo;
    rememberPost(from); rememberPost(to);
    const rails = new Graphics();
    for (const offset of [-5, -2, -.5]) {
      rails.moveTo(from.x, from.y + offset).lineTo(to.x, to.y + offset)
        .stroke({color: offset === -2 ? 0xb89565 : 0x634b32, alpha: offset === -2 ? .92 : .84, width: offset === -2 ? 1.1 : .9});
    }
    rails.zIndex = (from.y + to.y) / 2;
    rails.label = run.id;
    depthLayer.addChild(rails);
  }
  for (const gate of geometry.gates) {
    const from = gate.screenA, to = gate.screenB;
    rememberPost(from); rememberPost(to);
    const rails = new Graphics();
    for (const offset of [-4, 1]) rails.moveTo(from.x, from.y + offset).lineTo(to.x, to.y + offset)
      .stroke({color: 0x936d43, width: 1.4});
    rails.zIndex = (from.y + to.y) / 2 + .1;
    rails.label = gate.id;
    depthLayer.addChild(rails);
  }
  for (const point of postPositions.values()) {
    const post = new Graphics();
    post.rect(point.x - 1, point.y - 8, 2, 8).fill(0x634b32);
    post.rect(point.x - .35, point.y - 8, .55, 7).fill({color: 0xc3a174, alpha: .86});
    post.zIndex = point.y + .2;
    depthLayer.addChild(post);
  }
}

function addTerrain(terrainLayer, scene, geometry) {
  const outline = geometry.outline;
  const sideFaces = new Graphics(), depth = (scene.world ?? PRODUCT_WORLD).soilDepth ?? 18;
  for (const edge of geometry.frontEdges) {
    const offset = {x: 0, y: depth};
    const quad = [edge.from, edge.to, {x: edge.to.x + offset.x, y: edge.to.y + offset.y}, {x: edge.from.x + offset.x, y: edge.from.y + offset.y}];
    drawPoly(sideFaces, quad, edge.shade === 'side' ? 0x765039 : 0x8d6040, {color: 0x604833, alpha: .55, width: .7});
  }
  terrainLayer.addChild(sideFaces);
  const top = new Graphics();
  drawPoly(top, outline, 0x81965f, {color: 0x778c59, alpha: .34, width: .7});
  terrainLayer.addChild(top);

  const groundTexture = new Graphics();
  addContinuousGrass(groundTexture, outline);
  terrainLayer.addChild(groundTexture);

  const paths = new Graphics();
  for (const route of geometry.paths) {
    const points = route.points;
    paths.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) paths.lineTo(points[i].x, points[i].y);
    paths.stroke({color: 0x53432f, alpha: .22, width: 13, cap: 'round', join: 'round'});
    paths.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) paths.lineTo(points[i].x, points[i].y);
    paths.stroke({color: 0xb89a6b, width: 9, cap: 'round', join: 'round'});
  }
  terrainLayer.addChild(paths);

  const paddocks = new Graphics();
  for (const [index, zone] of scene.zones.entries()) {
    const color = zone.kind === 'holdingPen' ? 0xd8b778 : [0xc7d792, 0xd7d99a, 0xb9ce87, 0xcad48b][index];
    drawPoly(paddocks, sceneCorners(zone.x, zone.y, zone.w, zone.h), {color, alpha: .055});
  }
  terrainLayer.addChild(paddocks);
}

function projectAnimals(animals, housing, scene) {
  const placements = animals.flatMap(animal => {
    const position = animalWorldPosition(animal, undefined, housing);
    const zone = position && scene.zones.find(item => item.id === position.zoneId);
    return position && zone ? [{animal, ...position, zone}] : [];
  });
  return separateAnimalVisuals(placements).map(item => ({...item.animal, visualPosition: worldToScreen(item.x, item.y)}));
}

export async function createProductWorldRenderer({host, scene = PRODUCT_BLOCKOUT, onAnimalSelect = () => {}, onEntitySelect = () => {}}) {
  const geometry = productSceneGeometry(scene);
  const {manifest, assetBase} = await fetchAssetManifest();
  const manifestAssets = new Map((manifest.assets ?? []).map(asset => [asset.id, asset]));
  const atlasKeys = new Set(Object.values(ARTWORK).map(({atlas}) => atlas).filter(Boolean));
  for (const id of Object.keys(ARTWORK)) {
    const asset = manifestAssets.get(id);
    if (asset?.frame?.atlas) atlasKeys.add(asset.frame.atlas);
  }
  const atlasDefinitions = Object.entries(manifest.atlases ?? {}).filter(([id]) => atlasKeys.has(id));
  const loadedAtlases = await Promise.all(atlasDefinitions.map(async ([id, definition]) => {
    const url = assetBase && definition.image.startsWith('/assets/') ? `${assetBase}${definition.image}` : definition.image;
    return [id, await Assets.load(url)];
  }));
  const atlasTextures = new Map(loadedAtlases);
  const textures = new Map();
  for (const [id] of Object.entries(ARTWORK)) {
    const asset = manifestAssets.get(id), atlas = asset && atlasTextures.get(asset.frame.atlas);
    if (atlas) textures.set(id, new Texture({source: atlas.source, frame: new Rectangle(asset.frame.x, asset.frame.y, asset.frame.w, asset.frame.h)}));
  }
  if (textures.size !== Object.keys(ARTWORK).length) throw new Error('One or more required farm sprite atlases are unavailable');

  const app = new Application();
  await app.init({resizeTo: host, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 1.5), preference: 'webgl', eventMode: 'static'});
  app.stop();
  const canvas = app.canvas;
  canvas.id = 'product-world-pixi';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive isometric farm. Select an animal or farm area; drag to move, and use the wheel to zoom.');
  host.appendChild(canvas);

  const camera = new Container(), terrainLayer = new Container(), depthLayer = new Container(), overlayLayer = new Container();
  depthLayer.sortableChildren = true;
  camera.addChild(terrainLayer, depthLayer, overlayLayer);
  app.stage.addChild(camera);
  addTerrain(terrainLayer, scene, geometry);

  const staticSprites = [];
  for (const vegetation of scene.vegetation ?? []) {
    const texture = textures.get(vegetation.asset);
    if (!texture) continue;
    const sprite = new Sprite(texture), frame = manifestAssets.get(vegetation.asset);
    sprite.anchor.set(frame.anchor.x, frame.anchor.y);
    sizeSprite(sprite, frame, ARTWORK[vegetation.asset]?.scale ?? .38);
    const point = worldToScreen(vegetation.x, vegetation.y);
    sprite.position.set(point.x, point.y); sprite.zIndex = point.y;
    depthLayer.addChild(sprite); staticSprites.push(sprite);
  }
  for (const structure of scene.structures) {
    if (structure.kind === 'pond') {
      addPond(depthLayer, structure);
      continue;
    }
    if (structure.kind === 'crops') {
      addCropRows(depthLayer, structure);
      continue;
    }
    const id = structure.asset, texture = textures.get(id), asset = manifestAssets.get(id);
    if (!texture || !asset) continue;
    const point = worldToScreen(structure.x + structure.w / 2, structure.y + structure.h);
    const sprite = new Sprite(texture);
    sprite.anchor.set(asset.anchor.x, asset.anchor.y);
    sizeSprite(sprite, asset, ARTWORK[id]?.scale ?? .5);
    sprite.position.set(point.x, point.y); sprite.zIndex = point.y + 2;
    depthLayer.addChild(sprite); staticSprites.push(sprite);
  }
  const tractorTexture = textures.get('vehicle-tractor-imagegen-v1');
  if (tractorTexture) {
    const point = worldToScreen(15, 10.5), tractor = new Sprite(tractorTexture), asset = manifestAssets.get('vehicle-tractor-imagegen-v1');
    tractor.anchor.set(asset.anchor.x, asset.anchor.y); sizeSprite(tractor, asset, ARTWORK['vehicle-tractor-imagegen-v1'].scale);
    tractor.position.set(point.x, point.y); tractor.zIndex = point.y; depthLayer.addChild(tractor); staticSprites.push(tractor);
  }
  buildFences(depthLayer, geometry);

  const animalSprites = new Map(), animalRings = new Map();
  const animalTexture = textures.get('nelore-adult');
  const overlays = new Graphics(); overlayLayer.addChild(overlays);
  let overlaySignature = '', visualState = {animals: [], housing: 'pasture', pastures: [], selectedAnimalId: 1, selectedEntityId: null, hoverAnimalId: null, hoverEntityId: null, hour: 6, weather: 'normal'};
  let cameraZoom = 1, panX = 0, panY = 0, pointer = null, lastPointer = null, hovered = null;

  function transform() {
    const width = host.clientWidth, height = host.clientHeight;
    const fit = Math.min(width / PRODUCT_SCENE_SIZE.width, height / PRODUCT_SCENE_SIZE.height);
    const scale = fit * cameraZoom;
    camera.position.set(width / 2 + panX, height / 2 + panY);
    camera.pivot.set(PRODUCT_SCENE_SIZE.width / 2, PRODUCT_SCENE_SIZE.height / 2);
    camera.scale.set(scale);
  }
  const resizeObserver = new ResizeObserver(transform); resizeObserver.observe(host);

  function hitTest(localX, localY) {
    const fit = Math.min(host.clientWidth / PRODUCT_SCENE_SIZE.width, host.clientHeight / PRODUCT_SCENE_SIZE.height), scale = fit * cameraZoom;
    const x = (localX - host.clientWidth / 2 - panX) / scale + PRODUCT_SCENE_SIZE.width / 2;
    const y = (localY - host.clientHeight / 2 - panY) / scale + PRODUCT_SCENE_SIZE.height / 2;
    const projectedAnimals = projectAnimals(visualState.animals, visualState.housing, scene);
    const animal = productWorldAnimalAt({x, y}, projectedAnimals, manifestAssets.get('nelore-adult'), ARTWORK['nelore-adult'].scale);
    if (animal) return {kind: 'animal', animal};
    const tree = productWorldVegetationAt({x, y}, scene.vegetation, worldToScreen, manifestAssets,
      assetId => ARTWORK[assetId]?.scale ?? 1);
    if (tree) return {kind: 'entity', entity: tree};
    const entity = productWorldEntityFromHit(productFarmEntityAt(x, y));
    if (entity) return {kind: 'entity', entity};
    return null;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    pointer = {x: event.clientX, y: event.clientY, panX, panY, moved: false};
    canvas.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event) {
    if (!pointer) {
      const rect = canvas.getBoundingClientRect(), hit = hitTest(event.clientX - rect.left, event.clientY - rect.top);
      const next = hit?.kind === 'animal' ? `animal:${hit.animal.id}` : hit?.kind === 'entity' ? `entity:${hit.entity.id}` : null;
      if (next !== hovered) {
        hovered = next;
        visualState.hoverAnimalId = hit?.kind === 'animal' ? hit.animal.id : null;
        visualState.hoverEntityId = hit?.kind === 'entity' ? hit.entity.id : null;
        overlaySignature = '';
      }
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      return;
    }
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 3) pointer.moved = true;
    if (pointer.moved) { panX = pointer.panX + dx; panY = pointer.panY + dy; transform(); }
  }
  function onPointerUp(event) {
    if (!pointer) return;
    const wasClick = !pointer.moved;
    pointer = null;
    if (!wasClick) return;
    const rect = canvas.getBoundingClientRect(), hit = hitTest(event.clientX - rect.left, event.clientY - rect.top);
    if (hit?.kind === 'animal') {
      const animal = productWorldAnimalById(visualState.animals, hit.animal.id);
      if (animal) onAnimalSelect(animal);
    } else if (hit?.kind === 'entity') onEntitySelect(hit.entity, visualState);
  }
  function onWheel(event) {
    event.preventDefault(); cameraZoom = clamp(cameraZoom * (event.deltaY < 0 ? 1.12 : .89), 1, 3); transform();
  }
  function onKeyDown(event) {
    if (event.key === '+' || event.key === '=') { cameraZoom = clamp(cameraZoom + .2, 1, 3); transform(); event.preventDefault(); }
    else if (event.key === '-') { cameraZoom = clamp(cameraZoom - .2, 1, 3); transform(); event.preventDefault(); }
    else if (event.key === '0' || event.key === 'Home') { cameraZoom = 1; panX = panY = 0; transform(); event.preventDefault(); }
    else if (event.key.startsWith('Arrow')) {
      const delta = {ArrowLeft: [18, 0], ArrowRight: [-18, 0], ArrowUp: [0, 18], ArrowDown: [0, -18]}[event.key];
      if (delta) { panX += delta[0]; panY += delta[1]; transform(); event.preventDefault(); }
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  canvas.addEventListener('wheel', onWheel, {passive: false});
  canvas.addEventListener('keydown', onKeyDown);

  function update(nextState = {}) {
    visualState = {...visualState, ...nextState};
    const currentIds = new Set();
    const projectedAnimals = projectAnimals(visualState.animals, visualState.housing, scene);
    for (const animal of projectedAnimals) {
      currentIds.add(animal.id);
      let sprite = animalSprites.get(animal.id);
      if (!sprite && animalTexture) {
        sprite = new Sprite(animalTexture);
        const asset = manifestAssets.get('nelore-adult');
        sprite.anchor.set(asset.anchor.x, asset.anchor.y); sizeSprite(sprite, asset, ARTWORK['nelore-adult'].scale);
        sprite.zIndex = 0; depthLayer.addChild(sprite); animalSprites.set(animal.id, sprite);
      }
      if (!sprite) continue;
      const point = animal.visualPosition, bob = animal.action === 'resting' ? 0 : Math.sin(performance.now() * .003 + animal.id) * .85;
      sprite.position.set(point.x, point.y + bob); sprite.zIndex = point.y + 4;
      sprite.alpha = visualState.hour % 24 < 6 || visualState.hour % 24 >= 21 ? .88 : 1;
    }
    for (const [id, sprite] of animalSprites) if (!currentIds.has(id)) { sprite.destroy(); animalSprites.delete(id); }
    const signature = [visualState.selectedAnimalId, visualState.selectedEntityId, visualState.hoverAnimalId, visualState.hoverEntityId, ...(visualState.pastures ?? [])].join('|');
    if (signature !== overlaySignature) {
      overlaySignature = signature; overlays.clear();
      for (const [index, zone] of scene.zones.entries()) {
        if (zone.patch === undefined) continue;
        const value = visualState.pastures?.[zone.patch], ratio = Number.isFinite(value) ? clamp(value / 2400, .1, 1) : .35;
        const points = sceneCorners(zone.x, zone.y, zone.w, zone.h), selected = visualState.selectedEntityId === zone.id || zone.patch === visualState.selectedPatch, hovered = visualState.hoverEntityId === zone.id;
        drawPoly(overlays, points, {color: 0xc7d792, alpha: .035 + ratio * .045});
        overlays.poly(points.flatMap(point => [point.x, point.y])).stroke({color: selected ? 0xf4d98c : hovered ? 0xfff4d4 : 0x355c39, alpha: selected || hovered ? .96 : .42, width: selected || hovered ? 2.2 : 1, pixelLine: true});
      }
      for (const structure of scene.structures) {
        const selectedId = structure.id === 'barn-corral' ? 'cattle-shed' : structure.id;
        if (visualState.selectedEntityId !== selectedId && visualState.hoverEntityId !== selectedId) continue;
        const points = sceneCorners(structure.x, structure.y, structure.w, structure.h);
        overlays.poly(points.flatMap(point => [point.x, point.y])).stroke({color: visualState.selectedEntityId === selectedId ? 0xf4d98c : 0xfff4d4, width: 2, alpha: .95, pixelLine: true});
      }
      for (const animal of projectedAnimals) if (animal.id === visualState.selectedAnimalId || animal.id === visualState.hoverAnimalId) {
        const point = animal.visualPosition, selected = animal.id === visualState.selectedAnimalId;
        overlays.ellipse(point.x, point.y + 3, 12, 4).stroke({color: selected ? 0xe4d394 : 0xfff4d4, alpha: .95, width: selected ? 1.5 : 1, pixelLine: true});
      }
    }
  }

  function setZoom(value) { cameraZoom = clamp(value, 1, 3); transform(); }
  function resetCamera() { cameraZoom = 1; panX = 0; panY = 0; transform(); }
  transform(); app.start();

  return {
    canvas,
    update,
    setZoom,
    getZoom: () => cameraZoom,
    resetCamera,
    destroy() {
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('keydown', onKeyDown);
      app.destroy({removeView: true}, {children: true, texture: false, textureSource: false});
    },
  };
}
