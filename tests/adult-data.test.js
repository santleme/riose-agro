import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAdultCperCsv} from '../adult-data-model.js';

const csv = readFileSync(new URL('../data/usda-cper/period.csv', import.meta.url), 'utf8');

test('USDA adult explorer parses every animal-period row with observed ADG and grazing measures', () => {
  const rows = parseAdultCperCsv(csv);
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map(row => row.eartag)).size, 33);
  assert.deepEqual([...new Set(rows.map(row => row.year))].sort(), [2019, 2020]);
  assert.ok(rows.every(row => Number.isFinite(row.adg) && Number.isFinite(row.bout) && Number.isFinite(row.hours) && Number.isFinite(row.velocity)));
  assert.equal(rows[0].adg, 1.25745098);
  assert.equal(rows[0].paddock, '19N');
});

test('adult observed-data explorer is linked from project pages and served with its local dataset', () => {
  for (const path of ['../adult-data.html', '../adult-data.js', '../adult-data.css', '../adult-data-model.js']) {
    assert.ok(readFileSync(new URL(path, import.meta.url), 'utf8').length > 0);
  }
  const home = readFileSync(new URL('../home.html', import.meta.url), 'utf8');
  const calves = readFileSync(new URL('../observed-data.html', import.meta.url), 'utf8');
  const farm = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(home, /adult-data\.html/);
  assert.match(calves, /adult-data\.html/);
  assert.match(farm, /adult-data\.html/);
});
