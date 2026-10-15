#!/usr/bin/env node
/** Fixed-config CPER row-aligned descriptive engine benchmark for v2. */
import {readFileSync} from 'node:fs';
import {FarmEngine, metrics} from '../../../src/client/engine.js';

const rows = JSON.parse(readFileSync(0, 'utf8'));
if (!Array.isArray(rows) || rows.length !== 320) throw new Error('Expected exactly 320 CPER benchmark rows');
const predictions = rows.map((row, index) => {
  if (!(row.initialWeightKg > 0) || !(row.seasonDays > 0)) throw new Error(`Invalid benchmark inputs at row ${index}`);
  const engine = new FarmEngine(20261011, 1);
  const animal = engine.state.animals[0];
  animal.weight = row.initialWeightKg;
  animal.initialWeight = row.initialWeightKg;
  engine.configure({housing: 'pasture', diet: 'pasture', weather: 'normal', supplement: 0});
  engine.tick(row.seasonDays * 24);
  const result = metrics(engine.state);
  return (result.weight - row.initialWeightKg) / row.seasonDays;
});
process.stdout.write(JSON.stringify(predictions));
