import {readFile, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {enrichRuntimeAssetManifest} from './runtime-asset-provenance.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SEMANTIC_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const SHIP_STATUSES = new Set(['RELEASED']);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

function resolveRepoPath(reference, repositoryRoot) {
  const normalized = reference.startsWith('/assets/') ? `public${reference}` : reference.replace(/^\//, '');
  const resolved = path.resolve(repositoryRoot, normalized);
  const relative = path.relative(repositoryRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`path escapes repository: ${reference}`);
  return resolved;
}

async function fileMetadata(reference, repositoryRoot) {
  const filePath = resolveRepoPath(reference, repositoryRoot);
  const [realRoot, realFilePath] = await Promise.all([realpath(repositoryRoot), realpath(filePath)]);
  const relative = path.relative(realRoot, realFilePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`resolved path escapes repository: ${reference}`);
  }
  const bytes = await readFile(realFilePath);
  return {
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: bytes.length >= 24 && bytes.toString('hex', 0, 8) === '89504e470d0a1a0a' ? bytes.readUInt32BE(16) : null,
    height: bytes.length >= 24 && bytes.toString('hex', 0, 8) === '89504e470d0a1a0a' ? bytes.readUInt32BE(20) : null,
  };
}

export async function inspectGraphicsReleaseFiles({semanticManifest, dairyManifest, rendererManifest, runtimeManifest}, repositoryRoot = root) {
  const errors = [];
  const checkFile = async (label, reference) => {
    if (typeof reference !== 'string' || !reference.trim()) {
      errors.push(`${label} has no file path`);
      return null;
    }
    try {
      const details = await fileMetadata(reference, repositoryRoot);
      if (!details.size) errors.push(`${label} file is empty: ${reference}`);
      return details;
    } catch (error) {
      errors.push(`${label} file is missing or unreadable: ${reference} (${error.message})`);
      return null;
    }
  };

  for (const asset of semanticManifest.assets ?? []) {
    await checkFile(`${asset.id} export`, asset.file);
    await checkFile(`${asset.id} source`, asset.source?.sourceFile);
    if (asset.source?.sha256) {
      const source = await fileMetadata(asset.source.sourceFile, repositoryRoot).catch(() => null);
      if (source) check(source.sha256 === asset.source.sha256, `${asset.id} source hash does not match its provenance record`, errors);
    }
  }
  for (const asset of dairyManifest.assets ?? []) {
    await checkFile(`${asset.id} atlas export`, asset.file);
    await checkFile(`${asset.id} source`, asset.sourceFile);
    if (asset.sourceSha256) {
      const source = await fileMetadata(asset.sourceFile, repositoryRoot).catch(() => null);
      if (source) check(source.sha256 === asset.sourceSha256, `${asset.id} source hash does not match its provenance record`, errors);
    }
    if (asset.spriteFile) {
      const sprite = await checkFile(`${asset.id} sprite export`, asset.spriteFile);
      if (sprite && asset.spriteSha256) check(sprite.sha256 === asset.spriteSha256,
        `${asset.id} sprite hash does not match its manifest record`, errors);
    }
  }
  for (const [atlasKey, atlas] of Object.entries(runtimeManifest?.atlases ?? {})) {
    const metadata = await checkFile(`runtime atlas ${atlasKey}`, atlas.image);
    if (metadata) {
      check(metadata.width !== null && metadata.height !== null, `runtime atlas ${atlasKey} is not a PNG`, errors);
      check(Array.isArray(atlas.sourceSize) && atlas.sourceSize[0] === metadata.width && atlas.sourceSize[1] === metadata.height,
        `runtime atlas ${atlasKey} dimensions do not match sourceSize`, errors);
      check(metadata.sha256 === runtimeManifest.atlasSha256?.[atlasKey],
        `runtime atlas ${atlasKey} hash does not match atlasSha256`, errors);
    }
  }
  for (const asset of runtimeManifest?.assets ?? []) {
    const atlasKey = asset.frame?.atlas;
    const atlas = runtimeManifest.atlases?.[atlasKey];
    if (!atlas) {
      errors.push(`runtime asset ${asset.id} frame references undeclared atlas ${String(atlasKey)}`);
      continue;
    }
    const metadata = await fileMetadata(atlas.image, repositoryRoot).catch(() => null);
    if (!metadata) continue;
    const frame = asset.frame;
    check(frame && [frame.x, frame.y, frame.w, frame.h].every(Number.isFinite)
      && frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0
      && frame.x + frame.w <= metadata.width && frame.y + frame.h <= metadata.height,
    `runtime asset ${asset.id} frame ${JSON.stringify(frame)} is outside atlas ${atlasKey} (${metadata.width}x${metadata.height})`, errors);
  }
  const sourceAtlasMetadata = new Map();
  for (const [atlasKey, atlas] of Object.entries(dairyManifest.atlases ?? {})) {
    const metadata = await checkFile(`source atlas ${atlasKey}`, atlas.image);
    if (metadata) sourceAtlasMetadata.set(atlasKey, metadata);
  }

  const atlasMetadata = new Map();
  for (const [atlasKey, atlasPath] of Object.entries(rendererManifest.atlases ?? {})) {
    const metadata = await checkFile(`renderer atlas ${atlasKey}`, atlasPath);
    if (!metadata) continue;
    atlasMetadata.set(atlasKey, metadata);
    const expectedHash = rendererManifest.atlasSha256?.[atlasKey];
    check(typeof expectedHash === 'string' && metadata.sha256 === expectedHash,
      `renderer atlas ${atlasKey} hash does not match atlasSha256`, errors);
  }

  for (const asset of rendererManifest.assets ?? []) {
    const label = asset.assetId ?? '<unnamed renderer asset>';
    await checkFile(`${label} source`, asset.sourceFile);
    await checkFile(`${label} source manifest`, asset.manifestSource);
    const metadata = atlasMetadata.get(asset.atlasKey);
    const frame = asset.frame;
    check(Boolean(metadata), `${label} has no generated atlas membership for ${String(asset.atlasKey)}`, errors);
    if (metadata) {
      check(metadata.width !== null && metadata.height !== null, `${label} atlas is not a PNG`, errors);
      check(frame && [frame.x, frame.y, frame.w, frame.h].every(Number.isInteger)
        && frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0
        && frame.x + frame.w <= metadata.width && frame.y + frame.h <= metadata.height,
      `${label} frame ${JSON.stringify(frame)} is outside generated atlas ${asset.atlasKey} (${metadata.width}x${metadata.height})`, errors);
    }
    const source = dairyManifest.assets?.find(entry => entry.id === asset.assetId || entry.semanticId === asset.sourceSemanticId);
    if (source?.frame?.atlas) {
      const sourceAtlas = sourceAtlasMetadata.get(source.frame.atlas);
      check(Boolean(sourceAtlas), `${label} source frame atlas ${source.frame.atlas} has no generated image`, errors);
      if (sourceAtlas && metadata) {
        check(sourceAtlas.sha256 === metadata.sha256,
          `${label} renderer atlas is not byte-identical to source atlas ${source.frame.atlas}`, errors);
        check(['x', 'y', 'w', 'h'].every(key => frame?.[key] === source.frame[key]),
          `${label} renderer frame does not match source atlas membership`, errors);
      }
    }
  }

  return errors;
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
      const sourceFile = source.source?.sourceFile ?? source.sourceFile;
      check(typeof sourceFile === 'string' && asset.sourceFile === sourceFile,
        `${id} renderer source file does not match its semantic source record`, errors);
      check(source.status === 'RELEASED', `${id} source status ${String(source.status)} is not RELEASED`, errors);
      check(source.review?.art === 'pass' && source.review?.technical === 'pass', `${id} source review is not explicitly approved`, errors);
      check(source.rights?.licenseState === 'documented' && typeof source.rights.notes === 'string' && source.rights.notes.trim().length > 0,
        `${id} source record has no documented rights basis`, errors);
      check(source.source?.kind && !['unknown', 'legacy-unknown'].includes(source.source.kind), `${id} source origin is unknown`, errors);
      if (source.atlas) check(source.atlas.pack === asset.atlasKey, `${id} renderer atlas does not match semantic atlas membership`, errors);
      if (source.frame?.atlas) {
        const ownerManifest = sourceManifests.find(manifest => (manifest.assets ?? []).includes(source));
        const sourceAtlas = ownerManifest?.atlases?.[source.frame.atlas];
        check(Boolean(sourceAtlas), `${id} source frame references undeclared atlas ${source.frame.atlas}`, errors);
        if (sourceAtlas && ownerManifest?.moduleId === 'livestock-dairy') {
          check(sourceAtlas.image?.endsWith('/dairy-assets-atlas-v1.png') && asset.atlasKey === 'dairy',
            `${id} renderer frame is not linked to the generated dairy atlas`, errors);
        }
      }
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
  const [semanticManifest, dairyManifest, rendererManifest, rawRuntimeManifest, beefScene, dairyScene] = await Promise.all([
    readJson('assets/manifests/manifest.json'),
    readJson('public/assets/modules/livestock-dairy/manifest.json'),
    readJson('graphics-poc/assets/main-composer-render-manifest.json'),
    readJson('public/assets/manifest.json'),
    readJson('graphics-poc/source/main-composer-v1/beef.json'),
    readJson('graphics-poc/source/main-composer-v1/dairy.json'),
  ]);
  const runtimeManifest = enrichRuntimeAssetManifest(rawRuntimeManifest, {semanticManifest, dairyManifest, rendererManifest});
  const filesystemErrors = await inspectGraphicsReleaseFiles({semanticManifest, dairyManifest, rendererManifest, runtimeManifest});
  assertGraphicsReleaseInputsReady({semanticManifest, dairyManifest, rendererManifest, runtimeManifest, releaseScenes: [
    ['beef scene', beefScene], ['dairy scene', dairyScene],
  ]}, filesystemErrors);
}

/** Validate the exact manifest inputs used by a release build; exported for isolated fixture tests. */
export function assertGraphicsReleaseInputsReady({semanticManifest, dairyManifest, rendererManifest, runtimeManifest, releaseScenes}, initialErrors = []) {
  const errors = [...initialErrors];
  validateManifest(semanticManifest, 'semantic manifest', errors);
  validateRendererManifest(rendererManifest, [semanticManifest, dairyManifest], releaseScenes, errors);
  validateRuntimeManifest(runtimeManifest, errors);
  if (errors.length) {
    throw new Error(`Graphics release blocked (${errors.length} manifest issue(s)):\n${errors.map(error => `- ${error}`).join('\n')}`);
  }
}

function validateRuntimeManifest(runtime, errors) {
  check(runtime && Array.isArray(runtime.assets), 'runtime Composer manifest has no assets array', errors);
  if (!Array.isArray(runtime?.assets)) return;
  check(runtime.atlases && typeof runtime.atlases === 'object' && !Array.isArray(runtime.atlases)
    && Object.keys(runtime.atlases).length > 0, 'runtime Composer manifest has no atlas map', errors);
  uniqueBy(runtime.assets, 'id', 'runtime asset', errors);
  for (const asset of runtime.assets) {
    const id = asset?.id ?? '<unnamed runtime asset>';
    check(asset?.reviewStatus === 'RELEASED', `${id} runtime status ${String(asset?.reviewStatus ?? 'UNRESOLVED')} is not release eligible`, errors);
    check(typeof asset?.provenance?.sourceFile === 'string' && asset.provenance.sourceFile.length > 0,
      `${id} runtime asset has no source-file provenance`, errors);
    check(typeof asset?.provenance?.sourceManifest === 'string' && asset.provenance.sourceManifest.length > 0,
      `${id} runtime asset has no source-manifest provenance`, errors);
    check(asset?.provenance?.rights?.licenseState === 'documented'
      && typeof asset.provenance.rights.notes === 'string' && asset.provenance.rights.notes.trim().length > 0,
    `${id} runtime asset has no documented rights basis`, errors);
    const frame = asset?.frame;
    check(frame && typeof frame.atlas === 'string' && Object.hasOwn(runtime.atlases ?? {}, frame.atlas),
      `${id} runtime frame has no declared atlas membership`, errors);
    check(frame && [frame.x, frame.y, frame.w, frame.h].every(Number.isFinite)
      && frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0,
    `${id} runtime frame has invalid coordinates`, errors);
  }
}
