import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const readJson = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('PASTorIN public source is checksum-pinned and remains a treatment-level context dataset', () => {
  const manifest = readJson('data/pastorin-treatment-comparisons/manifest.json');
  const report = readJson('docs/evidence/pastorin-treatment-comparisons-audit.json');
  assert.equal(manifest.repositoryLicense.spdx, 'etalab-2.0');
  assert.equal(manifest.dataPaper.doi, '10.3390/data11070170');
  assert.equal(manifest.dataPaper.articleLicense.spdx, 'CC-BY-4.0');
  assert.equal(manifest.dataPaper.datasetLicenseAsReportedInDataPaper.spdx, 'CC-BY-2.0');
  assert.match(manifest.licenseNote, /article license with the dataset license/);
  assert.equal(report.source.dataPaper.articleLicense.spdx, 'CC-BY-4.0');
  assert.equal(report.source.dataPaper.datasetLicenseAsReportedInDataPaper.spdx, 'CC-BY-2.0');
  assert.equal(report.source.files.every(file => file.verified), true);
  assert.equal(report.source.apiDeclaredSizeMismatch, true);
  for (const file of manifest.files) {
    const bytes = readFileSync(new URL(`../data/pastorin-treatment-comparisons/${file.name}`, import.meta.url));
    assert.equal(bytes.length, file.archivedBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  assert.equal(report.workbook.treatmentRows, 248);
  assert.equal(report.workbook.meaningfulVariableCount, 39);
  assert.equal(report.workbook.individualAnimalIdentifierAvailable, false);
  assert.equal(report.coverage.cattleTreatmentRows, 123);
  assert.equal(report.coverage.cattleRowsWithBothAdgAndDmi, 11);
  assert.equal(report.coverage.cattleExperimentsWithBothPastureAndIndoorRows, 1);
  assert.match(report.classification, /not_engine_validation/);
});
