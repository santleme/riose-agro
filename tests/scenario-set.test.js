import test from 'node:test';
import assert from 'node:assert/strict';
import {FarmEngine, FARM_ENGINE_VERSION} from '../src/client/engine.js';
import {createScenarioSetManifest, replayScenarioSetManifest, validateScenarioSetManifest} from '../src/client/scenario-set.js';

function threeSupplementScenarios(snapshot) {
  const shared = {...snapshot.config};
  return [
    {id: 'baseline', label: 'Baseline', role: 'baseline', config: {...shared, supplement: 0.5}},
    {id: 'supplement-1', label: '1.0 kg DM', role: 'intervention', config: {...shared, supplement: 1.0}},
    {id: 'supplement-2', label: '1.5 kg DM', role: 'intervention', config: {...shared, supplement: 1.5}},
  ];
}

test('creates a versioned scenario set with a shared snapshot, seed, and three comparable arms', () => {
  const snapshot = new FarmEngine(2026, 3).snapshot();
  const manifest = createScenarioSetManifest({snapshot, durationDays: 30, scenarioId: 'supplement-sweep', scenarios: threeSupplementScenarios(snapshot)});

  assert.equal(manifest.type, 'riose-scenario-set');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.engineVersion, FARM_ENGINE_VERSION);
  assert.equal(manifest.durationDays, 30);
  assert.equal(manifest.factor, 'supplement');
  assert.equal(manifest.seed, snapshot.initialSeed);
  assert.equal(manifest.validated, false);
  assert.deepEqual(manifest.initialSnapshot, snapshot);
  assert.notEqual(manifest.initialSnapshot, snapshot);
  assert.deepEqual(manifest.scenarios.map(scenario => scenario.id), ['baseline', 'supplement-1', 'supplement-2']);
  assert.equal(validateScenarioSetManifest(manifest), true);
});

test('rejects an intervention arm that changes more than the declared common factor', () => {
  const snapshot = new FarmEngine(2026, 3).snapshot();
  const manifest = createScenarioSetManifest({snapshot, durationDays: 30, scenarioId: 'supplement-sweep', scenarios: threeSupplementScenarios(snapshot)});
  manifest.scenarios[2].config.weather = 'hot';

  assert.throws(() => validateScenarioSetManifest(manifest), /differ from baseline in exactly one factor/);
});

test('rejects a baseline that silently changes an unrelated field from the initial snapshot', () => {
  const snapshot = new FarmEngine(2026, 3).snapshot();
  const scenarios = threeSupplementScenarios(snapshot);
  for (const scenario of scenarios) scenario.config.weather = 'hot';

  assert.throws(() => createScenarioSetManifest({snapshot, durationDays: 30, scenarioId: 'supplement-sweep', scenarios}), /baseline may differ from the initial snapshot only by the varied factor/);
});

test('rejects unsupported versions, extra persisted fields, duplicate IDs, and duplicate factor values', () => {
  const snapshot = new FarmEngine(2026, 3).snapshot();
  const create = scenarios => createScenarioSetManifest({snapshot, durationDays: 30, scenarioId: 'supplement-sweep', scenarios});

  const badVersion = create(threeSupplementScenarios(snapshot));
  badVersion.version = 2;
  assert.throws(() => validateScenarioSetManifest(badVersion), /type\/version must be riose-scenario-set\/1/);

  const extraField = create(threeSupplementScenarios(snapshot));
  extraField.unregistered = true;
  assert.throws(() => validateScenarioSetManifest(extraField), /root must contain exactly/);

  const duplicateId = threeSupplementScenarios(snapshot);
  duplicateId[2].id = duplicateId[1].id;
  assert.throws(() => create(duplicateId), /scenario IDs must be unique/);

  const duplicateValue = threeSupplementScenarios(snapshot);
  duplicateValue[2].config.supplement = duplicateValue[1].config.supplement;
  assert.throws(() => create(duplicateValue), /unique value for the varied factor/);
});

test('rejects scenario inputs outside the current FarmEngine configuration domain', () => {
  const snapshot = new FarmEngine(2026, 3).snapshot();
  const scenarios = threeSupplementScenarios(snapshot);
  scenarios[2].config.supplement = 5;

  assert.throws(() => createScenarioSetManifest({snapshot, durationDays: 30, scenarioId: 'supplement-sweep', scenarios}), /outside the FarmEngine domain/);
});

test('requires at least three total scenarios and one factor shared by all interventions', () => {
  const snapshot = new FarmEngine(2026, 3).snapshot();
  const scenarios = threeSupplementScenarios(snapshot);

  assert.throws(() => createScenarioSetManifest({snapshot, durationDays: 30, scenarioId: 'short-set', scenarios: scenarios.slice(0, 2)}), /3 to 10 arms/);

  const mixedFactorScenarios = threeSupplementScenarios(snapshot);
  mixedFactorScenarios[2].config.supplement = mixedFactorScenarios[0].config.supplement;
  mixedFactorScenarios[2].config.diet = 'balanced';
  assert.throws(() => createScenarioSetManifest({snapshot, durationDays: 30, scenarioId: 'mixed-set', scenarios: mixedFactorScenarios}), /all interventions must vary the same declared factor/);
});

test('replays every intervention from one deterministic baseline snapshot and exposes aligned results', () => {
  const snapshot = new FarmEngine(2026, 4).snapshot();
  const manifest = createScenarioSetManifest({snapshot, durationDays: 1, scenarioId: 'supplement-sweep', scenarios: threeSupplementScenarios(snapshot)});
  const first = replayScenarioSetManifest(manifest);
  const replay = replayScenarioSetManifest(manifest);

  assert.deepEqual(replay, first);
  assert.equal(first.type, 'riose-scenario-results');
  assert.equal(first.version, 1);
  assert.equal(first.validated, false);
  assert.equal(first.seed, manifest.seed);
  assert.equal(first.executor, 'javascript-population-observations');
  assert.equal(first.units.meanWeightKg, 'kg live weight/animal');
  assert.ok(first.assumptions.dailyPastureGrowthKgDM >= 0);
  assert.equal(first.baseline.id, 'baseline');
  assert.equal(first.scenarios.length, 2);
  assert.deepEqual(first.baseline.timeline.map(point => point.day), [0, 1]);
  assert.deepEqual(first.scenarios.map(scenario => scenario.id), ['supplement-1', 'supplement-2']);
  for (const scenario of first.scenarios) {
    assert.deepEqual(scenario.timeline.map(point => point.day), [0, 1]);
    assert.equal(scenario.rows.length, 2);
    assert.equal(scenario.rows[1].day, 1);
    assert.ok(Number.isFinite(scenario.rows[1].meanWeightKg));
    assert.equal(scenario.timeline[1].animals.length, 4);
  }
});

test('reports progress with the arm identity and bounded shared horizon', () => {
  const snapshot = new FarmEngine(2026, 3).snapshot();
  const manifest = createScenarioSetManifest({snapshot, durationDays: 1, scenarioId: 'supplement-sweep', scenarios: threeSupplementScenarios(snapshot)});
  const progress = [];
  replayScenarioSetManifest(manifest, {onProgress: value => progress.push(value)});

  assert.equal(progress.length, 4);
  assert.deepEqual([...new Set(progress.map(value => value.scenarioId))], ['supplement-1', 'supplement-2']);
  assert.ok(progress.every(value => value.days === 1 && value.day >= 0 && value.day <= 1));
  assert.ok(progress.every(value => value.scenarioCount === 2 && value.scenarioIndex >= 1 && value.scenarioIndex <= 2));
});
