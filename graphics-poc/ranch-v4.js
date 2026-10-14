import {AnimatedSprite, Application, Assets, Container, Rectangle, Sprite, Texture} from 'pixi.js';
import {advanceAgentMotion, createAgentMotion, createLivestockNavigationGrid, interpolateAgentPosition, planLivestockRoute} from './livestock-navigation-v1.js';

const SCENE_URL = '/assets/previews/ranch-composition-v4/rural-diorama-scene-v4-grounding-v2-gate-v2-water-v2-feed-v2-review.json';
const MANIFEST_URL = '/assets/manifests/manifest.json';
const requestedMap = new URLSearchParams(location.search).get('map') ?? 'ranch-v4';
if (!/^[a-z0-9-]+$/.test(requestedMap)) throw new Error('Invalid Tiled map key.');
const TILED_MAP_URL = `/graphics-poc/generated/${requestedMap}.tmj`;
const stage = document.querySelector('#stage');
const errorNode = document.querySelector('#scene-error');
const app = new Application();
const camera = {x: 0, y: 0, zoom: 1};
const world = new Container();
world.sortableChildren = true;
const cropCache = new Map();
let drag = null;
let sceneBounds = {left: 0, top: 0, right: 1774, bottom: 950};

function loadImage(url) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Image load failed: ${url}`)); image.src = url; });
}

function cropTransparent(source, url) {
  if (cropCache.has(url)) return cropCache.get(url);
  const image = source;
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(image, 0, 0);
  const {data, width, height} = context.getImageData(0, 0, image.width, image.height);
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 20) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1); }
  }
  if (right <= left || bottom <= top) return Texture.from(source);
  const trimmed = document.createElement('canvas'); trimmed.width = right - left; trimmed.height = bottom - top;
  trimmed.getContext('2d').drawImage(source, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  const texture = Texture.from(trimmed); cropCache.set(url, texture); return texture;
}

function fitCamera() {
  const bounds = sceneBounds;
  const width = stage.clientWidth, height = stage.clientHeight;
  camera.zoom = Math.min(width * .91 / (bounds.right - bounds.left), height * .94 / (bounds.bottom - bounds.top));
  camera.x = (width - (bounds.right - bounds.left) * camera.zoom) / 2 - bounds.left * camera.zoom;
  camera.y = (height - (bounds.bottom - bounds.top) * camera.zoom) / 2 - bounds.top * camera.zoom;
  world.position.set(camera.x, camera.y); world.scale.set(camera.zoom);
  if (window.__ranchVisual) {
    window.__ranchVisual.cameraZoom = camera.zoom;
    window.__ranchVisual.terrainWidthOccupancy = Number((((bounds.right - bounds.left) * camera.zoom / width) * 100).toFixed(1));
  }
}

function buildSprite(texture, requestedSize, anchor, container, alpha = 1) {
  const sprite = new Sprite(texture);
  sprite.anchor.set(anchor.x ?? .5, anchor.y ?? 1);
  const scale = Math.min(requestedSize[0] / texture.width, requestedSize[1] / texture.height);
  sprite.scale.set(scale); sprite.alpha = alpha; container.addChild(sprite); return sprite;
}

function tiledScreenToWorld(point, map) {
  const halfWidth = map.tilewidth / 2, halfHeight = map.tileheight / 2;
  const x = point.x / halfWidth - map.height, y = point.y / halfHeight;
  return {x: (x + y) / 2, y: (y - x) / 2};
}

function tiledWorldToScreen(point, map) {
  return {x: (point.x - point.y + map.height) * map.tilewidth / 2, y: (point.x + point.y) * map.tileheight / 2};
}

function placementGeometry(placement, map) {
  const [x, y] = placement.anchorPx, [width, height] = placement.requestedSizePx;
  const corners = [
    {x: x - width / 2, y: y - height}, {x: x + width / 2, y: y - height},
    {x: x + width / 2, y}, {x: x - width / 2, y},
  ];
  return corners.map(point => tiledScreenToWorld(point, map));
}

function compilePresentationNavigation(map, placements) {
  // Building and vehicle visual envelopes are conservative presentation obstacles;
  // they are not asserted as surveyed physical footprints.
  const blockedPolygons = placements.filter(item => /^(building\.|corral\.|vehicle\.)/.test(item.assetId))
    .map(item => ({placementId: item.placementId, polygon: placementGeometry(item, map)}));
  const fencePosts = placements.filter(item => item.assetId === 'fence.wire.wood-post.imagegen.v1')
    .map(item => ({placementId: item.placementId, point: tiledScreenToWorld({x: item.anchorPx[0], y: item.anchorPx[1]}, map)}));
  const fences = [];
  const linked = new Set();
  for (let i = 0; i < fencePosts.length; i++) {
    const nearest = fencePosts.map((post, j) => ({j, distance: Math.hypot(post.point.x - fencePosts[i].point.x, post.point.y - fencePosts[i].point.y)}))
      .filter(candidate => candidate.j !== i && candidate.distance > .65 && candidate.distance <= 1.8)
      .sort((a, b) => a.distance - b.distance || fencePosts[a.j].placementId.localeCompare(fencePosts[b.j].placementId))[0];
    if (!nearest) continue;
    const key = [fencePosts[i].placementId, fencePosts[nearest.j].placementId].sort().join('|');
    if (linked.has(key)) continue;
    linked.add(key); fences.push({from: fencePosts[i].point, to: fencePosts[nearest.j].point});
  }
  return {grid: createLivestockNavigationGrid({columns: map.width, rows: map.height, blockedPolygons, fences}), blockedPolygons, fenceSegments: fences};
}

function createClipFrames(clip, atlas) {
  return clip.frames.map(frame => new Texture({source: atlas.source, frame: new Rectangle(frame.contactBounds.x, frame.contactBounds.y, frame.contactBounds.width, frame.contactBounds.height)}));
}

async function loadScene() {
  try {
    await app.init({resizeTo: stage, background: 0xecebe3, antialias: false, roundPixels: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), preference: 'webgl'});
    app.canvas.setAttribute('aria-label', 'Fazenda isométrica renderizada com sprites em camadas');
    stage.prepend(app.canvas); app.stage.addChild(world);
    const [scene, manifest, tiledMap] = await Promise.all([fetch(SCENE_URL).then(r => { if (!r.ok) throw Error(`Cena v4: HTTP ${r.status}`); return r.json(); }), fetch(MANIFEST_URL).then(r => { if (!r.ok) throw Error(`Manifest: HTTP ${r.status}`); return r.json(); }), fetch(TILED_MAP_URL).then(r => { if (!r.ok) throw Error(`Tiled TMJ: HTTP ${r.status}`); return r.json(); })]);
    if (tiledMap.orientation !== 'isometric') throw Error(`Tiled map orientation must be isometric; got ${tiledMap.orientation}`);
    const compiledObjects = tiledMap.layers.filter(layer => layer.type === 'objectgroup').flatMap(layer => layer.objects ?? []);
    const placements = compiledObjects.filter(object => object.gid).map(object => {
      const properties = Object.fromEntries((object.properties ?? []).map(property => [property.name, property.value]));
      return {placementId: properties.placementId, assetId: properties.assetId, anchorPx: [object.x, object.y], requestedSizePx: [object.width, object.height], depthKey: properties.depthKey, transform: {rotationDegreesCCW: -(object.rotation ?? 0), flip: object.flippedHorizontally ? 'h' : object.flippedVertically ? 'v' : null}};
    }).filter(item => item.assetId && item.placementId);
    if (placements.length !== scene.placements.length) throw Error(`Tiled objects ${placements.length} do not match semantic source placements ${scene.placements.length}`);
    const records = new Map(manifest.assets.map(asset => [asset.id, asset]));
    const referenced = [...new Set([scene.terrainAssetId, ...scene.groundingOverlays.map(e => e.assetId), ...placements.map(e => e.assetId)])];
    const loaded = new Map(await Promise.all(referenced.map(async id => {
      const entry = records.get(id); if (!entry) throw Error(`Asset sem registro: ${id}`);
      const url = `/${entry.file}`;
      if (id === scene.terrainAssetId) { const source = await Assets.load(url); return [id, {entry, source, texture: source instanceof Texture ? source : Texture.from(source)}]; }
      const source = await loadImage(url);
      return [id, {entry, source, texture: cropTransparent(source, url)}];
    })));
    const groundLayer = tiledMap.layers.find(layer => layer.type === 'imagelayer');
    if (!groundLayer?.image) throw Error('Tiled map is missing its rendered terrain image layer.');
    const groundUrl = new URL(groundLayer.image, new URL(TILED_MAP_URL, location.origin)).pathname;
    const groundSource = await Assets.load(groundUrl);
    const groundTexture = groundSource instanceof Texture ? groundSource : Texture.from(groundSource);
    sceneBounds = {left: groundLayer.x ?? 0, top: groundLayer.y ?? 0,
      right: (groundLayer.x ?? 0) + groundLayer.imagewidth, bottom: (groundLayer.y ?? 0) + groundLayer.imageheight};
    const groundSprite = new Sprite(groundTexture); groundSprite.position.set(groundLayer.x ?? 0, groundLayer.y ?? 0); world.addChild(groundSprite);
    for (const overlay of scene.groundingOverlays) {
      const asset = loaded.get(overlay.assetId), size = overlay.renderSizePx;
      const container = new Container(); container.position.set(...overlay.centerPx); world.addChild(container);
      buildSprite(asset.texture, size, {x: .5, y: .5}, container, (overlay.opacity ?? 255) / 255);
    }
    const ordered = placements.sort((a, b) => (a.depthKey ?? a.anchorPx[1]) - (b.depthKey ?? b.anchorPx[1]) || a.placementId.localeCompare(b.placementId));
    const [animationManifest, animationImage] = await Promise.all([
      fetch('/assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.json').then(r => { if (!r.ok) throw Error(`Animation atlas manifest: HTTP ${r.status}`); return r.json(); }),
      loadImage('/assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.png'),
    ]);
    const animationAtlas = Texture.from(animationImage), grazeClip = animationManifest.clips.graze, walkClip = animationManifest.clips.walk;
    if (!grazeClip || !walkClip || !walkClip.frames?.length || !grazeClip.frames?.length) throw Error('The livestock atlas must provide graze and walk clips for this visual preview.');
    const animalFrames = createClipFrames(grazeClip, animationAtlas), walkFrames = createClipFrames(walkClip, animationAtlas);
    const presentationNavigation = compilePresentationNavigation(tiledMap, placements);
    const cattle = placements.filter(item => item.assetId.startsWith('livestock.nelore.'));
    const walkingPlacements = placements.filter(item => item.assetId === 'livestock.nelore.adult.walking.ne.v1');
    const occupancy = cattle.map(item => ({agentId: item.placementId, position: tiledScreenToWorld({x: item.anchorPx[0], y: item.anchorPx[1]}, tiledMap)}));
    let demo = null;
    for (const candidate of walkingPlacements) {
      const start = tiledScreenToWorld({x: candidate.anchorPx[0], y: candidate.anchorPx[1]}, tiledMap);
      const startCell = {x: Math.floor(start.x), y: Math.floor(start.y)};
      const goals = [];
      for (let row = 0; row < tiledMap.height; row++) for (let column = 0; column < tiledMap.width; column++) {
        const distance = Math.abs(column - startCell.x) + Math.abs(row - startCell.y);
        if (distance >= 3 && distance <= 7) goals.push({x: column + .5, y: row + .5, distance});
      }
      goals.sort((a, b) => b.distance - a.distance || a.y - b.y || a.x - b.x);
      for (const goal of goals) {
        const route = planLivestockRoute({grid: presentationNavigation.grid,
          agent: {agentId: candidate.placementId, position: start, simulationState: null}, goal,
          occupied: occupancy.filter(item => item.agentId !== candidate.placementId), minSeparation: .72,
          motionSource: 'visual-demonstration'});
        if (route.valid && route.pathCells.length >= 4) { demo = {placementId: candidate.placementId, route, motion: createAgentMotion(route)}; break; }
      }
      if (demo) break;
    }
    if (!demo) throw Error('No presentation-only cattle route could be planned around the current building and fence envelopes.');
    const animated = [];
    let demoSprite = null, demoContainer = null;
    const frameDescriptions = [];
    for (const placement of ordered) {
      const asset = loaded.get(placement.assetId), sourceAnchor = asset.entry.anchor ?? {x: .5, y: 1};
      const anchor = placement.anchorNormalized ? {x: placement.anchorNormalized[0], y: placement.anchorNormalized[1]} : {x: sourceAnchor.x, y: sourceAnchor.y};
      const object = new Container(); object.position.set(...placement.anchorPx); object.sortableChildren = true; object.zIndex = placement.depthKey ?? placement.anchorPx[1];
      const sprite = buildSprite(asset.texture, placement.requestedSizePx, anchor, object);
      const visualWidth = sprite.width, visualHeight = sprite.height;
      sceneBounds.left = Math.min(sceneBounds.left, placement.anchorPx[0] - anchor.x * visualWidth);
      sceneBounds.right = Math.max(sceneBounds.right, placement.anchorPx[0] + (1 - anchor.x) * visualWidth);
      sceneBounds.top = Math.min(sceneBounds.top, placement.anchorPx[1] - anchor.y * visualHeight);
      sceneBounds.bottom = Math.max(sceneBounds.bottom, placement.anchorPx[1] + (1 - anchor.y) * visualHeight);
      if (placement.assetId === 'livestock.nelore.adult.grazing.ne.v1') {
        const animatedSprite = new AnimatedSprite(animalFrames); animatedSprite.anchor.set(.5, 1); const size = placement.requestedSizePx; const scale = Math.min(size[0] / animationManifest.frameSize.width, size[1] / animationManifest.frameSize.height); animatedSprite.scale.set(scale); animatedSprite.position.set(0, 0); animatedSprite.animationSpeed = 1000 / grazeClip.frameMs / 60; animatedSprite.play(); object.addChild(animatedSprite); sprite.visible = false; animated.push(animatedSprite); frameDescriptions.push({placementId: placement.placementId, state: 'graze', source: 'atlas-clip'});
      }
      if (placement.placementId === demo.placementId) {
        const animatedSprite = new AnimatedSprite(walkFrames); animatedSprite.anchor.set(.5, 1); const size = placement.requestedSizePx; const scale = Math.min(size[0] / animationManifest.frameSize.width, size[1] / animationManifest.frameSize.height); animatedSprite.scale.set(scale); animatedSprite.position.set(0, 0); animatedSprite.animationSpeed = 1000 / walkClip.frameMs / 60; animatedSprite.stop(); object.addChild(animatedSprite); sprite.visible = false;
        demoSprite = animatedSprite; demoContainer = object; frameDescriptions.push({placementId: placement.placementId, state: 'walk', source: 'visual-presentation-only'});
      }
      world.addChild(object);
    }
    const mapProperties = Object.fromEntries((tiledMap.properties ?? []).map(property => [property.name, property.value]));
    const materialZones = JSON.parse(mapProperties.surfaceMaterialZones ?? '[]');
    if (!Array.isArray(materialZones) || materialZones.some(zone => !zone.material || !zone.source || !Array.isArray(zone.world))) throw Error('Tiled surface material metadata is invalid.');
    const mapSceneId = (tiledMap.properties ?? []).find(property => property.name === 'sceneId')?.value;
    window.__ranchVisual = {sceneId: scene.sceneId, mapSceneId, mapSource: 'Tiled TMJ 1.12.2', terrainProposal: mapProperties.terrainProposal, terrainSeed: mapProperties.terrainSeed, surfaceMaterialGrammar: mapProperties.surfaceMaterialGrammar, surfaceMaterialZones: materialZones.length, surfaceMaterialTypes: [...new Set(materialZones.map(zone => zone.material))], placements: placements.length, uniqueAssets: referenced.length, animatedCattle: animated.length + 1, animationState: 'graze', animationFrames: animalFrames.length, errors: [], navigation: {source: 'visual-presentation-only', unit: demo.route.unit, agentId: demo.placementId, routeCells: demo.route.pathCells.length, blockedStructureEnvelopes: presentationNavigation.blockedPolygons.length, fenceSegments: presentationNavigation.fenceSegments.length, simulationState: null}};
    const applyDemoStep = deltaSeconds => {
      demo.motion = advanceAgentMotion(demo.route, demo.motion, deltaSeconds, 1.25, {simulationState: null, visualDemoAction: 'walk'});
      const position = interpolateAgentPosition(demo.motion, 1), projected = tiledWorldToScreen(position, tiledMap);
      demoContainer.position.set(projected.x, projected.y); demoContainer.zIndex = projected.y;
      if (demo.motion.animation.walkFramesAdvance && !demoSprite.playing) demoSprite.play();
      if (!demo.motion.animation.walkFramesAdvance && demoSprite.playing) demoSprite.stop();
      window.__ranchVisual.navigation.position = position;
      window.__ranchVisual.navigation.animationState = demo.motion.animation.animationState;
      window.__ranchVisual.navigation.animationStateSource = demo.motion.animation.animationStateSource;
      window.__ranchVisual.navigation.walkFramesAdvance = demo.motion.animation.walkFramesAdvance;
      window.__ranchVisual.navigation.isTranslating = demo.motion.isTranslating;
      window.__ranchVisual.navigation.finished = demo.motion.finished;
      return window.__ranchVisual.navigation;
    };
    app.ticker.add(ticker => applyDemoStep(ticker.deltaMS / 1000));
    window.__ranchNavigationDebug = {step: applyDemoStep, route: demo.route, grid: {columns: presentationNavigation.grid.columns, rows: presentationNavigation.grid.rows, blockedPolygons: presentationNavigation.blockedPolygons, fenceSegments: presentationNavigation.fenceSegments}, clipStates: frameDescriptions};
    document.querySelector('#scene-seed').textContent = `SEED VISUAL ${mapProperties.terrainSeed}`;
    document.querySelector('#asset-count').textContent = ` · ${placements.length} OBJETOS`;
    fitCamera(); window.addEventListener('resize', fitCamera); window.__ranchReady = true;
    document.querySelector('#zoom-in').onclick = () => zoomAt(1.2);
    document.querySelector('#zoom-out').onclick = () => zoomAt(1 / 1.2);
    document.querySelector('#zoom-home').onclick = fitCamera;
    stage.addEventListener('wheel', event => { event.preventDefault(); zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - stage.getBoundingClientRect().left, event.clientY - stage.getBoundingClientRect().top); }, {passive: false});
    stage.addEventListener('pointerdown', event => { drag = {x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y}; stage.setPointerCapture(event.pointerId); });
    stage.addEventListener('pointermove', event => { if (!drag) return; camera.x = drag.cameraX + event.clientX - drag.x; camera.y = drag.cameraY + event.clientY - drag.y; world.position.set(camera.x, camera.y); });
    stage.addEventListener('pointerup', () => drag = null); stage.addEventListener('pointercancel', () => drag = null);
  } catch (error) { errorNode.hidden = false; errorNode.textContent = `Falha ao carregar composição v4:\n${error.stack ?? error}`; window.__ranchError = String(error); }
}

function zoomAt(factor, x = stage.clientWidth / 2, y = stage.clientHeight / 2) {
  const next = Math.max(.24, Math.min(2.2, camera.zoom * factor));
  const worldX = (x - camera.x) / camera.zoom, worldY = (y - camera.y) / camera.zoom;
  camera.zoom = next; camera.x = x - worldX * next; camera.y = y - worldY * next;
  world.position.set(camera.x, camera.y); world.scale.set(next);
}

loadScene();
