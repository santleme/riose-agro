import {normalizeSceneAssetReferences} from './asset-contract.js';

const coordinateNoise = (seed, x, y) => {
  let value = (seed ^ Math.imul(x + 37, 0x45d9f3b) ^ Math.imul(y + 17, 0x119de1f3)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
};

/** A presentation-only dry-pasture variant. It deliberately carries no scientific drought claim. */
export function createWaterStressVisualVariant(sourceScene, {seed = sourceScene?.simulation?.seed, dryCoverage = 0.46, rendererManifest, sourceManifest} = {}) {
  if (!sourceScene || !Array.isArray(sourceScene.terrainTiles) || !Array.isArray(sourceScene.zones)) throw new TypeError('A generated base scene with terrainTiles and zones is required');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('Visual variant seed must be an unsigned 32-bit integer');
  if (!Number.isFinite(dryCoverage) || dryCoverage < 0 || dryCoverage > 1) throw new TypeError('dryCoverage must be between 0 and 1');
  if (!rendererManifest || !sourceManifest) throw new TypeError('Renderer and asset source manifests are required to resolve every generated sprite');
  const scene = structuredClone(sourceScene);
  const grass = new Set(['grass-light', 'grass-mid']);
  scene.terrainTiles = scene.terrainTiles.map(tile => {
    if (!grass.has(tile.assetId)) return tile;
    const x = tile.position.x, y = tile.position.y;
    const regional = (Math.sin(x * 0.21 + seed * 0.0001) + Math.cos(y * 0.29 - x * 0.13)) / 4 + 0.5;
    return coordinateNoise(seed, x, y) * 0.38 + regional * 0.62 < dryCoverage
      ? {...tile, assetId: 'soil-dry'} : tile;
  });
  scene.sceneId = 'riose-beef-water-stress-visual-v1';
  scene.name = 'Pastagem seca · variante visual';
  scene.simulation.scenarioId = 'visual-water-stress-preview-no-science';
  scene.domainModule = {
    moduleId: 'visual-water-stress-preview',
    version: 'scene-variant-v1',
    status: 'in-progress',
    modelIds: [],
  };
  scene.provenance = {...scene.provenance, sourceId: 'seeded-visual-variant-v1', sourceSceneId: sourceScene.sceneId};
  scene.visualVariant = {
    schemaVersion: 1,
    classification: 'visual-only-unvalidated',
    label: 'Demonstração visual de pastagem seca; não representa saída do modelo científico.',
    seed,
    dryCoverage,
    rule: 'seeded-spatial-noise-plus-low-frequency-patches',
  };
  const pastureZones = scene.zones.filter(zone => zone.kind === 'pasture');
  scene.entities = pastureZones.flatMap((zone, zoneIndex) => Array.from({length: 4}, (_, index) => {
    const columns = Math.max(1, zone.footprint.columns - 2), rows = Math.max(1, zone.footprint.rows - 2);
    const column = zone.origin.x + 1 + ((index * 3 + zoneIndex * 2) % columns);
    const row = zone.origin.y + 1 + ((index * 5 + zoneIndex) % rows);
    return {
      entityId: `water-stress-preview-cow-${zoneIndex + 1}-${index + 1}`,
      kind: 'animal',
      position: {x: column + 0.5, y: row + 0.5, unit: 'grid-cell'},
      asset: {assetId: ['livestock-nelore-cow-idle-imagegen-v1', 'livestock-nelore-heifer-idle-imagegen-v1', 'livestock-nelore-calf-idle-imagegen-v1'][index % 3]},
      state: {stateId: 'idle'},
      representationMode: 'sampled-miniature',
      groupId: zone.zoneId,
      visualId: `stress-preview-${zoneIndex + 1}-${index + 1}`,
    };
  }));
  normalizeSceneAssetReferences(scene, rendererManifest, sourceManifest);
  return scene;
}

