import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('public GrASTech DMI diagnostic is checksum-verified, grouped, and explicitly not validation', () => {
  execFileSync('npm', ['run', 'audit:grastech-dairy-dmi'], {encoding: 'utf8'});
  const report = JSON.parse(readFileSync('docs/evidence/grastech-dairy-grazing-dmi-engine-check.json', 'utf8'));

  assert.equal(report.classification, 'fixed_default_engine_dmi_component_diagnostic_out_of_approved_cper_domain_not_full_validation');
  assert.equal(report.source.license, 'Etalab Open License 2.0');
  assert.equal(report.source.archivedSourceFiles.length, 8);
  assert.equal(report.source.sourceCoverage.allRows, 168);
  assert.equal(report.source.sourceCoverage.evaluatedRows, 24);
  assert.equal(report.source.sourceCoverage.evaluatedCows, 24);
  assert.equal(report.source.sourceCoverage.evaluatedGroups.length, 6);
  assert.equal(report.evaluation.folds, 6);
  assert.equal(report.evaluation.animalIdentityLeakage, false);
  assert.equal(report.evaluation.engineDefault.maeKgDmPerCowDay, 1.5628474129953132);
  assert.equal(report.evaluation.constantTrainingMeanBaseline.maeKgDmPerCowDay, 1.4964921273865253);
  assert.equal(report.model.calibrationOrParameterFitting, false);
  assert.equal(report.validated, false);
  assert.equal(report.calibrated, false);
  assert.equal(report.productPredictiveIntervalsAvailable, false);
});
