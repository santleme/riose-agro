import test from 'node:test';
import assert from 'node:assert/strict';
import {FarmEngine} from '../engine.js';
import {analyzeSensitivity} from '../sensitivity-analysis.js';

function baselineSnapshot() {
  const engine = new FarmEngine(417, 4);
  engine.configure({diet: 'balanced', housing: 'pasture', weather: 'normal', supplement: 1});
  engine.tick(24);
  return engine.snapshot();
}

const request = snapshot => ({
  snapshot,
  targetVariable: 'supplement',
  values: [0, 1, 2],
  outputs: ['weight', 'gain', 'cost'],
  durationHours: 24,
});

test('sensitivity declares the baseline and each explicitly tested value', () => {
  const result = analyzeSensitivity(request(baselineSnapshot()));

  assert.equal(result.status, 'supported');
  assert.equal(result.method, 'one-at-a-time');
  assert.equal(result.targetVariable.baselineValue, 1);
  assert.equal(result.baselineIncludedInValues, true);
  assert.deepEqual(result.values, [0, 1, 2]);
  assert.equal(result.seed, 417);
  assert.deepEqual(result.duration, {value: 24, unit: 'hour'});
  assert.deepEqual(result.baseline.config, baselineSnapshot().config);
});

test('each run changes only the declared input and preserves the caller snapshot', () => {
  const snapshot = baselineSnapshot();
  const before = structuredClone(snapshot);
  const result = analyzeSensitivity(request(snapshot));

  assert.deepEqual(snapshot, before);
  for (const row of result.results) {
    assert.equal(row.config.supplement, row.inputValue);
    assert.deepEqual({...row.config, supplement: before.config.supplement}, before.config);
  }
});

test('runs the baseline and every explicit value and returns selected structured outputs', () => {
  const result = analyzeSensitivity(request(baselineSnapshot()));

  assert.equal(result.executionCount, 4);
  assert.equal(result.results.length, 3);
  assert.deepEqual(Object.keys(result.baseline.outputs), ['weight', 'gain', 'cost']);
  assert.deepEqual(Object.keys(result.results[0].outputs), ['weight', 'gain', 'cost']);
  assert.ok(result.results.every(row => Object.hasOwn(row, 'deltaFromBaseline')));
});

test('reports absolute and relative deltas against the explicit baseline', () => {
  const result = analyzeSensitivity(request(baselineSnapshot()));
  const baselineWeight = result.baseline.outputs.weight;
  const row = result.results.find(item => item.inputValue === 2);

  assert.equal(row.deltaFromBaseline.weight.absolute, row.outputs.weight - baselineWeight);
  assert.equal(row.deltaFromBaseline.weight.percent, (row.outputs.weight - baselineWeight) / baselineWeight * 100);
});

test('returns a null percentage when a numeric baseline output is zero', () => {
  const snapshot = new FarmEngine(417, 1).snapshot();
  const result = analyzeSensitivity({
    snapshot,
    targetVariable: 'supplement',
    values: [0, 1],
    outputs: ['cost'],
    durationHours: 1,
  });

  assert.equal(result.baseline.outputs.cost, 0);
  assert.equal(result.results[0].deltaFromBaseline.cost.percent, null);
  assert.equal(result.results[0].deltaFromBaseline.cost.absolute, result.results[0].outputs.cost);
});

test('rejects invalid values, empty value lists, unsupported outputs, and invalid durations', () => {
  const input = request(baselineSnapshot());

  assert.throws(() => analyzeSensitivity({...input, values: []}), /non-empty array/);
  assert.throws(() => analyzeSensitivity({...input, values: [5]}), /Invalid configuration/);
  assert.throws(() => analyzeSensitivity({...input, values: [NaN]}), /finite numbers or strings/);
  assert.throws(() => analyzeSensitivity({...input, outputs: ['notAMetric']}), /Unsupported output/);
  assert.throws(() => analyzeSensitivity({...input, durationHours: 0}), /durationHours/);
  assert.throws(() => analyzeSensitivity({...input, snapshot: {...input.snapshot, config: {...input.snapshot.config, weather: 'humid'}}}), /Invalid configuration/);
  assert.throws(() => analyzeSensitivity({...input, snapshot: {...input.snapshot, initialSeed: -1}}), /initialSeed/);
});

test('returns unsupported for an input without a model instead of inventing a result', () => {
  const result = analyzeSensitivity({...request(baselineSnapshot()), targetVariable: 'humidity'});

  assert.equal(result.status, 'unsupported');
  assert.match(result.reason, /does not model humidity/);
  assert.equal(result.results, undefined);
});

test('same snapshot, seed, values, and outputs produce byte-identical structured results', () => {
  const input = request(baselineSnapshot());
  assert.deepEqual(analyzeSensitivity(input), analyzeSensitivity(input));
});

test('reuses FarmEngine behavior without mutating the source snapshot', () => {
  const snapshot = baselineSnapshot();
  const direct = FarmEngine.from(snapshot);
  direct.configure({...snapshot.config, supplement: 2});
  direct.tick(24);
  const result = analyzeSensitivity(request(snapshot));
  const resultAtTwo = result.results.find(row => row.inputValue === 2);

  assert.deepEqual(resultAtTwo.outputs, {
    weight: direct.metrics().weight,
    gain: direct.metrics().gain,
    cost: direct.metrics().cost,
  });
  assert.equal(snapshot.config.supplement, 1);
  assert.equal(direct.state.config.supplement, 2);
});
