import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const access = JSON.parse(await readFile(
  new URL('../docs/evidence/dryad-finishing-steers-access.json', import.meta.url),
  'utf8',
));

test('Dryad finishing-steer files use the public version archive and retain checksum evidence', () => {
  assert.equal(access.source.license, 'CC0-1.0');
  assert.equal(access.source.metadataApiStatus, 200);
  assert.equal(access.candidateFile.sizeBytes, 64512);
  assert.equal(access.candidateFile.fileListingApiStatus, 200);
  assert.equal(access.candidateFile.downloadApiStatus, 401);
  assert.match(access.candidateFile.downloadApiResponse, /bearer token/i);
  assert.equal(access.candidateFile.publicFileStreamStatus, 403);
  assert.equal(access.candidateFile.publicVersionZipStatus, 200);
  assert.equal(access.candidateFile.downloaded, true);
  assert.equal(access.candidateFile.sha256LocallyVerified, true);
  assert.equal(access.candidateFile.downloadedFiles['Database_09-11-2025.csv'].sha256, access.candidateFile.sha256PublishedByDryad);
  assert.match(access.decision, /fixed-default engine DMI component check/i);
  assert.match(access.limits.join(' '), /cannot validate the approved USDA\/CPER pasture case/i);
});
