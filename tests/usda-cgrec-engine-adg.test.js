import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('CPER-only ADG scale is evaluated unchanged on public external-site CGREC steer data', () => {
  execFileSync('python3', ['scripts/audit_usda_cgrec_longterm.py'], {encoding: 'utf8'});
  const integrity = JSON.parse(readFileSync('docs/evidence/usda-cgrec-longterm-audit.json', 'utf8'));
  assert.equal(integrity.dataset.sha256_verified, true);
  assert.equal(integrity.dataset.public_md5_verified, true);
  assert.equal(integrity.steer_validation_rows.length, 291);

  execFileSync('node', ['scripts/science/engine-audits/audit_engine_adg_usda_cper_ltgi.js'], {encoding: 'utf8'});
  execFileSync('node', ['scripts/science/engine-audits/audit_engine_adg_usda_cgrec_external.js'], {encoding: 'utf8'});
  const reportPath = 'docs/evidence/engine-adg-usda-cgrec-transport-check.json';
  const firstRun = readFileSync(reportPath, 'utf8');
  const report = JSON.parse(firstRun);
  assert.equal(report.classification, 'external_site_transport_diagnostic_not_full_validation');
  assert.equal(report.source.eligibleSteerYearlings, 291);
  assert.equal(report.source.recordsIn2015, 200);
  assert.deepEqual(report.source.years, [1989, 1994, 2015]);
  assert.equal(report.transferFromCper.cgrecOutcomesUsedForFitting, false);
  assert.equal(report.transferFromCper.engineSha256, report.transferFromCper.cperEngineSha256);
  assert.equal(report.evaluation.models.defaultEngine.primary.maeKgPerHeadDay, 0.5396938859151102);
  assert.equal(report.evaluation.models.cperTrainingScale.primary.maeKgPerHeadDay, 0.2221192500940076);
  assert.equal(report.evaluation.models.cperTrainingMeanBaseline.primary.maeKgPerHeadDay, 0.2419336232354963);
  assert.equal(report.evaluation.models.cperTrainingScale.byYear['2015'].n, 200);
  assert.equal(report.evaluation.models.cperTrainingScale.byYear['2015'].maeKgPerHeadDay, 0.19141686933189425);
  assert.equal(report.evaluation.cperCalibrated80IntervalTransport.externalSiteCoverage.covered, 280);
  assert.equal(report.evaluation.cperCalibrated80IntervalTransport.externalSiteCoverage.n, 291);
  assert.equal(report.evaluation.cperCalibrated80IntervalTransport.byYear['2015'].covered, 200);
  assert.equal(report.evaluation.cperCalibrated80IntervalTransport.byYear['1994'].covered, 3);
  assert.equal(report.evaluation.cperCalibrated80IntervalTransport.rows.length, 291);
  assert.equal(report.evaluation.rows.every(row => row.age === 'Yearling'), true);
  assert.equal(report.evaluation.rows.every(row => ['Steer', 'S'].includes(row.sex)), true);
  assert.equal(report.validated, false);
  assert.equal(report.calibratedOnCgrec, false);

  execFileSync('node', ['scripts/science/engine-audits/audit_engine_adg_usda_cgrec_external.js'], {encoding: 'utf8'});
  assert.equal(readFileSync(reportPath, 'utf8'), firstRun);
});
