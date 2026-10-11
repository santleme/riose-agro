import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareObservedGroups, summarizeObservedData} from '../observed-data-model.js';

const data = JSON.parse(readFileSync(new URL('../data/observed-calves-zenodo-7251167.json', import.meta.url), 'utf8'));

test('observed trial snapshot retains source, license, and animal-level weights', () => {
  assert.equal(data.source.doi, '10.5281/zenodo.7251167');
  assert.equal(data.source.license, 'CC0');
  assert.equal(data.source.measurements_are_observations, true);
  assert.equal(data.weights.length, 256);
  assert.deepEqual(
    Object.fromEntries(['Control', 'Bucket', 'Pipe'].map(group => [group, data.weights.filter(row => row.treatment === group).length])),
    {Control: 83, Bucket: 86, Pipe: 87},
  );
  assert.ok(data.weights.every(row => Number.isFinite(row.weight_kg) && Number.isInteger(row.age_days)));
  assert.ok(data.weights.every(row => !Object.hasOwn(row, 'adg_kg_day')), 'ADG is not a separate independent measurement');
});

test('observed intake snapshot preserves documented missing values by feed', () => {
  const expected = {
    grain: [1647, 1492, 155],
    hay: [900, 687, 213],
    tmr: [297, 274, 23],
    water: [1647, 1565, 82],
  };
  for (const [feed, [rows, valid, missing]] of Object.entries(expected)) {
    const selected = data.intake.filter(row => row.feed === feed);
    assert.equal(selected.length, rows, `${feed} source row count`);
    assert.equal(selected.filter(row => row.value !== null).length, valid, `${feed} valid value count`);
    assert.equal(selected.filter(row => row.value === null).length, missing, `${feed} missing value count`);
  }
  assert.ok(data.intake.every(row => row.value === null || Number.isFinite(row.value)));
});

test('weekly group summaries give each calf equal weight and preserve empty treatment cells', () => {
  const fixture = {
    weights: [],
    intake: [
      {calf: 'A', treatment: 'Control', age_days: 0, feed: 'grain', value: 10},
      {calf: 'A', treatment: 'Control', age_days: 1, feed: 'grain', value: 30},
      {calf: 'B', treatment: 'Control', age_days: 2, feed: 'grain', value: 100},
    ],
  };
  const result = summarizeObservedData(fixture, 'grain');
  assert.deepEqual(result.series.get('Control')[0], {week: 0, mean: 60, min: 20, max: 100, n: 2});

  const hay = summarizeObservedData(data, 'hay');
  assert.equal(hay.series.get('Control').every(point => point === null), true);
  assert.equal(hay.missing, 213);
});

test('observed group contrast uses animal-weighted weekly means and reports coverage', () => {
  const fixture = {
    weights: [
      {calf: 'A', treatment: 'Control', age_days: 1, weight_kg: 100},
      {calf: 'B', treatment: 'Control', age_days: 2, weight_kg: 120},
      {calf: 'C', treatment: 'Bucket', age_days: 3, weight_kg: 130},
    ],
    intake: [],
  };
  const result = compareObservedGroups(fixture, 'weight', 'Control', 'Bucket');
  assert.deepEqual(result[0], {
    week: 0,
    reference: 110,
    comparison: 130,
    referenceN: 2,
    comparisonN: 1,
    difference: 20,
    percentDifference: 20 / 110 * 100,
  });
  assert.equal(result.slice(1).every(row => row.difference === null), true);
});

test('observed group contrast preserves unavailable comparisons and rejects invalid pairs', () => {
  const noHayForControl = compareObservedGroups(data, 'hay', 'Control', 'Bucket');
  assert.equal(noHayForControl.every(row => row.difference === null), true);
  assert.throws(() => compareObservedGroups(data, 'weight', 'Control', 'Control'), /different observed groups/);
  assert.throws(() => compareObservedGroups(data, 'weight', 'Control', 'Missing'), /Unknown observed group/);
});
