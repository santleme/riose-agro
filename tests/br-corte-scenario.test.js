import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBrCorteDmiScenarioManifest, evaluateBrCorteDmiScenarioManifest, validateBrCorteDmiScenarioManifest} from '../src/client/br-corte-scenario.js';

const references = JSON.parse(readFileSync(new URL('./fixtures/scientific-numeric-reference-v1.json', import.meta.url), 'utf8'));
const table214 = references.fixtures.brCorte2023Eq26Table214;

test('BR-CORTE scenario output reproduces the published Eq. 2.6 worked example and explicit herd arithmetic', () => {
  const manifest = createBrCorteDmiScenarioManifest({
    bodyWeightKg: table214.inputs.bodyWeightKg.value,
    adgKgPerDay: table214.inputs.adgKgPerDay.value,
    animalCount: 200,
    durationDays: 30,
    supplementLevelsKgDMPerHeadPerDay: [1.6, 2.0, 2.5],
    supplementPricePerKgDM: 4,
    currency: 'BRL',
  });
  const result = evaluateBrCorteDmiScenarioManifest(manifest);

  assert.equal(result.type, 'riose-br-corte-dmi-scenario-results');
  assert.equal(result.version, 1);
  assert.equal(result.validated, false);
  assert.equal(result.model.id, 'br-corte-2023-eq-2.6');
  assert.equal(result.model.version, '2023');
  assert.ok(Math.abs(result.scenarios[0].outputs.totalDmiKgDMPerHeadPerDay - table214.expected.calculatedTotalDmiKgDMPerDay) < 1e-12);
  assert.ok(Math.abs(result.scenarios[0].totals.herdDmiKgDM - table214.expected.calculatedTotalDmiKgDMPerDay * 200 * 30) < 1e-8);
  assert.equal(result.scenarios[0].totals.supplementCost, 1.6 * 200 * 30 * 4);
  assert.equal(result.scenarios[0].totals.currency, 'BRL');
  assert.match(result.scenarios[0].provenance.implementationHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(result.scenarios[0].outputs, 'adgKgPerDayPredicted'), false);
  assert.equal(Object.hasOwn(result.scenarios[0].outputs, 'forageDmiKgDMPerHeadPerDay'), false);
  assert.equal(result.scenarios[1].baselineDeltas.dmiKgDMPerHeadPerDay,
    result.scenarios[1].outputs.totalDmiKgDMPerHeadPerDay - result.scenarios[0].outputs.totalDmiKgDMPerHeadPerDay);
});

test('BR-CORTE scenario validation rejects out-of-domain, duplicate, and tampered manifests', () => {
  const valid = createBrCorteDmiScenarioManifest({bodyWeightKg: 400, adgKgPerDay: 0.5, animalCount: 20,
    durationDays: 30, supplementLevelsKgDMPerHeadPerDay: [0.5, 1, 1.5]});
  assert.equal(validateBrCorteDmiScenarioManifest(valid), true);
  assert.throws(() => createBrCorteDmiScenarioManifest({...valid.inputs, bodyWeightKg: 500}), /bodyWeightKg/);
  assert.throws(() => createBrCorteDmiScenarioManifest({...valid.inputs, adgKgPerDay: 1.5}), /adgKgPerDay/);
  assert.throws(() => createBrCorteDmiScenarioManifest({...valid.inputs, supplementLevelsKgDMPerHeadPerDay: [0.5, 0.5, 1]}), /distinct/);
  assert.throws(() => createBrCorteDmiScenarioManifest({...valid.inputs, supplementPricePerKgDM: 3}), /currency/);
  assert.throws(() => createBrCorteDmiScenarioManifest({...valid.inputs, supplementPricePerKgDM: Number.MAX_VALUE, currency: 'BRL'}), /overflow/);
  assert.throws(() => validateBrCorteDmiScenarioManifest({...valid, assumptions: {...valid.assumptions, horizon: '30 days projected'}}), /assumptions/);
  assert.throws(() => validateBrCorteDmiScenarioManifest({...valid, modelVersion: 'next'}), /model must be/);
});

test('cost remains unavailable without a user-supplied price', () => {
  const manifest = createBrCorteDmiScenarioManifest({bodyWeightKg: 400, adgKgPerDay: 0.5, animalCount: 20,
    durationDays: 30, supplementLevelsKgDMPerHeadPerDay: [0.5, 1, 1.5]});
  const result = evaluateBrCorteDmiScenarioManifest(manifest);
  assert.ok(result.scenarios.every(scenario => scenario.totals.supplementCost === null && scenario.totals.currency === null));
  assert.equal(result.scenarios[1].baselineDeltas.supplementCost, null);
});
