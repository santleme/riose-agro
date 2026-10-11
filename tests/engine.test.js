import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG, FarmEngine, compare} from '../engine.js';

test('same seed and actions reproduce the same farm state', () => {
  const first = new FarmEngine(417, 8);
  const second = new FarmEngine(417, 8);

  first.tick(72);
  second.tick(72);

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
