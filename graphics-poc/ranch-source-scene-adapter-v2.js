import {createHash} from 'node:crypto';

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

const stable = value => JSON.stringify(value);
const sha256 = value => createHash('sha256').update(stable(value)).digest('hex');
const copy = value => structuredClone(value);

function findUnknownFields(source) {
  const unknown = [];
  const scan = (record, keys, path, idKey) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    for (const key of Object.keys(record).sort()) {
      if (!keys.has(key)) unknown.push({path: path ? `${path}.${key}` : key, ...(record[idKey] ? {sourceId: record[idKey]} : {})});
    }
  };
  scan(source, SOURCE_KEYS.root, '');
  scan(source.referenceRoles, SOURCE_KEYS.referenceRoles, 'referenceRoles');
  scan(source.visualAnimalBudget, SOURCE_KEYS.visualAnimalBudget, 'visualAnimalBudget');
  (source.visualAnimalLots ?? []).forEach(item => scan(item, SOURCE_KEYS.visualAnimalLots, 'visualAnimalLots[]', 'id'));
  (source.zones ?? []).forEach(item => scan(item, SOURCE_KEYS.zones, 'zones[]', 'id'));
  (source.groundingOverlays ?? []).forEach(item => scan(item, SOURCE_KEYS.groundingOverlays, 'groundingOverlays[]'));
  (source.prefabs ?? []).forEach(item => {
    scan(item, SOURCE_KEYS.prefabs, 'prefabs[]', 'id');
    (item.placements ?? []).forEach(child => scan(child, SOURCE_KEYS.prefabPlacements, 'prefabs[].placements[]', 'placementId'));
  });
  (source.placements ?? []).forEach(item => {
    scan(item, SOURCE_KEYS.placements, 'placements[]', 'placementId');
    scan(item.transform, SOURCE_KEYS.transform, 'placements[].transform', 'placementId');
  });
  scan(source.renderSettings, SOURCE_KEYS.renderSettings, 'renderSettings');
  for (const key of ['compositionReview', 'assetReview', 'groundingReview', 'gateReview', 'troughReview', 'feedTroughReview', 'sceneArtReview']) {
    scan(source[key], SOURCE_KEYS.review, key);
  }
  return unknown;
}

/**
 * Wrap the authored ranch composition without converting its pixel geometry
 * into the grid-cell scene contract. Source data remains authoritative and is
 * retained in full; derived indexes are references into that snapshot.
 */
export function adaptRanchSourceSceneV2(source, semanticManifest, pilot = {}) {
  if (!source || source.schemaVersion !== 1 || !Array.isArray(source.placements)
    || !Array.isArray(source.footprintPx) || source.footprintPx.length !== 2
    || !Array.isArray(source.zones) || !Array.isArray(source.prefabs)) {
    throw new TypeError('Invalid ranch source scene: expected v4 pixel composition fields');
  }
  const assetsById = new Map((semanticManifest?.assets ?? []).map(asset => [asset.id, asset]));
  const placementIds = source.placements.map(item => item.placementId);
  if (new Set(placementIds).size !== placementIds.length) throw new TypeError('Ranch source scene contains duplicate placement IDs');
  const sourceAssetIds = [...new Set([
    source.terrainAssetId,
    ...source.placements.map(item => item.assetId),
    ...(source.groundingOverlays ?? []).map(item => item.assetId),
  ].filter(Boolean))].sort();
  const missingAssetIds = sourceAssetIds.filter(assetId => !assetsById.has(assetId));
  if (missingAssetIds.length) throw new TypeError(`Ranch source assets missing from canonical manifest: ${missingAssetIds.join(', ')}`);
  const selectedPilotIds = new Set(pilot.assetIds ?? []);
  const sourceSnapshot = copy(source);
  const resolvedAssets = sourceAssetIds.map(assetId => {
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
  const assetById = new Map(resolvedAssets.map(asset => [asset.assetId, asset]));
  return {
    adapterVersion: RANCH_SOURCE_SCENE_ADAPTER_VERSION,
    sourceFormat: {
      formatId: RANCH_SOURCE_SCENE_FORMAT,
      schemaVersion: String(source.schemaVersion),
      sceneId: source.sceneId,
      sourceDigest: sha256(sourceSnapshot),
      coordinateFrame: {
        frameId: 'ranch-composition-v4-canvas-pixel',
        units: 'px',
        footprintPx: [...source.footprintPx],
        projection: source.projection,
        originConvention: 'not specified; source coordinates are preserved without transform',
      },
      ids: {
        placementIds: [...placementIds],
        assetIds: sourceAssetIds,
        zoneIds: source.zones.map(zone => zone.id),
        prefabIds: source.prefabs.map(prefab => prefab.id),
      },
    },
    sourceScene: sourceSnapshot,
    placements: sourceSnapshot.placements.map(item => ({...copy(item), canonicalAsset: copy(assetById.get(item.assetId))})),
    assets: resolvedAssets,
    unknownSourceFields: findUnknownFields(sourceSnapshot),
  };
}

export function restoreRanchSourceSceneV2(document) {
  if (document?.adapterVersion !== RANCH_SOURCE_SCENE_ADAPTER_VERSION
    || document?.sourceFormat?.formatId !== RANCH_SOURCE_SCENE_FORMAT
    || !document.sourceScene) throw new TypeError('Unsupported or incomplete ranch source-scene adapter document');
  if (sha256(document.sourceScene) !== document.sourceFormat.sourceDigest) throw new TypeError('Ranch source snapshot failed its integrity check');
  return copy(document.sourceScene);
}
