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
  assert.equal(report.cohorts['1'].rowCount + report.cohorts['2'].rowCount + report.cohorts['3'].rowCount, 1864);
  assert.equal(report.cohorts['4'].rowCount, 498);

  assert.equal(report.heldOutBaseline.trainAnimalCount, 190);
  assert.equal(report.heldOutBaseline.testAnimalCount, 58);
  assert.equal(report.heldOutBaseline.rowCount, 498);
  assert.equal(report.heldOutBaseline.animalLeakage, false);
  assert.equal(report.heldOutBaseline.scope, 'later cohorts on the same six North Wyke plots; not new-farm generalization and not a feature model');
  assert.ok(Number.isFinite(report.heldOutBaseline.maeKgPerSteerDay));
  assert.ok(Number.isFinite(report.heldOutBaseline.rmseKgPerSteerDay));
  assert.equal(report.engineValidation.evaluated, false);
  assert.match(report.engineValidation.reason, /cannot validate engine\.js/);
  assert.equal(report.descriptiveTreatmentMeans['set-stocked'].animalPeriodRowCount, 1175);
  assert.match(report.descriptiveTreatmentMeans['set-stocked'].warning, /three plots per arm/);
});
