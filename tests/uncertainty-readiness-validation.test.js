import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateIssue15ReadinessContract, validateOutcomeUncertaintyClassifications} from '../scripts/uncertainty-readiness-validation.mjs';

const fixture = JSON.parse(await readFile(new URL('../docs/evidence/uncertainty-readiness-issue-15.json', import.meta.url), 'utf8'));
const dryadEligibility = JSON.parse(await readFile(new URL('../docs/evidence/issue-15-dryad-yearling-eligibility.json', import.meta.url), 'utf8'));
const dryadManifest = JSON.parse(await readFile(new URL('../data/dryad-grazing-yearlings/manifest.json', import.meta.url), 'utf8'));
const dryadAudit = JSON.parse(await readFile(new URL('../docs/evidence/dryad-grazing-yearlings-audit.json', import.meta.url), 'utf8'));

test('issue 15 fixture classifies every uncertainty source for every outcome', () => {
  assert.deepEqual(
    validateOutcomeUncertaintyClassifications(fixture.outcomes, fixture.sourcesOfUncertainty),
    [],
  );
  assert.equal(fixture.decision, 'insufficient-evidence');
  assert.equal(fixture.productState.validated, false);
  assert.equal(fixture.productState.probabilisticIntervals, 'unavailable');
  assert.deepEqual(validateIssue15ReadinessContract(fixture), []);
});

test('issue 15 gate rejects row splits, missing uncertainty classes, and weak interval promotion rules', () => {
  const invalid = structuredClone(fixture);
  invalid.evaluationGate.splitPolicy = 'Random row split across all records';
  invalid.evaluationGate.mustFreezeBeforeHoldout = ['estimand and units'];
  invalid.evaluationGate.promotionRule = 'Promote after a good deterministic sensitivity result.';
  invalid.sourcesOfUncertainty.pop();
  const errors = validateIssue15ReadinessContract(invalid).join('\n');
  assert.match(errors, /must classify the six required uncertainty sources exactly once/);
  assert.match(errors, /split policy must keep all observations from an animal together/);
  assert.match(errors, /random row splits are prohibited/);
  assert.match(errors, /holdout freeze requirements must include cluster split/);
  assert.match(errors, /must require independent evaluation with coverage evidence/);
  assert.match(errors, /must reject deterministic sensitivity/);
  assert.match(errors, /must reject metric bootstrap intervals/);
});

test('issue 15 contract validator reports malformed field types instead of throwing', () => {
  const invalid = structuredClone(fixture);
  invalid.sourcesOfUncertainty = 'not-an-array';
  invalid.evaluationGate.mustFreezeBeforeHoldout = 'not-an-array';
  invalid.evaluationGate.splitPolicy = 42;
  invalid.evaluationGate.requiredReport = null;
  invalid.evaluationGate.promotionRule = {};
  const errors = validateIssue15ReadinessContract(invalid);
  assert.ok(errors.some(error => error.includes('uncertainty sources must be an array')));
  assert.ok(errors.some(error => error.includes('freeze requirements must be an array')));
  assert.ok(errors.some(error => error.includes('report fields must be an array')));
});

test('outcome classification rejects a missing uncertainty source', () => {
  const outcomes = structuredClone(fixture.outcomes);
  outcomes[0].uncertaintyBySource.pop();
  assert.match(
    validateOutcomeUncertaintyClassifications(outcomes, fixture.sourcesOfUncertainty).join('\n'),
    /weight-and-average-daily-gain: missing uncertainty classification for extrapolation-and-missing-inputs/,
  );
});

test('outcome classification rejects unknown and duplicate sources', () => {
  const outcomes = structuredClone(fixture.outcomes);
  outcomes[0].uncertaintyBySource[1].source = fixture.sourcesOfUncertainty[0].source;
  outcomes[0].uncertaintyBySource[3].source = 'invented-source';
  const errors = validateOutcomeUncertaintyClassifications(outcomes, fixture.sourcesOfUncertainty).join('\n');
  assert.match(errors, /unknown uncertainty source invented-source/);
  assert.match(errors, /duplicate uncertainty source measurement/);
  assert.match(errors, /missing uncertainty classification for parameter/);
});

test('outcome classification rejects invalid status or a missing explanation', () => {
  const outcomes = structuredClone(fixture.outcomes);
  outcomes[0].uncertaintyBySource[0].classification = 'calibrated';
  outcomes[0].uncertaintyBySource[1].reason = '  ';
  const errors = validateOutcomeUncertaintyClassifications(outcomes, fixture.sourcesOfUncertainty).join('\n');
  assert.match(errors, /classification must be not-estimable, partially-estimable, or not-applicable/);
  assert.match(errors, /weight-and-average-daily-gain\/parameter: classification reason is required/);
});

test('issue 15 keeps the public Dryad yearling cohort out of interval calibration for documented compatibility gaps', () => {
  assert.equal(dryadEligibility.issue, 15);
  assert.equal(dryadEligibility.decision, 'not-eligible-for-issue-15-calibration');
  assert.equal(dryadEligibility.source.datasetDoi, dryadManifest.doi);
  assert.equal(dryadEligibility.source.license, dryadManifest.license);
  assert.equal(dryadEligibility.source.license, 'CC0-1.0');
  assert.equal(dryadEligibility.populationAndDesign.independentExperimentsInPrimarySource, 4);
  assert.equal(dryadEligibility.populationAndDesign.groupingAvailableInModelFile, false);
  assert.equal(dryadAudit.interpretation.experimentIdInModelFile, false);
  assert.equal(dryadEligibility.outcomeCompatibility.modelFileColumns.join(','), 'ID,CO2,CH4,O2,ADG,BW');
  assert.ok(dryadEligibility.outcomeCompatibility.requiredForFrozenEngineAdgEvaluationButAbsent.includes('animal-specific initial body weight'));
  assert.ok(dryadEligibility.outcomeCompatibility.requiredForFrozenEngineAdgEvaluationButAbsent.includes('animal-to-experiment/site/year grouping key'));
  assert.equal(dryadEligibility.issue15Assessment.eligibleForCalibration, false);
  assert.equal(dryadEligibility.issue15Assessment.eligibleForFinalHoldout, false);
  assert.ok(dryadEligibility.issue15Assessment.remainingExternalDependency.length > 100);
  assert.ok(fixture.outcomes.find(outcome => outcome.id === 'weight-and-average-daily-gain').evidence.includes('issue-15-dryad-yearling-eligibility.json'));
  assert.equal(fixture.productState.probabilisticIntervals, 'unavailable');
});
