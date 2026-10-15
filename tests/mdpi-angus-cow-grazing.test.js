import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('MDPI Angus cow audit verifies the open supplement, 84-day ADG derivation, and cohort limits', () => {
  const report = JSON.parse(execFileSync('python3', ['scripts/science/source-audits/audit_mdpi_angus_cow_grazing.py'], {encoding: 'utf8'}));
  assert.equal(report.source.articleDoi, '10.3390/ani11061518');
  assert.equal(report.source.license, 'CC-BY-4.0');
  assert.equal(report.source.archiveSha256Verified, true);
  assert.equal(report.coverage.s1CowSeasonRows, 408);
  assert.equal(report.coverage.s1UniqueCowIdsAcrossYears, 241);
  assert.equal(report.coverage.s2SupplementCowDayRows, 19691);
  assert.equal(report.coverage.s2ContainsForageDmiField, false);
  assert.equal(report.interpretation.adgDerived, true);
  assert.equal(report.interpretation.adgDerivation.periodDays, 84);
  assert.equal(report.interpretation.adgDerivation.formula, 'Tot_Wt_Ch_kg / 84');
  assert.equal(report.interpretation.validatesEngine, false);
  assert.ok(report.interpretation.limitations.some(message => message.includes('one-year age class')));
});
