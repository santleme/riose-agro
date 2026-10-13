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
  const {bodyWeightKg, adgKgPerDay, supplementKgDMPerDay} = table214.inputs;
  const intermediates = table214.intermediates;
  const metabolicWeight = bodyWeightKg.value ** 0.75;
  const expectedIntermediates = {
    bodyWeightMetabolicKg075: metabolicWeight,
    supplementTermKgDMPerDay: 0.7732 * supplementKgDMPerDay.value,
    bodyWeightTermKgDMPerDay: 0.0742 * metabolicWeight,
    adgTermKgDMPerDay: 0.7953 * adgKgPerDay.value,
    squaredAdgTermKgDMPerDay: -0.9047 * adgKgPerDay.value ** 2
  };
  for (const [name, value] of Object.entries(expectedIntermediates)) {
    assert.ok(Math.abs(intermediates[name].value - value) < 1e-12, `${name} transcription/formula mismatch`);
  }
  assert.ok(Math.abs(result.totalDmiKgDMPerDay - (-0.4684
    + expectedIntermediates.supplementTermKgDMPerDay
    + expectedIntermediates.bodyWeightTermKgDMPerDay
    + expectedIntermediates.adgTermKgDMPerDay
    + expectedIntermediates.squaredAdgTermKgDMPerDay)) < 1e-12);
  assert.equal(result.inValidatedDomain, true);
  assert.equal(result.adgRole, 'input-assumption; not predicted by this equation');
});

test('equation input and output units and evidence metadata are explicit', () => {
  // Keep these source-derived contracts independent of both the implementation
  // metadata and the fixture so a coordinated metadata edit cannot silently
  // widen or relabel the scientific reference domain.
  assert.equal(table214.locator.source, 'https://brcorte.com.br/assets/book2023/br/02.pdf');
  assert.equal(table214.locator.printedPage, 37);
  assert.equal(table214.locator.pdfPage, 22);
  assert.equal(table214.locator.table, '2.14');
  assert.equal(table214.domainAssumptions.source, 'https://brcorte.com.br/assets/book2023/br/02.pdf');
  assert.equal(table214.domainAssumptions.printedPage, 36);
  assert.equal(table214.domainAssumptions.pdfPage, 21);
  assert.equal(table214.domainAssumptions.table, '2.12, independent validation set for Zebu cattle grazing pasture');
  assert.equal(table214.domainAssumptions.experimentalUnits, 174);
  assert.deepEqual({
    bodyWeightKg: table214.domainAssumptions.bodyWeightKg,
    adgKgPerDay: table214.domainAssumptions.adgKgPerDay,
    supplementKgDMPerDay: table214.domainAssumptions.supplementKgDMPerDay
  }, {
    bodyWeightKg: [133, 474],
    adgKgPerDay: [-0.18, 1.34],
    supplementKgDMPerDay: [0, 5.32]
  });
  assert.deepEqual(table214.inputs.bodyWeightKg.unit, 'kg');
  assert.deepEqual(table214.inputs.adgKgPerDay.unit, 'kg/day');
  assert.deepEqual(table214.inputs.supplementKgDMPerDay.unit, 'kg DM/day');
  assert.deepEqual(table214.expected.unit, 'kg DM/day');
  assert.deepEqual(BR_CORTE_PASTURE_DMI.validatedDomain, {
    bodyWeightKg: table214.domainAssumptions.bodyWeightKg,
    adgKgPerDay: table214.domainAssumptions.adgKgPerDay,
    supplementKgDMPerDay: table214.domainAssumptions.supplementKgDMPerDay,
    productionSystem: 'growing Zebu cattle grazing tropical pasture with supplementation'
  });
  assert.equal(BR_CORTE_PASTURE_DMI.units.bodyWeightKg, table214.inputs.bodyWeightKg.unit);
  assert.equal(BR_CORTE_PASTURE_DMI.units.adgKgPerDay, table214.inputs.adgKgPerDay.unit);
  assert.equal(BR_CORTE_PASTURE_DMI.units.supplementKgDMPerDay, table214.inputs.supplementKgDMPerDay.unit);
  assert.equal(BR_CORTE_PASTURE_DMI.units.dmiKgDMPerDay, table214.expected.unit);
  const result = predictPastureDmi({bodyWeightKg: 300, adgKgPerDay: 0.5, supplementKgDMPerDay: 1});
  assert.equal(BR_CORTE_PASTURE_DMI.rSquared, 0.638);
  assert.equal(result.supplementKgDMPerDay, 1);
  assert.ok(Math.abs(result.totalDmiKgDMPerDay - result.residualForageDmiKgDMPerDay - 1) < 1e-12);
});

test('reference vector pins each transcribed BR-CORTE term and its rounded table output', () => {
  const {bodyWeightKg, adgKgPerDay, supplementKgDMPerDay} = Object.fromEntries(
    Object.entries(table214.inputs).map(([key, input]) => [key, input.value])
  );
  const coefficients = table214.equation.coefficients;
  const metabolicWeight = bodyWeightKg ** 0.75;
  const terms = {
    bodyWeightMetabolicKg075: metabolicWeight,
    supplementTermKgDMPerDay: coefficients.supplement * supplementKgDMPerDay,
    bodyWeightTermKgDMPerDay: coefficients.metabolicBodyWeight * metabolicWeight,
    adgTermKgDMPerDay: coefficients.adg * adgKgPerDay,
    squaredAdgTermKgDMPerDay: coefficients.squaredAdg * adgKgPerDay ** 2
  };
  for (const [key, value] of Object.entries(terms)) {
    assert.ok(Math.abs(value - table214.intermediates[key].value) < 1e-12, `${key} must match the frozen transcription`);
  }
  const transcribedOutput = coefficients.intercept + terms.supplementTermKgDMPerDay
    + terms.bodyWeightTermKgDMPerDay + terms.adgTermKgDMPerDay + terms.squaredAdgTermKgDMPerDay;
  assert.ok(Math.abs(transcribedOutput - table214.expected.calculatedTotalDmiKgDMPerDay) < 1e-12);
  const result = predictPastureDmi({bodyWeightKg, adgKgPerDay, supplementKgDMPerDay});
  assert.ok(Math.abs(result.totalDmiKgDMPerDay - table214.expected.calculatedTotalDmiKgDMPerDay) < 1e-12);
});

test('Table 2.14 coefficient guard rows detect changes across BW, ADG, and supplement inputs', () => {
  for (const row of table214.coefficientGuardRows) {
    const result = predictPastureDmi(row.inputs);
    assert.ok(
      Math.abs(result.totalDmiKgDMPerDay - row.publishedRoundedTotalDmiKgDMPerDay) < table214.coefficientGuardToleranceKgDMPerDay,
      `Table 2.14 inputs ${JSON.stringify(row.inputs)} should reproduce its rounded Eq. 2.6 value`
    );
  }
});

test('invalid mathematical inputs and nonpositive BW are rejected', () => {
  assert.throws(() => predictPastureDmi({bodyWeightKg: 0, adgKgPerDay: 0.5, supplementKgDMPerDay: 1}), /greater than zero/);
  assert.throws(() => predictPastureDmi({bodyWeightKg: 300, adgKgPerDay: NaN, supplementKgDMPerDay: 1}), /finite number/);
  assert.throws(() => predictPastureDmi({bodyWeightKg: 300, adgKgPerDay: 0.5, supplementKgDMPerDay: -1}), /cannot be negative/);
});

test('BR-CORTE independent-validation range endpoints remain in-domain', () => {
  const {bodyWeightKg: [minimumBw, maximumBw], adgKgPerDay: [minimumAdg, maximumAdg], supplementKgDMPerDay: [minimumSupplement, maximumSupplement]} = table214.domainAssumptions;
  assert.equal(predictPastureDmi({bodyWeightKg: minimumBw, adgKgPerDay: minimumAdg, supplementKgDMPerDay: minimumSupplement}).inValidatedDomain, true);
  assert.equal(predictPastureDmi({bodyWeightKg: maximumBw, adgKgPerDay: maximumAdg, supplementKgDMPerDay: maximumSupplement}).inValidatedDomain, true);
});

test('each published validation boundary is inclusive and each feasible outside value is flagged', () => {
  const ranges = Object.fromEntries(Object.entries(table214.domainAssumptions)
    .filter(([, range]) => Array.isArray(range)));
  const middle = {
    bodyWeightKg: 300,
    adgKgPerDay: 0.5,
    supplementKgDMPerDay: 1.6
  };
  const epsilon = 1e-9;

  for (const [input, [minimum, maximum]] of Object.entries(ranges)) {
    for (const boundary of [minimum, maximum]) {
      const result = predictPastureDmi({...middle, [input]: boundary});
      assert.equal(result.inValidatedDomain, true, `${input}=${boundary} should be inside the inclusive validation range`);
      assert.equal(result.evidenceStatus, 'within-independent-validation-ranges');
    }

    const aboveMaximum = predictPastureDmi({...middle, [input]: maximum + epsilon});
    assert.equal(aboveMaximum.inValidatedDomain, false, `${input} just above ${maximum} should be flagged`);
    assert.equal(aboveMaximum.evidenceStatus, 'outside-independent-validation-ranges');

    if (input !== 'supplementKgDMPerDay') {
      const belowMinimum = predictPastureDmi({...middle, [input]: minimum - epsilon});
      assert.equal(belowMinimum.inValidatedDomain, false, `${input} just below ${minimum} should be flagged`);
      assert.equal(belowMinimum.evidenceStatus, 'outside-independent-validation-ranges');
    } else {
      assert.throws(
        () => predictPastureDmi({...middle, [input]: minimum - epsilon}),
        /cannot be negative/,
        `${input} below zero must be rejected as mathematically invalid`
      );
    }
  }
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
