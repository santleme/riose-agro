import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertGraphicsReleaseInputsReady, assertGraphicsReleaseReady, inspectGraphicsReleaseFiles} from '../scripts/assets/graphics-release-gate.mjs';
import {enrichRuntimeAssetManifest} from '../scripts/assets/runtime-asset-provenance.mjs';

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
    runtimeManifest: {
      atlases: {livestock: {image: '/graphics-poc/atlas.png', sourceSize: [10, 12]}},
      atlasSha256: {livestock: sha256(atlasBytes)},
      assets: [{
        id: 'nelore-adult',
        reviewStatus: 'RELEASED',
        provenance: {sourceFile: 'assets/source.png', sourceManifest: 'assets/manifest.json', rights: {licenseState: 'documented', notes: 'Fixture rights'}},
        frame: {atlas: 'livestock', x: 2, y: 3, w: 4, h: 5},
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
    assert.match(error.message, /grass-light runtime status UNRESOLVED is not release eligible/);
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

test('runtime release gate treats missing status as unresolved and rejects every non-release status', () => {
  for (const status of ['REVIEW', 'UNRESOLVED', 'APPROVED']) {
    const fixture = cloneFixture();
    fixture.runtimeManifest.assets[0].reviewStatus = status;
    assert.throws(() => assertGraphicsReleaseInputsReady(fixture), new RegExp(`nelore-adult runtime status ${status} is not release eligible`));
  }
  const missing = cloneFixture();
  delete missing.runtimeManifest.assets[0].reviewStatus;
  assert.throws(() => assertGraphicsReleaseInputsReady(missing), /nelore-adult runtime status UNRESOLVED is not release eligible/);
});

test('runtime release gate requires declared atlas membership and finite positive frame coordinates', () => {
  const missing = cloneFixture();
  delete missing.runtimeManifest.assets[0].frame;
  assert.throws(() => assertGraphicsReleaseInputsReady(missing), /nelore-adult runtime frame has no declared atlas membership/);
  assert.throws(() => assertGraphicsReleaseInputsReady(missing), /nelore-adult runtime frame has invalid coordinates/);

  const undeclared = cloneFixture();
  undeclared.runtimeManifest.assets[0].frame.atlas = 'missing';
  assert.throws(() => assertGraphicsReleaseInputsReady(undeclared), /nelore-adult runtime frame has no declared atlas membership/);

  const fractional = cloneFixture();
  fractional.runtimeManifest.assets[0].frame.x = 2.5;
  assert.doesNotThrow(() => assertGraphicsReleaseInputsReady(fractional), 'fractional atlas cells are valid when bounded');

  const nonFinite = cloneFixture();
  nonFinite.runtimeManifest.assets[0].frame.x = Number.NaN;
  assert.throws(() => assertGraphicsReleaseInputsReady(nonFinite), /nelore-adult runtime frame has invalid coordinates/);
});

test('runtime provenance join preserves explicit source status, rights and unknowns without approving assets', () => {
  const runtimeManifest = {assets: [{id: 'source-approved'}, {id: 'source-review'}, {id: 'orphan'}, {id: 'renderer-review-conflict'}]};
  const semanticManifest = {assets: [
    {id: 'source-approved', status: 'APPROVED', source: {sourceFile: 'approved.png'}, rights: {licenseState: 'documented', notes: 'rights'}, review: {art: 'pass'}},
    {id: 'source-review', status: 'REVIEW', source: {sourceFile: 'review.png'}, rights: {licenseState: 'unknown', notes: 'pending'}},
    {id: 'source-released', status: 'RELEASED', source: {sourceFile: 'released.png'}, rights: {licenseState: 'documented', notes: 'released rights'}},
  ]};
  const enriched = enrichRuntimeAssetManifest(runtimeManifest, {
    semanticManifest,
    dairyManifest: {assets: []},
    rendererManifest: {assets: [{assetId: 'renderer-review-conflict', sourceSemanticId: 'source-released', reviewStatus: 'REVIEW'}]},
  });
  assert.deepEqual(enriched.assets.map(asset => asset.reviewStatus), ['APPROVED', 'REVIEW', 'UNRESOLVED', 'REVIEW']);
  assert.equal(enriched.assets[0].provenance.rights.licenseState, 'documented');
  assert.equal(enriched.assets[1].provenance.sourceFile, 'review.png');
  assert.equal(enriched.assets[2].provenance.rights.licenseState, 'unknown');
  assert.equal(enriched.assets[2].provenance.sourceManifest, null, 'the runtime manifest is not evidence of an asset source');
});

test('release gate rejects a renderer asset without a matching semantic source record', () => {
  const fixture = cloneFixture();
  fixture.semanticManifest.assets = [];
  assert.throws(
    () => assertGraphicsReleaseInputsReady(fixture),
    /nelore-adult semantic\/source record does not resolve/
  );
});

test('release gate rejects renderer provenance that points at a different source file', () => {
  const fixture = cloneFixture();
  fixture.rendererManifest.assets[0].sourceFile = 'assets/another-approved-image.png';
  assert.throws(
    () => assertGraphicsReleaseInputsReady(fixture),
    /nelore-adult renderer source file does not match its semantic source record/
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

test('filesystem gate rejects asset paths that escape through a repository symlink', async () => {
  await withFilesystemFixture(async ({repositoryRoot, inputs}) => {
    const outsideDirectory = await mkdtemp(path.join(tmpdir(), 'riose-graphics-outside-'));
    try {
      await writeFile(path.join(outsideDirectory, 'source.png'), Buffer.from('outside source'));
      await symlink(outsideDirectory, path.join(repositoryRoot, 'external'), 'dir');
      inputs.semanticManifest.assets[0].source.sourceFile = 'external/source.png';
      const errors = await inspectGraphicsReleaseFiles(inputs, repositoryRoot);
      assert(errors.some(error => /livestock\.cattle\.nelore\.adult\.v1 source file is missing or unreadable: external\/source\.png \(resolved path escapes repository/.test(error)));
    } finally {
      await rm(outsideDirectory, {recursive: true, force: true});
    }
  });
});

test('filesystem gate rejects provenance and generated-atlas hash mismatches in an isolated fixture', async () => {
  await withFilesystemFixture(async ({repositoryRoot, inputs}) => {
    inputs.semanticManifest.assets[0].source.sha256 = '0'.repeat(64);
    inputs.rendererManifest.atlasSha256.livestock = '0'.repeat(64);
    inputs.runtimeManifest.atlasSha256.livestock = '0'.repeat(64);
    const errors = await inspectGraphicsReleaseFiles(inputs, repositoryRoot);
    assert(errors.some(error => /source hash does not match its provenance record/.test(error)));
    assert(errors.some(error => /renderer atlas livestock hash does not match atlasSha256/.test(error)));
    assert(errors.some(error => /runtime atlas livestock hash does not match atlasSha256/.test(error)));
  });
});

test('filesystem gate rejects generated frames that exceed the atlas dimensions', async () => {
  await withFilesystemFixture(async ({repositoryRoot, inputs}) => {
    inputs.rendererManifest.assets[0].frame = {x: 9, y: 3, w: 2, h: 5};
    inputs.runtimeManifest.assets[0].frame = {atlas: 'livestock', x: 9, y: 3, w: 2, h: 5};
    const errors = await inspectGraphicsReleaseFiles(inputs, repositoryRoot);
    assert(errors.some(error => /outside generated atlas livestock \(10x12\)/.test(error)));
    assert(errors.some(error => /outside atlas livestock \(10x12\)/.test(error)));
  });
});

test('filesystem gate rejects runtime frames whose atlas key is missing or undeclared', async () => {
  await withFilesystemFixture(async ({repositoryRoot, inputs}) => {
    inputs.runtimeManifest.assets[0].frame.atlas = 'missing';
    const errors = await inspectGraphicsReleaseFiles(inputs, repositoryRoot);
    assert(errors.some(error => /runtime asset nelore-adult frame references undeclared atlas missing/.test(error)));
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
