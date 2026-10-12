/**
 * Component-level, year-held-out ADG diagnostic on the public Maremmana dataset.
 * ADG is recomputed from successive observed weights and dates because some
 * deposited ADG values do not reconcile with those endpoints.
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {FarmEngine, metrics} from '../src/client/engine.js';

const dataDir = new URL('../data/zenodo-maremmana-silvopastoral/', import.meta.url);
const reportPath = new URL('../docs/evidence/zenodo-maremmana-adg-audit.json', import.meta.url);
const manifestBytes = readFileSync(new URL('manifest.json', dataDir));
const manifest = JSON.parse(manifestBytes);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const md5 = value => createHash('md5').update(value).digest('hex');

if (manifest.doi !== '10.5281/zenodo.12568499' || manifest.license !== 'CC BY 4.0') {
  throw new Error('Unexpected Zenodo record or license; review before using this snapshot');
}
for (const file of manifest.files) {
  const bytes = readFileSync(new URL(file.path, dataDir));
  if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256 || md5(bytes) !== file.zenodoMd5) {
    throw new Error(`Integrity check failed for ${file.path}`);
  }
}

function parseCsv(bytes) {
  const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.map((line, i) => {
    const values = line.split(',');
    if (values.length !== headers.length) throw new Error(`Malformed CSV line ${i + 2}`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function parseDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error(`Unexpected date format: ${value}`);
  const timestamp = Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid date: ${value}`);
  return timestamp;
}

const bytes = readFileSync(new URL('average_daily_gain.csv', dataDir));
const rawRows = parseCsv(bytes);
const grouped = new Map();
for (const raw of rawRows) {
  const row = {
    year: Number(raw.year), animal: raw.animal.trim(), system: raw.system.trim(),
    sex: raw.sex.trim(), time: raw.time.trim(), timestamp: parseDate(raw.date),
    weightKg: Number(raw.weight), reportedAdgKgPerDay: raw.adg === '' ? null : Number(raw.adg),
  };
  if (![row.year, row.timestamp, row.weightKg].every(Number.isFinite) || !row.animal) {
    throw new Error(`Invalid animal weight row: ${JSON.stringify(raw)}`);
  }
  const key = `${row.year}|${row.animal}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(row);
}

const intervals = [];
const reconciled = {checked: 0, matchesWithinRoundingTolerance: 0, mismatches: 0, reportedAdgWithoutPriorEndpoint: 0};
let intervalsCrossingSystemChangeExcluded = 0;
for (const observations of grouped.values()) {
  observations.sort((a, b) => a.timestamp - b.timestamp);
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    const days = (current.timestamp - previous.timestamp) / 86_400_000;
    if (!Number.isInteger(days) || days <= 0 || previous.sex !== current.sex) {
      throw new Error('Invalid consecutive measurement interval');
    }
    if (previous.system !== current.system) {
      intervalsCrossingSystemChangeExcluded += 1;
      continue;
    }
    const observedAdgKgPerDay = (current.weightKg - previous.weightKg) / days;
    if (current.reportedAdgKgPerDay !== null) {
      reconciled.checked += 1;
      if (Math.abs(observedAdgKgPerDay - current.reportedAdgKgPerDay) <= 0.011) reconciled.matchesWithinRoundingTolerance += 1;
      else reconciled.mismatches += 1;
    }
    intervals.push({
      year: current.year, animal: current.animal, system: current.system,
      sex: current.sex, fromTimestamp: previous.timestamp, toTimestamp: current.timestamp,
      startWeightKg: previous.weightKg, endWeightKg: current.weightKg, days,
      observedAdgKgPerDay,
    });
  }
  reconciled.reportedAdgWithoutPriorEndpoint += Number(observations[0].reportedAdgKgPerDay !== null);
}

function simulateAdg(row) {
  const engine = new FarmEngine(20261012, 1);
  const animal = engine.state.animals[0];
  animal.weight = row.startWeightKg;
  animal.initialWeight = row.startWeightKg;
  engine.configure({housing: 'pasture', diet: 'pasture', weather: 'normal', supplement: 0});
  engine.tick(row.days * 24);
  return (metrics(engine.state).weight - row.startWeightKg) / row.days;
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function summarize(rows, predictions) {
  const errors = rows.map((row, index) => predictions[index] - row.observedAdgKgPerDay);
  return {
    nAnimalIntervals: rows.length,
    nAnimals: new Set(rows.map(row => row.animal)).size,
    meanObservedKgPerAnimalDay: mean(rows.map(row => row.observedAdgKgPerDay)),
    meanPredictedKgPerAnimalDay: mean(predictions),
    maeKgPerAnimalDay: mean(errors.map(Math.abs)),
    rmseKgPerAnimalDay: Math.sqrt(mean(errors.map(error => error ** 2))),
    biasPredictedMinusObservedKgPerAnimalDay: mean(errors),
    bySystem: Object.fromEntries(['PA', 'SP'].map(system => {
      const selected = rows.map((row, index) => ({row, prediction: predictions[index]})).filter(item => item.row.system === system);
      const systemErrors = selected.map(item => item.prediction - item.row.observedAdgKgPerDay);
      return [system, {
        nAnimalIntervals: selected.length,
        nAnimals: new Set(selected.map(item => item.row.animal)).size,
        meanObservedKgPerAnimalDay: mean(selected.map(item => item.row.observedAdgKgPerDay)),
        maeKgPerAnimalDay: mean(systemErrors.map(Math.abs)),
      }];
    })),
  };
}

const train = intervals.filter(row => row.year === 2021);
const heldOut = intervals.filter(row => row.year === 2022);
const animals2021 = new Set(train.map(row => row.animal));
const animals2022 = new Set(heldOut.map(row => row.animal));
if (!train.length || !heldOut.length || [...animals2022].some(animal => animals2021.has(animal))) {
  throw new Error('Empty cohort or animal-identity leakage between years');
}
const modelPredictions = heldOut.map(simulateAdg);
const trainingMean = mean(train.map(row => row.observedAdgKgPerDay));
const baselinePredictions = Array(heldOut.length).fill(trainingMean);
const evaluated = heldOut.map((row, index) => ({
  ...row,
  enginePredictionKgPerDay: modelPredictions[index],
  baselinePredictionKgPerDay: baselinePredictions[index],
}));

function errorMetrics(rows) {
  const engineErrors = rows.map(row => row.enginePredictionKgPerDay - row.observedAdgKgPerDay);
  const baselineErrors = rows.map(row => row.baselinePredictionKgPerDay - row.observedAdgKgPerDay);
  const engineMae = mean(engineErrors.map(Math.abs));
  const baselineMae = mean(baselineErrors.map(Math.abs));
  return {
    engineMaeKgPerAnimalDay: engineMae,
    baselineMaeKgPerAnimalDay: baselineMae,
    engineMinusBaselineMaeKgPerAnimalDay: engineMae - baselineMae,
    engineBiasKgPerAnimalDay: mean(engineErrors),
    baselineBiasKgPerAnimalDay: mean(baselineErrors),
  };
}

function percentile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[Math.min(lower + 1, sorted.length - 1)] * fraction;
}

function bootstrapByAnimal(rows, replicates = 10_000) {
  const groupedByAnimal = new Map();
  for (const row of rows) {
    if (!groupedByAnimal.has(row.animal)) groupedByAnimal.set(row.animal, []);
    groupedByAnimal.get(row.animal).push(row);
  }
  const animalClusters = [...groupedByAnimal.values()];
  let state = 20261012;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const samples = [];
  for (let iteration = 0; iteration < replicates; iteration += 1) {
    const bootRows = [];
    for (let draw = 0; draw < animalClusters.length; draw += 1) {
      const cluster = animalClusters[Math.floor(random() * animalClusters.length)];
      bootRows.push(...cluster);
    }
    samples.push(errorMetrics(bootRows));
  }
  const percentileIntervals = Object.fromEntries(Object.keys(samples[0]).map(metric => [metric, {
    lower95: percentile(samples.map(sample => sample[metric]), 0.025),
    upper95: percentile(samples.map(sample => sample[metric]), 0.975),
  }]));
  return {
    method: 'Paired percentile cluster bootstrap; resample unique animals with replacement and retain every observed interval and grazing system recorded for each selected animal.',
    replicates,
    seed: 20261012,
    animals: animalClusters.length,
    unit: 'animal; intervals remain grouped within the animal',
    pairedComparison: 'Engine and baseline errors are computed on the same resampled animal intervals in each replicate.',
    interpretation: 'These intervals quantify sampling uncertainty of error metrics for this 2022 cohort conditional on this one study/site. They are not prediction intervals, do not estimate year/site transport uncertainty, and do not calibrate the product.',
    percentileIntervals,
  };
}

const report = {
  classification: 'public_external_year_holdout_adg_component_diagnostic_not_full_validation',
  source: {
    ...Object.fromEntries(['title', 'recordUrl', 'doi', 'articleDoi', 'license', 'retrievedAt'].map(key => [key, manifest[key]])),
    population: {
      classification: 'growing Maremmana heifers and steers; not mature cows',
      initialMeanAgeDaysByYearAndSystem: {
        2021: {PA: {mean: 314, sd: 46}, SP: {mean: 331, sd: 66}},
        2022: {PA: {mean: 331, sd: 34}, SP: {mean: 330, sd: 38}},
      },
      evidence: 'Ripamonti et al. (2025), Table 1; DOI 10.1016/j.animal.2025.101425',
    },
    archiveFiles: manifest.files.map(({path, bytes: fileBytes, sha256: digest}) => ({path, bytes: fileBytes, sha256: digest})),
    attribution: 'Ripamonti, A. et al. (2025). Beef cattle performance and hair cortisol accumulation in silvopastoral and pastoral systems: a 2-year assessment. Animal 19(3), 101425. https://doi.org/10.1016/j.animal.2025.101425. Dataset DOI: 10.5281/zenodo.12568499.',
  },
  integrity: {filesVerified: manifest.files.length, rawRows: rawRows.length, animalYears: grouped.size},
  coverage: {
    years: [2021, 2022],
    animalsByYear: Object.fromEntries([2021, 2022].map(year => [year, new Set(intervals.filter(row => row.year === year).map(row => row.animal)).size])),
    animalsSharedBetweenYears: [...animals2021].filter(animal => animals2022.has(animal)).length,
    intervalsCrossingSystemChangeExcluded,
    derivedIntervalsByYear: Object.fromEntries([2021, 2022].map(year => [year, intervals.filter(row => row.year === year).length])),
    reportedAdgReconciliation: {
      roundingToleranceKgPerAnimalDay: 0.011,
      ...reconciled,
      interpretation: 'Evaluation target is recomputed from consecutive observed weights and actual elapsed dates. Reported ADG is retained in the source archive but not substituted for inconsistent endpoints.',
    },
  },
  evaluation: {
    trainingYear: 2021,
    heldOutYear: 2022,
    trainingRows: train.length,
    trainingAnimals: animals2021.size,
    baseline: {method: '2021 cohort mean of endpoint-derived ADG', valueKgPerAnimalDay: trainingMean},
    engineInputs: 'Observed start weight and interval duration only; default pasture state/configuration. Observed supplementation, forage quality, pasture mass, weather and system are not supplied to the engine.',
    engine: summarize(heldOut, modelPredictions),
    baselineEvaluation: summarize(heldOut, baselinePredictions),
    metricSamplingUncertainty: bootstrapByAnimal(evaluated),
    interpretation: 'Repeated intervals are clustered within animal; the paired animal-cluster bootstrap quantifies local sampling uncertainty for error metrics, not prediction-interval coverage. This tests one ADG component and is not calibration, causal inference, full engine validation, or validation of DMI, forage stock, cost, or the pasture-versus-confinement comparison.',
  },
  limits: [
    'One Italian Maremmana farm and two annual cohorts do not represent Brazilian Bos indicus farms or all grazing systems.',
    'The paper reports initial group mean ages of 314–331 days; the cohort is growing heifers and steers, not mature cows.',
    'The 2022 cohort is a year holdout with no animal identities shared with 2021, but the cohorts come from the same study and site.',
    'The paper reports supplements and group-level forage/intake context, but this engine diagnostic does not map those observations to inputs.',
    'The article does not define this dataset as the approved primary USDA/CPER case; keep it as an independent exploratory ADG check.',
    'A reported ADG value is not used when it disagrees with its adjacent measured weight endpoints and elapsed dates.',
  ],
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
