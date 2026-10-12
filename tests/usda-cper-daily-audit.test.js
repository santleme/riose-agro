import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('USDA CPER daily audit pins public files and refuses ambiguous period joins', () => {
  const report = JSON.parse(execFileSync(
    'python3', ['scripts/audit_usda_cper_daily.py'], {encoding: 'utf8'},
  ));

  assert.equal(report.source.doi, '10.15482/USDA.ADC/1524788');
  assert.equal(report.source.license, 'U.S. Public Domain');
  assert.deepEqual(Object.keys(report.source.verifiedHashes).sort(), [
    'daily.csv', 'daily_dict.csv', 'period.csv', 'period_dict.csv',
  ]);
  assert.equal(report.studyPeriodRows, 36);
  assert.deepEqual(report.studyPeriodRowsBy60dAdgInterval, {'1': 9, '2': 14, '3': 13});
  assert.equal(report.rows, 644);
  assert.equal(report.animals, 33);
  assert.equal(report.completeDayRows, 636);
  assert.equal(report.partialDayRows, 8);
  assert.equal(report.duplicateAnimalDays, 0);
  assert.equal(report.uninterpretedSourceCodes.seasonMapsToStudyPeriod, false);
  assert.equal(report.uninterpretedSourceCodes.adgIntMapsToStudyPeriod, false);
  assert.equal(report.uninterpretedSourceCodes.directJoinSupported, false);
  assert.equal(report.dailyAdgOutcomePresent, false);
  assert.equal(report.engineValidation, false);
});
