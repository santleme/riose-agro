import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateOutcomeUncertaintyClassifications} from '../scripts/uncertainty-readiness-validation.mjs';

const fixture = JSON.parse(await readFile(new URL('../docs/evidence/uncertainty-readiness-issue-15.json', import.meta.url), 'utf8'));

test('issue 15 fixture classifies every uncertainty source for every outcome', () => {
  assert.deepEqual(
    validateOutcomeUncertaintyClassifications(fixture.outcomes, fixture.sourcesOfUncertainty),
    [],
  );
  assert.equal(fixture.decision, 'insufficient-evidence');
  assert.equal(fixture.productState.validated, false);
  assert.equal(fixture.productState.probabilisticIntervals, 'unavailable');
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
