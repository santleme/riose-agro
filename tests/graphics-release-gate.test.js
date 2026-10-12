import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertGraphicsReleaseInputsReady, assertGraphicsReleaseReady} from '../scripts/assets/graphics-release-gate.mjs';

const approvedFixture = JSON.parse(await readFile(new URL('./fixtures/graphics-release/approved-manifests.json', import.meta.url), 'utf8'));

function cloneFixture() {
  return structuredClone(approvedFixture);
}

test('release packaging refuses the current unreviewed and unresolved graphics manifests', async () => {
  await assert.rejects(assertGraphicsReleaseReady(), error => {
    assert.match(error.message, /^Graphics release blocked \(\d+ manifest issue\(s\)\):/);
    assert.match(error.message, /status REVIEW is not release eligible/);
    assert.match(error.message, /unresolved renderer asset reference/);
    assert.match(error.message, /no documented rights basis/);
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
