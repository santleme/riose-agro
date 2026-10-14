import compiledGeometry from './asset-geometry-v1.json' with {type: 'json'};

/** Build the reviewable spatial registry consumed by generation and scene validation. */
export function buildAssetRegistry(rendererManifest, sourceManifest, geometryManifest = null) {
  if (!Array.isArray(rendererManifest?.assets)) throw new TypeError('Renderer manifest must contain assets');
  if (!Array.isArray(sourceManifest?.assetSources)) throw new TypeError('Source manifest must contain assetSources');
  const sources = new Map(sourceManifest.assetSources.map(source => [source.assetId, source]));
  const geometries = new Map(Object.entries((geometryManifest ?? compiledGeometry).assets ?? {}));
  const ids = new Set();
  const assets = rendererManifest.assets.map(asset => {
    if (!asset.assetId || ids.has(asset.assetId)) throw new TypeError(`Missing or duplicate assetId: ${asset.assetId}`);
    ids.add(asset.assetId);
    const source = sources.get(asset.assetId);
    const spatialGeometry = geometries.get(asset.assetId) ?? {
      assetId: asset.assetId,
      geometryStatus: 'missing-source',
      reviewRequired: true,
      units: 'world-cell',
    };
    const frame = asset.frame;
    const anchor = asset.anchor;
    const footprint = asset.footprint;
    if (!asset.category || !frame || ![frame.x, frame.y, frame.w, frame.h].every(Number.isFinite)
      || frame.w <= 0 || frame.h <= 0 || !anchor || ![anchor.x, anchor.y].every(Number.isFinite)
      || !Array.isArray(footprint) || footprint.length !== 2 || footprint.some(value => !Number.isFinite(value) || value <= 0)) {
      throw new TypeError(`Asset ${asset.assetId} is missing required spatial metadata`);
    }
    return {
      assetId: asset.assetId,
      category: asset.category,
      dimensionsPx: {width: frame.w, height: frame.h},
      atlas: {key: asset.atlasKey, frame: {...frame}},
      displaySizePx: {width: asset.displaySize?.[0] ?? Math.round(frame.w * asset.scale), height: asset.displaySize?.[1] ?? Math.round(frame.h * asset.scale)},
      projection: asset.category === 'terrain' ? 'isometric-ground-2to1' : 'isometric-3quarter-unverified',
      footprintCells: spatialGeometry.groundFootprintCandidate ?? {columns: footprint[0], rows: footprint[1]},
      spatialGeometry,
      pivot: {x: anchor.x, y: anchor.y, units: 'normalized'},
      collision: spatialGeometry.collisionPolicy === 'blocking'
        ? {type: 'polygon', units: 'world-cell', vertices: spatialGeometry.collisionPolygonCandidate, reviewRequired: spatialGeometry.reviewRequired}
        : null,
      terrainProperties: asset.category === 'terrain' ? {role: 'ground-tile', terrainId: asset.assetId} : null,
      animations: [],
      animationStatus: 'none-declared',
      license: source ? {status: source.status, sourceManifest: source.sourceManifest ?? null, note: source.sourceApproval ?? source.sourceReview?.decisionNote ?? null} : {status: 'UNRESOLVED', sourceManifest: null, note: 'No source record is declared.'},
      source: {file: source?.sourceFile ?? asset.sourceFile ?? null, runtimeFile: source?.file ?? null, semanticId: asset.sourceSemanticId ?? source?.sourceSemanticId ?? null},
      reviewStatus: asset.reviewStatus ?? 'UNRESOLVED',
      metadataConfidence: {projection: asset.category === 'terrain' ? 'declared' : 'inferred-from-atlas',
        footprint: spatialGeometry.geometryStatus ?? 'manifest', collision: spatialGeometry.geometryStatus ?? 'manifest'},
    };
  }).sort((a, b) => a.assetId.localeCompare(b.assetId));
  return {schemaVersion: '1.0.0', registryId: 'riose-graphics-asset-registry', projectionBasis: 'isometric-2-to-1', assets};
}

export function validateAssetRegistry(registry) {
  const errors = [];
  if (registry?.schemaVersion !== '1.0.0' || !Array.isArray(registry.assets)) return ['Registry must use schemaVersion 1.0.0 and contain assets.'];
  const ids = new Set();
  for (const [index, asset] of registry.assets.entries()) {
    const path = `assets[${index}]`;
    if (typeof asset.assetId !== 'string' || !asset.assetId || ids.has(asset.assetId)) errors.push(`${path}.assetId is missing or duplicated`);
    ids.add(asset.assetId);
    if (!asset.category || !asset.dimensionsPx || asset.dimensionsPx.width <= 0 || asset.dimensionsPx.height <= 0) errors.push(`${path} lacks category or positive pixel dimensions`);
    if (!asset.footprintCells || asset.footprintCells.columns <= 0 || asset.footprintCells.rows <= 0) errors.push(`${path} lacks a positive spatial footprint`);
    if (!asset.pivot || ![asset.pivot.x, asset.pivot.y].every(Number.isFinite)) errors.push(`${path} lacks a finite normalized pivot`);
    if (!asset.projection || !asset.source || !('file' in asset.source) || !asset.license || !Array.isArray(asset.animations)) errors.push(`${path} lacks projection, source, license or animation metadata`);
    if (!asset.spatialGeometry || asset.spatialGeometry.units !== 'world-cell') errors.push(`${path} lacks canonical world-cell geometry`);
    if (asset.spatialGeometry.geometryStatus === 'inferred-review-required' && asset.spatialGeometry.reviewRequired !== true) errors.push(`${path} hides unresolved geometry review`);
    if (asset.spatialGeometry.geometryStatus === 'inferred-review-required' && (!asset.spatialGeometry.collisionPolygonCandidate?.length || !asset.spatialGeometry.groundContactAnchor)) errors.push(`${path} lacks measured contact geometry evidence`);
  }
  return errors;
}
