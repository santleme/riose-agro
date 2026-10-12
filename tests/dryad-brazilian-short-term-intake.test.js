import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Dryad Brazilian short-term intake source stays metadata-only until file bytes can be verified', () => {
  const report = JSON.parse(readFileSync(new URL('../docs/evidence/dryad-brazilian-short-term-intake-access.json', import.meta.url), 'utf8'));
  assert.equal(report.classification, 'public_dataset_metadata_verified_file_bytes_inaccessible_not_used');
  assert.equal(report.source.license, 'CC0-1.0');
  assert.equal(report.source.metadataApiStatus, 200);
  assert.equal(report.files.length, 2);
  assert.ok(report.files.every(file => file.downloadApiStatus === 401 && file.publicFileStreamStatus === 403));
  assert.ok(report.files.every(file => file.downloaded === false && file.sha256LocallyVerified === false));
  assert.match(report.decision, /Do not import data or compute metrics/);
  assert.match(report.limits[2], /not interchangeable with daily DMI/);
});
