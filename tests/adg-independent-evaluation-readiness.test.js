import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const readiness = JSON.parse(readFileSync('docs/evidence/adg-independent-evaluation-readiness-2026-10.json', 'utf8'));
const evaluation = JSON.parse(readFileSync('docs/evidence/engine-adg-usda-cgrec-transport-check.json', 'utf8'));
const integrity = JSON.parse(readFileSync('docs/evidence/usda-cgrec-longterm-audit.json', 'utf8'));

test('ADG readiness points to the existing independent-site evaluation without recasting it as DMI validation', () => {
  assert.equal(readiness.status, 'existing_external_site_adg_component_evaluation_sufficient_for_current_readiness');
  assert.equal(readiness.existingEvaluation.report, 'docs/evidence/engine-adg-usda-cgrec-transport-check.json');
  assert.equal(readiness.existingEvaluation.source.doi, integrity.dataset.doi);
  assert.equal(readiness.existingEvaluation.source.eligibleRows, evaluation.source.eligibleSteerYearlings);
  assert.equal(evaluation.transferFromCper.cgrecOutcomesUsedForFitting, false);
  assert.equal(readiness.existingEvaluation.models.simple_development_mean_baseline.maeKgPerHeadDay,
    evaluation.evaluation.models.cperTrainingMeanBaseline.primary.maeKgPerHeadDay);
  assert.equal(readiness.existingEvaluation.models.frozen_engine_times_development_scale.rmseKgPerHeadDay,
    evaluation.evaluation.models.cperTrainingScale.primary.rmseKgPerHeadDay);
  assert.equal(readiness.separation.dmiValidation, false);
  assert.equal(readiness.separation.fullEngineValidation, false);
  assert.ok(readiness.limitations.length >= 4);
});
