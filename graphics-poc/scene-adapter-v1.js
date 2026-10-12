import {createHash} from 'node:crypto';
import {validateFarmLayout} from '../public/assets/scenario-editor/scene-layout.js';

export const SCENE_ADAPTER_VERSION = '1.0.0';
export const COMPOSER_SOURCE_FORMAT = 'riose-composer-layout';
export const GENERATED_LAYOUT_SOURCE_FORMAT = 'riose-generated-farm-layout-v1';

const SCENE_FIELDS = new Set([
  'schemaVersion', 'metadata', 'grid', 'layers', 'placements', 'visualGroups',
  'zones', 'prefabInstances', 'autoTile', 'generation',
]);
const METADATA_FIELDS = new Set([
  'id', 'scenarioType', 'name', 'seed', 'animalCount', 'herdLabel',
]);
const GRID_FIELDS = new Set(['width', 'height', 'tileWidth', 'tileHeight']);
const ZONE_FIELDS = new Set(['id', 'type', 'name', 'polygon', 'color']);
const PLACEMENT_FIELDS = new Set(['id', 'assetId', 'layer', 'position', 'rotation', 'properties']);
const PLACEMENT_PROPERTY_FIELDS = new Set([
  'visualId', 'visualState', 'state', 'groupId', 'representationMode',
  'visualScale', 'prefabInstanceId', 'prefabId',
]);
const GROUP_FIELDS = new Set(['id', 'population', 'zoneId', 'operationalState', 'mode', 'seed', 'visualIds']);
const PREFAB_INSTANCE_FIELDS = new Set(['id', 'prefabId', 'col', 'row', 'rotation']);
const SUPPORTED_REASON = 'Kept in the versioned authored-source snapshot; no canonical v1 mapping is defined.';
const LAYER_ORDER = ['terrain', 'infrastructure', 'livestock', 'overlays'];
const VISUAL_STATES = new Set(['default', 'idle', 'grazing', 'walking', 'feeding', 'drinking', 'resting', 'milking', 'waiting', 'parked', 'connected', 'stocked', 'seasonal']);

const stableJson = value => JSON.stringify(value);
const sha256 = value => createHash('sha256').update(stableJson(value)).digest('hex');

function collectUnsupported(source) {
  const unsupported = new Map();
  const add = (path, id) => {
    const entry = unsupported.get(path) ?? {path, reason: SUPPORTED_REASON, count: 0, sourceIds: []};
    entry.count++;
    if (id && entry.sourceIds.length < 5 && !entry.sourceIds.includes(id)) entry.sourceIds.push(id);
    unsupported.set(path, entry);
  };
  const keys = (record, allowed, basePath, id) => {
    for (const key of Object.keys(record ?? {}).sort()) if (!allowed.has(key)) add(`${basePath}.${key}`, id);
  };
  const unsupportedTree = (value, basePath, id) => {
    if (!value || typeof value !== 'object') {
      add(basePath, id);
      return;
    }
    const entries = Object.entries(value);
    if (!entries.length) add(basePath, id);
    for (const [key, child] of entries) unsupportedTree(child, `${basePath}.${key}`, id);
  };

  keys(source.scene, SCENE_FIELDS, 'scene');
  if (source.scene.generation !== undefined) unsupportedTree(source.scene.generation, 'scene.generation', source.scene.metadata?.id);
  keys(source.scene.metadata, METADATA_FIELDS, 'scene.metadata', source.scene.metadata?.id);
  keys(source.scene.grid, GRID_FIELDS, 'scene.grid', source.scene.metadata?.id);
  keys(source.scene.autoTile, new Set(), 'scene.autoTile', source.scene.metadata?.id);
  (source.scene.layers ?? []).forEach(layer => {
    keys(layer, new Set(), 'scene.layers[]', layer.id);
  });
  (source.scene.zones ?? []).forEach(zone => keys(zone, ZONE_FIELDS, 'scene.zones[]', zone.id));
  (source.scene.placements ?? []).forEach(placement => {
    keys(placement, PLACEMENT_FIELDS, 'scene.placements[]', placement.id);
    keys(placement.properties, PLACEMENT_PROPERTY_FIELDS, 'scene.placements[].properties', placement.id);
  });
  (source.scene.visualGroups ?? []).forEach(group => keys(group, GROUP_FIELDS, 'scene.visualGroups[]', group.id));
  (source.scene.prefabInstances ?? []).forEach(instance => keys(instance, PREFAB_INSTANCE_FIELDS, 'scene.prefabInstances[]', instance.id));
  (source.expandedPlacements ?? []).forEach(placement => {
    keys(placement, PLACEMENT_FIELDS, 'expandedPlacements[]', placement.id);
    keys(placement.properties, PLACEMENT_PROPERTY_FIELDS, 'expandedPlacements[].properties', placement.id);
  });
  return [...unsupported.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function sourceIds(source) {
  return {
    sceneId: source.scene.metadata.id,
    zoneIds: (source.scene.zones ?? []).map(zone => zone.id),
    placementIds: (source.scene.placements ?? []).map(placement => placement.id),
    prefabInstanceIds: (source.scene.prefabInstances ?? []).map(instance => instance.id),
    visualIds: (source.scene.visualGroups ?? []).flatMap(group => group.visualIds ?? []),
    assetIds: [...new Set((source.expandedPlacements ?? []).map(placement => placement.assetId))].sort(),
  };
}

function rectangle(zone) {
  const points = zone.polygon ?? [];
  const xs = points.map(point => point.col), ys = points.map(point => point.row);
  const x = Math.min(...xs), y = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
  const expected = new Set([`${x}:${y}`, `${right}:${y}`, `${right}:${bottom}`, `${x}:${bottom}`]);
  if (points.length !== 4 || new Set(points.map(point => `${point.col}:${point.row}`)).size !== 4
    || expected.size !== 4 || points.some(point => !expected.has(`${point.col}:${point.row}`))) {
    throw new TypeError(`Unsupported Composer field scene.zones[].polygon for ${zone.id}: v1 requires an axis-aligned rectangle`);
  }
  return {x, y, columns: right - x, rows: bottom - y};
}

function canonicalize(source, rendererManifest, {provenance = {sourceId: 'scenario-composer-v1', sourceCommit: '2a360cd60bfd3f98d598e12ad5774f5ff4bb8fb7', sourceSceneId: source.scene.metadata.id}} = {}) {
  const {scene} = source;
  const system = scene.metadata?.scenarioType;
  if (!['beef', 'dairy'].includes(system)) throw new TypeError(`Unsupported Composer production system: ${system}`);
  if (!scene.grid || !Array.isArray(scene.zones) || !Array.isArray(source.expandedPlacements)) throw new TypeError('Invalid Composer layout source');
  const assetsById = new Map((rendererManifest?.assets ?? []).map(asset => [asset.assetId, asset]));
  const zones = scene.zones.map(zone => {
    const bounds = rectangle(zone);
    return {
      zoneId: zone.id,
      kind: zone.type,
      name: zone.name,
      color: zone.color,
      origin: {x: bounds.x, y: bounds.y, unit: 'grid-cell'},
      footprint: {columns: bounds.columns, rows: bounds.rows},
      groundAssetId: 'grass-light',
    };
  });
  const zoneAt = (x, y) => zones.find(zone => x >= zone.origin.x && y >= zone.origin.y
    && x < zone.origin.x + zone.footprint.columns && y < zone.origin.y + zone.footprint.rows)?.zoneId;
  const terrainTiles = [], prefabs = [], entities = [];
  for (const placement of source.expandedPlacements) {
    const asset = assetsById.get(placement.assetId);
    if (!asset) throw new TypeError(`No renderer manifest record for Composer asset ${placement.assetId}`);
    const {col, row} = placement.position;
    if (placement.layer === 'terrain') {
      terrainTiles.push({tileId: placement.id, position: {x: col, y: row, unit: 'grid-cell'}, assetId: placement.assetId, ...(zoneAt(col, row) ? {zoneId: zoneAt(col, row)} : {})});
      continue;
    }
    if (placement.layer === 'animals') {
      const visualId = placement.properties?.visualId ?? placement.id;
      const candidateState = placement.properties?.visualState ?? placement.properties?.state ?? 'default';
      entities.push({
        entityId: `visual-${visualId}`,
        kind: 'animal',
        position: {x: col, y: row, unit: 'grid-cell'},
        asset: {assetId: placement.assetId, manifestUri: '/graphics-poc/assets/main-composer-render-manifest.json', manifestVersion: 'main-composer-v1', reviewStatus: asset.reviewStatus},
        state: {stateId: VISUAL_STATES.has(candidateState) ? candidateState : 'default'},
        ...(placement.properties?.groupId ? {groupId: placement.properties.groupId} : {}),
        visualId,
        ...(placement.properties?.representationMode ? {representationMode: placement.properties.representationMode} : {}),
        ...(Number.isFinite(placement.properties?.visualScale) ? {visualScale: placement.properties.visualScale} : {}),
      });
      continue;
    }
    const footprint = asset.footprint ?? [1, 1];
    const nonBlocking = ['fence', 'road', 'vegetation', 'technology'].includes(asset.category);
    prefabs.push({
      prefabId: `composer-${placement.id}`,
      assetId: placement.assetId,
      position: {x: col, y: row, unit: 'grid-cell'},
      footprint: {columns: footprint[0], rows: footprint[1]},
      layer: 'infrastructure',
      state: {stateId: VISUAL_STATES.has(placement.properties?.visualState ?? placement.properties?.state) ? (placement.properties.visualState ?? placement.properties.state) : 'default'},
      blocking: !nonBlocking && asset.blocking,
      ...(placement.properties?.prefabInstanceId ? {compositionId: placement.properties.prefabInstanceId} : {}),
      ...(placement.properties?.prefabId ? {sourcePrefabId: placement.properties.prefabId} : {}),
      rotationDegrees: ((placement.rotation ?? 0) % 360 + 360) % 360,
    });
  }
  const visualGroups = (scene.visualGroups ?? []).map(group => ({
    groupId: group.id,
    population: group.population,
    zoneId: group.zoneId,
    operationalState: group.operationalState,
    mode: group.mode,
    seed: group.seed >>> 0,
    visualEntityIds: entities.filter(entity => entity.groupId === group.id).map(entity => entity.entityId),
  }));
  const usedAssetIds = new Set(['grass-light', ...terrainTiles.map(tile => tile.assetId), ...prefabs.map(prefab => prefab.assetId), ...entities.map(entity => entity.asset.assetId)]);
  for (const assetId of usedAssetIds) if (!assetsById.has(assetId)) throw new TypeError(`Scene asset ${assetId} is absent from renderer manifest`);
  const assets = [...usedAssetIds].sort().map(assetId => ({assetId, manifestUri: '/graphics-poc/assets/main-composer-render-manifest.json', manifestVersion: 'main-composer-v1', reviewStatus: assetsById.get(assetId).reviewStatus}));
  const isDairy = system === 'dairy';
  return {
    schemaVersion: '1.0.0',
    sceneId: isDairy ? 'riose-dairy-horizonte' : 'riose-beef-boa-esperanca',
    name: scene.metadata.name,
    domainModule: isDairy
      ? {moduleId: 'livestock-dairy', version: '0.1.0', status: 'in-progress', modelIds: []}
      : {moduleId: 'beef-demo', version: 'engine-farm-v1', status: 'demonstrative-unvalidated', modelIds: ['beef-demo-weight-intake-v1']},
    simulation: {
      scenarioId: scene.metadata.id,
      seed: scene.metadata.seed >>> 0,
      populationCount: scene.metadata.animalCount,
      productionSystem: system,
      initialConditions: isDairy
        ? {layoutOnly: true, modelStatus: 'in-progress', herdLabel: scene.metadata.herdLabel}
        : {housing: 'pasture', weather: 'normal', diet: 'pasture', supplement: 0, herdLabel: scene.metadata.herdLabel},
    },
    ...(provenance ? {provenance} : {}),
    projection: {type: 'isometric-2to1', cellWidth: scene.grid.tileWidth, cellHeight: scene.grid.tileHeight, columns: scene.grid.width, rows: scene.grid.height},
    assets,
    entities,
    zones,
    prefabs,
    terrainTiles,
    ...(visualGroups.length ? {visualGroups} : {}),
    layerOrder: LAYER_ORDER,
  };
}

/**
 * Adapt a committed Composer export into the renderer-independent visual-scene
 * contract. The adapter document carries the exact source export so consumers
 * can load and save without losing authored data that v1 cannot represent.
 */
export function adaptComposerDocument(source, rendererManifest) {
  if (!source?.scene || !Array.isArray(source.expandedPlacements)) {
    throw new TypeError('Invalid Composer export: expected scene and expandedPlacements');
  }
  const canonicalScene = canonicalize(source, rendererManifest);
  const sourceSnapshot = structuredClone(source);
  return {
    adapterVersion: SCENE_ADAPTER_VERSION,
    sourceFormat: {
      formatId: COMPOSER_SOURCE_FORMAT,
      schemaVersion: String(source.scene.schemaVersion),
      sceneId: source.scene.metadata.id,
      sourceDigest: sha256(sourceSnapshot),
      canonicalSceneDigest: sha256(canonicalScene),
      ids: sourceIds(source),
    },
    scene: canonicalScene,
    unsupportedFields: collectUnsupported(source),
    authoredSource: sourceSnapshot,
  };
}

/** Restore the authored Composer export from a v1 adapter document. */
export function restoreComposerDocument(adapterDocument) {
  if (adapterDocument?.adapterVersion !== SCENE_ADAPTER_VERSION
    || adapterDocument?.sourceFormat?.formatId !== COMPOSER_SOURCE_FORMAT
    || !adapterDocument.authoredSource) {
    throw new TypeError('Unsupported or incomplete scene adapter document');
  }
  const restored = structuredClone(adapterDocument.authoredSource);
  if (sha256(restored) !== adapterDocument.sourceFormat.sourceDigest) {
    throw new TypeError('Authored Composer source snapshot failed its integrity check');
  }
  if (sha256(adapterDocument.scene) !== adapterDocument.sourceFormat.canonicalSceneDigest) {
    throw new TypeError('Canonical scene changed; v1 cannot save canonical edits back to Composer without a field mapping');
  }
  return restored;
}

/**
 * Adapt an editable generated Composer layout without altering renderer outputs.
 * Prefab children are expanded deterministically for canonical rendering while
 * the exact generated Composer scene remains the restorable authored source.
 */
export function adaptGeneratedFarmLayoutDocument(generatedScene, rendererManifest, prefabLibrary, composerManifest) {
  if (!generatedScene?.metadata?.id || !Array.isArray(generatedScene.prefabInstances)
    || !Array.isArray(generatedScene.placements) || !Array.isArray(generatedScene.zones)) {
    throw new TypeError('Invalid generated farm layout: expected Composer scene, zones, placements and prefabInstances');
  }
  const diagnostics = validateFarmLayout(generatedScene, {prefabs: prefabLibrary, manifest: composerManifest});
  const errors = diagnostics.filter(item => item.severity === 'error');
  if (errors.length) throw new TypeError(`Generated Composer layout is invalid: ${errors.map(item => `${item.code} at ${item.path}`).join(', ')}`);

  const expandedPlacements = expandGeneratedPrefabPlacements(generatedScene, prefabLibrary);
  const source = {scene: generatedScene, expandedPlacements};
  const canonicalScene = canonicalize(source, rendererManifest, {provenance: null});
  const authoredSource = structuredClone(generatedScene);
  const sourceDigest = sha256(authoredSource);
  const assetIds = [...new Set(expandedPlacements.map(item => item.assetId))].sort();
  return {
    adapterVersion: SCENE_ADAPTER_VERSION,
    sourceFormat: {
      formatId: GENERATED_LAYOUT_SOURCE_FORMAT,
      schemaVersion: String(generatedScene.schemaVersion),
      sceneId: generatedScene.metadata.id,
      sourceDigest,
      canonicalSceneDigest: sha256(canonicalScene),
      ids: {
        sceneId: generatedScene.metadata.id,
        zoneIds: generatedScene.zones.map(zone => zone.id),
        placementIds: generatedScene.placements.map(item => item.id),
        prefabInstanceIds: generatedScene.prefabInstances.map(item => item.id),
        visualIds: (generatedScene.visualGroups ?? []).flatMap(group => group.visualIds ?? []),
        assetIds,
      },
      expandedPlacementCount: expandedPlacements.length,
    },
    scene: canonicalScene,
    unsupportedFields: collectUnsupported(source),
    authoredSource,
  };
}

/** Restore the exact generated Composer scene if neither side of the adapter document was edited. */
export function restoreGeneratedFarmLayoutDocument(adapterDocument) {
  if (adapterDocument?.adapterVersion !== SCENE_ADAPTER_VERSION
    || adapterDocument?.sourceFormat?.formatId !== GENERATED_LAYOUT_SOURCE_FORMAT
    || !adapterDocument.authoredSource) {
    throw new TypeError('Unsupported or incomplete generated farm layout adapter document');
  }
  const restored = structuredClone(adapterDocument.authoredSource);
  if (sha256(restored) !== adapterDocument.sourceFormat.sourceDigest) {
    throw new TypeError('Generated Composer source failed its integrity check');
  }
  if (sha256(adapterDocument.scene) !== adapterDocument.sourceFormat.canonicalSceneDigest) {
    throw new TypeError('Canonical scene changed; generated Composer source cannot be rewritten without an explicit field mapping');
  }
  return restored;
}

function expandGeneratedPrefabPlacements(scene, prefabLibrary) {
  const prefabById = new Map(prefabLibrary.map(item => [item.id, item]));
  const expanded = scene.placements.map(item => structuredClone(item));
  for (const instance of scene.prefabInstances) {
    const prefab = prefabById.get(instance.prefabId);
    if (!prefab) throw new TypeError(`Unknown generated Composer prefab ${instance.prefabId}`);
    const rotation = ((instance.rotation ?? 0) % 360 + 360) % 360;
    if (![0, 90, 180, 270].includes(rotation)) throw new TypeError(`Unsupported prefab rotation ${rotation} for ${instance.id}`);
    for (const [index, child] of (prefab.placements ?? []).entries()) {
      let col = child.col, row = child.row;
      if (rotation === 90) [col, row] = [-row, col];
      else if (rotation === 180) [col, row] = [-col, -row];
      else if (rotation === 270) [col, row] = [row, -col];
      expanded.push({
        id: `${instance.id}::${index}`,
        assetId: child.assetId,
        layer: child.layer,
        position: {col: instance.col + col, row: instance.row + row},
        rotation: ((child.rotation ?? 0) + rotation) % 360,
        properties: {...(child.properties ?? {}), prefabInstanceId: instance.id, prefabId: instance.prefabId},
      });
    }
  }
  return expanded;
}
