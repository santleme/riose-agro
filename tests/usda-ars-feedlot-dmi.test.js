import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {predictDefaultBarnDmiKgPerDay} from '../scripts/science/engine-audits/audit_engine_dmi_usda_ars.js';

test('public USDA-ARS feedlot DMI workbook is hashed and audited independently of grazing case', () => {
  execFileSync('node', ['scripts/science/engine-audits/audit_engine_dmi_usda_ars.js'], {encoding: 'utf8'});
  const source = JSON.parse(readFileSync('docs/evidence/usda-ars-feedlot-dmi-audit.json', 'utf8'));
  const model = JSON.parse(readFileSync('docs/evidence/usda-ars-feedlot-engine-dmi-check.json', 'utf8'));

  assert.equal(source.source.license, 'CC BY 4.0');
  assert.match(source.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(source.coverage.nAnimalExperimentRows, 150);
  assert.equal(source.coverage.nAnimals, 149);
  assert.equal(source.coverage.nExperiments, 3);
  assert.equal(model.source.nAnimalExperimentRows, 150);
  assert.equal(model.classification, 'fixed_default_dmi_component_check_feedlot_adults_not_full_engine_validation_or_pasture_case');
  assert.equal(model.model.calibrationOrParameterFitting, false);
  assert.equal(model.overall.maeKgPerDay, 1.8767958374121496);
  assert.equal(model.overall.biasPredictedMinusObservedKgPerDay, 1.6862991501927787);
  assert.equal(model.leaveOneExperimentOutBaseline.fittedOnHeldOutRows, false);
  assert.equal(model.leaveOneExperimentOutBaseline.animalTagsDisjointWithinEachFold, true);
  assert.equal(model.overall.nAnimalExperimentRows, 150);
  assert.equal(model.overall.nUniqueAnimalExperimentKeys, 150);
  assert.equal(model.overall.nUniqueAnimalIdsAcrossExperiments, 149);
  assert.equal(model.leaveOneExperimentOutBaseline.overall.nAnimalExperimentRows, model.overall.nAnimalExperimentRows);
  assert.equal(model.leaveOneExperimentOutBaseline.overall.maeKgPerDay, 1.1441382201829282);
  assert.deepEqual(
    Object.values(model.leaveOneExperimentOutBaseline.byHeldOutExperiment).map(split => split.trainingRows),
    [107, 94, 97],
  );
  assert.equal(model.leaveOneExperimentOutBaseline.byHeldOutExperiment['Beck et al. (2023)'].excludedOverlappingAnimalIds.includes('13'), true);
  assert.equal(model.leaveOneExperimentOutBaseline.byHeldOutExperiment['Foote et al. (2024)'].excludedOverlappingAnimalIds.includes('13'), true);
  assert.equal(model.sameRowsComparison.engineBeatsBaselineOnMae, false);
  assert.equal(model.sameRowsComparison.engineMaeMinusBaselineMaeKgPerDay, 0.7326576172292214);
  assert.equal(Object.keys(model.byExperiment).length, 3);
  assert.equal('confidenceInterval' in model.overall, false);
  assert.equal(predictDefaultBarnDmiKgPerDay(500), predictDefaultBarnDmiKgPerDay(500));
});
