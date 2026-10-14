import {terrainCells} from './contract.js';

export const APPROVED_BENCHMARK_FIXTURE_ID = 'approved-livestock-v1';
export const APPROVED_BENCHMARK_ASSET_IDS = Object.freeze(['nelore-adult']);

const LEGACY_DIRECT_IMAGE_IDS = Object.freeze([
  'farm-starter-atlas',
  'nelore-adult',
  'handling-review-atlas-v1',
  'dairy-heifer',
  'dairy-activity-collar',
]);

function normalizeStatus(status) {
  if (status === 'APPROVED') return 'APPROVED';
  if (status === 'REVIEW') return 'REVIEW';
  if (status === 'REJECTED') return 'REJECTED';
  return 'UNRESOLVED';
}

function statusIndex(sourceManifest, renderManifest) {
  const statuses = new Map();
  for (const item of sourceManifest?.assetSources ?? []) statuses.set(item.assetId, item.status);
  for (const item of renderManifest?.assets ?? []) statuses.set(item.assetId, item.reviewStatus ?? item.status);
  return statuses;
}

function sceneAssetRoles(scene, renderPolicy = {}) {
  const roles = new Map();
  const add = (assetId, role) => {
    if (!assetId) return;
    const existing = roles.get(assetId) ?? new Set();
    existing.add(role);
    roles.set(assetId, existing);
  };
  if (renderPolicy.terrain !== false) {
    for (const cell of terrainCells(scene)) add(cell.assetId, 'terrain');
  }
  if (renderPolicy.infrastructure !== false) {
    for (const prefab of scene.prefabs ?? []) add(prefab.assetId, 'prefab');
    for (const entity of scene.entities ?? []) add(entity.asset?.assetId, 'entity');
  }
  add('nelore-adult', 'simulated-livestock');
  add('nelore-adult-low', 'derived-lod-texture');
  return roles;
}

export function classifyBenchmarkSceneAssets(scene, sourceManifest, renderManifest, renderPolicy) {
  const statuses = statusIndex(sourceManifest, renderManifest);
  const approvedNelore = normalizeStatus(statuses.get('nelore-adult')) === 'APPROVED';
  return [...sceneAssetRoles(scene, renderPolicy)].map(([assetId, roles]) => {
    const status = assetId === 'nelore-adult-low' && approvedNelore
      ? 'APPROVED'
      : normalizeStatus(statuses.get(assetId));
    return {
      assetId,
      classification: status,
      roles: [...roles].sort(),
      ...(assetId === 'nelore-adult-low' ? {derivedFrom: 'nelore-adult'} : {}),
    };
  }).sort((left, right) => left.assetId.localeCompare(right.assetId));
}

export function classifyLegacyBenchmarkImageResources(sourceManifest, renderManifest) {
  const sourceStatuses = statusIndex(sourceManifest, renderManifest);
  const directImages = LEGACY_DIRECT_IMAGE_IDS.map(assetId => ({
    resourceId: assetId,
    classification: normalizeStatus(sourceStatuses.get(assetId)),
    resourceType: 'image',
  }));
  const atlasResources = Object.entries(renderManifest?.atlases ?? {}).map(([atlasKey, url]) => {
    const assets = (renderManifest.assets ?? []).filter(asset => asset.atlasKey === atlasKey);
    const classes = new Set(assets.map(asset => normalizeStatus(asset.reviewStatus ?? asset.status)));
    const classification = classes.has('REJECTED') ? 'REJECTED'
      : classes.has('UNRESOLVED') ? 'UNRESOLVED'
        : classes.has('REVIEW') ? 'REVIEW'
          : classes.size && [...classes].every(value => value === 'APPROVED') ? 'APPROVED' : 'UNRESOLVED';
    return {resourceId: atlasKey, url, classification, resourceType: 'atlas'};
  });
  return [...directImages, ...atlasResources].sort((left, right) => left.resourceId.localeCompare(right.resourceId));
}

export function createApprovedBenchmarkFixture(scene, fixtureConfig, sourceManifest, renderManifest) {
  if (fixtureConfig?.fixtureId !== APPROVED_BENCHMARK_FIXTURE_ID) {
    throw new TypeError(`Unsupported approved benchmark fixture: ${fixtureConfig?.fixtureId ?? 'missing'}.`);
  }
  if (fixtureConfig.sourceSceneId !== scene.sceneId) {
    throw new TypeError(`Benchmark fixture expects source scene ${fixtureConfig.sourceSceneId}, received ${scene.sceneId}.`);
  }
  const approvedAssetIds = fixtureConfig.approvedAssetIds ?? [];
  if (approvedAssetIds.length !== APPROVED_BENCHMARK_ASSET_IDS.length
    || APPROVED_BENCHMARK_ASSET_IDS.some(assetId => !approvedAssetIds.includes(assetId))) {
    throw new TypeError('Approved benchmark fixture must use only the approved Nelore adult sprite.');
  }
  const statuses = statusIndex(sourceManifest, renderManifest);
  for (const assetId of approvedAssetIds) {
    if (normalizeStatus(statuses.get(assetId)) !== 'APPROVED') {
      throw new TypeError(`Benchmark asset ${assetId} is not explicitly approved.`);
    }
  }

  const fixtureScene = structuredClone(scene);
  fixtureScene.prefabs = [];
  fixtureScene.entities = [];
  fixtureScene.terrainTiles = [];
  fixtureScene.zones = (fixtureScene.zones ?? []).map(({groundAssetId, transitionAssetIds, ...zone}) => zone);
  const benchmarkAssets = classifyBenchmarkSceneAssets(fixtureScene, sourceManifest, renderManifest, fixtureConfig.renderPolicy);
  const nonApproved = benchmarkAssets.filter(asset => asset.classification !== 'APPROVED');
  if (nonApproved.length) {
    throw new TypeError(`Approved fixture references non-approved assets: ${nonApproved.map(asset => asset.assetId).join(', ')}.`);
  }

  return {
    fixtureId: fixtureConfig.fixtureId,
    sourceSceneId: scene.sceneId,
    scene: fixtureScene,
    approvedAssetIds: [...approvedAssetIds],
    benchmarkAssets,
    excludedSceneAssets: classifyBenchmarkSceneAssets(scene, sourceManifest, renderManifest)
      .filter(asset => asset.classification !== 'APPROVED'),
    renderPolicy: structuredClone(fixtureConfig.renderPolicy),
    simulation: structuredClone(fixtureConfig.simulation),
  };
}
