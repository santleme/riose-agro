import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG, FarmEngine, compare, createComparisonManifest, replayComparisonManifest, validateComparisonManifest} from '../engine.js';

test('same seed and actions reproduce the same farm state', () => {
  const first = new FarmEngine(417, 8);
  const second = new FarmEngine(417, 8);

  first.tick(72);
  second.tick(72);

  assert.deepEqual(first.snapshot(), second.snapshot());
});

test('housing changes consume locomotion randomness without advancing the model seed', () => {
  const changed = new FarmEngine(417, 8);
  const unchanged = new FarmEngine(417, 8);
  const modelSeed = changed.state.seed;
  const locomotionSeed = changed.state.locomotionSeed;

  changed.configure({housing: 'barn'});
  changed.tick(3);

  assert.equal(changed.state.seed, modelSeed);
  assert.notEqual(changed.state.locomotionSeed, locomotionSeed);
  assert.equal(changed.random(), unchanged.random());
});

test('legacy snapshots get a deterministic locomotion stream without being mutated', () => {
  const legacySnapshot = new FarmEngine(81, 3).snapshot();
  delete legacySnapshot.locomotionSeed;
  const original = structuredClone(legacySnapshot);
  const first = FarmEngine.from(legacySnapshot);
  const second = FarmEngine.from(legacySnapshot);

  assert.deepEqual(legacySnapshot, original);
  assert.ok(Number.isInteger(first.state.locomotionSeed));
  assert.equal(first.state.locomotionSeed, second.state.locomotionSeed);
  first.tick(24);
  second.tick(24);
  assert.deepEqual(first.snapshot(), second.snapshot());
});

test('comparison keeps the initial snapshot and changes housing only', () => {
  const engine = new FarmEngine(2026, 12);
  engine.configure({diet: 'balanced', supplement: 1.5, weather: 'rain'});
  engine.tick(24);
  const start = engine.snapshot();

  const result = compare(start, 30);
  const baseline = result.baselineConfig;
  const scenario = result.scenarioConfig;

  assert.equal(result.comparisonFactor, 'housing');
  assert.equal(baseline.housing, 'pasture');
  assert.equal(scenario.housing, 'barn');
  assert.deepEqual({...baseline, housing: DEFAULT_CONFIG.housing}, {...scenario, housing: DEFAULT_CONFIG.housing});
  assert.deepEqual(engine.snapshot(), start);
  assert.equal(result.rows[0].baselineWeight, result.rows[0].scenarioWeight);
});

test('scenario comparison repeats with the same input and period', () => {
  const engine = new FarmEngine(903, 6);
  engine.configure({housing: 'barn', diet: 'concentrate', supplement: 2, weather: 'hot'});
  engine.tick(36);
  const start = engine.snapshot();

  assert.deepEqual(compare(start, 14), compare(start, 14));
  assert.equal(compare(start, 14).rows.length, 15);
});

test('comparison manifests preserve the seed, starting snapshot, period, and both configs', () => {
  const engine = new FarmEngine(2741, 5);
  engine.configure({diet: 'balanced', supplement: 1.5, weather: 'rain'});
  engine.tick(48);
  const start = engine.snapshot();
  const manifest = createComparisonManifest(start, 17);
  const restored = JSON.parse(JSON.stringify(manifest));

  assert.equal(restored.seed, start.initialSeed);
  assert.deepEqual(restored.initialSnapshot, start);
  assert.equal(restored.periodDays, 17);
  assert.equal(restored.factor, 'housing');
  assert.deepEqual(restored.scenarios.reference, {...start.config, housing: 'pasture'});
  assert.deepEqual(restored.scenarios.scenario, {...start.config, housing: 'barn'});
  assert.equal(validateComparisonManifest(restored), true);
  assert.deepEqual(replayComparisonManifest(restored), replayComparisonManifest(restored));
  assert.deepEqual(replayComparisonManifest(restored), compare(start, 17));
  assert.deepEqual(engine.snapshot(), start);
});

test('comparison manifests reject scenarios that change undeclared factors', () => {
  const manifest = createComparisonManifest(new FarmEngine(44, 2).snapshot(), 3);
  manifest.scenarios.scenario.weather = 'hot';

  assert.throws(() => validateComparisonManifest(manifest), /diferir somente no fator declarado/);
});

test('activity history records the rule inputs for every animal', () => {
  const engine = new FarmEngine(11, 2);
  assert.equal(engine.snapshot().events.length, 1, 'initial activity belongs in each animal history, not the global event feed');
  engine.configure({weather: 'hot'});
  engine.tick(6);
  const snapshot = engine.snapshot();

  for (const animal of snapshot.animals) {
    const initial = animal.history[0];
    const thirstEvent = animal.history.find(record => record.reason === 'thirst_threshold');
    assert.equal(initial.reason, 'pasture_housing');
    assert.equal(initial.observed.housing, 'pasture');
    assert.ok(thirstEvent);
    assert.ok(thirstEvent.observed.thirst > 65);
    assert.equal(thirstEvent.action, 'drinking');
  }
});

test('activity histories replay deterministically with the same seed', () => {
  const first = new FarmEngine(72, 4);
  const second = new FarmEngine(72, 4);
  for (const engine of [first, second]) {
    engine.configure({housing: 'barn', weather: 'hot'});
    engine.tick(30);
  }
  assert.deepEqual(first.snapshot().animals.map(animal => animal.history), second.snapshot().animals.map(animal => animal.history));
});

test('comparison reports simulated intake and pasture stock by paddock', () => {
  const engine = new FarmEngine(93, 4);
  engine.configure({diet: 'balanced', supplement: 1});
  engine.tick(24);
  const start = engine.snapshot();
  const result = compare(start, 3);
  const end = result.rows.at(-1);

  assert.equal(result.initialPastureByPaddock.length, 4);
  assert.equal(end.baselinePastureByPaddock.length, 4);
  assert.equal(end.scenarioPastureByPaddock.length, 4);
  assert.equal(result.rows[0].baselineConsumptionKgDM, 0);
  assert.equal(result.rows[0].scenarioConsumptionKgDM, 0);
  assert.ok(end.baselineConsumptionKgDM > 0);
  assert.ok(end.scenarioConsumptionKgDM > 0);
  assert.ok(end.baselinePastureKgDM < end.scenarioPastureKgDM);
  assert.deepEqual(engine.snapshot(), start);
});

test('intake ledger separates pasture, confinement base feed, supplement, and diet extra', () => {
  const pasture = new FarmEngine(21, 3);
  pasture.configure({diet: 'balanced', supplement: 1.5});
  pasture.tick(24);
  const pastureIntake = pasture.metrics().intake;
  assert.ok(pastureIntake.pastureKgDM > 0);
  assert.equal(pastureIntake.barnBaseKgDM, 0);
  assert.ok(pastureIntake.supplementKgDM > 0);
  assert.ok(pastureIntake.dietExtraKgDM > 0);
  assert.equal(pastureIntake.totalKgDM, pastureIntake.pastureKgDM + pastureIntake.supplementKgDM + pastureIntake.dietExtraKgDM);

  const barn = FarmEngine.from(pasture.snapshot());
  barn.configure({housing: 'barn'});
  barn.tick(24);
  const barnIntake = barn.metrics().intake;
  assert.ok(barnIntake.barnBaseKgDM > 0);
  assert.equal(barnIntake.pastureKgDM, pastureIntake.pastureKgDM);
});
