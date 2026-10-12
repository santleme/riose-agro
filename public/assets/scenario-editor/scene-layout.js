export const DEFAULT_LAYERS = [
  'terrain', 'roads', 'pasture', 'water', 'fences', 'buildings',
  'handling', 'technology', 'animals', 'overlays',
];

const hash = (seed, x, y) => {
  let value = Math.imul(seed ^ Math.imul(x + 31, 0x45d9f3b), 0x45d9f3b);
  value = Math.imul(value ^ Math.imul(y + 17, 0x119de1f3), 0x119de1f3);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
};

const placement = (assetId, col, row, layer, properties = {}, rotation = 0) => ({
  id: `${layer}-${assetId}-${col}-${row}-${Math.round(hash(91, col, row) * 1e6)}`,
  assetId,
  layer,
  position: {col, row},
  rotation,
  properties,
});

function addFenceRun(items, startCol, startRow, length, axis, prefix) {
  for (let index = 0; index < length; index++) {
    const col = startCol + (axis === 'col' ? index : 0);
    const row = startRow + (axis === 'row' ? index : 0);
    items.push(placement('fence-wire-wood-post-imagegen-v1', col, row, 'fences', {
      autoTileGroup: prefix,
      connector: axis,
    }, axis === 'row' ? 90 : 0));
  }
}

/** Deterministic, rule-based starter farm. Every object remains an editable placement. */
export function createDairyFarmScene(prefabs, seed = 20261012) {
  const width = 36;
  const height = 24;
  const placements = [];

  // Continuous pasture with broad tonal patches; pads and tracks use matching atlas tiles.
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const servicePad = col >= 24 && col <= 34 && row >= 13 && row <= 20;
      const roadLine = row === 11 || (col === 19 && row >= 3 && row <= 20);
      const assetId = servicePad ? 'soil-dry'
        : roadLine ? 'soil-dry'
          : (Math.sin(col * 0.37 + row * 0.16) + Math.cos(row * 0.48 - col * 0.12) > 0.52
            ? 'grass-light' : 'grass-mid');
      placements.push(placement(assetId, col, row, 'terrain', {
        autoTileGroup: servicePad ? 'service-yard' : 'pasture-main',
        tileKind: servicePad ? 'yard' : 'pasture',
        autotile: true,
      }));
    }
  }

  // A readable central lane with a service spur. Neighbour masks orient straight and corner pieces.
  for (let col = 1; col < 35; col++) {
    if (col === 19) continue;
    placements.push(placement('road-straight', col, 11, 'roads', {autoTileGroup: 'farm-access', road: true}));
  }
  for (let row = 3; row <= 20; row++) {
    if (row === 11) continue;
    placements.push(placement('road-straight', 19, row, 'roads', {autoTileGroup: 'farm-access', road: true}, 90));
  }
  placements.push(placement('road-turn', 19, 11, 'roads', {autoTileGroup: 'farm-access', road: true}, 90));

  // Four paddocks form a serviceable rotation; repeated fence runs connect at corners.
  const paddocks = [
    {id: 'paddock-nw', x: 1, y: 1, w: 8, h: 8},
    {id: 'paddock-ne', x: 10, y: 1, w: 8, h: 8},
    {id: 'paddock-sw', x: 1, y: 13, w: 8, h: 8},
    {id: 'paddock-se', x: 10, y: 13, w: 8, h: 8},
  ];
  for (const paddock of paddocks) {
    addFenceRun(placements, paddock.x, paddock.y, paddock.w, 'col', paddock.id);
    addFenceRun(placements, paddock.x, paddock.y + paddock.h, paddock.w, 'col', paddock.id);
    addFenceRun(placements, paddock.x, paddock.y, paddock.h, 'row', paddock.id);
    addFenceRun(placements, paddock.x + paddock.w, paddock.y, paddock.h, 'row', paddock.id);
    placements.push(placement('fence-gate-wood-imagegen-v1', paddock.x + paddock.w - 1, paddock.y + 2, 'fences', {
      paddockId: paddock.id,
      opening: true,
    }, 90));
  }

  // Shade, water, and operational details use image assets from the current atlas manifests.
  const trees = [
    [1, 1], [8, 1], [17, 2], [2, 10], [9, 11], [3, 22], [11, 22], [16, 21],
    [22, 5], [24, 5], [35, 4], [35, 20], [16, 22], [1, 13], [8, 13], [17, 13],
  ];
  trees.forEach(([col, row], index) => placements.push(placement(
    index % 3 === 0 ? 'vegetation-tree-shade-imagegen-v1' : index % 3 === 1 ? 'shade-tree' : 'shrub',
    col, row, 'pasture', {variant: index % 3, shade: true},
  )));
  placements.push(placement('water-pond-imagegen-v1', 4, 11, 'water', {waterState: 'seasonal'}));
  placements.push(placement('feed-trough-hay-imagegen-v1', 12, 10, 'handling', {capacity: 'large'}));
  placements.push(placement('feed-salt-roofed-imagegen-v1', 15, 16, 'handling', {state: 'stocked'}));
  placements.push(placement('vehicle-tractor-imagegen-v1', 17, 12, 'buildings', {parked: true}));
  placements.push(placement('vehicle-pickup-rural-imagegen-v1', 29, 9, 'buildings', {parked: true}));
  placements.push(placement('building-workshop-imagegen-v1', 32, 8, 'buildings', {role: 'machine-shop'}));
  placements.push(placement('technology-traceability-system-imagegen-v1', 33, 5, 'technology', {connectedTo: 'gateway'}));

  // Four functional modules, stored as prefab instances and expanded by either renderer.
  const prefabInstances = [
    {id: 'module-dairy-milking', prefabId: 'dairy-milking-base', col: 25, row: 13, rotation: 0},
    {id: 'module-farmstead', prefabId: 'farmstead', col: 27, row: 2, rotation: 0},
    {id: 'module-corral-weighing', prefabId: 'corral-scale', col: 19, row: 17, rotation: 0},
    {id: 'module-feed', prefabId: 'supplement-area', col: 11, row: 9, rotation: 0},
    {id: 'module-network', prefabId: 'gateway-antenna', col: 20, row: 7, rotation: 0},
    {id: 'module-calf-unit', prefabId: 'dairy-calf-unit', col: 20, row: 2, rotation: 0},
    ...paddocks.map((paddock) => ({id: `module-water-${paddock.id}`, prefabId: 'water-point', col: paddock.x + paddock.w - 2, row: paddock.y + paddock.h - 2, rotation: 0})),
  ];

  // The science herd is 200; the diorama samples 12 representative, non-identified sprites.
  const dairySamples = [
    [3, 3], [6, 6], [14, 3], [11, 6], [3, 16], [6, 19],
    [14, 16], [11, 19], [22, 15], [24, 17], [27, 18], [29, 16],
  ];
  dairySamples.forEach(([col, row], index) => {
      const zoneId = index < 4 ? 'zone-pasture-north' : index < 8 ? 'zone-pasture-south' : 'zone-dairy';
      const groupId = index < 4 ? 'dairy-north-lot' : index < 8 ? 'dairy-south-lot' : 'dairy-operations-lot';
    const breed = hash(seed, index, 3) < 0.62 ? 'dairy-holstein-cow' : 'dairy-girolando-cow';
    placements.push(placement(breed, col + (hash(seed, index, 1) - 0.5) * 0.22, row + (hash(seed, index, 2) - 0.5) * 0.18, 'animals', {
      groupId, zoneId, visualId: `dairy-visual-${String(index + 1).padStart(2, '0')}`,
      representationMode: index < 6 ? 'sampled-miniature' : 'operational',
      sourceKind: 'lot-representative',
      visualState: index === 10 ? 'waiting' : index % 4 === 0 ? 'resting' : 'grazing',
      visualScale: 0.84 + hash(seed, index, 5) * 0.12,
    }));
  });

  return {
    schemaVersion: 1,
    metadata: {
      id: 'riose-dairy-composer-v1',
      scenarioType: 'dairy',
      name: 'Fazenda Leiteira Horizonte',
      description: 'Diorama leiteiro brasileiro: 200 animais no sistema e 14 sprites representativos, com ordenha, curral de espera, sede e monitoramento.',
      seed,
      author: 'Riose Scenario Composer',
      createdAt: '2026-10-12',
      animalCount: 200,
      herdLabel: 'vacas leiteiras',
      visualBudget: 15,
      visibleAnimalCount: 14,
    },
    grid: {
      width,
      height,
      tileWidth: 96,
      tileHeight: 48,
      projection: 'isometric-2-to-1',
      origin: {x: 0, y: 0},
    },
    layers: DEFAULT_LAYERS.map((id, order) => ({id, order, visible: true, locked: id === 'terrain'})),
    placements,
    visualGroups: [
      {id: 'dairy-north-lot', population: 90, zoneId: 'zone-pasture-north', operationalState: 'grazing', maxSprites: 4, mode: 'sampled-miniature', seed, visualIds: ['dairy-visual-01', 'dairy-visual-02', 'dairy-visual-03', 'dairy-visual-04']},
      {id: 'dairy-south-lot', population: 90, zoneId: 'zone-pasture-south', operationalState: 'grazing', maxSprites: 4, mode: 'sampled-miniature', seed, visualIds: ['dairy-visual-05', 'dairy-visual-06', 'dairy-visual-07', 'dairy-visual-08']},
      {id: 'dairy-operations-lot', population: 10, zoneId: 'zone-dairy', operationalState: 'milking-rotation', maxSprites: 6, mode: 'operational', seed, visualIds: ['dairy-visual-09', 'dairy-visual-10', 'dairy-visual-11', 'dairy-visual-12']},
      {id: 'dairy-calf-lot', population: 10, zoneId: 'zone-service', operationalState: 'resting', maxSprites: 2, mode: 'sampled-miniature', seed, visualIds: ['dairy-calf-visual-01', 'dairy-calf-visual-02']},
    ],
    zones: [
      {id: 'zone-pasture-north', type: 'pasture', name: 'Piquetes Norte', polygon: [{col: 1, row: 1}, {col: 18, row: 1}, {col: 18, row: 10}, {col: 1, row: 10}], color: '#78a75b'},
      {id: 'zone-pasture-south', type: 'pasture', name: 'Piquetes Sul', polygon: [{col: 1, row: 13}, {col: 18, row: 13}, {col: 18, row: 22}, {col: 1, row: 22}], color: '#83aa63'},
      {id: 'zone-dairy', type: 'dairy', name: 'Ordenha e leite', polygon: [{col: 20, row: 12}, {col: 35, row: 12}, {col: 35, row: 22}, {col: 20, row: 22}], color: '#c78e54'},
      {id: 'zone-handling', type: 'handling', name: 'Manejo e espera', polygon: [{col: 19, row: 16}, {col: 26, row: 16}, {col: 26, row: 22}, {col: 19, row: 22}], color: '#a5825d'},
      {id: 'zone-service', type: 'service', name: 'Sede e apoio', polygon: [{col: 20, row: 1}, {col: 35, row: 1}, {col: 35, row: 9}, {col: 20, row: 9}], color: '#89958b'},
      {id: 'zone-tech', type: 'tech', name: 'Monitoramento', polygon: [{col: 30, row: 5}, {col: 35, row: 5}, {col: 35, row: 10}, {col: 30, row: 10}], color: '#619399'},
      {id: 'zone-support', type: 'support', name: 'Logística e trato', polygon: [{col: 9, row: 8}, {col: 20, row: 8}, {col: 20, row: 13}, {col: 9, row: 13}], color: '#a3a16b'},
    ],
    prefabInstances,
    autoTile: {
      enabled: true,
      rules: ['pasture-neighbor-variation', 'road-connectivity', 'fence-connectivity', 'soft-overlap-2px'],
    },
  };
}

/** Compact beef-farm diorama derived from the same spatial grammar and asset manifest. */
export function createBeefFarmScene(prefabs, seed = 20261012) {
  const scene = createDairyFarmScene(prefabs, seed);
  const retained = new Set([
    'terrain', 'roads', 'fences', 'pasture',
    'water-pond-imagegen-v1', 'feed-trough-hay-imagegen-v1', 'feed-salt-roofed-imagegen-v1',
    'vehicle-tractor-imagegen-v1', 'vehicle-pickup-rural-imagegen-v1',
    'building-workshop-imagegen-v1', 'technology-traceability-system-imagegen-v1',
  ]);
  scene.placements = scene.placements.filter((item) => retained.has(item.layer) || retained.has(item.assetId));
  const paddocks = [
    {id: 'beef-north-west', zoneId: 'zone-pasture-north', x: 2, y: 2},
    {id: 'beef-north-east', zoneId: 'zone-pasture-north', x: 12, y: 2},
    {id: 'beef-south-west', zoneId: 'zone-pasture-south', x: 2, y: 14},
    {id: 'beef-south-east', zoneId: 'zone-pasture-south', x: 12, y: 14},
  ];
  const breeds = [
    'livestock-nelore-cow-idle-imagegen-v1',
    'livestock-nelore-heifer-idle-imagegen-v1',
    'livestock-nelore-calf-idle-imagegen-v1',
  ];
  const visualGroups = [];
  let visualIndex = 0;
  for (const [paddockIndex, paddock] of paddocks.entries()) {
    const visualIds = [];
    for (const [localIndex, offset] of [[2, 2], [5, 5], [6, 2]].entries()) {
      visualIndex++;
      const visualId = `beef-visual-${String(visualIndex).padStart(2, '0')}`;
      visualIds.push(visualId);
      scene.placements.push(placement(breeds[localIndex], paddock.x + offset[0], paddock.y + offset[1], 'animals', {
        groupId: paddock.id,
        zoneId: paddock.zoneId,
        visualId,
        representationMode: 'sampled-miniature',
        sourceKind: 'lot-representative',
        visualState: localIndex === 2 ? 'grazing' : 'idle',
        visualScale: 0.82 + hash(seed, visualIndex, 5) * 0.12,
      }));
    }
    visualGroups.push({id: paddock.id, population: 30, zoneId: paddock.zoneId, operationalState: 'grazing', maxSprites: 3, mode: 'sampled-miniature', seed, visualIds});
  }
  scene.metadata = {
    ...scene.metadata,
    id: 'riose-beef-composer-v1',
    scenarioType: 'beef',
    name: 'Fazenda de Corte Boa Esperança',
    description: 'Diorama de corte brasileiro: lote científico de 120 bovinos representado por 12 sprites amostrais, curral, água, suplementação e rastreabilidade.',
    animalCount: 120,
    herdLabel: 'bovinos de corte',
    visualBudget: 16,
    visibleAnimalCount: 12,
  };
  scene.prefabInstances = [
    {id: 'beef-farmstead', prefabId: 'farmstead', col: 27, row: 2, rotation: 0},
    {id: 'beef-corral-scale', prefabId: 'corral-scale', col: 22, row: 13, rotation: 0},
    {id: 'beef-supplement', prefabId: 'supplement-area', col: 10, row: 10, rotation: 0},
    {id: 'beef-network', prefabId: 'gateway-antenna', col: 29, row: 7, rotation: 0},
    ...paddocks.map((item, index) => ({id: `beef-water-${index + 1}`, prefabId: 'water-point', col: item.x + 5, row: item.y + 5, rotation: 0})),
  ];
  scene.zones = [
    {id: 'zone-pasture-north', type: 'pasture', name: 'Piquetes Norte', polygon: [{col: 1, row: 1}, {col: 18, row: 1}, {col: 18, row: 10}, {col: 1, row: 10}], color: '#78a75b'},
    {id: 'zone-pasture-south', type: 'pasture', name: 'Piquetes Sul', polygon: [{col: 1, row: 13}, {col: 18, row: 13}, {col: 18, row: 22}, {col: 1, row: 22}], color: '#83aa63'},
    {id: 'zone-handling', type: 'handling', name: 'Curral e manejo', polygon: [{col: 20, row: 12}, {col: 28, row: 12}, {col: 28, row: 21}, {col: 20, row: 21}], color: '#a5825d'},
    {id: 'zone-service', type: 'service', name: 'Sede e apoio', polygon: [{col: 27, row: 1}, {col: 35, row: 1}, {col: 35, row: 8}, {col: 27, row: 8}], color: '#89958b'},
    {id: 'zone-tech', type: 'tech', name: 'Monitoramento', polygon: [{col: 28, row: 7}, {col: 35, row: 7}, {col: 35, row: 11}, {col: 28, row: 11}], color: '#619399'},
    {id: 'zone-support', type: 'support', name: 'Suplementação', polygon: [{col: 9, row: 8}, {col: 18, row: 8}, {col: 18, row: 13}, {col: 9, row: 13}], color: '#a3a16b'},
  ];
  scene.visualGroups = visualGroups;
  scene.metadata.visibleAnimalCount = 12;
  return scene;
}

export function projectIso(col, row, grid) {
  return {
    x: (col - row) * grid.tileWidth / 2,
    y: (col + row) * grid.tileHeight / 2,
  };
}

export function unprojectIso(x, y, grid) {
  const px = x / (grid.tileWidth / 2);
  const py = y / (grid.tileHeight / 2);
  return {col: (px + py) / 2, row: (py - px) / 2};
}

/**
 * Build an editable starter layout from the checked-in spatial templates.
 * This deliberately does not call a model or synthesize assets: the seed is
 * consumed only by the existing seeded visual choices, and every reference is
 * traceable to the supplied prefab/asset catalog.
 */
export function generateFarmLayout({
  scenarioType = 'dairy',
  seed = 20261012,
  prefabs = [],
  manifest,
  constraints = [],
} = {}) {
  if (!['beef', 'dairy'].includes(scenarioType)) {
    throw new TypeError(`Unsupported farm scenario: ${scenarioType}`);
  }
  if (!Number.isSafeInteger(seed)) throw new TypeError('Farm layout seed must be a safe integer');
  if (!Array.isArray(prefabs)) throw new TypeError('Farm layout prefabs must be an array');
  if (!Array.isArray(constraints)) throw new TypeError('Farm layout constraints must be an array');
  const scene = scenarioType === 'beef'
    ? createBeefFarmScene(prefabs, seed)
    : createDairyFarmScene(prefabs, seed);
  varyWaterPointStructure(scene, {seed, prefabs, manifest});
  placeConstrainedModules(scene, {seed, prefabs, manifest, constraints});
  const validation = validateFarmLayout(scene, {prefabs, manifest, constraints});
  const errors = validation.filter((item) => item.severity === 'error'
    && !['unresolved-asset', 'unresolved-prefab-asset'].includes(item.code));
  if (errors.length) {
    throw new TypeError(`Generated farm layout is invalid: ${errors.map((item) => `${item.code} at ${item.path}`).join(', ')}`);
  }
  const referencedAssetIds = new Set(scene.placements.map((item) => item.assetId));
  const prefabById = new Map(prefabs.map((item) => [item.id, item]));
  for (const instance of scene.prefabInstances) {
    for (const child of prefabById.get(instance.prefabId)?.placements ?? []) referencedAssetIds.add(child.assetId);
  }
  const assetsById = new Map((manifest?.assets ?? []).map((item) => [item.id, item]));
  scene.generation = {
    generator: 'riose-farm-layout-rules',
    generatorVersion: 2,
    algorithm: 'seeded-spatial-grammar-v2',
    seed,
    scenarioType,
    inputFingerprint: fingerprint({scenarioType, seed, prefabs, manifest: manifest ?? null, constraints}),
    model: {used: false, status: 'not-used'},
    constraints: constraints.map((constraint) => ({...constraint})),
    validation,
    assets: [...referencedAssetIds].sort().map((id) => {
      const asset = assetsById.get(id);
      return {
        id,
        status: asset ? (asset.status ?? asset.reviewStatus ?? 'not-declared') : 'unresolved',
        provenance: asset?.provenance?.kind ?? asset?.sourceKind ?? 'not-declared',
      };
    }),
  };
  return scene;
}

/** Seeded placement of water points makes the farm structure vary while keeping each point in its authored pasture zone. */
function varyWaterPointStructure(scene, {seed, prefabs, manifest}) {
  const prefabById = new Map(prefabs.map((item) => [item.id, item]));
  const waterPoints = scene.prefabInstances.filter((item) => item.prefabId === 'water-point');
  for (const instance of waterPoints) {
    const prefab = prefabById.get(instance.prefabId);
    if (!prefab) continue;
    const originCenter = {col: instance.col + prefab.footprint[0] / 2, row: instance.row + prefab.footprint[1] / 2};
    const zone = (scene.zones ?? []).find((item) => item.type === 'pasture' && pointInPolygon(originCenter, item.polygon));
    if (!zone) continue;
    const candidates = candidateOrigins(scene, prefab, zone, scene.prefabInstances, manifest, prefabById, {exclude: instance.id});
    if (!candidates.length) continue;
    const start = Math.floor(stableSeedUnit(seed, instance.id) * candidates.length);
    const picked = candidates[start];
    instance.col = picked.col;
    instance.row = picked.row;
  }
}

function stableSeedUnit(seed, key) {
  let value = (Number(seed) >>> 0) ^ 0x9e3779b9;
  for (let index = 0; index < key.length; index++) {
    value = Math.imul(value ^ key.charCodeAt(index), 0x45d9f3b);
    value ^= value >>> 16;
  }
  return (value >>> 0) / 4294967296;
}

function candidateOrigins(scene, prefab, zone, allInstances, manifest, prefabById, {exclude = null} = {}) {
  const [width, height] = prefab.footprint;
  const xs = (zone.polygon ?? []).map((point) => point.col), ys = (zone.polygon ?? []).map((point) => point.row);
  if (!xs.length || !ys.length) return [];
  const minX = Math.ceil(Math.min(...xs)), maxX = Math.floor(Math.max(...xs) - width);
  const minY = Math.ceil(Math.min(...ys)), maxY = Math.floor(Math.max(...ys) - height);
  const points = [];
  for (let row = minY; row <= maxY; row++) for (let col = minX; col <= maxX; col++) {
    const candidate = {col, row};
    if (!originFitsZone(candidate, prefab, zone) || !originFitsGrid(candidate, prefab, scene.grid)) continue;
    if (allInstances.some((other) => other.id !== exclude && prefabBoxesOverlap(candidate, prefab, other, prefabById))) continue;
    if (overlapsBlockingPlacement(candidate, prefab, scene, manifest)) continue;
    points.push(candidate);
  }
  return points;
}

function originFitsGrid(origin, prefab, grid) {
  return origin.col >= 0 && origin.row >= 0
    && origin.col + prefab.footprint[0] <= grid.width
    && origin.row + prefab.footprint[1] <= grid.height;
}

function originFitsZone(origin, prefab, zone) {
  if (prefab.zones?.length && !prefab.zones.includes(zone.type)) return false;
  return rectFitsZone(origin, prefab.footprint, zone.polygon);
}

function prefabBoxesOverlap(originA, prefabA, instanceB, prefabById) {
  const prefabB = prefabById?.get(instanceB.prefabId);
  if (!prefabB) return false;
  const [widthA, heightA] = prefabA.footprint, [widthB, heightB] = prefabB.footprint;
  return originA.col < instanceB.col + widthB && originA.col + widthA > instanceB.col
    && originA.row < instanceB.row + heightB && originA.row + heightA > instanceB.row;
}

function overlapsBlockingPlacement(origin, prefab, scene, manifest) {
  const assets = new Map((manifest?.assets ?? []).map((asset) => [asset.id, asset]));
  const [width, height] = prefab.footprint;
  return scene.placements.some((placement) => {
    const asset = assets.get(placement.assetId);
    if (asset?.placementRules?.collision !== true && asset?.collision == null) return false;
    const position = placement.position ?? placement;
    const [otherWidth, otherHeight] = placement.footprint ?? asset?.footprint ?? [1, 1];
    return origin.col < position.col + otherWidth && origin.col + width > position.col
      && origin.row < position.row + otherHeight && origin.row + height > position.row;
  });
}

function placeConstrainedModules(scene, {seed, prefabs, manifest, constraints}) {
  if (!constraints.length) return;
  const prefabById = new Map(prefabs.map((item) => [item.id, item]));
  const instances = scene.prefabInstances;
  const byId = new Map(instances.map((item) => [item.id, item]));
  for (const [index, constraint] of constraints.entries()) {
    if (constraint?.type !== 'must-be-adjacent' || !constraint.first || !constraint.second) continue;
    const first = byId.get(constraint.first), second = byId.get(constraint.second);
    const prefabA = prefabById.get(first?.prefabId), prefabB = prefabById.get(second?.prefabId);
    if (!first || !second || !prefabA || !prefabB || first.id === second.id) continue;
    const candidates = adjacentOrigins(first, prefabA, second, prefabB, scene, prefabById, manifest);
    const valid = candidates.filter((origin) => {
      const previous = {col: second.col, row: second.row};
      second.col = origin.col; second.row = origin.row;
      const okay = instances.filter((item) => item.id !== second.id)
        .every((item) => !prefabBoxesOverlap(origin, prefabB, item, prefabById));
      second.col = previous.col; second.row = previous.row;
      return okay;
    });
    if (!valid.length) continue;
    valid.sort((a, b) => a.row - b.row || a.col - b.col);
    const chosen = valid[Math.floor(stableSeedUnit(seed, `${index}:${constraint.first}:${constraint.second}`) * valid.length)];
    second.col = chosen.col;
    second.row = chosen.row;
  }
}

function adjacentOrigins(first, prefabA, second, prefabB, scene, prefabById, manifest) {
  const [firstW, firstH] = prefabA.footprint, [secondW, secondH] = prefabB.footprint;
  const candidates = [];
  for (let row = first.row - secondH + 1; row < first.row + firstH; row++) {
    candidates.push({col: first.col + firstW, row});
    candidates.push({col: first.col - secondW, row});
  }
  for (let col = first.col - secondW + 1; col < first.col + firstW; col++) {
    candidates.push({col, row: first.row + firstH});
    candidates.push({col, row: first.row - secondH});
  }
  return candidates.filter((origin) => originFitsGrid(origin, prefabB, scene.grid)
    && (scene.zones ?? []).some((zone) => originFitsZone(origin, prefabB, zone))
    && !overlapsBlockingPlacement(origin, prefabB, scene, manifest)
    && !scene.prefabInstances.some((item) => item.id !== first.id && item.id !== second.id
      && prefabBoxesOverlap(origin, prefabB, item, prefabById)));
}

/** Return deterministic, machine-readable layout diagnostics. */
export function validateFarmLayout(scene, {prefabs = [], manifest, constraints = []} = {}) {
  const diagnostics = [];
  const report = (code, message, path, severity = 'error') => diagnostics.push({severity, code, message, path});
  if (!scene?.grid || !Array.isArray(scene.placements) || !Array.isArray(scene.prefabInstances)) {
    return [{severity: 'error', code: 'invalid-scene', message: 'Scene is missing grid, placements or prefabInstances.', path: '$'}];
  }
  const {width, height} = scene.grid;
  const prefabById = new Map(prefabs.map((item) => [item.id, item]));
  const assetById = new Map((manifest?.assets ?? []).map((item) => [item.id, item]));
  const zones = Array.isArray(scene.zones) ? scene.zones : [];
  if (!Array.isArray(scene.zones)) report('invalid-zones', 'Scene zones must be an array.', '$.zones');
  const zoneIds = new Set();
  for (const [index, zone] of zones.entries()) {
    if (!zone?.id || zoneIds.has(zone.id)) report('invalid-zone-id', `Zone ID is missing or duplicated: ${zone?.id ?? '(missing)'}.`, `$.zones[${index}]`);
    if (zone?.id) zoneIds.add(zone.id);
    if (!Array.isArray(zone?.polygon) || zone.polygon.length < 3) {
      report('invalid-zone-polygon', `Zone ${zone?.id ?? index} needs at least three polygon vertices.`, `$.zones[${index}].polygon`);
      continue;
    }
    for (const [pointIndex, point] of zone.polygon.entries()) {
      if (!Number.isFinite(point?.col) || !Number.isFinite(point?.row)
        || point.col < 0 || point.row < 0 || point.col > width || point.row > height) {
        report('zone-out-of-bounds', `Zone ${zone.id} has a vertex outside the ${width}×${height} grid.`, `$.zones[${index}].polygon[${pointIndex}]`);
      }
    }
  }
  const boxes = [];
  const insideGrid = (col, row, footprint) => Number.isFinite(col) && Number.isFinite(row)
    && col >= 0 && row >= 0 && col + footprint[0] <= width && row + footprint[1] <= height;
  const boxFor = (id, col, row, footprint, path, blocking = true) => {
    if (!Array.isArray(footprint) || footprint.length !== 2 || footprint.some((item) => !Number.isFinite(item) || item <= 0)) {
      report('invalid-footprint', `Invalid footprint for ${id}.`, path);
      return;
    }
    if (!insideGrid(col, row, footprint)) report('out-of-bounds', `${id} footprint exceeds the ${width}×${height} grid.`, path);
    if (blocking) boxes.push({id, x: col, y: row, w: footprint[0], h: footprint[1], path});
  };

  for (const [index, instance] of scene.prefabInstances.entries()) {
    const prefab = prefabById.get(instance.prefabId);
    if (!prefab) {
      report('unknown-prefab', `Unknown prefab ${instance.prefabId}.`, `$.prefabInstances[${index}]`);
      continue;
    }
    boxFor(instance.id, instance.col, instance.row, prefab.footprint, `$.prefabInstances[${index}]`);
    for (const [childIndex, child] of (prefab.placements ?? []).entries()) {
      const childAsset = assetById.get(child.assetId);
      if (!childAsset && manifest) report('unresolved-prefab-asset', `Asset ${child.assetId} is not in the supplied manifest.`, `$.prefabInstances[${index}].placements[${childIndex}]`);
      const childFootprint = childAsset?.footprint ?? [1, 1];
      if (!Array.isArray(childFootprint) || childFootprint.length !== 2 || childFootprint.some((value) => !Number.isFinite(value) || value <= 0)) {
        report('invalid-footprint', `Invalid asset footprint for ${child.assetId}.`, `$.prefabInstances[${index}].placements[${childIndex}]`);
        continue;
      }
      if (!Number.isFinite(child.col) || !Number.isFinite(child.row)
        || child.col < 1 || child.row < 1
        || child.col + childFootprint[0] - 1 > prefab.footprint[0]
        || child.row + childFootprint[1] - 1 > prefab.footprint[1]) {
        report('prefab-child-out-of-bounds', `${child.assetId} exceeds prefab ${prefab.id} footprint.`, `$.prefabInstances[${index}].placements[${childIndex}]`);
      }
    }
    const occupiedZones = zones.filter((item) => prefab.zones?.includes(item?.type)
      && rectFitsZone(instance, prefab.footprint, item.polygon));
    if (prefab.zones?.length && !occupiedZones.length) {
      report('prefab-zone-mismatch', `${instance.prefabId} footprint does not fit a compatible zone.`, `$.prefabInstances[${index}]`);
    }
  }

  for (const [index, item] of scene.placements.entries()) {
    const asset = assetById.get(item.assetId);
    const footprint = item.footprint ?? asset?.footprint ?? [1, 1];
    const position = item.position ?? item;
    const collides = asset?.placementRules?.collision === true || asset?.collision != null;
    boxFor(item.id ?? item.assetId, position.col, position.row, footprint, `$.placements[${index}]`, collides);
    if (!asset && manifest) report('unresolved-asset', `Asset ${item.assetId} is not in the supplied manifest.`, `$.placements[${index}]`);
    const assignedZoneId = item.properties?.zoneId;
    if (assignedZoneId) {
      const zone = zones.find((candidate) => candidate?.id === assignedZoneId);
      if (!zone) report('unknown-zone', `Placement ${item.id ?? item.assetId} references missing zone ${assignedZoneId}.`, `$.placements[${index}]`);
      else {
        if (!pointInPolygon(position, zone.polygon)) report('placement-outside-zone', `${item.id ?? item.assetId} is outside assigned zone ${zone.id}.`, `$.placements[${index}]`);
        if (asset?.allowedZones?.length && !asset.allowedZones.includes(zone.type)) {
          report('asset-zone-mismatch', `${item.assetId} is in incompatible zone ${zone.id}.`, `$.placements[${index}]`);
        }
      }
    }
  }

  for (let left = 0; left < boxes.length; left++) {
    for (let right = left + 1; right < boxes.length; right++) {
      const a = boxes[left]; const b = boxes[right];
      const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      if (overlaps) report('blocking-collision', `${a.id} overlaps ${b.id}.`, `${a.path}|${b.path}`);
    }
  }

  for (const [index, constraint] of constraints.entries()) {
    if (constraint?.type !== 'must-be-adjacent' || !constraint.first || !constraint.second) {
      report('invalid-constraint', 'Expected must-be-adjacent with first and second instance IDs.', `$.constraints[${index}]`);
      continue;
    }
    const first = boxes.find((box) => box.id === constraint.first);
    const second = boxes.find((box) => box.id === constraint.second);
    if (!first || !second) {
      report('unsatisfied-constraint', `Adjacency references a missing instance (${constraint.first}, ${constraint.second}).`, `$.constraints[${index}]`);
      continue;
    }
    const verticalTouch = (first.x + first.w === second.x || second.x + second.w === first.x)
      && first.y < second.y + second.h && first.y + first.h > second.y;
    const horizontalTouch = (first.y + first.h === second.y || second.y + second.h === first.y)
      && first.x < second.x + second.w && first.x + first.w > second.x;
    if (!verticalTouch && !horizontalTouch) report('unsatisfied-constraint', `${constraint.first} and ${constraint.second} are not edge-adjacent.`, `$.constraints[${index}]`);
  }
  return diagnostics;
}

function pointInPolygon(point, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3 || !Number.isFinite(point?.col) || !Number.isFinite(point?.row)) return false;
  if (polygon.some(vertex => !Number.isFinite(vertex?.col) || !Number.isFinite(vertex?.row))) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]; const b = polygon[previous];
    const cross = (point.row - a.row) * (b.col - a.col) - (point.col - a.col) * (b.row - a.row);
    const onSegment = Math.abs(cross) < 1e-9
      && point.col >= Math.min(a.col, b.col) && point.col <= Math.max(a.col, b.col)
      && point.row >= Math.min(a.row, b.row) && point.row <= Math.max(a.row, b.row);
    if (onSegment) return true;
    const crosses = (a.row > point.row) !== (b.row > point.row)
      && point.col < ((b.col - a.col) * (point.row - a.row)) / ((b.row - a.row) || Number.EPSILON) + a.col;
    if (crosses) inside = !inside;
  }
  return inside;
}

function rectFitsZone(origin, footprint, polygon) {
  const [width, height] = footprint;
  const cornersAndCenter = [
    {col: origin.col, row: origin.row},
    {col: origin.col + width, row: origin.row},
    {col: origin.col, row: origin.row + height},
    {col: origin.col + width, row: origin.row + height},
    {col: origin.col + width / 2, row: origin.row + height / 2},
  ];
  if (!cornersAndCenter.every((point) => pointInPolygon(point, polygon))) return false;

  const rect = {left: origin.col, right: origin.col + width, top: origin.row, bottom: origin.row + height};
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    if (segmentIntersectsRectInterior(polygon[previous], polygon[index], rect)) return false;
  }
  return true;
}

function segmentIntersectsRectInterior(a, b, rect) {
  const epsilon = Math.min(1e-9, (rect.right - rect.left) / 4, (rect.bottom - rect.top) / 4);
  const bounds = [
    [a.col, b.col - a.col, rect.left + epsilon, rect.right - epsilon],
    [a.row, b.row - a.row, rect.top + epsilon, rect.bottom - epsilon],
  ];
  let lower = 0;
  let upper = 1;
  for (const [start, delta, minimum, maximum] of bounds) {
    if (Math.abs(delta) < Number.EPSILON) {
      if (start <= minimum || start >= maximum) return false;
      continue;
    }
    const enter = (minimum - start) / delta;
    const exit = (maximum - start) / delta;
    lower = Math.max(lower, Math.min(enter, exit));
    upper = Math.min(upper, Math.max(enter, exit));
    if (lower > upper) return false;
  }
  const midpoint = (lower + upper) / 2;
  const col = a.col + (b.col - a.col) * midpoint;
  const row = a.row + (b.row - a.row) * midpoint;
  return lower <= upper
    && col > rect.left + epsilon && col < rect.right - epsilon
    && row > rect.top + epsilon && row < rect.bottom - epsilon;
}

function fingerprint(value) {
  const stable = (item) => Array.isArray(item) ? item.map(stable)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, stable(item[key])])) : item;
  const text = JSON.stringify(stable(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
