import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SEMANTIC_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const SHIP_STATUSES = new Set(['RELEASED']);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

function check(condition, message, errors) {
  if (!condition) errors.push(message);
}

function uniqueBy(records, key, label, errors) {
  const seen = new Set();
  for (const [index, record] of records.entries()) {
    const value = record?.[key];
    check(typeof value === 'string' && value.length > 0, `${label}[${index}] has no ${key}`, errors);
    if (typeof value !== 'string') continue;
    check(!seen.has(value), `duplicate ${label} ${key}: ${value}`, errors);
    seen.add(value);
  }
  return seen;
}

function validateManifest(manifest, label, errors) {
  check(manifest && Array.isArray(manifest.assets), `${label} has no assets array`, errors);
  if (!Array.isArray(manifest?.assets)) return;
  uniqueBy(manifest.assets, 'id', `${label} asset`, errors);
  for (const [index, asset] of manifest.assets.entries()) {
    const id = asset?.id ?? `${label}[${index}]`;
    check(typeof asset?.id === 'string' && SEMANTIC_ID.test(asset.id), `${id} has an invalid semantic ID`, errors);
    check(typeof asset?.source?.sourceFile === 'string' && asset.source.sourceFile.length > 0, `${id} has no source-file provenance`, errors);
    check(asset?.rights?.licenseState === 'documented' && typeof asset.rights.notes === 'string' && asset.rights.notes.trim().length > 0,
      `${id} has no documented rights basis`, errors);
    check(SHIP_STATUSES.has(asset?.status), `${id} status ${String(asset?.status)} is not release eligible`, errors);
    check(asset?.review?.art === 'pass' && asset?.review?.technical === 'pass', `${id} lacks explicit art and technical approval`, errors);
    const atlas = asset?.atlas;
    const hasAtlasMembership = typeof atlas === 'object' && atlas !== null && typeof atlas.pack === 'string';
    if (SHIP_STATUSES.has(asset?.status)) {
      check(hasAtlasMembership && Object.hasOwn(manifest.atlasPacks ?? {}, atlas.pack),
        `${id} atlas membership does not resolve to a declared atlas pack`, errors);
    } else if (hasAtlasMembership) {
      check(Object.hasOwn(manifest.atlasPacks ?? {}, atlas.pack),
        `${id} atlas membership does not resolve to a declared atlas pack`, errors);
    }
    for (const reference of asset?.references ?? []) {
      check(typeof reference === 'string' && reference.trim().length > 0, `${id} has an unresolved or empty reference`, errors);
    }
  }
}

function validateRendererManifest(renderer, sourceManifests, releaseScenes, errors) {
  const atlases = renderer?.atlases ?? {};
  const assets = Array.isArray(renderer?.assets) ? renderer.assets : [];
  check(Object.keys(atlases).length > 0, 'renderer manifest has no atlases', errors);
  uniqueBy(assets, 'assetId', 'renderer asset', errors);
  const assetIds = new Set(assets.map(asset => asset?.assetId).filter(Boolean));

  check(Array.isArray(renderer?.unresolvedAssetIds), 'renderer manifest must declare unresolvedAssetIds', errors);
  for (const id of renderer?.unresolvedAssetIds ?? []) errors.push(`unresolved renderer asset reference: ${id}`);

  for (const asset of assets) {
    const id = asset?.assetId ?? '<missing assetId>';
    check(typeof asset?.sourceSemanticId === 'string' && SEMANTIC_ID.test(asset.sourceSemanticId), `${id} has no valid semantic source ID`, errors);
    check(typeof asset?.sourceFile === 'string' && asset.sourceFile.length > 0, `${id} has no origin path`, errors);
    check(asset?.manifestSource && typeof asset.manifestSource === 'string', `${id} has no source manifest provenance`, errors);
    check(Object.hasOwn(atlases, asset?.atlasKey), `${id} belongs to undeclared atlas ${String(asset?.atlasKey)}`, errors);
    check(asset?.reviewStatus === 'RELEASED', `${id} renderer status ${String(asset?.reviewStatus)} is not release eligible`, errors);
    const source = sourceManifests.flatMap(manifest => manifest.assets ?? [])
      .find(entry => entry.id === id || entry.id === asset?.sourceSemanticId || entry.semanticId === asset?.sourceSemanticId);
    check(Boolean(source), `${id} semantic/source record does not resolve`, errors);
    if (source) {
      check(source.status === 'RELEASED', `${id} source status ${String(source.status)} is not RELEASED`, errors);
      check(source.review?.art === 'pass' && source.review?.technical === 'pass', `${id} source review is not explicitly approved`, errors);
      check(source.rights?.licenseState === 'documented' && typeof source.rights.notes === 'string' && source.rights.notes.trim().length > 0,
        `${id} source record has no documented rights basis`, errors);
      check(source.source?.kind && !['unknown', 'legacy-unknown'].includes(source.source.kind), `${id} source origin is unknown`, errors);
      if (source.atlas) check(source.atlas.pack === asset.atlasKey, `${id} renderer atlas does not match semantic atlas membership`, errors);
    }
  }

  for (const [scenePath, scene] of releaseScenes) {
    const sceneRefs = new Set();
    const collectReferences = value => {
      if (Array.isArray(value)) return value.forEach(collectReferences);
      if (!value || typeof value !== 'object') return;
      if (typeof value.assetId === 'string') sceneRefs.add(value.assetId);
      for (const nested of Object.values(value)) collectReferences(nested);
    };
    collectReferences(scene);
    for (const id of sceneRefs) check(assetIds.has(id), `${scenePath} references unlisted renderer asset ${id}`, errors);
    for (const id of sceneRefs) check(!(renderer.unresolvedAssetIds ?? []).includes(id), `${scenePath} references unresolved asset ${id}`, errors);
  }
}

export async function assertGraphicsReleaseReady() {
  const [semanticManifest, dairyManifest, rendererManifest, beefScene, dairyScene] = await Promise.all([
    readJson('assets/manifests/manifest.json'),
    readJson('public/assets/modules/livestock-dairy/manifest.json'),
    readJson('graphics-poc/assets/main-composer-render-manifest.json'),
    readJson('graphics-poc/source/main-composer-v1/beef.json'),
    readJson('graphics-poc/source/main-composer-v1/dairy.json'),
  ]);
  assertGraphicsReleaseInputsReady({semanticManifest, dairyManifest, rendererManifest, releaseScenes: [
    ['beef scene', beefScene], ['dairy scene', dairyScene],
  ]});
}

/** Validate the exact manifest inputs used by a release build; exported for isolated fixture tests. */
export function assertGraphicsReleaseInputsReady({semanticManifest, dairyManifest, rendererManifest, releaseScenes}) {
  const errors = [];
  validateManifest(semanticManifest, 'semantic manifest', errors);
  validateRendererManifest(rendererManifest, [semanticManifest, dairyManifest], releaseScenes, errors);
  if (errors.length) {
    throw new Error(`Graphics release blocked (${errors.length} manifest issue(s)):\n${errors.map(error => `- ${error}`).join('\n')}`);
  }
}
