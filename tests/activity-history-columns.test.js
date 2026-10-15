import test from 'node:test';
import assert from 'node:assert/strict';
import {ActivityHistoryColumns} from '../scripts/experiments/activity-history-columns.mjs';

test('typed activity columns retain the latest ring entries and materialize the same JSON shape', () => {
  const store = new ActivityHistoryColumns(2, 2);
  const record = (hour, action, reason, thirst, housing = 'pasture') => ({hour, action, reason, observed: {hour: hour % 24, thirst, housing}});
  store.push(1, record(1, 'grazing', 'pasture_housing', 25));
  store.push(1, record(2, 'drinking', 'thirst_threshold', 70, 'barn'));
  store.push(1, record(3, 'resting', 'rest_window', 12));
  assert.deepEqual(store.historyFor(1), [record(2, 'drinking', 'thirst_threshold', 70, 'barn'), record(3, 'resting', 'rest_window', 12)]);
  assert.deepEqual(store.historyFor(2), []);
  assert.deepEqual(store.historyFor(3), []);
});
