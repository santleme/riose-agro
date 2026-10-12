import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('Dryad finishing-steer data are checksum-verified and the DMI check remains feedlot-only', () => {
  execFileSync('npm', ['run', 'audit:dryad-finishing-steers'], {stdio: 'ignore'});
  const source = JSON.parse(readFileSync(new URL('../docs/evidence/dryad-finishing-steers-audit.json', import.meta.url), 'utf8'));
  const check = JSON.parse(readFileSync(new URL('../docs/evidence/engine-dmi-dryad-finishing-check.json', import.meta.url), 'utf8'));
  assert.equal(source.source.datasetDoi, '10.5061/dryad.qnk98sfsn');
  assert.equal(source.source.license, 'CC0-1.0');
  assert.equal(source.source.sha256VerifiedAgainstDryad, true);
  assert.equal(source.coverage.nRows, 446);
  assert.equal(source.coverage.nExperiments, 5);
  assert.equal(source.coverage.nUniqueProjectAnimalKeys, 446);
  assert.equal(Object.values(source.coverage.missingByColumn).reduce((a, b) => a + b, 0), 0);
  assert.equal(check.fixedEngineOverall.nAnimalExperimentRows, 446);
  assert.equal(check.leaveOneExperimentOutBaseline.nFolds, 5);
  assert.equal(check.model.calibrationOrParameterFitting, false);
  assert.equal(check.interpretation.transferToPastureCase, false);
  assert.equal(check.interpretation.fullEngineValidated, false);
  assert.equal(check.interpretation.probabilityIntervalsCalibrated, false);
  assert.equal(check.sameRowsComparison.engineBeatsBaselineOnMae, true);
  assert.ok(check.leaveOneExperimentOutBaseline.byHeldOutProject['2023G'].fixedEngine.maeKgPerDay >
    check.leaveOneExperimentOutBaseline.byHeldOutProject['2023G'].trainingMeanBaseline.maeKgPerDay);
});
