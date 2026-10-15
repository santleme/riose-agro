#!/usr/bin/env node
/**
 * Frozen, no-fit ADG transfer diagnostic on public UFMS/Mendeley v1 records.
 * This is not validation of the approved adult USDA/CPER case or the full engine.
 */
import {createHash} from 'node:crypto';
import {readFileSync, renameSync, writeFileSync} from 'node:fs';
import {FarmEngine} from '../../../src/client/engine.js';
import {engineSourceSha256, ENGINE_SOURCE_FILES} from '../../engine-source-hash.js';

const root = new URL('../../../', import.meta.url);
const sourcePath = new URL('data/ufms-nelore-grazing/Complete_Dataset.csv', root);
const auditPath = new URL('docs/evidence/ufms-nelore-grazing-audit.json', root);
const outputPath = new URL('docs/evidence/engine-adg-ufms-check.json', root);
const manifestPath = new URL('data/ufms-nelore-grazing/manifest.json', root);
const sourceBytes = readFileSync(sourcePath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (sourceHash !== manifest.sha256 || sourceHash !== manifest.repository_sha256) {
  throw new Error('UFMS source checksum does not match its pinned manifest');
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...records] = rows;
  if (!header || records.some(record => record.length !== header.length)) throw new Error('Malformed UFMS CSV');
  return records.map(record => Object.fromEntries(header.map((name, index) => [name, record[index]])));
}

const parseNumber = value => {
  const number = Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(number)) throw new Error('Invalid numeric value in UFMS source');
  return number;
};
const sourceRows = parseCsv(sourceBytes.toString('utf8').replace(/^\uFEFF/, ''));
const rows = sourceRows.map(row => {
  const initialWeightKg = parseNumber(row.START_WEIGHT);
  const finalWeightKg = parseNumber(row.FINAL_WEIGHT);
  const days = parseNumber(row.AMOUNT_DAYS);
  const engine = new FarmEngine(20261012, 1);
  const animal = engine.state.animals[0];
  animal.weight = initialWeightKg;
  animal.initialWeight = initialWeightKg;
  engine.tick(days * 24);
  return {
    animalId: row.ANIMAL,
    startDate: row.START_DATE,
    finalDate: row.FINAL_DATE,
    days,
    initialWeightKg,
    finalWeightKg,
    observedEndpointAdgKgPerDay: (finalWeightKg - initialWeightKg) / days,
    reportedGmdKgPerDay: parseNumber(row.GMD),
    predictedAdgKgPerDay: (animal.weight - initialWeightKg) / days,
  };
});
if (rows.length !== 390 || new Set(rows.map(row => row.animalId)).size !== 26) throw new Error('Unexpected UFMS cohort coverage');

const summarize = subset => {
  const errors = subset.map(row => row.predictedAdgKgPerDay - row.observedEndpointAdgKgPerDay);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    records: subset.length,
    animals: new Set(subset.map(row => row.animalId)).size,
    observedEndpointAdgMeanKgPerDay: mean(subset.map(row => row.observedEndpointAdgKgPerDay)),
    frozenEngineAdgMeanKgPerDay: mean(subset.map(row => row.predictedAdgKgPerDay)),
    biasPredictedMinusObservedKgPerDay: mean(errors),
    maeKgPerDay: mean(errors.map(Math.abs)),
    rmseKgPerDay: Math.sqrt(mean(errors.map(error => error ** 2))),
  };
};

// Resample animal IDs, retaining each selected animal's complete repeated-measure series.
let randomState = 20261012;
const random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 4294967296;
};
const ids = [...new Set(rows.map(row => row.animalId))];
const bootstrap = [];
for (let draw = 0; draw < 5000; draw++) {
  const selected = Array.from({length: ids.length}, () => ids[Math.floor(random() * ids.length)]);
  const sample = selected.flatMap(id => rows.filter(row => row.animalId === id));
  bootstrap.push(summarize(sample));
}
const percentile = (key, p) => {
  const values = bootstrap.map(row => row[key]).sort((a, b) => a - b);
  return values[Math.ceil(p * values.length) - 1];
};
const intervals = [...new Set(rows.map(row => row.startDate + '–' + row.finalDate))].map(period => {
  const subset = rows.filter(row => row.startDate + '–' + row.finalDate === period);
  return {period, ...summarize(subset)};
});

const report = {
  source: {doi: manifest.doi, articleDoi: manifest.article_doi, version: manifest.version, license: manifest.license, sha256: sourceHash},
  engine: {file: 'engine.js', sourceFiles: ENGINE_SOURCE_FILES, sha256: engineSourceSha256(), fitted: false, seed: 20261012, configuration: {housing: 'pasture', diet: 'pasture', weather: 'normal', supplementKgPerAnimalDay: 0}},
  protocol: {
    target: '(FINAL_WEIGHT - START_WEIGHT) / AMOUNT_DAYS',
    prediction: 'Frozen default engine ADG from the same starting weight and interval; no parameter fitting or endpoint update.',
    repeatedMeasureHandling: 'Animal-cluster bootstrap resamples all 15 interval records together for each of 26 animals; it does not create independent records.',
    bootstrapReplicates: 5000,
    bootstrapSeed: 20261012,
    uncertaintyMeaning: '95% percentile intervals describe metric stability across sampled animals in this cohort; they are not prediction intervals or calibrated uncertainty.',
  },
  overall: summarize(rows),
  animalClusterBootstrap95Percent: {
    biasPredictedMinusObservedKgPerDay: [percentile('biasPredictedMinusObservedKgPerDay', 0.025), percentile('biasPredictedMinusObservedKgPerDay', 0.975)],
    maeKgPerDay: [percentile('maeKgPerDay', 0.025), percentile('maeKgPerDay', 0.975)],
    rmseKgPerDay: [percentile('rmseKgPerDay', 0.025), percentile('rmseKgPerDay', 0.975)],
  },
  byInterval: intervals,
  comparisonCaveats: [
    'Growing male Nelore from one 16-ha paddock are not mature adult cows and are not merged with USDA/CPER.',
    'Observed target is derived from endpoint body weights and exact interval dates; the paper-reported GMD disagrees in 154 of 390 records and is not used as the target.',
    'The simulator receives only starting weight, duration and frozen default configuration; breed, age, supplement treatment, pasture biomass, forage quality and weather are not aligned.',
    'No direct forage DMI or comparable initial/final pasture-stock measurements are available in this file.',
    'This no-fit transfer diagnostic is not calibration, independent holdout validation, full-engine validation, a causal comparison, or evidence for uncertainty-band coverage.',
  ],
  decision: 'Retain only as a separate growing-male ADG transfer diagnostic. Keep Sem calibração suficiente for the product and retain the incompatibility decision for #6 and #15.',
};
const temporaryOutputPath = new URL('docs/evidence/engine-adg-ufms-check.json.tmp', root);
writeFileSync(temporaryOutputPath, JSON.stringify(report, null, 2) + '\n');
renameSync(temporaryOutputPath, outputPath);
console.log(JSON.stringify({overall: report.overall, animalClusterBootstrap95Percent: report.animalClusterBootstrap95Percent, output: 'docs/evidence/engine-adg-ufms-check.json'}, null, 2));
