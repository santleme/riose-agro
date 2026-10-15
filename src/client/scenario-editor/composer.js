import {
  Application, Assets, Container, Graphics, Rectangle, Sprite, Texture,
} from '../../../assets/scenario-editor/vendor/pixi.min.mjs';
import {DEFAULT_LAYERS, generateFarmLayout, validateFarmLayout, projectIso, unprojectIso} from './scene-layout.js';

const URLS = {
  manifest: '/assets/manifest.json',
  prefabs: '/assets/scenario-editor/prefabs.json',
  dairy: '/assets/scenarios/riose-dairy-sample.json',
  beef: '/assets/scenarios/riose-beef-sample.json',
};
const LAYER_LABELS = {
  terrain: 'Terreno', roads: 'Estradas', pasture: 'Pastagem', water: 'Água',
  fences: 'Cercas', buildings: 'Edificações', handling: 'Manejo',
  technology: 'Tecnologia', animals: 'Animais', overlays: 'Sobreposições',
};
const LAYER_COLORS = {
  terrain: '#8ea577', roads: '#bc8a5d', pasture: '#6d9c5d', water: '#659eae',
  fences: '#9b7957', buildings: '#c58b5f', handling: '#b28a65',
  technology: '#5e9aa2', animals: '#a97868', overlays: '#9d8fb7',
};
const CATEGORIES = [
  {id: 'animals', label: 'Animais'}, {id: 'fences', label: 'Cercas'},
  {id: 'water', label: 'Água'}, {id: 'feed', label: 'Alimento'},
  {id: 'corral', label: 'Curral'}, {id: 'buildings', label: 'Prédios'},
  {id: 'vehicles', label: 'Máquinas'}, {id: 'technology', label: 'Tecnologia'},
  {id: 'terrain', label: 'Terreno'}, {id: 'roads', label: 'Estradas'},
];
const CATEGORY_ALIASES = {
  animals: 'Animais', fences: 'Cercas', water: 'Água', feed: 'Alimentação',
  corral: 'Curral', building: 'Prédios', buildings: 'Prédios', vehicle: 'Veículos',
  vehicles: 'Veículos', technology: 'Tecnologia', terrain: 'Terreno', roads: 'Estradas',
  pasture: 'Pastagem', vegetation: 'Vegetação', agriculture: 'Lavoura', infrastructure: 'Infraestrutura',
};
const ZONE_LABELS = {pasture: 'Pastagem', handling: 'Manejo', dairy: 'Leite', service: 'Serviço', tech: 'Tecnologia', support: 'Apoio'};
const PREFAB_GLYPHS = {'dairy-milking-base': '◫', 'farmstead': '⌂', 'corral-scale': '▤', 'supplement-area': '◉', 'gateway-antenna': '⌁', 'paddock-water': '◇', 'basic-corral': '▧'};
const storeKey = 'riose-world-scene-v1';
const activeSceneKey = 'riose-active-scene-v1';
const stageElement = document.querySelector('#stage');
const pixiHost = document.querySelector('#pixi-stage');
const fallbackCanvas = document.querySelector('#fallback-stage');
const compareHost = document.querySelector('#comparison-stage');
const layerNames = new Set(DEFAULT_LAYERS);

let manifest;
let prefabLibrary = [];
let scene;
let loadedScene;
let loadedScenes = {};
let app;
let rendererMode = 'boot';
let atlasTextures = new Map();
let assetTextures = new Map();
let assetById = new Map();
let spriteTargets = [];
let spriteByTargetId = new Map();
let layerViews = new Map();
let zoneView;
let selectionView;
let selectedId = null;
let activeAssetId = null;
let activePrefabId = null;
let activeCategory = 'animals';
let activeTool = 'select';
let activeLayer = 'animals';
let zonesVisible = true;
let zoneDraft = [];
let zoom = 0.42;
let pan = {x: 0, y: 0};
let pointer = null;
let dragSnapshot = null;
let history = [];
let historyIndex = -1;
let frameTimes = [];
let lastFrameAt = 0;
let fps = 0;
let visiblePlacements = 0;
let lastCullAt = 0;
let atlasMemoryMB = 0;
let lastStatsUpdate = 0;
let toastTimer;

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const formatCount = (number) => new Intl.NumberFormat('pt-BR').format(number);

function nameOfAsset(asset) {
  if (!asset) return 'Item da cena';
  const known = {
    'grass-light': 'Grama clara', 'grass-mid': 'Grama média', 'soil-dry': 'Terra seca',
    'soil-damp': 'Terra úmida', 'road-straight': 'Estrada de terra', 'road-turn': 'Curva de estrada',
    'shade-tree': 'Árvore de sombra', 'fruit-tree': 'Árvore frutífera', 'shrub': 'Arbusto',
    'cow-dairy': 'Bovino leiteiro', 'cow-beef': 'Bovino de corte', 'calf': 'Bezerro',
    'nelore-adult': 'Boi Nelore', 'livestock-nelore-cow-idle-imagegen-v1': 'Vaca Nelore',
    'livestock-nelore-calf-idle-imagegen-v1': 'Bezerro Nelore', 'livestock-nelore-heifer-idle-imagegen-v1': 'Novilha Nelore',
    'livestock-nelore-bull-idle-imagegen-v1': 'Touro Nelore', 'livestock-angus-cow-idle-imagegen-v1': 'Vaca Angus',
    'livestock-crossbred-cow-idle-imagegen-v1': 'Vaca cruzada',
    'dairy-holstein-cow': 'Vaca Holandesa', 'dairy-girolando-cow': 'Vaca Girolando',
    'dairy-heifer': 'Novilha leiteira', 'dairy-heifer-calf': 'Bezerra leiteira',
    'dairy-milking-parlor': 'Sala de ordenha', 'dairy-milk-chilling-tank': 'Tanque de resfriamento',
    'dairy-waiting-pen': 'Curral de espera', 'dairy-barn': 'Galpão leiteiro',
    'dairy-activity-collar': 'Coleira inteligente', 'vehicle-tractor-imagegen-v1': 'Trator',
    'building-farmhouse-imagegen-v1': 'Casa sede', 'building-shed-imagegen-v1': 'Galpão',
    'building-workshop-imagegen-v1': 'Oficina rural', 'corral-wood-standard-imagegen-v1': 'Curral modular',
    'technology-gateway-antenna-imagegen-v1': 'Gateway + antena',
    'technology-reader-handheld-imagegen-v1': 'Leitor RFID',
    'technology-ear-tag-rfid-imagegen-v1': 'Brinco eletrônico',
    'technology-monitor-station-imagegen-v1': 'Estação de monitoramento',
    'water-trough-round-imagegen-v1': 'Bebedouro circular',
    'feed-trough-hay-imagegen-v1': 'Cocho de alimentação',
    'fence-wire-wood-post-imagegen-v1': 'Cerca de madeira e arame',
  };
  if (known[asset.id]) return known[asset.id];
  return asset.id.replace(/-imagegen-v\d+/g, '').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function paletteCategory(asset) {
  const id = asset.id.toLowerCase();
  const tags = asset.tags ?? [];
  if (/cow|calf|heifer|bull|nelore|angus|crossbred/.test(id)) return 'animals';
  if (tags.includes('fence') || id.includes('fence') || id.includes('gate')) return 'fences';
  if (/trough|pond|reservoir|water/.test(id)) return 'water';
  if (/feed|salt|supplement/.test(id)) return 'feed';
  if (/corral|chute|alley|handling|scale/.test(id)) return 'corral';
  if (/technology|gateway|reader|rfid|sensor|collar|traceability|monitor/.test(id) || asset.category === 'technology') return 'technology';
  if (/vehicle|tractor|truck|pickup/.test(id) || asset.category === 'vehicle' || asset.category === 'vehicles') return 'vehicles';
  if (/building|barn|parlor|shed|workshop|farmhouse/.test(id) || asset.category === 'building' || asset.category === 'buildings') return 'buildings';
  if (/road/.test(id) || asset.defaultLayer === 'roads') return 'roads';
  if (asset.defaultLayer === 'terrain' || asset.category === 'terrain') return 'terrain';
  return asset.defaultLayer === 'pasture' ? 'terrain' : asset.defaultLayer;
}

function showToast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2200);
}

function setSaveState(message, dirty = false) {
  const node = $('save-state');
  node.textContent = message;
  node.classList.toggle('dirty', dirty);
}

function updateHeader() {
  $('scene-name').textContent = scene.metadata.name;
  $('comparison-scene-name').textContent = `${scene.metadata.name} · diorama editável`;
  const displayedAnimals = scene.placements.filter((item) => item.layer === 'animals').length + expandedPrefabPlacements().filter((item) => item.layer === 'animals').length;
  const herdLabel = scene.metadata.herdLabel ?? 'animais';
  $('scene-summary').textContent = `${scene.grid.width} × ${scene.grid.height} tiles · ${formatCount(scene.metadata.animalCount ?? 0)} no lote · ${displayedAnimals} exibidos · seed ${scene.metadata.seed}`;
  $('scene-summary').title = `${formatCount(scene.metadata.animalCount ?? 0)} ${herdLabel} simulados; ${displayedAnimals} sprites representativos no diorama.`;
  $('footer-seed').textContent = scene.metadata.seed;
  $('metric-placements').textContent = formatCount(scene.placements.length + expandedPrefabPlacements().length);
  $('metric-zones').textContent = scene.zones.length;
  $('metric-atlases').textContent = Object.keys(manifest.atlases).length;
  const heap = performance.memory?.usedJSHeapSize;
  const heapLabel = heap ? ` · heap ${(heap / (1024 * 1024)).toFixed(0)} MB` : '';
  $('selection-count').textContent = `${formatCount(scene.placements.length + expandedPrefabPlacements().length)} placements · ${formatCount(visiblePlacements)} visíveis · ${atlasMemoryMB || '—'} MB atlas · ${fps ? `${fps} FPS` : 'FPS medindo'}${heapLabel}`;
}

function fitScene(target = stageElement) {
  const bounds = target.getBoundingClientRect();
  const grid = scene.grid;
  const diagonal = (grid.width + grid.height) * grid.tileWidth / 2;
  const vertical = (grid.width + grid.height) * grid.tileHeight / 2;
  const pad = target === compareHost ? 0.84 : 0.9;
  zoom = Math.min((bounds.width * pad) / diagonal, (bounds.height * pad) / vertical);
  const center = projectIso((grid.width - 1) / 2, (grid.height - 1) / 2, grid);
  pan.x = bounds.width / 2 - center.x * zoom;
  pan.y = bounds.height / 2 - center.y * zoom;
  updateCamera();
  updateZoomLabel();
}

function updateCamera() {
  if (rendererMode === 'pixi' && app) {
    const world = app.stage.getChildByLabel('riose-world');
    if (world) {
      world.position.set(pan.x, pan.y);
      world.scale.set(zoom);
    }
    updateCulling();
    app.render();
  }
  if (rendererMode === 'canvas') renderFallback();
  renderComparison();
}

function updateCulling() {
  if (!app || rendererMode !== 'pixi') return;
  const viewport = app.screen;
  let visible = 0;
  for (const target of spriteTargets) {
    const sprite = target.sprite;
    if (!sprite) { visible++; continue; }
    const asset = assetById.get(target.placement.assetId);
    if (!asset) { sprite.renderable = false; continue; }
    const point = pointFor(target.placement.position);
    const width = (asset.displaySize?.[0] ?? 96) * (target.placement.properties?.visualScale ?? 1);
    const height = (asset.displaySize?.[1] ?? 64) * (target.placement.properties?.visualScale ?? 1);
    const anchor = target.placement.anchor ?? asset.anchor ?? {x: 0.5, y: 1};
    const angle = (target.placement.rotation ?? 0) * Math.PI / 180;
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    let left = Infinity; let right = -Infinity; let top = Infinity; let bottom = -Infinity;
    for (const [localX, localY] of [[-width * anchor.x, -height * anchor.y], [width * (1 - anchor.x), -height * anchor.y], [width * (1 - anchor.x), height * (1 - anchor.y)], [-width * anchor.x, height * (1 - anchor.y)]]) {
      const x = pan.x + (point.x + localX * cos - localY * sin) * zoom;
      const y = pan.y + (point.y + localX * sin + localY * cos) * zoom;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    const isVisible = sprite.parent?.visible !== false && right >= viewport.x && left <= viewport.right && bottom >= viewport.y && top <= viewport.bottom;
    sprite.renderable = isVisible;
    if (isVisible) visible++;
  }
  visiblePlacements = visible;
}

function updateZoomLabel() {
  $('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
}

function pointFor(position, grid = scene.grid) {
  const point = projectIso(position.col, position.row, grid);
  return {x: point.x + (grid.origin?.x ?? 0), y: point.y + (grid.origin?.y ?? 0)};
}

function expandedPrefabPlacements() {
  const result = [];
  for (const instance of scene.prefabInstances ?? []) {
    const prefab = prefabLibrary.find((item) => item.id === instance.prefabId);
    if (!prefab) continue;
    const rotation = (instance.rotation ?? 0) % 360;
    for (let index = 0; index < prefab.placements.length; index++) {
      const child = prefab.placements[index];
      let dc = child.col;
      let dr = child.row;
      if (rotation === 90) [dc, dr] = [-dr, dc];
      else if (rotation === 180) [dc, dr] = [-dc, -dr];
      else if (rotation === 270) [dc, dr] = [dr, -dc];
      result.push({
        id: `${instance.id}::${index}`,
        assetId: child.assetId,
        layer: child.layer,
        position: {col: instance.col + dc, row: instance.row + dr},
        rotation: ((child.rotation ?? 0) + rotation) % 360,
        properties: {...(child.properties ?? {}), prefabInstanceId: instance.id, prefabId: instance.prefabId},
        parentInstanceId: instance.id,
      });
    }
  }
  return result;
}

function allPlacements() {
  return [...scene.placements, ...expandedPrefabPlacements()];
}

function makeTexture(asset) {
  if (assetTextures.has(asset.id)) return assetTextures.get(asset.id);
  const atlas = atlasTextures.get(asset.frame.atlas);
  if (!atlas) return null;
  const texture = new Texture({
    source: atlas.source,
    frame: new Rectangle(asset.frame.x, asset.frame.y, asset.frame.w, asset.frame.h),
  });
  assetTextures.set(asset.id, texture);
  return texture;
}

function refreshZoneGraphic() {
  if (!zoneView) return;
  zoneView.clear();
  zoneView.visible = zonesVisible;
  if (!zonesVisible) return;
  for (const zone of scene.zones) {
    const points = zone.polygon.map(({col, row}) => pointFor({col, row}));
    zoneView.poly(points.flatMap((point) => [point.x, point.y]).concat([points[0].x, points[0].y]));
    zoneView.fill({color: Number.parseInt(zone.color.slice(1), 16), alpha: 0.08});
    zoneView.stroke({color: Number.parseInt(zone.color.slice(1), 16), alpha: 0.68, width: 2 / zoom});
  }
  if (zoneDraft.length) {
    const points = zoneDraft.map(({col, row}) => pointFor({col, row}));
    zoneView.poly(points.flatMap((point) => [point.x, point.y]));
    zoneView.stroke({color: 0xf4d68a, alpha: 0.95, width: 3 / zoom});
    for (const point of points) zoneView.circle(point.x, point.y, 4 / zoom).fill({color: 0xf4d68a, alpha: 1});
  }
}

function updateSelectionGraphic() {
  if (!selectionView) return;
  selectionView.clear();
  if (!selectedId) return;
  const target = spriteByTargetId.get(selectedId);
  const instance = scene.prefabInstances.find((item) => item.id === selectedId);
  const prefab = instance && prefabLibrary.find((item) => item.id === instance.prefabId);
  if (!target && !instance) return;
  const placement = target?.placement;
  const asset = assetById.get(placement?.assetId);
  const footprint = instance ? prefab?.footprint ?? [1, 1] : placement.footprint ?? asset?.footprint ?? [1, 1];
  const center = pointFor(instance ? {col: instance.col + (footprint[0] - 1) / 2, row: instance.row + (footprint[1] - 1) / 2} : placement.position);
  const halfWidth = (footprint[0] ?? 1) * scene.grid.tileWidth / 2;
  const halfHeight = (footprint[1] ?? 1) * scene.grid.tileHeight / 2;
  const corners = [
    {x: center.x, y: center.y - halfHeight},
    {x: center.x + halfWidth, y: center.y},
    {x: center.x, y: center.y + halfHeight},
    {x: center.x - halfWidth, y: center.y},
  ];
  selectionView.poly(corners.flatMap((point) => [point.x, point.y]).concat([corners[0].x, corners[0].y]));
  selectionView.fill({color: 0xf4d68a, alpha: 0.1});
  selectionView.stroke({color: 0xf4d68a, width: 2.2 / zoom, alpha: 0.96});
}

function createSpriteTarget(placement, targetLayer) {
  const target = {sprite: null, placement, parentInstanceId: placement.parentInstanceId ?? null};
  if (rendererMode === 'pixi') {
    const asset = assetById.get(placement.assetId);
    if (!asset || !targetLayer) return null;
    const texture = makeTexture(asset);
    if (!texture) return null;
    const sprite = new Sprite(texture);
    const anchor = placement.anchor ?? asset.anchor ?? {x: 0.5, y: 1};
    sprite.anchor.set(anchor.x, anchor.y);
    const size = asset.displaySize ?? [96, 64];
    const tileBleed = placement.layer === 'terrain' && placement.properties?.tileKind === 'pasture' ? 2 : 0;
    sprite.width = size[0] * (placement.properties?.visualScale ?? 1) + tileBleed;
    sprite.height = size[1] * (placement.properties?.visualScale ?? 1) + tileBleed;
    const point = pointFor(placement.position);
    sprite.position.set(point.x, point.y);
    sprite.rotation = (placement.rotation ?? 0) * Math.PI / 180;
    sprite.zIndex = point.y + (placement.properties?.sortBias ?? 0);
    sprite.label = `${placement.assetId}:${placement.id}`;
    sprite.eventMode = 'none';
    targetLayer.addChild(sprite);
    target.sprite = sprite;
  }
  spriteTargets.push(target);
  spriteByTargetId.set(placement.id, target);
  return target;
}

function renderPixiScene() {
  if (!app) {
    spriteTargets = [];
    spriteByTargetId.clear();
    for (const placement of allPlacements()) createSpriteTarget(placement, null);
    renderFallback();
    return;
  }
  const world = app.stage.getChildByLabel('riose-world');
  if (!world) return;
  for (const container of layerViews.values()) {
    world.removeChild(container);
    container.destroy({children: true});
  }
  layerViews.clear();
  spriteTargets = [];
  spriteByTargetId.clear();
  const layerList = [...scene.layers].sort((a, b) => a.order - b.order);
  for (const layer of layerList) {
    const container = new Container({label: `layer:${layer.id}`});
    container.sortableChildren = true;
    container.visible = layer.visible;
    layerViews.set(layer.id, container);
    world.addChild(container);
  }
  if (zoneView && selectionView) world.addChild(zoneView, selectionView);
  for (const placement of allPlacements()) {
    createSpriteTarget(placement, layerViews.get(placement.layer));
  }
  for (const layer of layerViews.values()) layer.sortChildren();
  refreshZoneGraphic();
  updateCulling();
  updateSelectionGraphic();
  app.render();
  updateHeader();
  renderFallback();
  renderComparison();
}

function updateTargetPosition(target) {
  if (!target) return;
  if (!target.sprite) { renderFallback(); return; }
  if (target.parentInstanceId) {
    const instance = scene.prefabInstances.find((item) => item.id === target.parentInstanceId);
    if (instance) {
      const targetIndex = Number(target.placement.id.split('::')[1]);
      const prefab = prefabLibrary.find((item) => item.id === instance.prefabId);
      const child = prefab?.placements[targetIndex];
      if (!child) return;
      const angle = (instance.rotation ?? 0) * Math.PI / 180;
      const dc = child.col * Math.cos(angle) - child.row * Math.sin(angle);
      const dr = child.col * Math.sin(angle) + child.row * Math.cos(angle);
      const point = pointFor({col: instance.col + dc, row: instance.row + dr});
      target.sprite.position.set(point.x, point.y);
      target.sprite.zIndex = point.y;
      target.sprite.rotation = ((child.rotation ?? 0) + (instance.rotation ?? 0)) * Math.PI / 180;
      return;
    }
  }
  const point = pointFor(target.placement.position);
  target.sprite.position.set(point.x, point.y);
  target.sprite.zIndex = point.y;
  target.sprite.rotation = (target.placement.rotation ?? 0) * Math.PI / 180;
}

function drawCanvasAsset(context, asset, placement, scale, offsetX, offsetY) {
  const atlas = manifest.atlases[asset.frame.atlas];
  const image = canvasAtlasImages.get(asset.frame.atlas);
  if (!image || !atlas) return;
  const p = pointFor(placement.position);
  const tileBleed = placement.layer === 'terrain' && placement.properties?.tileKind === 'pasture' ? 2 : 0;
  const width = (asset.displaySize?.[0] ?? 96) * scale + tileBleed * scale;
  const height = (asset.displaySize?.[1] ?? 64) * scale + tileBleed * scale;
  const anchor = placement.anchor ?? asset.anchor ?? {x: 0.5, y: 1};
  context.save();
  context.translate(offsetX + p.x * scale, offsetY + p.y * scale);
  context.rotate((placement.rotation ?? 0) * Math.PI / 180);
  context.drawImage(image, asset.frame.x, asset.frame.y, asset.frame.w, asset.frame.h, -width * anchor.x, -height * anchor.y, width, height);
  context.restore();
}

const canvasAtlasImages = new Map();
function renderFallback(canvas = fallbackCanvas, viewport = stageElement) {
  if (!manifest || !scene || !canvas || rendererMode === 'pixi' && canvas === fallbackCanvas) return;
  const bounds = viewport.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(bounds.width * ratio) || canvas.height !== Math.round(bounds.height * ratio)) {
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
  }
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  const visibleLayerIds = new Set(scene.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const center = projectIso((scene.grid.width - 1) / 2, (scene.grid.height - 1) / 2, scene.grid);
  const scale = canvas === fallbackCanvas ? zoom : Math.min((bounds.width * 0.84) / ((scene.grid.width + scene.grid.height) * scene.grid.tileWidth / 2), (bounds.height * 0.84) / ((scene.grid.width + scene.grid.height) * scene.grid.tileHeight / 2));
  const offsetX = canvas === fallbackCanvas ? pan.x : bounds.width / 2 - center.x * scale;
  const offsetY = canvas === fallbackCanvas ? pan.y : bounds.height / 2 - center.y * scale;
  for (const placement of allPlacements().sort((a, b) => {
    const la = scene.layers.find((layer) => layer.id === a.layer)?.order ?? 99;
    const lb = scene.layers.find((layer) => layer.id === b.layer)?.order ?? 99;
    if (la !== lb) return la - lb;
    return pointFor(a.position).y - pointFor(b.position).y;
  })) {
    if (!visibleLayerIds.has(placement.layer)) continue;
    const asset = assetById.get(placement.assetId);
    if (asset) drawCanvasAsset(context, asset, placement, scale, offsetX, offsetY);
  }
  if (zonesVisible) {
    for (const zone of scene.zones) {
      const points = zone.polygon.map(({col, row}) => pointFor({col, row}));
      context.beginPath();
      points.forEach((point, index) => context[index ? 'lineTo' : 'moveTo'](offsetX + point.x * scale, offsetY + point.y * scale));
      context.closePath();
      context.fillStyle = `${zone.color}20`;
      context.fill();
      context.strokeStyle = `${zone.color}aa`;
      context.lineWidth = 1;
      context.stroke();
    }
  }
}

function renderComparison() {
  if (!manifest || !scene || !compareHost || !compareHost.clientWidth) return;
  if (!compareCanvas) {
    compareCanvas = document.createElement('canvas');
    compareCanvas.setAttribute('aria-label', 'Cena JSON atual renderizada pelo adaptador Canvas 2D');
    compareHost.appendChild(compareCanvas);
  }
  // The comparison uses the same scene and a lightweight Canvas adapter; keep one WebGL context alive.
  renderFallback(compareCanvas, compareHost);
}
let compareCanvas;

function makePalette() {
  const categories = $('categories');
  categories.replaceChildren();
  for (const category of CATEGORIES) {
    const button = document.createElement('button');
    button.className = `category-button${category.id === activeCategory ? ' active' : ''}`;
    button.type = 'button';
    button.textContent = category.label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', category.id === activeCategory);
    button.addEventListener('click', () => {
      activeCategory = category.id;
      activePrefabId = null;
      makePalette();
    });
    categories.append(button);
  }
  const query = $('asset-search').value.trim().toLocaleLowerCase('pt-BR');
  const filtered = manifest.assets.filter((asset) => {
    if (paletteCategory(asset) !== activeCategory) return false;
    const haystack = `${nameOfAsset(asset)} ${asset.id} ${(asset.tags ?? []).join(' ')}`.toLocaleLowerCase('pt-BR');
    return !query || haystack.includes(query);
  });
  $('asset-count').textContent = filtered.length;
  $('palette-title').textContent = CATEGORIES.find((item) => item.id === activeCategory)?.label ?? 'Assets';
  const list = $('asset-list');
  list.replaceChildren();
  for (const asset of filtered) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `asset-card${activeAssetId === asset.id ? ' active' : ''}`;
    const provenance = asset.provenance ?? {};
    card.title = `${nameOfAsset(asset)} · footprint ${asset.footprint.join('×')} · status ${asset.reviewStatus ?? 'UNRESOLVED'} · source ${provenance.sourceFile ?? 'unresolved'} · rights ${provenance.rights?.licenseState ?? 'unknown'}`;
    const thumb = document.createElement('span');
    thumb.className = 'asset-thumb';
    const canvas = document.createElement('canvas');
    canvas.width = 108;
    canvas.height = 63;
    thumb.append(canvas);
    const context = canvas.getContext('2d');
    const image = canvasAtlasImages.get(asset.frame.atlas);
    if (image) {
      const scale = Math.min(90 / asset.frame.w, 51 / asset.frame.h);
      const w = asset.frame.w * scale;
      const h = asset.frame.h * scale;
      context.drawImage(image, asset.frame.x, asset.frame.y, asset.frame.w, asset.frame.h, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
    const title = document.createElement('strong');
    title.textContent = nameOfAsset(asset);
    const layer = document.createElement('small');
    layer.textContent = `${CATEGORY_ALIASES[asset.category] ?? LAYER_LABELS[asset.defaultLayer] ?? asset.category} · ${asset.footprint.join('×')}`;
    const review = document.createElement('small');
    review.className = `asset-review-status status-${String(asset.reviewStatus ?? 'UNRESOLVED').toLowerCase()}`;
    review.textContent = `Status: ${asset.reviewStatus ?? 'UNRESOLVED'}`;
    card.append(thumb, title, layer, review);
    card.addEventListener('click', () => {
      activeAssetId = asset.id;
      activePrefabId = null;
      activeLayer = asset.defaultLayer ?? activeLayer;
      activeTool = ['terrain', 'roads', 'fences'].includes(activeLayer) ? 'paint' : 'place';
      selectTool(activeTool);
      makePalette();
      showToast(`${nameOfAsset(asset)} selecionado · clique no mapa para posicionar`);
    });
    list.append(card);
  }
  const prefabList = $('prefab-list');
  prefabList.replaceChildren();
  $('prefab-count').textContent = `${prefabLibrary.length} módulos`;
  for (const prefab of prefabLibrary) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `prefab-card${activePrefabId === prefab.id ? ' active' : ''}`;
    button.innerHTML = `<span class="prefab-icon">${PREFAB_GLYPHS[prefab.id] ?? '⌘'}</span><span><strong>${prefab.name}</strong><small>${prefab.footprint[0]} × ${prefab.footprint[1]} tiles · ${prefab.placements.length} assets</small></span>`;
    button.addEventListener('click', () => {
      activePrefabId = prefab.id;
      activeAssetId = null;
      activeLayer = prefab.placements[0]?.layer ?? 'buildings';
      selectTool('place');
      makePalette();
      showToast(`${prefab.name} selecionado · clique para inserir o módulo`);
    });
    prefabList.append(button);
  }
}

function drawLayerList() {
  const container = $('layer-list');
  container.replaceChildren();
  for (const layer of [...scene.layers].sort((a, b) => b.order - a.order)) {
    const row = document.createElement('div');
    row.className = 'layer-row';
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.innerHTML = `<i style="--layer-color:${LAYER_COLORS[layer.id]}"></i>${LAYER_LABELS[layer.id]}`;
    const actions = document.createElement('span');
    actions.className = 'layer-actions';
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Camada ativa ${LAYER_LABELS[layer.id]}`);
    select.innerHTML = '<option value="view">Visualizar</option><option value="active">Editar</option>';
    select.value = activeLayer === layer.id ? 'active' : 'view';
    select.addEventListener('change', () => {
      if (select.value === 'active') {
        activeLayer = layer.id;
        selectTool(layer.id === 'terrain' ? 'paint' : 'place');
        drawLayerList();
      }
    });
    const toggle = document.createElement('button');
    toggle.className = `layer-toggle${layer.visible ? '' : ' off'}`;
    toggle.type = 'button';
    toggle.title = layer.visible ? 'Ocultar camada' : 'Mostrar camada';
    toggle.textContent = layer.visible ? '◉' : '○';
    toggle.addEventListener('click', () => {
      layer.visible = !layer.visible;
      const view = layerViews.get(layer.id);
      if (view) view.visible = layer.visible;
      renderFallback();
      renderComparison();
      drawLayerList();
    });
    const lock = document.createElement('button');
    lock.className = `layer-lock${layer.locked ? ' locked' : ''}`;
    lock.type = 'button';
    lock.title = layer.locked ? 'Desbloquear camada' : 'Bloquear camada';
    lock.textContent = layer.locked ? '⌑' : '⌕';
    lock.addEventListener('click', () => {
      layer.locked = !layer.locked;
      drawLayerList();
    });
    actions.append(select, toggle, lock);
    row.append(name, actions);
    container.append(row);
  }
}

function drawZoneLegend() {
  const legend = $('zone-legend');
  legend.replaceChildren();
  for (const zone of scene.zones) {
    const chip = document.createElement('span');
    chip.className = 'zone-chip';
    chip.innerHTML = `<i style="background:${zone.color}"></i>${zone.name}`;
    legend.append(chip);
  }
}

function populateInspector() {
  const inputIds = ['position-col', 'position-row', 'rotation', 'placement-layer', 'zone-select'];
  let selection;
  let target;
  let isPrefab = false;
  if (selectedId) {
    const instance = scene.prefabInstances.find((item) => item.id === selectedId);
    if (instance) {
      selection = instance;
      isPrefab = true;
      const prefab = prefabLibrary.find((item) => item.id === instance.prefabId);
      $('selected-name').textContent = prefab?.name ?? 'Módulo';
      $('selected-type').textContent = `Prefab · ${prefab?.placements.length ?? 0} assets · ${instance.prefabId}`;
    } else {
      target = spriteByTargetId.get(selectedId);
      selection = target?.placement;
      const asset = assetById.get(selection?.assetId);
      $('selected-name').textContent = nameOfAsset(asset);
      const footprint = selection?.footprint ?? asset?.footprint ?? [1, 1];
      const anchor = selection?.anchor ?? asset?.anchor ?? {x: 0.5, y: 1};
      const group = scene.visualGroups?.find((entry) => entry.id === selection?.properties?.groupId);
      const representative = selection?.properties?.sourceKind === 'lot-representative';
      $('selected-type').textContent = representative
        ? `Amostra visual · ${group?.population ?? '—'} no lote · sem ID individual`
        : `${LAYER_LABELS[selection?.layer] ?? selection?.layer} · ${footprint[0]}×${footprint[1]} · anchor ${anchor.x},${anchor.y}`;
    }
  }
  const active = Boolean(selection);
  for (const id of inputIds) $(id).disabled = !active;
  $('delete-selection').disabled = !active;
  $('duplicate').disabled = !active;
  $('selected-thumb').replaceChildren();
  if (target) {
    const asset = assetById.get(target.placement.assetId);
    const canvas = document.createElement('canvas');
    canvas.width = 42; canvas.height = 42;
    const context = canvas.getContext('2d');
    const image = canvasAtlasImages.get(asset?.frame.atlas);
    if (image && asset) {
      const scale = Math.min(36 / asset.frame.w, 36 / asset.frame.h);
      const w = asset.frame.w * scale; const h = asset.frame.h * scale;
      context.drawImage(image, asset.frame.x, asset.frame.y, asset.frame.w, asset.frame.h, (42 - w) / 2, (42 - h) / 2, w, h);
    }
    $('selected-thumb').append(canvas);
  } else {
    $('selected-thumb').textContent = active ? '⌘' : '⌖';
  }
  if (!active) {
    $('position-col').value = '';
    $('position-row').value = '';
    $('rotation').value = '0';
    $('placement-layer').replaceChildren();
    $('zone-select').value = '';
    return;
  }
  const pos = isPrefab ? selection : selection.position;
  $('position-col').value = Number(pos.col.toFixed(2));
  $('position-row').value = Number(pos.row.toFixed(2));
  const rotationSelect = $('rotation');
  const asset = !isPrefab && assetById.get(selection.assetId);
  const prefab = isPrefab && prefabLibrary.find((entry) => entry.id === selection.prefabId);
  const rotationModes = isPrefab ? prefab?.rotationModes : asset?.rotationModes;
  rotationSelect.replaceChildren(...(rotationModes ?? [0]).map((angle) => new Option(`${angle}°`, String(angle))));
  rotationSelect.value = String(selection.rotation ?? 0);
  rotationSelect.disabled = !rotationModes;
  const layerSelect = $('placement-layer');
  layerSelect.replaceChildren(...scene.layers.map((layer) => new Option(LAYER_LABELS[layer.id], layer.id)));
  layerSelect.value = isPrefab ? (prefabLibrary.find((item) => item.id === selection.prefabId)?.placements[0]?.layer ?? 'buildings') : selection.layer;
  layerSelect.disabled = isPrefab;
  const zoneSelect = $('zone-select');
  zoneSelect.replaceChildren(new Option('Sem zona', ''), ...scene.zones.map((zone) => new Option(zone.name, zone.id)));
  zoneSelect.value = selection.zoneId ?? target?.placement.zoneId ?? '';
  if (isPrefab) $('selected-thumb').textContent = '⌘';
}

function syncPlacementFromInspector() {
  if (!selectedId) return;
  const instance = scene.prefabInstances.find((item) => item.id === selectedId);
  const target = spriteByTargetId.get(selectedId);
  const selection = instance ?? target?.placement;
  if (!selection) return;
  const position = instance ?? selection.position;
  position.col = clamp(Number($('position-col').value) || 0, 0, scene.grid.width - 1);
  position.row = clamp(Number($('position-row').value) || 0, 0, scene.grid.height - 1);
  if (!instance) {
    selection.rotation = Number($('rotation').value);
    selection.layer = $('placement-layer').value;
    selection.zoneId = $('zone-select').value || undefined;
  }
  for (const spriteTarget of spriteTargets) {
    if (spriteTarget.parentInstanceId === selectedId) updateTargetPosition(spriteTarget);
  }
  if (target) updateTargetPosition(target);
  if (instance) selection.rotation = Number($('rotation').value);
  refreshZoneGraphic();
  app?.render();
  renderFallback();
  renderComparison();
  pushHistory();
  populateInspector();
  updateHeader();
  setSaveState('Alterações pendentes', true);
}

function selectTool(tool) {
  if (activeTool === 'zone' && tool !== 'zone' && zoneDraft.length) cancelZoneDraft();
  activeTool = tool;
  $('finish-zone').textContent = tool === 'zone' ? 'Concluir zona' : '＋ Zona';
  document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
  stageElement.style.cursor = tool === 'select' ? 'default' : tool === 'erase' ? 'not-allowed' : 'crosshair';
  if (rendererMode === 'pixi') app?.render();
}

function pushHistory() {
  const snapshot = JSON.stringify(scene);
  if (history[historyIndex] === snapshot) return;
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  if (history.length > 40) history.shift();
  historyIndex = history.length - 1;
  persistSceneDraft();
}

function persistSceneDraft() {
  try {
    const text = JSON.stringify(scene);
    localStorage.setItem(`${storeKey}:${scene.metadata.id}`, text);
    localStorage.setItem(activeSceneKey, scene.metadata.id);
    localStorage.setItem(storeKey, text);
  } catch {}
}

function restoreHistory(nextIndex) {
  if (nextIndex < 0 || nextIndex >= history.length) return;
  historyIndex = nextIndex;
  scene = JSON.parse(history[historyIndex]);
  selectedId = null;
  rebuildEditor();
  setSaveState('Alterações pendentes', true);
  persistSceneDraft();
}

function addPlacement(assetId, col, row, layer = activeLayer) {
  const asset = assetById.get(assetId);
  if (!asset) return;
  const snappedCol = clamp(Math.round(col * 4) / 4, 0, scene.grid.width - 1);
  const snappedRow = clamp(Math.round(row * 4) / 4, 0, scene.grid.height - 1);
  const zone = zoneAt(snappedCol, snappedRow);
  if (zone && asset.allowedZones?.length && !asset.allowedZones.includes(zone.type)) {
    showToast(`${nameOfAsset(asset)} não está previsto na zona ${zone.name}.`);
    return;
  }
  if (asset.defaultLayer === 'terrain') {
    const existing = scene.placements.find((item) => item.layer === 'terrain' && Math.round(item.position.col) === Math.round(snappedCol) && Math.round(item.position.row) === Math.round(snappedRow));
    if (existing) {
      existing.assetId = assetId;
      existing.properties = {...existing.properties, tileKind: 'pasture', autotile: true};
      const target = spriteByTargetId.get(existing.id);
      const replacement = assetById.get(assetId);
      if (target?.sprite && replacement) target.sprite.texture = makeTexture(replacement);
      app?.render();
      renderFallback();
      renderComparison();
      return existing;
    }
  }
  const item = {
    id: `place-${crypto.randomUUID()}`,
    assetId,
    layer,
    position: {col: snappedCol, row: snappedRow},
    rotation: 0,
    footprint: asset.footprint,
    properties: asset.defaultLayer === 'terrain' ? {tileKind: 'pasture', autotile: true} : {},
  };
  scene.placements.push(item);
  if (scene.autoTile?.enabled && asset.placementRules?.autoTile) autotileScene();
  if (asset.placementRules?.autoTile) {
    renderPixiScene();
    return scene.placements.find((placement) => placement.id === item.id) ?? item;
  }
  createSpriteTarget(item, layerViews.get(layer));
  layerViews.get(layer)?.sortChildren();
  app?.render();
  renderFallback();
  renderComparison();
  return item;
}

function addPrefab(prefabId, col, row) {
  const prefab = prefabLibrary.find((item) => item.id === prefabId);
  if (!prefab) return null;
  const zone = zoneAt(col, row);
  if (zone && prefab.zones?.length && !prefab.zones.includes(zone.type)) {
    showToast(`${prefab.name} não está previsto na zona ${zone.name}.`);
    return null;
  }
  const instance = {
    id: `module-${crypto.randomUUID()}`,
    prefabId,
    col: clamp(Math.round(col), 0, scene.grid.width - prefab.footprint[0]),
    row: clamp(Math.round(row), 0, scene.grid.height - prefab.footprint[1]),
    rotation: 0,
    zoneId: scene.zones.find((zone) => (prefab.zones ?? []).includes(zone.type))?.id,
  };
  scene.prefabInstances.push(instance);
  return instance;
}

function zoneAt(col, row) {
  return scene.zones.find((zone) => {
    let inside = false;
    for (let index = 0, previous = zone.polygon.length - 1; index < zone.polygon.length; previous = index++) {
      const a = zone.polygon[index]; const b = zone.polygon[previous];
      const crosses = (a.row > row) !== (b.row > row)
        && col < ((b.col - a.col) * (row - a.row)) / (b.row - a.row || 1e-9) + a.col;
      if (crosses) inside = !inside;
    }
    return inside;
  });
}

function removeSelection() {
  if (!selectedId) return;
  const prefabIndex = scene.prefabInstances.findIndex((item) => item.id === selectedId);
  if (prefabIndex >= 0) scene.prefabInstances.splice(prefabIndex, 1);
  else scene.placements = scene.placements.filter((item) => item.id !== selectedId);
  selectedId = null;
  pushHistory();
  rebuildEditor();
  setSaveState('Alterações pendentes', true);
}

function duplicateSelection() {
  if (!selectedId) return;
  const instance = scene.prefabInstances.find((item) => item.id === selectedId);
  if (instance) {
    const copy = {...deepClone(instance), id: `module-${crypto.randomUUID()}`, col: clamp(instance.col + 1, 0, scene.grid.width - 1), row: clamp(instance.row + 1, 0, scene.grid.height - 1)};
    scene.prefabInstances.push(copy);
    selectedId = copy.id;
  } else {
    const placement = scene.placements.find((item) => item.id === selectedId);
    if (!placement) return;
    const copy = {...deepClone(placement), id: `place-${crypto.randomUUID()}`, position: {col: clamp(placement.position.col + 1, 0, scene.grid.width - 1), row: clamp(placement.position.row + 1, 0, scene.grid.height - 1)}};
    scene.placements.push(copy);
    selectedId = copy.id;
  }
  pushHistory();
  rebuildEditor();
  setSaveState('Alterações pendentes', true);
}

function localPoint(event) {
  const rect = stageElement.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const center = projectIso((scene.grid.width - 1) / 2, (scene.grid.height - 1) / 2, scene.grid);
  const wx = (sx - pan.x) / zoom;
  const wy = (sy - pan.y) / zoom;
  const coords = unprojectIso(wx - (scene.grid.origin?.x ?? 0), wy - (scene.grid.origin?.y ?? 0), scene.grid);
  const inside = coords.col >= -0.5 && coords.row >= -0.5 && coords.col <= scene.grid.width - 0.5 && coords.row <= scene.grid.height - 0.5;
  return {sx, sy, col: coords.col, row: coords.row, snappedCol: clamp(Math.round(coords.col), 0, scene.grid.width - 1), snappedRow: clamp(Math.round(coords.row), 0, scene.grid.height - 1), inside, center};
}

function findTargetAt(screenX, screenY) {
  if (rendererMode === 'pixi') {
    for (let index = spriteTargets.length - 1; index >= 0; index--) {
      const target = spriteTargets[index];
      if (!target.sprite.visible || !target.sprite.renderable || target.sprite.parent?.visible === false) continue;
      const bounds = target.sprite.getBounds();
      if (screenX >= bounds.x && screenX <= bounds.x + bounds.width
        && screenY >= bounds.y && screenY <= bounds.y + bounds.height) return target;
    }
    return undefined;
  }
  let best;
  let distance = Infinity;
  for (const target of spriteTargets) {
    const point = pointFor(target.placement.position);
    const screenPoint = {x: pan.x + point.x * zoom, y: pan.y + point.y * zoom};
    const next = Math.hypot(screenPoint.x - screenX, screenPoint.y - screenY);
    if (next < distance && next < 28) { distance = next; best = target; }
  }
  return best;
}

function handleStageDown(event) {
  if (event.button !== 0) return;
  stageElement.focus();
  const point = localPoint(event);
  pointer = {startX: event.clientX, startY: event.clientY, lastKey: '', moved: false, shiftPan: event.shiftKey};
  if (event.shiftKey || event.button === 1) {
    pointer.pan = true;
    pointer.originPan = {...pan};
    return;
  }
  if (!point.inside) {
    if (activeTool === 'select') { selectedId = null; updateSelectionGraphic(); populateInspector(); }
    return;
  }
  if (activeTool === 'zone') {
    const next = {col: point.snappedCol, row: point.snappedRow};
    if (!zoneDraft.some((vertex) => vertex.col === next.col && vertex.row === next.row)) zoneDraft.push(next);
    refreshZoneGraphic();
    if (event.detail >= 2) finishZone();
    return;
  }
  const hit = findTargetAt(point.sx, point.sy);
  if (activeTool === 'erase') {
    if (hit) { selectedId = hit.parentInstanceId ?? hit.placement.id; removeSelection(); }
    return;
  }
  if (activeTool === 'place' && (activeAssetId || activePrefabId)) {
    const target = activePrefabId
      ? addPrefab(activePrefabId, point.snappedCol, point.snappedRow)
      : addPlacement(activeAssetId, point.snappedCol, point.snappedRow, activeLayer);
    selectedId = target?.id ?? null;
    pushHistory();
    rebuildEditor();
    populateInspector();
    setSaveState('Alterações pendentes', true);
    return;
  }
  if (activeTool === 'paint' && activeAssetId) {
    paintCell(point.snappedCol, point.snappedRow);
    pointer.painting = true;
    return;
  }
  if (hit) {
    selectedId = hit.parentInstanceId ?? hit.placement.id;
    if (!scene.prefabInstances.some((item) => item.id === selectedId)) {
      const layer = scene.layers.find((item) => item.id === hit.placement.layer);
      if (layer?.locked) return;
      dragSnapshot = JSON.stringify(scene);
      pointer.moving = true;
    } else {
      dragSnapshot = JSON.stringify(scene);
      pointer.moving = true;
    }
  } else {
    selectedId = null;
  }
  updateSelectionGraphic();
  populateInspector();
}

function paintCell(col, row) {
  if (!activeAssetId) return;
  const asset = assetById.get(activeAssetId);
  const previous = pointer?.lastCell ?? {col, row};
  const steps = Math.max(Math.abs(col - previous.col), Math.abs(row - previous.row), 1);
  let changed = false;
  for (let step = 0; step <= steps; step++) {
    const nextCol = Math.round(previous.col + (col - previous.col) * step / steps);
    const nextRow = Math.round(previous.row + (row - previous.row) * step / steps);
    const key = `${nextCol},${nextRow}`;
    if (pointer?.lastKey === key) continue;
    if (pointer) pointer.lastKey = key;
    const zone = zoneAt(nextCol, nextRow);
    if (zone && asset?.allowedZones?.length && !asset.allowedZones.includes(zone.type)) continue;
    const existing = scene.placements.find((item) => item.layer === activeLayer && Math.round(item.position.col) === nextCol && Math.round(item.position.row) === nextRow);
    if (existing) {
      if (existing.assetId !== activeAssetId) {
        existing.assetId = activeAssetId;
        existing.rotation = Math.abs(col - previous.col) >= Math.abs(row - previous.row) ? 0 : 90;
        changed = true;
      }
    } else if (asset) {
      scene.placements.push({
        id: `place-${crypto.randomUUID()}`, assetId: activeAssetId, layer: activeLayer,
        position: {col: nextCol, row: nextRow},
        rotation: Math.abs(col - previous.col) >= Math.abs(row - previous.row) ? 0 : 90,
        footprint: asset.footprint,
        properties: {autoTileGroup: `brush-${activeLayer}`, tileKind: activeLayer === 'terrain' ? 'pasture' : undefined, autotile: true},
      });
      changed = true;
    }
  }
  if (pointer) pointer.lastCell = {col, row};
  if (!changed) return;
  autotileScene();
  renderPixiScene();
  renderComparison();
  setSaveState('Alterações pendentes', true);
}

function handleStageMove(event) {
  const point = localPoint(event);
  $('cursor-coordinates').textContent = `c ${point.snappedCol} · r ${point.snappedRow}`;
  if (!pointer) return;
  const deltaX = event.clientX - pointer.startX;
  const deltaY = event.clientY - pointer.startY;
  if (Math.hypot(deltaX, deltaY) > 3) pointer.moved = true;
  if (pointer.pan) {
    pan = {x: pointer.originPan.x + deltaX, y: pointer.originPan.y + deltaY};
    updateCamera();
    return;
  }
  if (pointer.painting && point.inside) {
    paintCell(point.snappedCol, point.snappedRow);
    return;
  }
  if (!pointer.moving || !selectedId || !point.inside) return;
  const instance = scene.prefabInstances.find((item) => item.id === selectedId);
  if (instance) {
    const prefab = prefabLibrary.find((item) => item.id === instance.prefabId);
    instance.col = clamp(Math.round(point.col), 0, scene.grid.width - (prefab?.footprint[0] ?? 1));
    instance.row = clamp(Math.round(point.row), 0, scene.grid.height - (prefab?.footprint[1] ?? 1));
    spriteTargets.filter((target) => target.parentInstanceId === selectedId).forEach(updateTargetPosition);
  } else {
    const placement = scene.placements.find((item) => item.id === selectedId);
    if (!placement) return;
    placement.position = {col: clamp(Math.round(point.col * 4) / 4, 0, scene.grid.width - 1), row: clamp(Math.round(point.row * 4) / 4, 0, scene.grid.height - 1)};
    updateTargetPosition(spriteByTargetId.get(selectedId));
  }
  const layer = layerViews.get(instance ? prefabLibrary.find((item) => item.id === instance.prefabId)?.placements[0]?.layer : scene.placements.find((item) => item.id === selectedId)?.layer);
  layer?.sortChildren();
  updateSelectionGraphic();
  app?.render();
  renderFallback();
  renderComparison();
  populateInspector();
}

function handleStageUp() {
  if (pointer?.moved && pointer.moving && dragSnapshot && JSON.stringify(scene) !== dragSnapshot) {
    pushHistory();
    setSaveState('Alterações pendentes', true);
    updateHeader();
  }
  if (pointer?.painting) {
    pushHistory();
    updateHeader();
  }
  pointer = null;
  dragSnapshot = null;
}

function rotateSelection() {
  if (!selectedId) return;
  const instance = scene.prefabInstances.find((item) => item.id === selectedId);
  const target = spriteByTargetId.get(selectedId);
  const item = instance ?? target?.placement;
  if (!item) return;
  const asset = assetById.get(item.assetId ?? target?.placement.assetId);
  const prefab = instance && prefabLibrary.find((entry) => entry.id === instance.prefabId);
  const rotationModes = instance ? prefab?.rotationModes : asset?.rotationModes;
  if (!rotationModes?.includes(((item.rotation ?? 0) + 90) % 360)) { showToast('Este sprite não possui uma variante rotacionada compatível.'); return; }
  if (!instance && asset?.defaultLayer === 'terrain') { showToast('Tiles de terreno mantêm o alinhamento da grade'); return; }
  item.rotation = ((item.rotation ?? 0) + 90) % 360;
  if (instance) spriteTargets.filter((entry) => entry.parentInstanceId === selectedId).forEach(updateTargetPosition);
  else updateTargetPosition(target);
  pushHistory();
  updateSelectionGraphic();
  populateInspector();
  app?.render();
  renderFallback();
  renderComparison();
  setSaveState('Alterações pendentes', true);
}

function paintLayerInspector() {
  const select = $('placement-layer');
  select.addEventListener('change', () => {
    const target = spriteByTargetId.get(selectedId);
    if (!target) return;
    target.placement.layer = select.value;
    pushHistory();
    renderPixiScene();
    populateInspector();
    setSaveState('Alterações pendentes', true);
  });
  $('position-col').addEventListener('change', syncPlacementFromInspector);
  $('position-row').addEventListener('change', syncPlacementFromInspector);
  $('rotation').addEventListener('change', syncPlacementFromInspector);
  $('zone-select').addEventListener('change', () => {
    const target = spriteByTargetId.get(selectedId);
    const instance = scene.prefabInstances.find((item) => item.id === selectedId);
    if (target) target.placement.zoneId = $('zone-select').value || undefined;
    if (instance) instance.zoneId = $('zone-select').value || undefined;
    pushHistory();
    setSaveState('Alterações pendentes', true);
  });
}

function rebuildEditor() {
  if (rendererMode === 'pixi') renderPixiScene();
  else renderFallback();
  drawLayerList();
  drawZoneLegend();
  populateInspector();
  makePalette();
  updateHeader();
}

function autotileScene() {
  const map = new Map();
  for (const item of scene.placements.filter((placement) => placement.layer === 'roads')) {
    map.set(`${Math.round(item.position.col)},${Math.round(item.position.row)}`, item);
  }
  const has = (col, row) => map.has(`${col},${row}`);
  for (const item of map.values()) {
    const col = Math.round(item.position.col);
    const row = Math.round(item.position.row);
    const horizontal = has(col - 1, row) || has(col + 1, row);
    const vertical = has(col, row - 1) || has(col, row + 1);
    const turn = horizontal && vertical;
    if (turn) item.assetId = 'road-turn';
    else item.assetId = 'road-straight';
    item.rotation = vertical && !horizontal ? 90 : 0;
    item.properties = {...item.properties, autoTileMask: [has(col - 1, row), has(col, row - 1), has(col + 1, row), has(col, row + 1)].map(Number).join('')};
  }
  const fenceMap = new Map();
  for (const item of scene.placements.filter((placement) => placement.layer === 'fences')) {
    fenceMap.set(`${Math.round(item.position.col)},${Math.round(item.position.row)}`, item);
  }
  const hasFence = (col, row) => fenceMap.has(`${col},${row}`);
  for (const item of fenceMap.values()) {
    const col = Math.round(item.position.col); const row = Math.round(item.position.row);
    const horizontal = hasFence(col - 1, row) || hasFence(col + 1, row);
    const vertical = hasFence(col, row - 1) || hasFence(col, row + 1);
    if (horizontal || vertical) item.rotation = vertical && !horizontal ? 90 : item.properties?.connector === 'row' && !horizontal ? 90 : 0;
    item.properties = {...item.properties, autoTileMask: [hasFence(col - 1, row), hasFence(col, row - 1), hasFence(col + 1, row), hasFence(col, row + 1)].map(Number).join('')};
  }
  // Terrain variants change only inside the same connected ground family; 2px art bleed closes alpha seams.
  const terrain = scene.placements.filter((item) => item.layer === 'terrain' && item.properties?.autoTileGroup === 'pasture-main');
  for (const item of terrain) {
    const col = Math.round(item.position.col); const row = Math.round(item.position.row);
    const pattern = Math.sin((col - 2) * 0.37 + (row + 1) * 0.16) + Math.cos((row + 3) * 0.48 - col * 0.12);
    item.assetId = pattern > 0.52 ? 'grass-light' : 'grass-mid';
    item.properties = {...item.properties, transitionMask: `${col % 2}${row % 2}`};
  }
}

function createZoneSelect() {
  const select = $('zone-select');
  select.replaceChildren(new Option('Sem zona', ''), ...scene.zones.map((zone) => new Option(zone.name, zone.id)));
}

function finishZone() {
  if (zoneDraft.length < 3) { showToast('Marque ao menos três pontos para fechar a zona.'); return; }
  const type = prompt('Tipo da zona: pasture, handling, dairy, service, tech ou support', 'pasture')?.trim().toLowerCase();
  if (!type) return;
  if (!Object.hasOwn(ZONE_LABELS, type)) { showToast('Tipo de zona desconhecido.'); return; }
  const name = prompt('Nome da zona', `${ZONE_LABELS[type]} ${scene.zones.length + 1}`)?.trim();
  if (!name) return;
  const palette = {pasture: '#78a75b', handling: '#a5825d', dairy: '#c78e54', service: '#89958b', tech: '#619399', support: '#a3a16b'};
  scene.zones.push({id: `zone-${crypto.randomUUID()}`, type, name, polygon: zoneDraft.map((point) => ({...point})), color: palette[type]});
  zoneDraft = [];
  selectTool('select');
  drawZoneLegend();
  createZoneSelect();
  refreshZoneGraphic();
  pushHistory();
  updateHeader();
  setSaveState('Alterações pendentes', true);
  showToast(`Zona ${name} adicionada.`);
}

function cancelZoneDraft() {
  zoneDraft = [];
  if (activeTool === 'zone') selectTool('select');
  refreshZoneGraphic();
}

function validateScene(candidate) {
  const errors = [];
  if (!candidate || candidate.schemaVersion !== 1 || !candidate.grid || !Array.isArray(candidate.placements)) errors.push('O arquivo não corresponde ao schema Riose Scene v1.');
  if (!Array.isArray(candidate.layers) || !Array.isArray(candidate.zones) || !Array.isArray(candidate.prefabInstances)) errors.push('A cena precisa conter layers, zones e prefabInstances.');
  if (candidate.grid?.projection !== 'isometric-2-to-1') errors.push('A projeção precisa ser isometric-2-to-1.');
  for (const diagnostic of validateFarmLayout(candidate, {
    prefabs: prefabLibrary,
    manifest,
    constraints: candidate.generation?.constraints ?? [],
  })) if (diagnostic.severity === 'error') errors.push(diagnostic.message);
  const assetIds = new Set(manifest.assets.map((asset) => asset.id));
  const unknown = [...new Set((candidate.placements ?? []).map((item) => item.assetId).filter((id) => !assetIds.has(id)))];
  if (unknown.length) errors.push(`Assets ausentes no manifesto: ${unknown.slice(0, 6).join(', ')}`);
  const prefabIds = new Set(prefabLibrary.map((prefab) => prefab.id));
  const missingPrefabs = [...new Set((candidate.prefabInstances ?? []).map((item) => item.prefabId).filter((id) => !prefabIds.has(id)))];
  if (missingPrefabs.length) errors.push(`Prefabs desconhecidos: ${missingPrefabs.join(', ')}`);
  for (const layer of candidate.layers ?? []) if (!layerNames.has(layer.id)) errors.push(`Camada desconhecida: ${layer.id}`);
  if (Array.isArray(candidate.visualGroups)) {
    const groupIds = new Set(candidate.visualGroups.map((group) => group.id));
    const visualIds = new Set();
    for (const group of candidate.visualGroups) {
      if (!candidate.zones.some((zone) => zone.id === group.zoneId)) errors.push(`Zona ausente no lote visual ${group.id}.`);
      if (group.visualIds.length > group.maxSprites) errors.push(`O lote ${group.id} excede o orçamento de sprites.`);
      if (group.visualIds.some((id) => visualIds.has(id))) errors.push(`Visual ID repetido no lote ${group.id}.`);
      group.visualIds.forEach((id) => visualIds.add(id));
    }
    const population = candidate.visualGroups.reduce((sum, group) => sum + group.population, 0);
    if (Number.isInteger(candidate.metadata?.animalCount) && population !== candidate.metadata.animalCount) errors.push('A população dos lotes visuais não corresponde ao total do cenário.');
    const visualPlacements = [...candidate.placements, ...expandedPrefabPlacementsFor(candidate, prefabLibrary)].filter((item) => item.layer === 'animals');
    if (Number.isInteger(candidate.metadata?.visualBudget) && visualPlacements.length > candidate.metadata.visualBudget) errors.push('A cena ultrapassa seu orçamento visual de animais.');
    if (Number.isInteger(candidate.metadata?.visibleAnimalCount) && visualPlacements.length !== candidate.metadata.visibleAnimalCount) errors.push('A contagem de animais visíveis não corresponde aos placements.');
    for (const item of visualPlacements) {
      const props = item.properties ?? {};
      if (props.sourceKind === 'lot-representative' && (!groupIds.has(props.groupId) || !visualIds.has(props.visualId))) errors.push(`Sprite representativo sem lote/visual ID válido: ${item.id}.`);
      if (props.sourceKind === 'lot-representative' && props.animalId) errors.push(`Sprite de grupo não pode alegar identidade individual: ${item.id}.`);
    }
  }
  return errors;
}

function expandedPrefabPlacementsFor(candidate, prefabs) {
  const result = [];
  for (const instance of candidate.prefabInstances ?? []) {
    const prefab = prefabs.find((item) => item.id === instance.prefabId);
    for (const [index, child] of (prefab?.placements ?? []).entries()) result.push({id: `${instance.id}::${index}`, assetId: child.assetId, layer: child.layer, properties: child.properties ?? {}});
  }
  return result;
}

async function saveScene() {
  autotileScene();
  const errors = validateScene(scene);
  if (errors.length) { showToast(errors[0]); return; }
  const text = `${JSON.stringify(scene, null, 2)}\n`;
  try { localStorage.setItem(`${storeKey}:${scene.metadata.id}`, text); localStorage.setItem(activeSceneKey, scene.metadata.id); localStorage.setItem(storeKey, text); } catch { showToast('Não foi possível atualizar o armazenamento local.'); }
  const blob = new Blob([text], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${scene.metadata.id}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setSaveState('Cena salva', false);
  showToast(`${scene.placements.length} placements · ${scene.prefabInstances.length} módulos · JSON salvo`);
}

async function openSceneFile(file) {
  try {
    const candidate = JSON.parse(await file.text());
    const errors = validateScene(candidate);
    if (errors.length) { showToast(errors[0]); return; }
    scene = candidate;
    selectedId = null;
    pushHistory();
    rebuildEditor();
    fitScene();
    persistSceneDraft();
    const preset = $('scene-preset');
    preset.value = candidate.metadata.id === 'riose-beef-composer-v1' ? 'beef' : candidate.metadata.id === 'riose-dairy-composer-v1' ? 'dairy' : 'custom';
    setSaveState('Cena aberta', false);
  } catch {
    showToast('O arquivo JSON não pôde ser aberto.');
  }
}

async function regenerateScene() {
  scene = generateFarmLayout({
    scenarioType: scene.metadata.scenarioType === 'beef' ? 'beef' : 'dairy',
    seed: scene.metadata.seed,
    prefabs: prefabLibrary,
    manifest,
  });
  selectedId = null;
  pushHistory();
  rebuildEditor();
  fitScene();
  persistSceneDraft();
  setSaveState('Composição regenerada', true);
  showToast('Layout regenerado a partir da seed e das regras espaciais.');
}

async function setupPixi() {
  app = new Application();
  await app.init({
    resizeTo: stageElement,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
    powerPreference: 'high-performance',
    hello: false,
  });
  app.canvas.setAttribute('aria-label', 'Fazenda isométrica Riose, editor PixiJS 8');
  pixiHost.appendChild(app.canvas);
  const world = new Container({label: 'riose-world'});
  world.sortableChildren = false;
  app.stage.addChild(world);
  zoneView = new Graphics({label: 'zone-overlay'});
  world.addChild(zoneView);
  selectionView = new Graphics({label: 'selection-overlay'});
  world.addChild(selectionView);
  app.ticker.add(() => {
    const time = performance.now();
    if (lastFrameAt) {
      frameTimes.push(time - lastFrameAt);
      if (frameTimes.length > 120) frameTimes.shift();
      if (frameTimes.length >= 30) fps = Math.round(1000 / (frameTimes.reduce((sum, item) => sum + item, 0) / frameTimes.length));
    }
    lastFrameAt = time;
    if (time - lastStatsUpdate > 1200) {
      lastStatsUpdate = time;
      updateHeader();
    }
    if (time - lastCullAt > 300) {
      lastCullAt = time;
      updateCulling();
    }
  });
  rendererMode = 'pixi';
  $('renderer-status').innerHTML = '<i></i> PixiJS 8 · WebGL';
  $('renderer-status').classList.remove('error');
  fallbackCanvas.hidden = true;
}

async function loadAssets() {
  const atlases = Object.entries(manifest.atlases);
  let loaded = 0;
  for (const [id, info] of atlases) {
    try {
      const texture = await Assets.load(info.image);
      atlasTextures.set(id, texture);
      const image = texture.source.resource;
      if (image instanceof HTMLImageElement || image instanceof ImageBitmap) canvasAtlasImages.set(id, image);
      else if (image?.canvas) canvasAtlasImages.set(id, image.canvas);
      loaded++;
    } catch (error) {
      console.error(`Atlas ${id} failed`, error);
    }
  }
  return loaded;
}

async function loadEditor() {
  const [manifestResponse, prefabsResponse, dairyResponse, beefResponse] = await Promise.all([
    fetch(URLS.manifest), fetch(URLS.prefabs), fetch(URLS.dairy), fetch(URLS.beef),
  ]);
  if (![manifestResponse, prefabsResponse, dairyResponse, beefResponse].every((response) => response.ok)) throw new Error('asset library did not load');
  const [loadedManifest, loadedPrefabs, dairyScene, beefScene] = await Promise.all([
    manifestResponse.json(), prefabsResponse.json(), dairyResponse.json(), beefResponse.json(),
  ]);
  manifest = loadedManifest;
  prefabLibrary = loadedPrefabs.prefabs;
  loadedScenes = {
    dairy: generateFarmLayout({scenarioType: 'dairy', seed: dairyScene.metadata.seed, prefabs: prefabLibrary, manifest}),
    beef: generateFarmLayout({scenarioType: 'beef', seed: beefScene.metadata.seed, prefabs: prefabLibrary, manifest}),
  };
  const activeId = localStorage.getItem(activeSceneKey);
  const preset = activeId === 'riose-beef-composer-v1' ? 'beef' : activeId === 'riose-dairy-composer-v1' ? 'dairy' : activeId ? 'custom' : 'dairy';
  $('scene-preset').value = preset;
  let customScene;
  if (preset === 'custom') {
    try { customScene = JSON.parse(localStorage.getItem(`${storeKey}:${activeId}`) ?? 'null'); } catch {}
    if (!customScene) $('scene-preset').value = 'dairy';
  }
  loadedScene = preset === 'custom' && customScene ? customScene : loadedScenes[preset === 'custom' ? 'dairy' : preset];
  assetById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const errors = validateScene(loadedScene);
  if (errors.length) throw new Error(errors[0]);
  let saved;
  try { saved = preset === 'custom' ? customScene : JSON.parse(localStorage.getItem(`${storeKey}:${loadedScene.metadata.id}`) ?? (preset === 'dairy' ? localStorage.getItem(storeKey) : 'null') ?? 'null'); } catch {}
  scene = saved && validateScene(saved).length === 0 ? saved : loadedScene;
  history = [JSON.stringify(scene)];
  historyIndex = 0;
  const atlasCount = await loadAssets();
  atlasMemoryMB = (atlasTextures.size
    ? [...atlasTextures.values()].reduce((sum, texture) => sum + texture.source.width * texture.source.height * 4, 0) / (1024 * 1024)
    : 0).toFixed(1);
  $('metric-atlases').textContent = atlasCount;
  makePalette();
  drawLayerList();
  drawZoneLegend();
  createZoneSelect();
  try { await setupPixi(); } catch (error) {
    console.error('PixiJS initialization failed; switching to the Canvas2D adapter.', error);
    rendererMode = 'canvas';
    pixiHost.hidden = true;
    fallbackCanvas.hidden = false;
    $('renderer-status').innerHTML = '<i></i> Canvas 2D · fallback';
    $('renderer-status').classList.add('error');
  }
  renderPixiScene();
  fitScene();
  populateInspector();
  updateHeader();
  renderComparison();
  if (rendererMode === 'pixi') {
    const estimate = atlasTextures.size
      ? [...atlasTextures.values()].reduce((sum, texture) => sum + texture.source.width * texture.source.height * 4, 0)
      : 0;
    const mb = (estimate / (1024 * 1024)).toFixed(1);
    $('renderer-status').title = `${atlasTextures.size} atlas textures · ${mb} MB RGBA nominal na GPU`;
  }
}

for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => selectTool(button.dataset.tool));
stageElement.addEventListener('pointerdown', handleStageDown);
stageElement.addEventListener('pointermove', handleStageMove);
stageElement.addEventListener('pointerup', handleStageUp);
stageElement.addEventListener('pointercancel', handleStageUp);
stageElement.addEventListener('wheel', (event) => {
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  const bounds = stageElement.getBoundingClientRect();
  const cursor = {x: event.clientX - bounds.left, y: event.clientY - bounds.top};
  const next = clamp(zoom * factor, 0.18, 1.4);
  const ratio = next / zoom;
  pan = {x: cursor.x - (cursor.x - pan.x) * ratio, y: cursor.y - (cursor.y - pan.y) * ratio};
  zoom = next;
  updateCamera();
  updateZoomLabel();
}, {passive: false});

$('open-scene').addEventListener('click', () => $('scene-file').click());
$('scene-preset').addEventListener('change', async (event) => {
  const key = event.target.value;
  if (key === 'custom') return;
  const source = loadedScenes[key];
  if (!source) return;
  const saved = (() => { try { return JSON.parse(localStorage.getItem(`${storeKey}:${source.metadata.id}`) ?? 'null'); } catch { return null; } })();
  scene = saved && validateScene(saved).length === 0 ? saved : deepClone(source);
  persistSceneDraft();
  history = [JSON.stringify(scene)]; historyIndex = 0; selectedId = null;
  drawZoneLegend(); createZoneSelect(); rebuildEditor(); fitScene(); populateInspector(); updateHeader(); renderComparison();
  setSaveState('Cena carregada', false);
});
$('scene-file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) openSceneFile(file);
  event.target.value = '';
});
$('save-scene').addEventListener('click', saveScene);
$('fit-scene').addEventListener('click', () => fitScene());
$('zoom-in').addEventListener('click', () => { zoom = clamp(zoom * 1.18, 0.18, 1.4); updateCamera(); updateZoomLabel(); });
$('zoom-out').addEventListener('click', () => { zoom = clamp(zoom / 1.18, 0.18, 1.4); updateCamera(); updateZoomLabel(); });
$('toggle-zones').addEventListener('click', () => {
  zonesVisible = !zonesVisible;
  $('toggle-zones').innerHTML = zonesVisible ? 'Zonas visíveis <span>●</span>' : 'Zonas ocultas <span>○</span>';
  refreshZoneGraphic();
  updateCamera();
});
$('finish-zone').addEventListener('click', () => {
  if (activeTool !== 'zone') { zoneDraft = []; selectTool('zone'); showToast('Clique nos vértices no mapa; use Finalizar zona para fechar.'); }
  else finishZone();
});
$('delete-selection').addEventListener('click', removeSelection);
$('duplicate').addEventListener('click', duplicateSelection);
$('regenerate').addEventListener('click', regenerateScene);
$('asset-search').addEventListener('input', makePalette);
paintLayerInspector();

window.addEventListener('resize', () => {
  updateCamera();
  if (rendererMode === 'pixi') app?.renderer.resize(stageElement.clientWidth, stageElement.clientHeight);
  renderComparison();
});
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveScene(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); restoreHistory(historyIndex - 1); }
  else if (event.key.toLowerCase() === 'r') rotateSelection();
  else if (event.key.toLowerCase() === 'v') selectTool('select');
  else if (event.key.toLowerCase() === 'p') selectTool('place');
  else if (event.key.toLowerCase() === 'b') selectTool('paint');
  else if (event.key.toLowerCase() === 'e') selectTool('erase');
  else if (event.key.toLowerCase() === 'z') { zoneDraft = []; selectTool('zone'); }
  else if (event.key === 'Delete' || event.key === 'Backspace') removeSelection();
  else if (event.key === 'Escape') { if (zoneDraft.length) cancelZoneDraft(); else { selectedId = null; populateInspector(); updateSelectionGraphic(); } }
});

loadEditor().catch((error) => {
  console.error('Scenario Composer failed to initialize', error);
  $('renderer-status').textContent = 'Falha ao abrir a cena';
  $('renderer-status').classList.add('error');
  showToast(error.message || 'Não foi possível abrir o Composer.');
});
