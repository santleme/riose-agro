import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateScenarioSetResultJsonBytes, scenarioSetCheckpointCount, scenarioSetResultBudgetStatus, SCENARIO_SET_PROJECTED_JSON_BUDGET_BYTES, SCENARIO_SET_REFERENCE_JSON_BYTES} from '../src/client/scenario-set-budget.js';

test('checkpoint count follows the engine observation schedule and deduplicates the final day', () => {
  assert.equal(scenarioSetCheckpointCount(1), 2);
  assert.equal(scenarioSetCheckpointCount(7), 3);
  assert.equal(scenarioSetCheckpointCount(30), 5);
  assert.equal(scenarioSetCheckpointCount(365), 9);
});

test('projected result size reproduces measured scale and blocks combinations above 40 MiB', () => {
  assert.equal(estimateScenarioSetResultJsonBytes({animalCount: 10000, durationDays: 7, scenarioCount: 3}), SCENARIO_SET_REFERENCE_JSON_BYTES);
  const ordinary = scenarioSetResultBudgetStatus({animalCount: 1000, durationDays: 30, scenarioCount: 3});
  assert.equal(ordinary.withinBudget, true);
  const large = scenarioSetResultBudgetStatus({animalCount: 10000, durationDays: 15, scenarioCount: 3});
  assert.equal(large.estimatedBytes, Math.ceil(SCENARIO_SET_REFERENCE_JSON_BYTES * 120000 / 90000));
  assert.ok(large.estimatedBytes > SCENARIO_SET_PROJECTED_JSON_BUDGET_BYTES);
  assert.equal(large.withinBudget, false);
});

test('resource estimate rejects values outside the supported FarmEngine workload', () => {
  assert.throws(() => estimateScenarioSetResultJsonBytes({animalCount: 10001, durationDays: 7, scenarioCount: 3}), /animalCount/);
  assert.throws(() => estimateScenarioSetResultJsonBytes({animalCount: 100, durationDays: 366, scenarioCount: 3}), /durationDays/);
  assert.throws(() => estimateScenarioSetResultJsonBytes({animalCount: 100, durationDays: 7, scenarioCount: 11}), /scenarioCount/);
});
