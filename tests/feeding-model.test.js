import test from 'node:test';
import assert from 'node:assert/strict';
import {FarmEngine} from '../engine.js';
import {calculateFeeding} from '../feeding-model.js';

const assumptions = {
  baseDemandKgDM: 8,
  supplementPrice: 1.8,
  balancedPrice: 1.6,
  concentratePrice: 2.1
};

function legacyFeedingAdapter(input) {
  const {weight, housing, heatFactor, pastureAvailableKgDM, diet, supplementKgDMPerDay, assumptions: currentAssumptions} = input;
  const demand = currentAssumptions.baseDemandKgDM * (weight / 360) * heatFactor / 24;
  let forage = 0;
  let barnBaseFeed = 0;
  let pastureAfterFeedingKgDM = pastureAvailableKgDM;
  let barnBaseCost = 0;

  if (housing === 'pasture') {
    forage = Math.min(demand, pastureAvailableKgDM);
    pastureAfterFeedingKgDM -= forage;
  } else {
    barnBaseFeed = demand;
    barnBaseCost = demand * 0.65;
  }

  const supplement = supplementKgDMPerDay / 24;
  const dietExtra = diet === 'pasture' ? 0 : diet === 'balanced' ? 1.8 / 24 : 3.2 / 24;
  const additionalFeedCost = supplement * currentAssumptions.supplementPrice
    + dietExtra * (diet === 'balanced' ? currentAssumptions.balancedPrice : currentAssumptions.concentratePrice);
  const energyIntake = forage + barnBaseFeed + supplement * 1.2 + dietExtra * 1.35;

  return {
    forageKgDM: forage,
    barnBaseFeedKgDM: barnBaseFeed,
    supplementKgDM: supplement,
    dietExtraKgDM: dietExtra,
    pastureAfterFeedingKgDM,
    barnBaseCost,
    additionalFeedCost,
    energyIntakeKgDM: energyIntake
  };
}

test('pasture feeding uses available stock and the current pasture diet values', () => {
  const feeding = calculateFeeding({
    weight: 360,
    housing: 'pasture',
    heatFactor: 1,
    pastureAvailableKgDM: 0.25,
    diet: 'pasture',
    supplementKgDMPerDay: 0,
    assumptions
  });

  assert.equal(feeding.forageKgDM, 0.25);
  assert.equal(feeding.barnBaseFeedKgDM, 0);
  assert.equal(feeding.supplementKgDM, 0);
  assert.equal(feeding.dietExtraKgDM, 0);
  assert.equal(feeding.pastureAfterFeedingKgDM, 0);
  assert.equal(feeding.barnBaseCost, 0);
  assert.equal(feeding.additionalFeedCost, 0);
  assert.equal(feeding.energyIntakeKgDM, 0.25);
});

test('barn feeding preserves the existing balanced diet and supplement calculation', () => {
  const feeding = calculateFeeding({
    weight: 360,
    housing: 'barn',
    heatFactor: 0.8,
    pastureAvailableKgDM: 100,
    diet: 'balanced',
    supplementKgDMPerDay: 4,
    assumptions
  });
  const demand = 8 * (360 / 360) * 0.8 / 24;

  assert.equal(feeding.forageKgDM, 0);
  assert.equal(feeding.barnBaseFeedKgDM, demand);
  assert.equal(feeding.supplementKgDM, 4 / 24);
  assert.equal(feeding.dietExtraKgDM, 1.8 / 24);
  assert.equal(feeding.pastureAfterFeedingKgDM, 100);
  assert.equal(feeding.barnBaseCost, demand * 0.65);
  assert.equal(feeding.additionalFeedCost, (4 / 24) * 1.8 + (1.8 / 24) * 1.6);
  assert.equal(feeding.energyIntakeKgDM, demand + (4 / 24) * 1.2 + (1.8 / 24) * 1.35);
});

test('zero pasture, unknown housing, and unknown diet keep legacy fallback behavior', () => {
  const feeding = calculateFeeding({
    weight: 360,
    housing: 'legacy-housing',
    heatFactor: 1,
    pastureAvailableKgDM: 0,
    diet: 'legacy-diet',
    supplementKgDMPerDay: 0,
    assumptions
  });

  assert.equal(feeding.forageKgDM, 0);
  assert.equal(feeding.barnBaseFeedKgDM, 8 / 24);
  assert.equal(feeding.pastureAfterFeedingKgDM, 0);
  assert.equal(feeding.barnBaseCost, (8 / 24) * 0.65);
  assert.equal(feeding.dietExtraKgDM, 3.2 / 24);
  assert.equal(feeding.additionalFeedCost, (3.2 / 24) * 2.1);
});

test('engine accepts supported supplement boundaries and rejects invalid feed configuration unchanged', () => {
  const engine = new FarmEngine(417, 4);
  engine.configure({supplement: 0});
  engine.configure({supplement: 4, diet: 'concentrate'});

  const before = engine.snapshot();
  for (const patch of [
    {diet: 'grain'},
    {supplement: -0.01},
    {supplement: 4.01},
    {supplement: Number.NaN}
  ]) {
    assert.throws(() => engine.configure(patch), /Invalid configuration/);
    assert.deepEqual(engine.snapshot(), before);
  }
});

test('tick keeps its existing defaults and accepts a migration-time feeding adapter', () => {
  const direct = new FarmEngine(417, 4);
  const adapted = new FarmEngine(417, 4);
  let calls = 0;
  const legacyAdapter = input => {
    calls++;
    return legacyFeedingAdapter(input);
  };

  direct.tick(2);
  adapted.tick(2, undefined, true, legacyAdapter);

  assert.equal(calls, 8);
  assert.deepEqual(adapted.snapshot(), direct.snapshot());
});
