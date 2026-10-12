import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('Rothamsted audit verifies the cohort holdout and does not claim engine validation', () => {
  const raw = execFileSync('python3', ['scripts/audit_rothamsted_adg.py'], {encoding: 'utf8'});
  const report = JSON.parse(raw);

  assert.equal(report.source.doi, '10.23637/rothamsted.00033688');
  assert.equal(report.source.license, 'CC BY 4.0');
  assert.equal(report.source.verifiedSnapshotFiles.length, 3);
  assert.equal(report.integrity.animalPeriodRowCount, 2362);
  assert.equal(report.integrity.uniqueOfficialTagCount, 248);
  assert.equal(report.integrity.dlwgReconcilesWithWeightEndpointsAndDays, true);
  assert.match(report.population.classification, /not a mature-cow cohort/);
  const age = report.population.ageAtFirstObservedIntervalDays;
  assert.equal(age.animalCount, 248);
  assert.equal(age.minimumDays, 173);
  assert.equal(age.medianDays, 231);
  assert.ok(Math.abs(age.meanDays - 311.2782258064516) < 1e-12);
  assert.equal(age.maximumDays, 747);
  assert.match(age.method, /Date_From minus DOB/);
  assert.equal(report.cohorts['1'].rowCount + report.cohorts['2'].rowCount + report.cohorts['3'].rowCount, 1864);
  assert.equal(report.cohorts['4'].rowCount, 498);

  assert.equal(report.heldOutBaseline.trainAnimalCount, 190);
  assert.equal(report.heldOutBaseline.testAnimalCount, 58);
  assert.equal(report.heldOutBaseline.rowCount, 498);
  assert.equal(report.heldOutBaseline.animalLeakage, false);
  assert.equal(report.heldOutBaseline.scope, 'later cohorts on the same six North Wyke plots; not new-farm generalization and not a feature model');
  assert.ok(Number.isFinite(report.heldOutBaseline.maeKgPerSteerDay));
  assert.ok(Number.isFinite(report.heldOutBaseline.rmseKgPerSteerDay));
  assert.equal(report.fullEngineValidation.evaluated, false);
  assert.match(report.fullEngineValidation.reason, /does not establish end-to-end validation of engine\.js/);
  assert.equal(report.separateFrozenComponentDiagnostic.reportPath, 'docs/evidence/engine-adg-rothamsted-check.json');
  assert.equal(report.descriptiveTreatmentMeans['set-stocked'].animalPeriodRowCount, 1175);
  assert.match(report.descriptiveTreatmentMeans['set-stocked'].warning, /three plots per arm/);
});
