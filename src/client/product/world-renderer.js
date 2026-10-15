import {Application, Assets, Container, Graphics, Rectangle, Sprite, Texture} from 'pixi.js';
import {productFarmEntityAt, PRODUCT_SCENE_SIZE} from './scene.js';
import {productWorldAnimalAt, productWorldAnimalById, productWorldEntityFromHit, productWorldVegetationAt} from './world-contract.js';
import {animalWorldPosition, PRODUCT_BLOCKOUT, separateAnimalVisuals, worldToScreen} from './spatial.js';
import {productSceneGeometry} from './scene-geometry.js';
import {drawProductLandscape} from './static-world-renderer.js';

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

function sizeSprite(sprite, asset, factor = 1) {
  const [width, height] = asset.displaySize ?? [asset.frame.w, asset.frame.h];
  sprite.width = width * factor;
  sprite.height = height * factor;
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
  drawProductLandscape(terrainLayer, depthLayer, scene, geometry);

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
    if (structure.kind === 'pond' || structure.kind === 'crops') continue;
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
