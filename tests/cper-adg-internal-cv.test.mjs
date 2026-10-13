import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createYearFolds, evaluateRows, readDevelopmentRows} from '../scripts/evaluate_cper_adg_internal_cv.mjs';

const header = 'Concatenate,Year,Pasture,Treatment,Allocation.number,Type,Owner,Tag.Color,Tag,QAQC.Notes,Actual.on.date,Actual.off.date,Season.on.date,Season.off.date,Season.Days,on_Weight,on_Shrink,off_Weight,off_Shrink,Gain_shrunk,ADG_shrunk,Use.Flag';

test('development reader skips all outcome parsing for post-2013 rows and converts raw ADG to kg/day', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cper-adg-cv-'));
  try {
    const file = path.join(dir, 'source.csv');
    writeFileSync(file, `${header}\n2009_15E,2009,15E,moderate,20,steer,Local,Blue,1,,5/1/2009,9/1/2009,5/1/2009,9/1/2009,120,500,0,620,0,120,1,0\n2014_15E,2014,15E,moderate,20,steer,Local,Blue,1,,5/1/2014,9/1/2014,5/1/2014,9/1/2014,120,500,0,NOT_AN_OUTCOME,0,0,0,0\n`);
    const rows = await readDevelopmentRows(file, [2009]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].year, 2009);
    assert.ok(Math.abs(rows[0].observedRawAdgKgPerDay - 0.45359237) < 1e-12);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('year folds purge matching animal proxies from training and keep test-year rows intact', () => {
  const rows = [
    {year: 2009, identity: 'Local|Blue|1'},
    {year: 2009, identity: 'Local|Blue|2'},
    {year: 2010, identity: 'Local|Blue|1'},
    {year: 2010, identity: 'Local|Red|3'},
  ];
  const [fold09, fold10] = createYearFolds(rows, [2009, 2010]);
  assert.equal(fold09.testRows.length, 2);
  assert.deepEqual(fold09.trainRows.map(row => row.identity), ['Local|Red|3']);
  assert.equal(fold09.purgedIdentityCount, 1);
  assert.deepEqual(fold10.trainRows.map(row => row.identity), ['Local|Blue|2']);
});

test('fixed candidate evaluator returns pooled OOF scores and does not accept out-of-protocol rows', () => {
  const years = [2009, 2010, 2011, 2012, 2013];
  const rows = [];
  for (const year of years) {
    for (const [i, treatment] of ['light', 'moderate', 'heavy'].entries()) {
      for (let j = 0; j < 3; j += 1) {
        const initialWeightKg = 200 + i * 20 + j * 3 + (year - 2009) * 2;
        const seasonDays = 120 + j + (year - 2009);
        rows.push({
          rowId: `${year}-${treatment}-${j}`, year, pasture: `${treatment}-${year}`, treatment,
          owner: 'Local', tagColor: `${year}-${i}`, tag: String(j), identity: `Local|${year}-${i}|${j}`,
          useFlag: '0', initialWeightKg, seasonDays,
          observedRawAdgKgPerDay: 0.3 + 0.0005 * initialWeightKg + 0.002 * i - 0.0003 * seasonDays + (year - 2011) * 0.01,
        });
      }
    }
  }
  const protocol = {
    cohort: {developmentYears: years, seasonDurationAtPrediction: 'known_horizon'},
    operationalAdvancementRule: {pooledMaeReductionAtLeast: 0.1, maxAllowedYearMaeWorseningKgPerHeadDay: 0.1},
  };
  const result = evaluateRows(rows, protocol, {enginePredictor: row => 0.5 + row.initialWeightKg * 0.0001 - row.seasonDays * 0.0002});
  assert.equal(result.oofRowCount, rows.length);
  assert.deepEqual(result.folds.map(fold => fold.year), years);
  assert.equal(result.candidates.M0.pooled.n, rows.length);
  assert.equal(result.candidates.M1.pooled.n, rows.length);
  assert.equal(result.candidates.M3.byYear.length, years.length);
  assert.throws(() => evaluateRows([...rows, {...rows[0], year: 2014}], protocol), /outside the pre-registered development cohort/);
});
