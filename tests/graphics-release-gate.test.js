import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertGraphicsReleaseInputsReady, assertGraphicsReleaseReady, inspectGraphicsReleaseFiles} from '../scripts/assets/graphics-release-gate.mjs';

const approvedFixture = JSON.parse(await readFile(new URL('./fixtures/graphics-release/approved-manifests.json', import.meta.url), 'utf8'));

function cloneFixture() {
  return structuredClone(approvedFixture);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

async function withFilesystemFixture(run) {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'riose-graphics-release-'));
  const sourceBytes = Buffer.from('asset source bytes');
  const exportBytes = Buffer.from('asset export bytes');
  const atlasBytes = pngHeader(10, 12);
  await mkdir(path.join(repositoryRoot, 'assets'), {recursive: true});
  await mkdir(path.join(repositoryRoot, 'graphics-poc'), {recursive: true});
  await writeFile(path.join(repositoryRoot, 'assets/source.png'), sourceBytes);
  await writeFile(path.join(repositoryRoot, 'assets/export.png'), exportBytes);
  await writeFile(path.join(repositoryRoot, 'assets/manifest.json'), '{}\n');
  await writeFile(path.join(repositoryRoot, 'graphics-poc/atlas.png'), atlasBytes);

  const inputs = {
    semanticManifest: {
      assets: [{
        id: 'livestock.cattle.nelore.adult.v1',
        file: 'assets/export.png',
        source: {sourceFile: 'assets/source.png', sha256: sha256(sourceBytes)},
      }],
    },
    dairyManifest: {assets: [], atlases: {}},
    rendererManifest: {
      atlases: {livestock: '/graphics-poc/atlas.png'},
      atlasSha256: {livestock: sha256(atlasBytes)},
      assets: [{
        assetId: 'nelore-adult',
        sourceSemanticId: 'livestock.cattle.nelore.adult.v1',
        sourceFile: 'assets/source.png',
        manifestSource: 'assets/manifest.json',
        atlasKey: 'livestock',
        frame: {x: 2, y: 3, w: 4, h: 5},
      }],
    },
  };
  try {
    await run({repositoryRoot, inputs, sourceBytes, atlasBytes});
  } finally {
    await rm(repositoryRoot, {recursive: true, force: true});
  }
}

test('release packaging refuses the current unreviewed and unresolved graphics manifests', async () => {
  await assert.rejects(assertGraphicsReleaseReady(), error => {
    assert.match(error.message, /^Graphics release blocked \(\d+ manifest issue\(s\)\):/);
    assert.match(error.message, /status REVIEW is not release eligible/);
    assert.match(error.message, /unresolved renderer asset reference/);
    assert.match(error.message, /no documented rights basis/);
    assert.doesNotMatch(error.message, /file is missing or unreadable/);
    assert.doesNotMatch(error.message, /hash does not match|outside generated atlas|not byte-identical|does not match source atlas membership/);
    return true;
  });
});

test('fully reviewed release fixture resolves semantic and renderer atlas membership', () => {
  assert.equal(approvedFixture.semanticManifest.assets[0].status, 'RELEASED');
  assert.equal(approvedFixture.semanticManifest.atlasPacks.livestock.image, '/assets/atlas/livestock.png');
  assert.equal(approvedFixture.semanticManifest.assets[0].atlas.pack, 'livestock');
  assert.equal(approvedFixture.rendererManifest.atlases.livestock, '/graphics-poc/assets/livestock.png');
  assert.equal(approvedFixture.rendererManifest.assets[0].atlasKey, 'livestock');
  assert.doesNotThrow(() => assertGraphicsReleaseInputsReady(approvedFixture));
});

test('release gate rejects a renderer asset without a matching semantic source record', () => {
  const fixture = cloneFixture();
  fixture.semanticManifest.assets = [];
  assert.throws(
    () => assertGraphicsReleaseInputsReady(fixture),
    /nelore-adult semantic\/source record does not resolve/
  );
});

test('release gate rejects duplicate semantic asset IDs', () => {
  const fixture = cloneFixture();
  fixture.semanticManifest.assets.push(structuredClone(fixture.semanticManifest.assets[0]));
  assert.throws(
    () => assertGraphicsReleaseInputsReady(fixture),
    /duplicate semantic manifest asset id: livestock\.cattle\.nelore\.adult\.v1/
  );
});

test('release gate rejects duplicate renderer asset IDs', () => {
  const fixture = cloneFixture();
  fixture.rendererManifest.assets.push(structuredClone(fixture.rendererManifest.assets[0]));
  assert.throws(
    () => assertGraphicsReleaseInputsReady(fixture),
    /duplicate renderer asset assetId: nelore-adult/
  );
});

test('release gate rejects review-only source assets and unresolved renderer references', () => {
  const reviewFixture = cloneFixture();
  reviewFixture.semanticManifest.assets[0].status = 'REVIEW';
  assert.throws(() => assertGraphicsReleaseInputsReady(reviewFixture), /status REVIEW is not release eligible/);

  const unresolvedFixture = cloneFixture();
  unresolvedFixture.rendererManifest.unresolvedAssetIds = ['nelore-adult'];
  assert.throws(() => assertGraphicsReleaseInputsReady(unresolvedFixture), /unresolved renderer asset reference: nelore-adult/);
});

test('release gate rejects a source without documented rights', () => {
  const fixture = cloneFixture();
  delete fixture.semanticManifest.assets[0].rights;
  assert.throws(() => assertGraphicsReleaseInputsReady(fixture), /no documented rights basis/);
});

test('release gate rejects a released asset with no semantic atlas membership', () => {
  const fixture = cloneFixture();
  delete fixture.semanticManifest.assets[0].atlas;
  assert.throws(
    () => assertGraphicsReleaseInputsReady(fixture),
    /livestock\.cattle\.nelore\.adult\.v1 atlas membership does not resolve to a declared atlas pack/
  );
});

test('release gate rejects semantic and renderer atlas membership that disagrees', () => {
  const fixture = cloneFixture();
  fixture.rendererManifest.atlases.other = '/graphics-poc/assets/other.png';
  fixture.rendererManifest.assets[0].atlasKey = 'other';
  assert.throws(
    () => assertGraphicsReleaseInputsReady(fixture),
    /renderer atlas does not match semantic atlas membership/
  );
});

test('filesystem gate rejects missing source and export files in an isolated fixture', async () => {
  await withFilesystemFixture(async ({repositoryRoot, inputs}) => {
    await unlink(path.join(repositoryRoot, 'assets/source.png'));
    await unlink(path.join(repositoryRoot, 'assets/export.png'));
    const errors = await inspectGraphicsReleaseFiles(inputs, repositoryRoot);
    assert(errors.some(error => /livestock\.cattle\.nelore\.adult\.v1 export file is missing or unreadable/.test(error)));
    assert(errors.some(error => /livestock\.cattle\.nelore\.adult\.v1 source file is missing or unreadable/.test(error)));
    assert(errors.some(error => /nelore-adult source file is missing or unreadable/.test(error)));
  });
});

test('filesystem gate rejects provenance and generated-atlas hash mismatches in an isolated fixture', async () => {
  await withFilesystemFixture(async ({repositoryRoot, inputs}) => {
    inputs.semanticManifest.assets[0].source.sha256 = '0'.repeat(64);
    inputs.rendererManifest.atlasSha256.livestock = '0'.repeat(64);
    const errors = await inspectGraphicsReleaseFiles(inputs, repositoryRoot);
    assert(errors.some(error => /source hash does not match its provenance record/.test(error)));
    assert(errors.some(error => /renderer atlas livestock hash does not match atlasSha256/.test(error)));
  });
});

test('filesystem gate rejects generated frames that exceed the atlas dimensions', async () => {
  await withFilesystemFixture(async ({repositoryRoot, inputs}) => {
    inputs.rendererManifest.assets[0].frame = {x: 9, y: 3, w: 2, h: 5};
    const errors = await inspectGraphicsReleaseFiles(inputs, repositoryRoot);
    assert(errors.some(error => /outside generated atlas livestock \(10x12\)/.test(error)));
  });
});

test('atlas size and browser load evidence match the pinned manifest and contain raw samples', async () => {
  const [manifest, report] = await Promise.all([
    readFile(new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../docs/evidence/graphics-atlas-load-2026-10-12.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.equal(report.atlasCount, Object.keys(manifest.atlases).length);
  assert.deepEqual(report.unresolvedAssetIds, manifest.unresolvedAssetIds);
  assert.equal(report.totalBytes, report.atlases.reduce((sum, atlas) => sum + atlas.byteSize, 0));
  for (const [key, url] of Object.entries(manifest.atlases)) {
    const row = report.atlases.find(atlas => atlas.key === key);
    assert.ok(row, `evidence includes atlas ${key}`);
    assert.equal(row.url, url);
    assert.equal(row.expectedSha256, manifest.atlasSha256[key]);
    const statuses = manifest.assets.filter(asset => asset.atlasKey === key).reduce((counts, asset) => {
      const status = asset.reviewStatus ?? 'UNRESOLVED';
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
    assert.deepEqual(row.semanticStatuses, Object.fromEntries(Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b))));
    const bytes = await readFile(new URL(`../${row.file}`, import.meta.url));
    assert.equal(bytes.length, row.byteSize);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
    assert.equal(row.browserSamples.length, report.environment.repeats);
    const durations = row.browserSamples.map(sample => sample.totalMs).sort((a, b) => a - b);
    assert.equal(row.browserLoad.medianTotalMs, Number(durations[Math.floor(durations.length / 2)].toFixed(3)));
    assert.ok(row.browserSamples.every(sample => sample.byteSize === row.byteSize && sample.width > 0 && sample.height > 0));
  }
});
