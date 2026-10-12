import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BR_CORTE_PASTURE_DMI, analyzePastureDmiSensitivity, predictPastureDmi, simulateNelorePastureScenario} from '../scientific/br_corte_pasture_dmi.js';

const numericReferences = JSON.parse(readFileSync(new URL('./fixtures/scientific-numeric-reference-v1.json', import.meta.url), 'utf8'));
const table214 = numericReferences.fixtures.brCorte2023Eq26Table214;

test('BR-CORTE 2023 Eq. 2.6 reproduces Table 2.14 worked example', () => {
  const result = predictPastureDmi({
    bodyWeightKg: table214.inputs.bodyWeightKg.value,
    adgKgPerDay: table214.inputs.adgKgPerDay.value,
    supplementKgDMPerDay: table214.inputs.supplementKgDMPerDay.value
  });
  assert.ok(Math.abs(result.totalDmiKgDMPerDay - table214.expected.publishedRoundedTotalDmiKgDMPerDay) < table214.expected.publishedPrecisionToleranceKgDMPerDay);
  assert.ok(Math.abs(result.totalDmiKgDMPerDay - table214.expected.calculatedTotalDmiKgDMPerDay) < 1e-12);
  assert.equal(result.inValidatedDomain, true);
  assert.equal(result.adgRole, 'input-assumption; not predicted by this equation');
});

test('equation input and output units and evidence metadata are explicit', () => {
  const result = predictPastureDmi({bodyWeightKg: 300, adgKgPerDay: 0.5, supplementKgDMPerDay: 1});
  assert.equal(BR_CORTE_PASTURE_DMI.units.dmiKgDMPerDay, 'kg DM/day');
  assert.equal(BR_CORTE_PASTURE_DMI.rSquared, 0.638);
  assert.equal(result.supplementKgDMPerDay, 1);
  assert.ok(Math.abs(result.totalDmiKgDMPerDay - result.residualForageDmiKgDMPerDay - 1) < 1e-12);
});

test('invalid mathematical inputs and nonpositive BW are rejected', () => {
  assert.throws(() => predictPastureDmi({bodyWeightKg: 0, adgKgPerDay: 0.5, supplementKgDMPerDay: 1}), /greater than zero/);
  assert.throws(() => predictPastureDmi({bodyWeightKg: 300, adgKgPerDay: NaN, supplementKgDMPerDay: 1}), /finite number/);
  assert.throws(() => predictPastureDmi({bodyWeightKg: 300, adgKgPerDay: 0.5, supplementKgDMPerDay: -1}), /cannot be negative/);
});

test('100-animal simulation has deterministic identified animals and supports 30, 60, and 90 days', () => {
  for (const days of [30, 60, 90]) {
    const first = simulateNelorePastureScenario({seed: 42, animalCount: 100, days, initialWeightSpreadKg: 10});
    const second = simulateNelorePastureScenario({seed: 42, animalCount: 100, days, initialWeightSpreadKg: 10});
    assert.deepEqual(first, second);
    assert.equal(first.animals.length, 100);
    assert.equal(new Set(first.animals.map(animal => animal.id)).size, 100);
    assert.equal(first.rows.length, days + 1);
    assert.equal(first.final.day, days);
    assert.ok(first.animals.every(animal => animal.weightKg === animal.initialWeightKg + days * 0.5));
  }
});

test('forage ledger conserves stock and reports shortages without inventing intake', () => {
  const run = simulateNelorePastureScenario({days: 30, initialPastureKgDMByPaddock: [10, 0, 0, 0], waterAvailableByPaddock: [true, false, false, false]});
  const totalUsed = run.rows.slice(1).reduce((sum, row) => sum + row.forageConsumedKgDM, 0);
  const totalDemand = run.rows.slice(1).reduce((sum, row) => sum + row.forageDemandKgDM, 0);
  assert.equal(run.final.pastureKgDMByPaddock.reduce((sum, value) => sum + value, 0), 0);
  assert.ok(Math.abs(totalUsed - 10) < 1e-9);
  assert.ok(totalDemand > totalUsed);
  assert.ok(run.final.forageShortfallKgDM > 0);
});

test('scenario limits inputs to the published independent-validation ranges', () => {
  assert.throws(() => simulateNelorePastureScenario({assumedAdgKgPerDay: 1.35}), /published validation range/);
  assert.throws(() => simulateNelorePastureScenario({supplementKgDMPerAnimalPerDay: 5.33}), /published validation range/);
  assert.throws(() => simulateNelorePastureScenario({days: 45}), /30, 60, or 90/);
  assert.throws(() => simulateNelorePastureScenario({initialWeightKg: 470, assumedAdgKgPerDay: 1}), /leaves the independently validated BW range/);
});

test('sensitivity analysis reports deterministic input effects without inventing uncertainty intervals', () => {
  const result = analyzePastureDmiSensitivity({bodyWeightKg: 300, adgKgPerDay: 0.5, supplementKgDMPerDay: 1});
  assert.equal(result.predictionInterval, null);
  assert.equal(result.effects.length, 3);
  const supplement = result.effects.find(effect => effect.input === 'supplementKgDMPerDay');
  assert.ok(Math.abs(supplement.deltaFromBaselineKgDMPerDay[0] - (-0.5 * 0.7732)) < 1e-12);
  assert.ok(Math.abs(supplement.deltaFromBaselineKgDMPerDay[1] - (0.5 * 0.7732)) < 1e-12);
  assert.ok(result.effects.every(effect => effect.meaning.includes('not a prediction interval')));
});
