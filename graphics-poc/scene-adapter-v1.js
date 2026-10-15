import {createHash} from 'node:crypto';
import {validateFarmLayout} from '../src/client/scenario-editor/scene-layout.js';

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
const GRID_FIELDS = new Set(['width', 'height', 'tileWidth', 'tileHeight', 'projection', 'origin']);
const ZONE_FIELDS = new Set(['id', 'type', 'name', 'polygon', 'color']);
const PLACEMENT_FIELDS = new Set(['id', 'assetId', 'layer', 'position', 'rotation', 'properties']);
const PLACEMENT_PROPERTY_FIELDS = new Set([
  'visualId', 'visualState', 'state', 'groupId', 'representationMode',
  'visualScale', 'prefabInstanceId', 'prefabId',
]);
const GROUP_FIELDS = new Set(['id', 'population', 'zoneId', 'operationalState', 'mode', 'seed', 'visualIds']);
const PREFAB_INSTANCE_FIELDS = new Set(['id', 'prefabId', 'col', 'row', 'rotation']);
const SUPPORTED_REASON = 'Preserved in authoredSource; no canonical v1 mapping is defined.';
const LAYER_ORDER = ['terrain', 'infrastructure', 'livestock', 'overlays'];
const VISUAL_STATES = new Set(['default', 'idle', 'grazing', 'walking', 'feeding', 'drinking', 'resting', 'milking', 'waiting', 'parked', 'connected', 'stocked', 'seasonal']);

const stableValue = value => Array.isArray(value) ? value.map(stableValue)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
    : value);
const stableJson = value => JSON.stringify(stableValue(value));
const sha256 = value => createHash('sha256').update(stableJson(value)).digest('hex');

function collectUnsupported(source) {
  const unsupported = new Map();
  const add = (path, id, disposition = 'preserved', reason = SUPPORTED_REASON) => {
    const entry = unsupported.get(path) ?? {path, reason, disposition, count: 0, sourceIds: []};
    entry.count++;
    if (id && entry.sourceIds.length < 5 && !entry.sourceIds.includes(id)) entry.sourceIds.push(id);
    unsupported.set(path, entry);
  };
  const keys = (record, allowed, basePath, id) => {
    for (const key of Object.keys(record ?? {}).sort()) if (!allowed.has(key)) add(`${basePath}.${key}`, id);
  };
  const unknownNested = (record, allowed, basePath, id, childSchemas = {}) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    for (const key of Object.keys(record).sort()) {
      const path = basePath ? `${basePath}.${key}` : key;
      if (!allowed.has(key)) {
        add(path, id);
        continue;
      }
      const childSchema = childSchemas[key];
      if (childSchema) unknownNested(record[key], childSchema.allowed, path, id, childSchema.children);
    }
  };
  const markUnsupportedTree = (value, path, id) => {
    if (Array.isArray(value)) {
      if (value.length === 0) add(path, id, 'unsupported');
      else value.forEach((child, index) => markUnsupportedTree(child, `${path}.${index}`, id));
      return;
    }
    if (!value || typeof value !== 'object' || Object.keys(value).length === 0) {
      add(path, id, 'unsupported');
      return;
    }
    for (const key of Object.keys(value).sort()) markUnsupportedTree(value[key], `${path}.${key}`, id);
  };

  const id = source.scene?.metadata?.id;
  unknownNested(source, new Set(['scene', 'expandedPlacements']), '', id, {
    scene: {allowed: SCENE_FIELDS, children: {
      metadata: {allowed: METADATA_FIELDS},
      grid: {allowed: GRID_FIELDS, children: {origin: {allowed: new Set(['x', 'y'])}}},
      layers: {allowed: new Set(), children: {}},
      zones: {allowed: new Set(), children: {}},
      placements: {allowed: new Set(), children: {}},
      visualGroups: {allowed: new Set(), children: {}},
      prefabInstances: {allowed: new Set(), children: {}},
    }},
  });

  // Traverse authored arrays with concrete indices so each diagnostic points
  // at one source value and nested future coordinate fields are not hidden.
  (source.scene?.zones ?? []).forEach((zone, index) => {
    unknownNested(zone, ZONE_FIELDS, `scene.zones[${index}]`, zone.id, {
      polygon: {allowed: new Set(), children: {}},
    });
    (zone.polygon ?? []).forEach((point, pointIndex) => unknownNested(
      point, new Set(['col', 'row']), `scene.zones[${index}].polygon[${pointIndex}]`, zone.id,
    ));
  });
  const scanPlacement = (placement, path) => {
    unknownNested(placement, PLACEMENT_FIELDS, path, placement.id, {
      position: {allowed: new Set(['col', 'row'])},
      properties: {allowed: PLACEMENT_PROPERTY_FIELDS},
    });
  };
  (source.scene?.placements ?? []).forEach((placement, index) => scanPlacement(placement, `scene.placements[${index}]`));
  (source.expandedPlacements ?? []).forEach((placement, index) => {
    scanPlacement(placement, `expandedPlacements[${index}]`);
    if (['terrain', 'animals'].includes(placement.layer) && placement.rotation !== undefined) {
      add(`expandedPlacements[${index}].rotation`, placement.id, 'unsupported', 'Preserved in authoredSource; visual-scene v1 has no rotation mapping for this placement kind.');
    }
    const stateKey = placement.properties?.visualState !== undefined ? 'visualState'
      : (placement.properties?.state !== undefined ? 'state' : null);
    if (stateKey && !VISUAL_STATES.has(placement.properties[stateKey])) {
      add(`expandedPlacements[${index}].properties.${stateKey}`, placement.id, 'unsupported', 'Preserved in authoredSource; the Composer visual state is outside the adapter v1 state vocabulary.');
    }
  });
  (source.scene?.visualGroups ?? []).forEach((group, index) => {
    unknownNested(group, GROUP_FIELDS, `scene.visualGroups[${index}]`, group.id);
  });
  (source.scene?.prefabInstances ?? []).forEach((instance, index) => {
    unknownNested(instance, PREFAB_INSTANCE_FIELDS, `scene.prefabInstances[${index}]`, instance.id);
  });
  if (source.scene?.generation !== undefined) markUnsupportedTree(source.scene.generation, 'scene.generation', id);
  if (source.scene?.autoTile !== undefined) markUnsupportedTree(source.scene.autoTile, 'scene.autoTile', id);
  (source.scene?.layers ?? []).forEach((layer, index) => add(`scene.layers[${index}]`, layer.id, 'unsupported', 'Preserved in authoredSource; canonical v1 does not model Composer layer declarations.'));
  const sceneVersion = source.scene?.schemaVersion;
  if (sceneVersion !== 1) throw new TypeError(`Unsupported Composer source schemaVersion: ${String(sceneVersion)}`);
  if (source.scene?.grid?.origin !== undefined && (source.scene.grid.origin.x !== 0 || source.scene.grid.origin.y !== 0)) {
    throw new TypeError('Unsupported non-zero Composer grid origin');
  }
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

function assertUnique(values, label) {
  const duplicates = values.filter((value, index) => value !== undefined && values.indexOf(value) !== index);
  if (duplicates.length) throw new TypeError(`Composer source contains duplicate ${label}: ${[...new Set(duplicates)].sort().join(', ')}`);
}

function assertFinitePair(value, path, {positive = false} = {}) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(item => !Number.isFinite(item) || (positive && item <= 0))) {
    throw new TypeError(`Invalid Composer coordinate pair at ${path}`);
  }
}

function canonicalPlacementIds(placements) {
  const indexesById = new Map();
  placements.forEach((placement, index) => {
    const indexes = indexesById.get(placement.id) ?? [];
    indexes.push(index);
    indexesById.set(placement.id, indexes);
  });
  const ids = placements.map(placement => placement.id);
  for (const [sourceId, indexes] of indexesById) {
    if (indexes.length < 2) continue;
    const signatures = indexes.map(index => sha256({
      assetId: placements[index].assetId,
      layer: placements[index].layer,
      position: placements[index].position,
      rotation: placements[index].rotation ?? 0,
      properties: placements[index].properties ?? {},
    }));
    if (new Set(signatures).size !== signatures.length) throw new TypeError(`Ambiguous duplicate Composer placement ID: ${sourceId}`);
    indexes.forEach((index, occurrence) => { ids[index] = `${sourceId}::${signatures[occurrence].slice(0, 16)}`; });
  }
  assertUnique(ids, 'canonical placement IDs');
  return ids;
}

function validateComposerSource(source, rendererManifest) {
  const {scene} = source;
  if (scene.schemaVersion !== 1) throw new TypeError(`Unsupported Composer source schemaVersion: ${String(scene.schemaVersion)}`);
  const grid = scene.grid;
  if (!grid || !Number.isInteger(grid.width) || grid.width < 1 || !Number.isInteger(grid.height) || grid.height < 1
    || !Number.isFinite(grid.tileWidth) || grid.tileWidth <= 0 || !Number.isFinite(grid.tileHeight) || grid.tileHeight <= 0) {
    throw new TypeError('Invalid Composer grid dimensions or tile size');
  }
  if (grid.projection !== 'isometric-2-to-1') throw new TypeError(`Unsupported Composer projection: ${String(grid.projection)}`);
  if (grid.origin !== undefined && (!Number.isFinite(grid.origin.x) || !Number.isFinite(grid.origin.y))) {
    throw new TypeError('Invalid Composer grid origin');
  }
  const metadata = scene.metadata;
  if (!metadata || typeof metadata.id !== 'string' || !metadata.id || !Number.isSafeInteger(metadata.seed)
    || metadata.seed < 0 || metadata.seed > 0xffffffff || !Number.isInteger(metadata.animalCount) || metadata.animalCount < 1) {
    throw new TypeError('Invalid Composer scene identity, seed, or population');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(metadata.id)) throw new TypeError(`Invalid Composer scene ID: ${metadata.id}`);
  const zones = scene.zones;
  const groups = scene.visualGroups ?? [];
  const expanded = source.expandedPlacements;
  for (const [items, key, label] of [
    [zones, 'id', 'zone IDs'],
    [scene.prefabInstances ?? [], 'id', 'prefab instance IDs'],
    [groups, 'id', 'visual group IDs'],
  ]) assertUnique(items.map(item => item?.[key]), label);
  canonicalPlacementIds(expanded);
  assertUnique(expanded.filter(item => item.layer === 'animals').map(item => item.properties?.visualId ?? item.id), 'animal visual IDs');
  assertUnique(groups.flatMap(group => group.visualIds ?? []), 'visual IDs');
  const manifestAssets = rendererManifest?.assets;
  if (!Array.isArray(manifestAssets)) throw new TypeError('Invalid Composer renderer manifest: expected assets');
  assertUnique(manifestAssets.map(asset => asset?.assetId), 'manifest asset IDs');
  assertUnique(manifestAssets.map(asset => asset?.sourceSemanticId).filter(Boolean), 'manifest semantic IDs');
  const reviewStatuses = new Set(['APPROVED', 'REVIEW', 'UNRESOLVED', 'RELEASED']);
  for (const asset of manifestAssets) {
    if (typeof asset.assetId !== 'string' || !asset.assetId) throw new TypeError('Composer renderer manifest assets require stable asset IDs');
    if (asset.reviewStatus !== undefined && !reviewStatuses.has(asset.reviewStatus)) throw new TypeError(`Unsupported Composer asset review status for ${asset.assetId}: ${String(asset.reviewStatus)}`);
  }
  for (const zone of zones) {
    if (typeof zone.id !== 'string' || !zone.id) throw new TypeError('Composer zones require stable IDs');
    for (const point of zone.polygon ?? []) {
      if (!Number.isFinite(point.col) || !Number.isFinite(point.row)
        || point.col < 0 || point.col > grid.width || point.row < 0 || point.row > grid.height) {
        throw new TypeError(`Invalid Composer zone coordinate at ${zone.id}`);
      }
    }
  }
  const zoneIds = new Set(zones.map(zone => zone.id));
  const visualIds = new Set(expanded.filter(item => item.layer === 'animals').map(item => item.properties?.visualId ?? item.id));
  const groupIds = new Set(groups.map(group => group.id));
  const supportedLayers = new Set(['terrain', 'animals', 'roads', 'pasture', 'water', 'fences', 'buildings', 'handling', 'technology']);
  for (const group of groups) {
    if (!zoneIds.has(group.zoneId)) throw new TypeError(`Composer visual group ${group.id} references missing zone ${group.zoneId}`);
    if (!Number.isSafeInteger(group.seed) || group.seed < 0 || group.seed > 0xffffffff) throw new TypeError(`Invalid Composer visual group seed at ${group.id}`);
    for (const visualId of group.visualIds ?? []) if (!visualIds.has(visualId)) throw new TypeError(`Composer visual group ${group.id} references missing visual ${visualId}`);
    if (!Number.isInteger(group.population) || group.population < 1
      || !['sampled-miniature', 'operational'].includes(group.mode)) throw new TypeError(`Invalid Composer visual group state at ${group.id}`);
  }
  for (const [index, placement] of expanded.entries()) {
    if (typeof placement.id !== 'string' || !placement.id || typeof placement.assetId !== 'string' || !placement.assetId) throw new TypeError(`Invalid Composer placement identity at expandedPlacements[${index}]`);
    assertFinitePair([placement.position?.col, placement.position?.row], `expandedPlacements[${index}].position`);
    if (placement.position.col < 0 || placement.position.col >= grid.width || placement.position.row < 0 || placement.position.row >= grid.height) {
      throw new TypeError(`Composer placement coordinate is outside the grid at expandedPlacements[${index}].position`);
    }
    if (!supportedLayers.has(placement.layer)) throw new TypeError(`Unsupported Composer placement layer at expandedPlacements[${index}].layer: ${String(placement.layer)}`);
    if (placement.rotation !== undefined && !Number.isFinite(placement.rotation)) throw new TypeError(`Invalid Composer rotation at expandedPlacements[${index}].rotation`);
    const candidateState = placement.properties?.visualState ?? placement.properties?.state;
    if (candidateState !== undefined && (typeof candidateState !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(candidateState))) {
      throw new TypeError(`Invalid Composer visual state at expandedPlacements[${index}].properties`);
    }
    const groupId = placement.properties?.groupId;
    if (groupId !== undefined && !groupIds.has(groupId)) throw new TypeError(`Composer placement ${placement.id} references missing visual group ${groupId}`);
  }
}

function sourceProvenance(rendererManifest, scene) {
  const revision = rendererManifest?.sourceRevision?.assetManifestCommit;
  if (typeof revision !== 'string' || !/^[a-f\d]{7,40}$/i.test(revision)) return null;
  return {sourceId: COMPOSER_SOURCE_FORMAT, sourceCommit: revision, sourceSceneId: scene.metadata.id};
}

function canonicalize(source, rendererManifest, {provenance = sourceProvenance(rendererManifest, source.scene)} = {}) {
  const {scene} = source;
  validateComposerSource(source, rendererManifest);
  const system = scene.metadata?.scenarioType;
  if (!['beef', 'dairy'].includes(system)) throw new TypeError(`Unsupported Composer production system: ${system}`);
  if (!scene.grid || !Array.isArray(scene.zones) || !Array.isArray(source.expandedPlacements)) throw new TypeError('Invalid Composer layout source');
  const assetsById = new Map(rendererManifest.assets.map(asset => [asset.assetId, asset]));
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
  const canonicalIds = canonicalPlacementIds(source.expandedPlacements);
  for (const [placementIndex, placement] of source.expandedPlacements.entries()) {
    const canonicalId = canonicalIds[placementIndex];
    const asset = assetsById.get(placement.assetId);
    if (!asset) throw new TypeError(`No renderer manifest record for Composer asset ${placement.assetId}`);
    const {col, row} = placement.position;
    if (placement.layer === 'terrain') {
      terrainTiles.push({tileId: canonicalId, position: {x: col, y: row, unit: 'grid-cell'}, assetId: placement.assetId, ...(zoneAt(col, row) ? {zoneId: zoneAt(col, row)} : {})});
      continue;
    }
    if (placement.layer === 'animals') {
      const visualId = placement.properties?.visualId ?? placement.id;
      const candidateState = placement.properties?.visualState ?? placement.properties?.state ?? 'default';
      entities.push({
        entityId: `visual-${visualId}`,
        kind: 'animal',
        position: {x: col, y: row, unit: 'grid-cell'},
        asset: {
          assetId: placement.assetId,
          manifestUri: '/graphics-poc/assets/main-composer-render-manifest.json',
          manifestVersion: 'main-composer-v1',
          reviewStatus: asset.reviewStatus ?? 'UNRESOLVED',
          sourceStatus: asset.sourceStatus ?? asset.reviewStatus ?? 'UNRESOLVED',
          sourceSemanticId: asset.sourceSemanticId ?? null,
          sourceFile: asset.sourceFile ?? null,
          sourceManifest: asset.sourceManifest ?? asset.manifestSource ?? null,
          rights: asset.rights ?? {licenseState: 'unknown', notes: 'No source rights record resolves for this asset.'},
        },
        state: {stateId: candidateState},
        ...(placement.properties?.groupId ? {groupId: placement.properties.groupId} : {}),
        visualId,
        ...(placement.properties?.representationMode ? {representationMode: placement.properties.representationMode} : {}),
        ...(Number.isFinite(placement.properties?.visualScale) ? {visualScale: placement.properties.visualScale} : {}),
      });
      continue;
    }
    const footprint = asset.footprint;
    if (!Array.isArray(footprint) || footprint.length !== 2 || footprint.some(value => !Number.isFinite(value) || value <= 0)) {
      throw new TypeError(`Missing or invalid required footprint for Composer asset ${asset.assetId}`);
    }
    const nonBlocking = ['fence', 'road', 'vegetation', 'technology'].includes(asset.category);
    prefabs.push({
      prefabId: `composer-${canonicalId}`,
      assetId: placement.assetId,
      position: {x: col, y: row, unit: 'grid-cell'},
      footprint: {columns: footprint[0], rows: footprint[1]},
      layer: 'infrastructure',
      state: {stateId: placement.properties?.visualState ?? placement.properties?.state ?? 'default'},
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
  const assets = [...usedAssetIds].sort().map(assetId => {
    const asset = assetsById.get(assetId);
    return {
      assetId,
      manifestUri: '/graphics-poc/assets/main-composer-render-manifest.json',
      manifestVersion: 'main-composer-v1',
      reviewStatus: asset.reviewStatus ?? 'UNRESOLVED',
      sourceStatus: asset.sourceStatus ?? asset.reviewStatus ?? 'UNRESOLVED',
      sourceSemanticId: asset.sourceSemanticId ?? null,
      sourceFile: asset.sourceFile ?? null,
      sourceManifest: asset.sourceManifest ?? asset.manifestSource ?? null,
      rights: asset.rights ?? {licenseState: 'unknown', notes: 'No source rights record resolves for this asset.'},
    };
  });
  const isDairy = system === 'dairy';
  return {
    schemaVersion: '1.0.0',
    representationRole: 'authored-preservation',
    sceneId: scene.metadata.id,
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
  const identityMap = canonicalPlacementIds(source.expandedPlacements);
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
      identityMap: source.expandedPlacements.map((placement, index) => ({sourcePlacementId: placement.id, canonicalPlacementId: identityMap[index]})),
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
