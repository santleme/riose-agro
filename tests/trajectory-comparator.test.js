import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalTrajectoryJson,
  classifyTrajectoryDivergence,
  compareExactJson,
  compareTrajectoryCheckpoint,
} from '../src/client/trajectory-comparator.js';

test('exact JSON comparison accepts lexical numeric equivalents without tolerance', () => {
  assert.equal(compareExactJson(0, 0.0).mismatch, null);
  assert.equal(compareExactJson(1200, 1.2e3).mismatch, null);
  assert.equal(compareExactJson(0, 0.0000000001).mismatch.jsValue, 0);
});

test('comparison preserves structural types, arrays, IDs, and event order', () => {
  assert.equal(compareExactJson({value: 1}, {value: '1'}).mismatch.pointer, '/value');
  assert.equal(compareExactJson([1, 2], [2, 1]).mismatch.pointer, '/0');
  assert.equal(classifyTrajectoryDivergence('/state/animals/0/id'), 'ORDER_DIVERGENCE');
  assert.equal(classifyTrajectoryDivergence('/state/events/0/hour'), 'EVENT_DIVERGENCE');
  assert.equal(classifyTrajectoryDivergence('/state/animals/0/weight'), 'STATE_DIVERGENCE');
  assert.equal(classifyTrajectoryDivergence('/state/seed'), 'RNG_DIVERGENCE');
  assert.equal(compareExactJson({seed: 17, locomotionSeed: 23}, {seed: 17.0, locomotionSeed: 23.0}).mismatch, null);
  const eventOrder = compareExactJson({events: [{text: 'a'}, {text: 'b'}]}, {events: [{text: 'b'}, {text: 'a'}]});
  assert.equal(classifyTrajectoryDivergence(eventOrder.mismatch.pointer), 'EVENT_DIVERGENCE');
  const numericMismatch = compareExactJson({animals: [{weight: 1}]}, {animals: [{weight: 1.0000000001}]});
  assert.equal(classifyTrajectoryDivergence(numericMismatch.mismatch.pointer, numericMismatch.mismatch.jsValue, numericMismatch.mismatch.rustValue), 'NUMERIC_DIVERGENCE');
});

test('first divergence reports the checkpoint, JSON Pointer, values, and prior match', () => {
  const result = compareTrajectoryCheckpoint({
    scenario: 'baseline-pasture',
    seed: 417,
    checkpoint: 'hour-6',
    previousMatchingCheckpoint: 'hour-1',
    jsValue: {state: {animals: [{weight: 10}]}, metrics: {weight: 10}},
    rustValue: {state: {animals: [{weight: 11}]}, metrics: {weight: 10}},
  });
  assert.equal(result.parity, 'FAIL');
  assert.equal(result.firstDivergence.scenario, 'baseline-pasture');
  assert.equal(result.firstDivergence.seed, 417);
  assert.equal(result.firstDivergence.checkpoint, 'hour-6');
  assert.equal(result.firstDivergence.path, '/state/animals/0/weight');
  assert.equal(result.firstDivergence.jsValue, 10);
  assert.equal(result.firstDivergence.rustValue, 11);
  assert.equal(result.firstDivergence.previousMatchingCheckpoint, 'hour-1');
  assert.equal(result.firstDivergence.divergenceClass, 'NUMERIC_DIVERGENCE');
});

test('canonical trajectory serialization is repeatable and keeps array order', () => {
  const first = canonicalTrajectoryJson({b: 2, a: [{z: 1, y: 0}]});
  const second = canonicalTrajectoryJson({a: [{y: 0.0, z: 1}], b: 2.0});
  assert.equal(first, second);
  assert.equal(canonicalTrajectoryJson([1, 2]), '[1,2]\n');
});

test('housing arms retain stable animal IDs and order in each checkpoint', () => {
  const js = {animals: [{id: 1}, {id: 2}, {id: 3}]};
  const rust = {animals: [{id: 1}, {id: 2}, {id: 3}]};
  assert.equal(compareExactJson(js, rust).mismatch, null);
  const reordered = compareExactJson(js, {animals: [{id: 2}, {id: 1}, {id: 3}]});
  assert.equal(classifyTrajectoryDivergence(reordered.mismatch.pointer), 'ORDER_DIVERGENCE');
});

test('trajectory parity ignores retired visual coordinates while exact JSON remains strict', () => {
  const legacy = {state: {animals: [{id: 1, weight: 330, x: 10, y: 20, targetX: 11, targetY: 21}], locomotionSeed: 99}};
  const scientific = {state: {animals: [{id: 1, weight: 330}]}};
  assert.ok(compareExactJson(legacy, scientific).mismatch);
  assert.equal(compareTrajectoryCheckpoint({jsValue: legacy, rustValue: scientific}).parity, 'PASS');
});
