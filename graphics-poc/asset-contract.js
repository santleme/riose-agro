const REVIEW_STATUSES = new Set(['APPROVED', 'REVIEW', 'UNRESOLVED', 'RELEASED']);
const LEGACY_ASSET_IDS = {
  farmhouse: 'building-farmhouse-imagegen-v1',
  'farm-shed': 'building-shed-imagegen-v1',
  pond: 'water-pond-imagegen-v1',
  'water-trough': 'water-trough-round-imagegen-v1',
  'feed-trough': 'feed-trough-hay-imagegen-v1',
  'fence-straight': 'fence-wire-wood-post-imagegen-v1',
  'fence-gate': 'fence-gate-wood-imagegen-v1',
};

function canonicalAssetId(assetId) { return LEGACY_ASSET_IDS[assetId] ?? assetId; }

export function sceneAssetReference(assetId, rendererManifest, sourceManifest) {
  const rendererAsset = rendererManifest.assets.find(asset => asset.assetId === assetId);
  if (rendererAsset) return {
    assetId,
    manifestUri: '/graphics-poc/assets/main-composer-render-manifest.json',
    manifestVersion: 'main-composer-v1',
    reviewStatus: REVIEW_STATUSES.has(rendererAsset.reviewStatus) ? rendererAsset.reviewStatus : 'UNRESOLVED',
  };

  const sourceAsset = sourceManifest.assetSources.find(asset => asset.assetId === assetId);
  if (!sourceAsset && rendererManifest.unresolvedAssetIds?.includes(assetId)) return {
    assetId,
    manifestUri: '/graphics-poc/assets/main-composer-render-manifest.json',
    manifestVersion: 'main-composer-v1',
    reviewStatus: 'UNRESOLVED',
  };
  if (!sourceAsset) throw new TypeError(`No asset manifest entry for ${assetId}`);
  const status = REVIEW_STATUSES.has(sourceAsset.status) ? sourceAsset.status : 'UNRESOLVED';
  return {
    assetId,
    manifestUri: '/graphics-poc/asset-sources.json',
    manifestVersion: sourceManifest.sourceRevision.commit,
    reviewStatus: status,
  };
}

export function normalizeSceneAssetReferences(scene, rendererManifest, sourceManifest) {
  for (const asset of scene.assets) asset.assetId = canonicalAssetId(asset.assetId);
  for (const prefab of scene.prefabs) {
    prefab.assetId = canonicalAssetId(prefab.assetId);
    if (prefab.placementRules?.adjacentTo) prefab.placementRules.adjacentTo = prefab.placementRules.adjacentTo.map(canonicalAssetId);
  }
  for (const entity of scene.entities) if (entity.asset?.assetId) entity.asset.assetId = canonicalAssetId(entity.asset.assetId);
  for (const zone of scene.zones) {
    if (zone.groundAssetId) zone.groundAssetId = canonicalAssetId(zone.groundAssetId);
    for (const [edge, assetId] of Object.entries(zone.transitionAssetIds ?? {})) zone.transitionAssetIds[edge] = canonicalAssetId(assetId);
  }
  for (const tile of scene.terrainTiles ?? []) tile.assetId = canonicalAssetId(tile.assetId);
  const assetIds = new Set(scene.assets.map(asset => asset.assetId));
  for (const prefab of scene.prefabs) assetIds.add(prefab.assetId);
  for (const entity of scene.entities) if (entity.asset?.assetId) assetIds.add(entity.asset.assetId);
  for (const zone of scene.zones) {
    if (zone.groundAssetId) assetIds.add(zone.groundAssetId);
    for (const assetId of Object.values(zone.transitionAssetIds ?? {})) assetIds.add(assetId);
  }
  for (const tile of scene.terrainTiles ?? []) assetIds.add(tile.assetId);

  const canonical = new Map([...assetIds].map(assetId => [assetId, sceneAssetReference(assetId, rendererManifest, sourceManifest)]));
  scene.assets = [...canonical.values()].sort((a, b) => a.assetId.localeCompare(b.assetId));
  for (const entity of scene.entities) {
    if (entity.asset?.assetId) entity.asset = {...entity.asset, ...canonical.get(entity.asset.assetId)};
  }
  return scene;
}
