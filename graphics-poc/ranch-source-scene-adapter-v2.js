import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const RANCH_SOURCE_SCENE_ADAPTER_VERSION = '2.0.0';
export const RANCH_SOURCE_SCENE_FORMAT = 'riose-ranch-composition-v4';

const SOURCE_KEYS = {
  root: new Set([
    'schemaVersion', 'sceneId', 'projection', 'footprintPx', 'terrainPlate',
    'terrainAssetId', 'terrainMode', 'referenceRoles', 'visualAnimalBudget',
    'visualAnimalLots', 'compositionBlocks', 'zones', 'groundingOverlays',
    'prefabs', 'placements', 'renderSettings', 'compositionReview',
    'assetReview', 'groundingReview', 'gateReview', 'troughReview',
    'feedTroughReview', 'sceneArtReview',
  ]),
  referenceRoles: new Set(['urban', 'fazendaV7', 'rioseV2']),
  visualAnimalBudget: new Set(['mode', 'visibleCount', 'populationBinding']),
  visualAnimalLots: new Set(['id', 'realPopulation', 'populationSource', 'zoneId', 'operationalState', 'maxSprites', 'representationMode', 'placementIds']),
  zones: new Set(['id', 'label', 'polygon']),
  groundingOverlays: new Set(['assetId', 'centerPx', 'renderSizePx', 'opacity', 'layer']),
  prefabs: new Set(['id', 'zoneIds', 'originPx', 'reusable', 'placements']),
  prefabPlacements: new Set(['placementId', 'offsetPx']),
  placements: new Set(['placementId', 'assetId', 'anchorPx', 'requestedSizePx', 'transform', 'depthKey', 'block']),
  transform: new Set(['flip', 'rotationDegreesCCW']),
  renderSettings: new Set(['scale', 'frameMarginX', 'frameMarginTop', 'frameBottomMargin', 'backgroundRGB', 'title', 'subtitle', 'footer']),
  review: new Set(['status', 'scope', 'reviewer', 'date', 'evidence', 'assetId', 'placementCount', 'note', 'exclusions']),
};

const stableValue = value => Array.isArray(value) ? value.map(stableValue)
  : (value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
    : value);
const stable = value => JSON.stringify(stableValue(value));
const sha256 = value => createHash('sha256').update(stable(value)).digest('hex');
const copy = value => structuredClone(value);
const pointer = segments => `/${segments.map(segment => String(segment).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;

function assertUnique(values, label) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) throw new TypeError(`Ranch source scene contains duplicate ${label}: ${[...new Set(duplicates)].sort().join(', ')}`);
}

function assertPair(value, path, {positive = false, within = null} = {}) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((part, index) => !Number.isFinite(part)
    || (positive && part <= 0) || (within && (part < 0 || part > within[index])))) {
    throw new TypeError(`Invalid ranch pixel coordinate at ${path}`);
  }
}

function validateSourceScene(source) {
  if (!source || source.schemaVersion !== 1 || typeof source.sceneId !== 'string' || !source.sceneId
    || !Array.isArray(source.placements) || !Array.isArray(source.footprintPx)
    || !Array.isArray(source.zones) || !Array.isArray(source.prefabs)) {
    throw new TypeError('Invalid ranch source scene: expected v4 pixel composition fields');
  }
  assertPair(source.footprintPx, '/footprintPx', {positive: true});
  if (source.terrainAssetId !== undefined && (typeof source.terrainAssetId !== 'string' || !source.terrainAssetId)) {
    throw new TypeError('Invalid ranch terrain asset reference at /terrainAssetId');
  }
  const zoneIds = source.zones.map(zone => zone?.id);
  const prefabIds = source.prefabs.map(prefab => prefab?.id);
  const placementIds = source.placements.map(item => item?.placementId);
  const lotIds = (source.visualAnimalLots ?? []).map(lot => lot?.id);
  for (const [values, label] of [[zoneIds, 'zone IDs'], [prefabIds, 'prefab IDs'], [placementIds, 'placement IDs'], [lotIds, 'lot IDs']]) {
    if (values.some(value => typeof value !== 'string' || !value)) throw new TypeError(`Ranch source scene has invalid ${label}`);
    assertUnique(values, label);
  }
  const zoneSet = new Set(zoneIds), prefabSet = new Set(prefabIds), placementSet = new Set(placementIds);
  for (const [index, zone] of source.zones.entries()) {
    if (!Array.isArray(zone.polygon) || zone.polygon.length < 3) throw new TypeError(`Invalid ranch zone polygon at /zones/${index}/polygon`);
    for (const [pointIndex, point] of zone.polygon.entries()) assertPair(point, pointer(['zones', index, 'polygon', pointIndex]), {within: source.footprintPx});
  }
  for (const [index, placement] of source.placements.entries()) {
    if (typeof placement.assetId !== 'string' || !placement.assetId) throw new TypeError(`Invalid ranch asset reference at /placements/${index}/assetId`);
    assertPair(placement.anchorPx, pointer(['placements', index, 'anchorPx']), {within: source.footprintPx});
    assertPair(placement.requestedSizePx, pointer(['placements', index, 'requestedSizePx']), {positive: true});
    if (!Number.isFinite(placement.depthKey)) throw new TypeError(`Invalid ranch depth key at /placements/${index}/depthKey`);
    if (!placement.transform || typeof placement.transform !== 'object' || Array.isArray(placement.transform)
      || (placement.transform.rotationDegreesCCW !== undefined && !Number.isFinite(placement.transform.rotationDegreesCCW))) {
      throw new TypeError(`Invalid ranch transform at /placements/${index}/transform`);
    }
  }
  for (const [index, overlay] of (source.groundingOverlays ?? []).entries()) {
    if (typeof overlay.assetId !== 'string' || !overlay.assetId) throw new TypeError(`Invalid ranch asset reference at /groundingOverlays/${index}/assetId`);
    assertPair(overlay.centerPx, pointer(['groundingOverlays', index, 'centerPx']), {within: source.footprintPx});
    assertPair(overlay.renderSizePx, pointer(['groundingOverlays', index, 'renderSizePx']), {positive: true});
    if (overlay.opacity !== undefined && (!Number.isFinite(overlay.opacity) || overlay.opacity < 0 || overlay.opacity > 100)) {
      throw new TypeError(`Invalid ranch overlay opacity at /groundingOverlays/${index}/opacity`);
    }
  }
  for (const [index, prefab] of source.prefabs.entries()) {
    assertPair(prefab.originPx, pointer(['prefabs', index, 'originPx']), {within: source.footprintPx});
    for (const zoneId of prefab.zoneIds ?? []) if (!zoneSet.has(zoneId)) throw new TypeError(`Ranch prefab ${prefab.id} references missing zone ${zoneId}`);
    for (const [childIndex, child] of (prefab.placements ?? []).entries()) {
      if (!placementSet.has(child.placementId)) throw new TypeError(`Ranch prefab ${prefab.id} references missing placement ${child.placementId}`);
      assertPair(child.offsetPx, pointer(['prefabs', index, 'placements', childIndex, 'offsetPx']));
    }
  }
  for (const lot of source.visualAnimalLots ?? []) {
    if (lot.zoneId !== undefined && !zoneSet.has(lot.zoneId)) throw new TypeError(`Ranch lot ${lot.id} references missing zone ${lot.zoneId}`);
    for (const placementId of lot.placementIds ?? []) if (!placementSet.has(placementId)) throw new TypeError(`Ranch lot ${lot.id} references missing placement ${placementId}`);
  }
  return {zoneIds, prefabIds, placementIds, lotIds, zoneSet, prefabSet, placementSet};
}

const FIELD_KEYS = {
  root: SOURCE_KEYS.root,
  referenceRoles: SOURCE_KEYS.referenceRoles,
  visualAnimalBudget: SOURCE_KEYS.visualAnimalBudget,
  visualAnimalLots: SOURCE_KEYS.visualAnimalLots,
  zones: SOURCE_KEYS.zones,
  groundingOverlays: SOURCE_KEYS.groundingOverlays,
  prefabs: SOURCE_KEYS.prefabs,
  prefabPlacements: SOURCE_KEYS.prefabPlacements,
  placements: SOURCE_KEYS.placements,
  transform: SOURCE_KEYS.transform,
  renderSettings: SOURCE_KEYS.renderSettings,
  review: SOURCE_KEYS.review,
};

function findUnknownFields(source) {
  const unknown = [];
  const scan = (record, keys, segments = [], sourceId = null) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    for (const key of Object.keys(record).sort()) {
      const next = [...segments, key];
      if (!keys.has(key)) {
        unknown.push({path: pointer(next), reason: 'Field is preserved in sourceScene but has no declared ranch v2 mapping.', disposition: 'preserved', ...(sourceId ? {sourceId} : {})});
      } else {
        const child = record[key];
        if (key === 'zones' && Array.isArray(child)) child.forEach((item, index) => scan(item, FIELD_KEYS.zones, [...next, index], item?.id));
        else if (key === 'placements' && Array.isArray(child)) child.forEach((item, index) => {
          const isPrefabChild = segments.includes('prefabs');
          scan(item, isPrefabChild ? FIELD_KEYS.prefabPlacements : FIELD_KEYS.placements, [...next, index], item?.placementId);
          if (!isPrefabChild) scan(item?.transform, FIELD_KEYS.transform, [...next, index, 'transform'], item?.placementId);
        });
        else if (key === 'prefabs' && Array.isArray(child)) child.forEach((item, index) => {
          scan(item, FIELD_KEYS.prefabs, [...next, index], item?.id);
          (item?.placements ?? []).forEach((placement, childIndex) => scan(placement, FIELD_KEYS.prefabPlacements, [...next, index, 'placements', childIndex], placement?.placementId));
        });
        else if (key === 'visualAnimalLots' && Array.isArray(child)) child.forEach((item, index) => scan(item, FIELD_KEYS.visualAnimalLots, [...next, index], item?.id));
        else if (key === 'groundingOverlays' && Array.isArray(child)) child.forEach((item, index) => scan(item, FIELD_KEYS.groundingOverlays, [...next, index], null));
        else if (key === 'referenceRoles') scan(child, FIELD_KEYS.referenceRoles, next, null);
        else if (key === 'visualAnimalBudget') scan(child, FIELD_KEYS.visualAnimalBudget, next, null);
        else if (key === 'renderSettings') scan(child, FIELD_KEYS.renderSettings, next, null);
        else if (key.endsWith('Review')) scan(child, FIELD_KEYS.review, next, null);
      }
    }
  };
  scan(source, FIELD_KEYS.root);
  return unknown.sort((a, b) => a.path.localeCompare(b.path));
}

function sourceAssetIds(source) {
  return [...new Set([source.terrainAssetId, ...source.placements.map(item => item.assetId), ...(source.groundingOverlays ?? []).map(item => item.assetId)].filter(Boolean))].sort();
}

function coordinateFrame(source) {
  return {
    frameId: 'ranch-composition-v4-canvas-pixel',
    units: 'px',
    footprintPx: [...source.footprintPx],
    projection: source.projection,
    originConvention: 'not specified; source coordinates are preserved without transform',
    gridMappingStatus: 'unsupported',
  };
}

function expectedPlacements(source, assets) {
  const assetsById = new Map(assets.map(asset => [asset.assetId, asset]));
  return source.placements.map(item => ({...copy(item), canonicalAsset: copy(assetsById.get(item.assetId))}));
}

function expectedIds(source) {
  return {
    placementIds: source.placements.map(item => item.placementId),
    assetIds: sourceAssetIds(source),
    zoneIds: source.zones.map(zone => zone.id),
    prefabIds: source.prefabs.map(prefab => prefab.id),
  };
}

function derivedProjection(source, assets, unknownSourceFields) {
  return {
    coordinateFrame: coordinateFrame(source),
    ids: expectedIds(source),
    placements: expectedPlacements(source, assets),
    assets,
    unknownSourceFields,
    sourceDigest: sha256(source),
  };
}

/**
 * Wrap the authored ranch composition without converting its pixel geometry
 * into the grid-cell scene contract. Source data remains authoritative and is
 * retained in full; derived indexes are references into that snapshot.
 */
export function adaptRanchSourceSceneV2(source, semanticManifest, pilot = {}) {
  validateSourceScene(source);
  const manifestAssets = semanticManifest?.assets ?? [];
  if (!Array.isArray(manifestAssets)) throw new TypeError('Invalid ranch semantic manifest: expected assets');
  const seenManifestIds = new Set();
  const duplicateManifestIds = new Set();
  for (const asset of manifestAssets) {
    const id = asset?.id;
    if (seenManifestIds.has(id)) duplicateManifestIds.add(id);
    seenManifestIds.add(id);
  }
  const sortedDuplicateManifestIds = [...duplicateManifestIds].sort();
  if (sortedDuplicateManifestIds.length) {
    throw new TypeError(`Ranch source manifest contains duplicate asset IDs: ${sortedDuplicateManifestIds.join(', ')}`);
  }
  const assetsById = new Map(manifestAssets.map(asset => [asset.id, asset]));
  const assetIds = sourceAssetIds(source);
  const missingAssetIds = assetIds.filter(assetId => !assetsById.has(assetId));
  if (missingAssetIds.length) throw new TypeError(`Ranch source assets missing from canonical manifest: ${missingAssetIds.join(', ')}`);
  const selectedPilotIds = new Set(pilot.assetIds ?? []);
  const resolvedAssets = assetIds.map(assetId => {
    const record = assetsById.get(assetId);
    return {
      assetId,
      canonicalStatus: record.status,
      canonicalReview: copy(record.review ?? null),
      canonicalRights: copy(record.rights ?? null),
      pilotScope: selectedPilotIds.has(assetId) ? {
        artDecision: pilot.artReview?.decision ?? null,
        technicalDecision: pilot.technicalReview?.decision ?? null,
        releasePromotion: false,
      } : null,
    };
  });
  const sourceSnapshot = copy(source);
  const unknownSourceFields = findUnknownFields(sourceSnapshot);
  const derived = derivedProjection(sourceSnapshot, resolvedAssets, unknownSourceFields);
  const derivedDigest = sha256({
    coordinateFrame: derived.coordinateFrame,
    ids: derived.ids,
    placements: derived.placements,
    assets: derived.assets,
    unknownSourceFields: derived.unknownSourceFields,
  });
  return {
    adapterVersion: RANCH_SOURCE_SCENE_ADAPTER_VERSION,
    sourceFormat: {
      formatId: RANCH_SOURCE_SCENE_FORMAT,
      schemaVersion: String(source.schemaVersion),
      sceneId: source.sceneId,
      sourceDigest: derived.sourceDigest,
      derivedDigest,
      coordinateFrame: derived.coordinateFrame,
      ids: derived.ids,
    },
    sourceScene: sourceSnapshot,
    placements: derived.placements,
    assets: resolvedAssets,
    unknownSourceFields,
  };
}

export function restoreRanchSourceSceneV2(document) {
  if (document?.adapterVersion !== RANCH_SOURCE_SCENE_ADAPTER_VERSION
    || document?.sourceFormat?.formatId !== RANCH_SOURCE_SCENE_FORMAT
    || !document.sourceScene) throw new TypeError('Unsupported or incomplete ranch source-scene adapter document');
  if (sha256(document.sourceScene) !== document.sourceFormat.sourceDigest) throw new TypeError('Ranch source snapshot failed its integrity check');
  validateSourceScene(document.sourceScene);
  const unknownSourceFields = findUnknownFields(document.sourceScene);
  const expected = derivedProjection(document.sourceScene, document.assets ?? [], unknownSourceFields);
  const expectedDigest = sha256({
    coordinateFrame: expected.coordinateFrame,
    ids: expected.ids,
    placements: expected.placements,
    assets: expected.assets,
    unknownSourceFields: expected.unknownSourceFields,
  });
  if (!isDeepStrictEqual(document.sourceFormat.coordinateFrame, expected.coordinateFrame)
    || !isDeepStrictEqual(document.sourceFormat.ids, expected.ids)
    || !isDeepStrictEqual(document.placements, expected.placements)
    || !isDeepStrictEqual(document.unknownSourceFields, expected.unknownSourceFields)
    || document.sourceFormat.schemaVersion !== String(document.sourceScene.schemaVersion)
    || document.sourceFormat.sceneId !== document.sourceScene.sceneId
    || document.sourceFormat.derivedDigest !== expectedDigest) {
    throw new TypeError('Ranch derived indexes do not match the preserved source scene');
  }
  return copy(document.sourceScene);
}
