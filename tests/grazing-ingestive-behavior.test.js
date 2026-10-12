import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const report = JSON.parse(await readFile(
  new URL('../docs/evidence/grazing-ingestive-behavior-audit.json', import.meta.url),
  'utf8',
));

test('public grazing ingestive-behavior audit is pinned and scoped as descriptive only', () => {
  assert.equal(report.source.datasetDoi, '10.57745/RPDBI6');
  assert.equal(report.source.license, 'Etalab Open License 2.0');
  assert.equal(report.integrity.dataRows, 676);
  assert.equal(report.integrity.columns, 51);
  assert.equal(report.integrity.uniqueAuthorYearPairs, 90);
  assert.equal(report.integrity.uniqueAuthorYearExperimentKeys, 199);
  assert.equal(report.adultCattleTreatmentRows, 546);
  assert.equal(report.integrity.dictionaryHeaderMismatches.length, 1);
  assert.equal(report.validated, false);
  assert.match(report.limitations.join(' '), /not.*individual-animal-day/i);
  assert.match(report.limitations.join(' '), /does not validate/i);
});
