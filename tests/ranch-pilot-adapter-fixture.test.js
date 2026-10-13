import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import {adaptComposerDocument} from '../graphics-poc/scene-adapter-v1.js';
import {adaptRanchSourceSceneV2, restoreRanchSourceSceneV2, RANCH_SOURCE_SCENE_ADAPTER_VERSION} from '../graphics-poc/ranch-source-scene-adapter-v2.js';

const [pilot, semanticManifest, composerManifest, gapReport, adapterSchema] = await Promise.all([
  readFile(new URL('../assets/pilots/cattle-ranch-v1/pilot.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../assets/manifests/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('./fixtures/ranch-pilot-adapter-gap-v1.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../schemas/ranch-source-scene-adapter-v2.schema.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const sourceScene = await readFile(new URL(`../${pilot.sourceScene}`, import.meta.url), 'utf8').then(JSON.parse);
const assetsById = new Map(semanticManifest.assets.map(asset => [asset.id, asset]));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function placementAssetIds(scene) {
  return [...new Set(scene.placements.map(placement => placement.assetId))].sort();
}

function pathExists(root, path) {
  let values = [root];
  for (const segment of path.split('.')) {
    const match = /^([^[\]]+)(\[\])?$/.exec(segment);
    if (!match) return false;
    const [, key, arrayMarker] = match;
    values = values.flatMap(value => {
      const child = value?.[key];
      if (arrayMarker) return Array.isArray(child) ? child : [];
      return child === undefined ? [] : [child];
    });
  }
  return values.length > 0;
}

test('ranch pilot is a deterministic lossless source fixture with statuses resolved from the canonical manifest', () => {
  assert.equal(sourceScene.placements.length, 82);
  const sourceAssetIds = placementAssetIds(sourceScene);
  assert.equal(sourceAssetIds.length, 26);

  const readAgain = JSON.parse(JSON.stringify(sourceScene));
  assert.deepEqual(readAgain, sourceScene);
  assert.equal(digest(readAgain), digest(sourceScene));
  assert.deepEqual(placementAssetIds(readAgain), sourceAssetIds);

  const states = sourceAssetIds.map(assetId => {
    const asset = assetsById.get(assetId);
    assert.ok(asset, `source asset ${assetId} resolves in the canonical manifest`);
    return {
      assetId,
      status: asset.status,
      art: asset.review?.art,
      technical: asset.review?.technical,
      licenseState: asset.rights?.licenseState,
    };
  });
  assert.equal(states.filter(asset => asset.status === 'APPROVED').length, 13);
  assert.equal(states.filter(asset => asset.status === 'REVIEW').length, 13);
  assert.ok(states.every(asset => asset.status !== 'RELEASED'), 'a pilot scene must not promote an asset into release');
  assert.ok(states.every(asset => asset.licenseState === 'project-generated-review'), 'rights state comes from the manifest, not the pilot directory');

  for (const assetId of pilot.assetIds) {
    const asset = assetsById.get(assetId);
    assert.equal(asset?.status, 'APPROVED', `${assetId} has pilot-scoped art approval`);
    assert.equal(asset?.review?.art, 'pass');
    assert.equal(asset?.review?.technical, 'pass');
    assert.equal(asset?.rights?.licenseState, 'project-generated-review');
  }
});

test('Composer v1 reports the ranch-pilot source shape as unsupported instead of guessing a canonical mapping', () => {
  assert.throws(
    () => adaptComposerDocument(sourceScene, composerManifest),
    /Invalid Composer export: expected scene and expandedPlacements/,
  );

  // These are the ranch-pilot fields that require explicit v1 mappings. The
  // source snapshot can be round-tripped byte-for-byte as JSON, but this test
  // intentionally does not claim canonical scene adaptation for them.
  assert.equal(gapReport.status, 'unsupported');
  assert.equal(gapReport.sourceFormat, 'riose-ranch-composition-v4');
  assert.equal(gapReport.adapterFormat, 'riose-composer-layout');
  assert.ok(gapReport.reason.length > 0);
  assert.ok(gapReport.unsupportedFields.length > 0);
  for (const field of gapReport.unsupportedFields) {
    assert.ok(field.reason.length > 0, `${field.path} has an explicit mapping gap`);
    assert.ok(pathExists(sourceScene, field.path), `${field.path} exists in the source fixture`);
  }
  assert.equal(sourceScene.placements.length, 82);
  assert.equal(placementAssetIds(sourceScene).length, 26);
});

test('ranch source-scene v2 preserves pixel geometry, links, lots and manifest review/rights without promotion', () => {
  const document = adaptRanchSourceSceneV2(sourceScene, semanticManifest, pilot);
  const validate = new Ajv2020({allErrors: true, strict: true}).compile(adapterSchema);
  assert.equal(document.adapterVersion, RANCH_SOURCE_SCENE_ADAPTER_VERSION);
  assert.equal(validate(document), true, JSON.stringify(validate.errors));
  assert.deepEqual(document.sourceFormat.coordinateFrame, {
    frameId: 'ranch-composition-v4-canvas-pixel',
    units: 'px',
    footprintPx: sourceScene.footprintPx,
    projection: sourceScene.projection,
    originConvention: 'not specified; source coordinates are preserved without transform',
    gridMappingStatus: 'unsupported',
  });
  assert.deepEqual(document.sourceFormat.ids.placementIds, sourceScene.placements.map(item => item.placementId));
  assert.equal(document.placements.length, 82);
  assert.deepEqual(document.placements.map(({canonicalAsset, ...placement}) => placement), sourceScene.placements);
  assert.deepEqual(document.sourceScene.zones, sourceScene.zones);
  assert.deepEqual(document.sourceScene.prefabs, sourceScene.prefabs);
  assert.deepEqual(document.sourceScene.visualAnimalLots, sourceScene.visualAnimalLots);
  assert.deepEqual(document.sourceScene.visualAnimalBudget, sourceScene.visualAnimalBudget);
  assert.deepEqual(restoreRanchSourceSceneV2(document), sourceScene);
  assert.deepEqual(document.unknownSourceFields, []);

  const canonicalById = new Map(semanticManifest.assets.map(asset => [asset.id, asset]));
  for (const resolved of document.assets) {
    const canonical = canonicalById.get(resolved.assetId);
    assert.equal(resolved.canonicalStatus, canonical.status);
    assert.deepEqual(resolved.canonicalReview, canonical.review ?? null);
    assert.deepEqual(resolved.canonicalRights, canonical.rights ?? null);
    if (pilot.assetIds.includes(resolved.assetId)) {
      assert.equal(resolved.pilotScope.releasePromotion, false);
      assert.equal(resolved.canonicalStatus, canonical.status, 'pilot approval never replaces canonical status');
    }
  }
  assert.ok(document.assets.every(asset => asset.canonicalStatus !== 'RELEASED'));
});

test('ranch source-scene v2 reports newly encountered source fields and still restores them losslessly', () => {
  const extended = structuredClone(sourceScene);
  extended.placements[0].transform.futureReviewFlag = {decision: 'unknown-to-this-adapter'};
  const document = adaptRanchSourceSceneV2(extended, semanticManifest, pilot);
  assert.deepEqual(document.unknownSourceFields, [{
    path: '/placements/0/transform/futureReviewFlag',
    reason: 'Field is preserved in sourceScene but has no declared ranch v2 mapping.',
    disposition: 'preserved',
    sourceId: extended.placements[0].placementId,
  }]);
  assert.deepEqual(restoreRanchSourceSceneV2(document), extended);
});

test('ranch source-scene v2 refuses ambiguous duplicate canonical asset IDs', () => {
  const duplicateManifest = structuredClone(semanticManifest);
  duplicateManifest.assets.push(structuredClone(duplicateManifest.assets[0]));
  assert.throws(
    () => adaptRanchSourceSceneV2(sourceScene, duplicateManifest, pilot),
    /Ranch source manifest contains duplicate asset IDs:/,
  );
});

test('ranch source-scene v2 is deterministic and restores exact parsed JSON values', () => {
  const first = adaptRanchSourceSceneV2(sourceScene, semanticManifest, pilot);
  const second = adaptRanchSourceSceneV2(sourceScene, semanticManifest, pilot);
  assert.deepEqual(first, second);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(restoreRanchSourceSceneV2(first))), JSON.parse(JSON.stringify(sourceScene)));
  assert.equal(first.sourceFormat.coordinateFrame.gridMappingStatus, 'unsupported');
  assert.deepEqual(first.sourceFormat.coordinateFrame.footprintPx, sourceScene.footprintPx);
  assert.ok(!('simulationGrid' in first.sourceFormat.coordinateFrame));
});

test('ranch restore rejects derived indexes that no longer match the preserved source', () => {
  const edited = adaptRanchSourceSceneV2(sourceScene, semanticManifest, pilot);
  edited.placements[0].anchorPx = [975, 384];
  assert.throws(() => restoreRanchSourceSceneV2(edited), /derived indexes do not match/);

  const changedFrame = adaptRanchSourceSceneV2(sourceScene, semanticManifest, pilot);
  changedFrame.sourceFormat.coordinateFrame.footprintPx[0] += 1;
  assert.throws(() => restoreRanchSourceSceneV2(changedFrame), /derived indexes do not match/);

  const changedAsset = adaptRanchSourceSceneV2(sourceScene, semanticManifest, pilot);
  changedAsset.assets[0].canonicalRights = {licenseState: 'released'};
  assert.throws(() => restoreRanchSourceSceneV2(changedAsset), /derived indexes do not match/);
});

test('ranch adapter rejects malformed coordinates, duplicate IDs and broken references', () => {
  const malformedCoordinate = structuredClone(sourceScene);
  malformedCoordinate.placements[0].anchorPx[0] = Number.NaN;
  assert.throws(() => adaptRanchSourceSceneV2(malformedCoordinate, semanticManifest, pilot), /Invalid ranch pixel coordinate/);

  const outOfBounds = structuredClone(sourceScene);
  outOfBounds.placements[0].anchorPx[0] = outOfBounds.footprintPx[0] + 1;
  assert.throws(() => adaptRanchSourceSceneV2(outOfBounds, semanticManifest, pilot), /Invalid ranch pixel coordinate/);

  const duplicateZone = structuredClone(sourceScene);
  duplicateZone.zones[1].id = duplicateZone.zones[0].id;
  assert.throws(() => adaptRanchSourceSceneV2(duplicateZone, semanticManifest, pilot), /duplicate zone IDs/);

  const brokenPrefab = structuredClone(sourceScene);
  brokenPrefab.prefabs[0].placements[0].placementId = 'missing-placement';
  assert.throws(() => adaptRanchSourceSceneV2(brokenPrefab, semanticManifest, pilot), /references missing placement/);

  const brokenLot = structuredClone(sourceScene);
  brokenLot.visualAnimalLots[0].zoneId = 'missing-zone';
  assert.throws(() => adaptRanchSourceSceneV2(brokenLot, semanticManifest, pilot), /references missing zone/);
});

test('ranch restore rejects a source hash mismatch', () => {
  const document = adaptRanchSourceSceneV2(sourceScene, semanticManifest, pilot);
  document.sourceScene.placements[0].anchorPx[0] += 1;
  assert.throws(() => restoreRanchSourceSceneV2(document), /source snapshot failed its integrity check/);
});

test('ranch source digest treats parsed object key order as non-semantic', () => {
  const document = adaptRanchSourceSceneV2(sourceScene, semanticManifest, pilot);
  document.sourceScene = Object.fromEntries(Object.entries(document.sourceScene).reverse());
  assert.deepStrictEqual(restoreRanchSourceSceneV2(document), sourceScene);
});
