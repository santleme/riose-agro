#!/usr/bin/env node
/**
 * Compare the default illustrative engine run with the published CPER ADG range.
 * This is a face-validity range check, not model validation or calibration.
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {FarmEngine, metrics} from '../../../src/client/engine.js';
import {parseAdultCperCsv} from '../../../src/client/adult-data-model.js';
import {engineSourceSha256, ENGINE_SOURCE_FILES} from '../../engine-source-hash.js';

const root = new URL('../../../', import.meta.url);
const cperBytes = readFileSync(new URL('data/usda-cper/period.csv', root));
const manifest = JSON.parse(readFileSync(new URL('data/usda-cper/manifest.json', root), 'utf8'));
const sourceFile = manifest.files.find(file => file.path === 'period.csv');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
if (!sourceFile || digest(cperBytes) !== sourceFile.sha256) throw new Error('USDA/CPER source checksum mismatch');

const observed = parseAdultCperCsv(cperBytes.toString('utf8')).map(row => row.adg).filter(Number.isFinite);
const observedMean = observed.reduce((sum, value) => sum + value, 0) / observed.length;
const run = housing => {
  const farm = new FarmEngine(1, 24);
  const initialWeightKgPerAnimal = metrics(farm.state).weight;
  farm.configure({housing});
  for (let day = 0; day < 30; day += 1) farm.tick(24);
  const final = metrics(farm.state);
  const gainKgPerAnimal = final.weight - initialWeightKgPerAnimal;
  return {
    housing, horizonDays: 30, herdSize: 24, initialWeightKgPerAnimal,
    finalWeightKgPerAnimal: final.weight, gainKgPerAnimal,
    derivedAdgKgPerAnimalDay: gainKgPerAnimal / 30,
    costValue: final.cost, intakeKgDMPerLot: final.intake.totalKgDM,
    pastureStockKgDM: final.pasture,
  };
};
const pasture = run('pasture');
const barn = run('barn');
const report = {
  classification: 'face_validity_range_check_only_not_validation_or_calibration',
  engine: {sha256: engineSourceSha256(), sourceFiles: ENGINE_SOURCE_FILES, seed: 1, assumptions: 'engine.js defaults; no values fitted to CPER'},
  source: {doi: manifest.source.doi, file: sourceFile.path, sha256: sourceFile.sha256, license: manifest.source.license, rowCount: observed.length, eartagCount: 33},
  observedAdgKgPerAnimalDay: {
    nAnimalPeriodRows: observed.length, simpleRowMean: observedMean,
    minimum: Math.min(...observed), maximum: Math.max(...observed),
    note: 'Same-study repeated animal-period rows; simple row summary is not an independent-sample interval.'
  },
  defaultEngineRuns: [pasture, barn].map(result => ({
    ...result,
    insideObservedMinMax: result.derivedAdgKgPerAnimalDay >= Math.min(...observed) && result.derivedAdgKgPerAnimalDay <= Math.max(...observed),
    differenceFromObservedRowMeanKgPerDay: result.derivedAdgKgPerAnimalDay - observedMean,
  })),
  interpretation: [
    'The simulator run has no matched animal, paddock, sensor inputs, or observation window; this comparison cannot estimate prediction error.',
    'The observed ADG rows are repeated and clustered within the CPER study; min/max is only a descriptive envelope, not a confidence interval or validation threshold.',
    'The engine’s current pasture and barn runs have the same gain because its illustrative feed-energy rules supply equal modeled intake; housing changes feed source, cost, and pasture stock.',
    'Do not fit assumptions to these rows or promote the engine output from demonstrative status on this check.'
  ],
};
writeFileSync(new URL('../../../docs/evidence/engine-adg-range-check.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
