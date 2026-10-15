/** Join runtime Composer assets to their reviewed source records without changing review decisions. */
export function enrichRuntimeAssetManifest(runtimeManifest, {semanticManifest, dairyManifest, rendererManifest}) {
  const semanticAssets = semanticManifest?.assets ?? [];
  const dairyAssets = dairyManifest?.assets ?? [];
  const rendererAssets = rendererManifest?.assets ?? [];
  const records = [...semanticAssets, ...dairyAssets];

  return {
    ...runtimeManifest,
    assets: (runtimeManifest?.assets ?? []).map(asset => {
      const renderer = rendererAssets.find(entry => entry.assetId === asset.id);
      const sourceId = renderer?.sourceSemanticId ?? asset.semanticId;
      const source = (typeof sourceId === 'string' ? records.find(entry => entry.id === sourceId || entry.semanticId === sourceId) : undefined)
        ?? (typeof asset.id === 'string' ? records.find(entry => entry.id === asset.id || entry.semanticId === asset.id) : undefined);
      const recordedStatuses = [renderer?.reviewStatus, source?.status, asset.reviewStatus, asset.status]
        .filter(status => typeof status === 'string' && status.trim());
      const declaredStatus = recordedStatuses.find(status => status !== 'RELEASED') ?? recordedStatuses[0];
      const reviewStatus = typeof declaredStatus === 'string' && declaredStatus.trim()
        ? declaredStatus
        : 'UNRESOLVED';
      const sourceFile = source?.source?.sourceFile ?? source?.sourceFile ?? renderer?.sourceFile ?? null;
      const sourceManifest = source
        ? (source.sourceManifest ?? (dairyAssets.includes(source) ? '/assets/modules/livestock-dairy/manifest.json' : '/assets/manifests/manifest.json'))
        : null;
      return {
        ...asset,
        reviewStatus,
        provenance: {
          sourceSemanticId: source?.id ?? source?.semanticId ?? renderer?.sourceSemanticId ?? null,
          sourceFile,
          sourceManifest,
          sourceSha256: source?.source?.sha256 ?? source?.sourceSha256 ?? null,
          sourceStatus: source?.status ?? renderer?.reviewStatus ?? null,
          rights: source?.rights ?? {licenseState: 'unknown', notes: 'No source rights record resolves for this runtime asset.'},
          review: source?.review ?? renderer?.sourceReview ?? null,
        },
      };
    }),
  };
}

export function enrichRendererManifest(rendererManifest, {semanticManifest, dairyManifest}) {
  const sources = [...(semanticManifest?.assets ?? []), ...(dairyManifest?.assets ?? [])];
  return {
    ...rendererManifest,
    assets: (rendererManifest?.assets ?? []).map(asset => {
      const source = typeof asset.sourceSemanticId === 'string'
        ? sources.find(entry => entry.id === asset.sourceSemanticId || entry.semanticId === asset.sourceSemanticId)
        : null;
      return {
        ...asset,
        sourceStatus: source?.status ?? asset.reviewStatus ?? 'UNRESOLVED',
        sourceFile: source?.source?.sourceFile ?? source?.sourceFile ?? asset.sourceFile ?? null,
        sourceManifest: source
          ? (source.sourceManifest ?? ((dairyManifest?.assets ?? []).includes(source) ? '/assets/modules/livestock-dairy/manifest.json' : '/assets/manifests/manifest.json'))
          : asset.manifestSource ?? null,
        rights: source?.rights ?? {licenseState: 'unknown', notes: 'No source rights record resolves for this renderer asset.'},
        sourceReview: source?.review ?? asset.sourceReview ?? null,
      };
    }),
  };
}
