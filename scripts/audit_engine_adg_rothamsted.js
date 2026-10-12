#!/usr/bin/env node
/**
 * Frozen component diagnostic: engine default vs. Rothamsted cohort 4.
 * No parameters are fitted and this is not full model validation.
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {FarmEngine, metrics} from '../engine.js';

const root = new URL('../', import.meta.url);
const dataPath = new URL('data/rothamsted/Cattle_LWt_collated_2018-2025.csv', root);
const manifestPath = new URL('data/rothamsted/manifest.json', root);
const auditPath = new URL('docs/evidence/rothamsted-adg-audit.json', root);
const reportPath = new URL('docs/evidence/engine-adg-rothamsted-check.json', root);
const bytes = path => readFileSync(path);
const digest = value => createHash('sha256').update(value).digest('hex');
const parseCsvLine = line => line.split(',');

const manifestBytes = bytes(manifestPath);
const manifest = JSON.parse(manifestBytes);
const dataBytes = bytes(dataPath);
const auditBytes = bytes(auditPath);
const audit = JSON.parse(auditBytes);
const engineBytes = bytes(new URL('../engine.js', import.meta.url));
const expectedFile = manifest.files.find(file => file.path === 'Cattle_LWt_collated_2018-2025.csv');
if (!expectedFile || digest(dataBytes) !== expectedFile.sha256) throw new Error('Rothamsted CSV SHA-256 does not match manifest');
if (audit.source?.doi !== manifest.source?.doi || audit.integrity?.dlwgReconcilesWithWeightEndpointsAndDays !== true) {
  throw new Error('Rothamsted integrity audit is missing, stale, or inconsistent with the manifest');
}

const lines = dataBytes.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
const headers = parseCsvLine(lines.shift());
const index = Object.fromEntries(headers.map((name, position) => [name, position]));
for (const name of ['Plot_ID', 'Year', 'Cohort_number', 'Tag_Official', 'DOB', 'Date_From', 'Date_To', 'LWt_Start', 'LWt_End', 'DLWG']) {
  if (index[name] === undefined) throw new Error(`Rothamsted CSV lacks ${name}`);
}
const rows = lines.map((line, rowIndex) => {
  const values = parseCsvLine(line);
  const value = name => values[index[name]];
  const from = Date.parse(`${value('Date_From')}T00:00:00Z`);
  const to = Date.parse(`${value('Date_To')}T00:00:00Z`);
  const dob = Date.parse(`${value('DOB')}T00:00:00Z`);
  const days = (to - from) / 86_400_000;
  const ageAtStartDays = (from - dob) / 86_400_000;
  const row = {
    rowId: rowIndex + 2,
    plot: value('Plot_ID'),
    year: Number(value('Year')),
    cohort: Number(value('Cohort_number')),
    tag: value('Tag_Official').trim(),
    ageAtStartDays,
    days,
    startWeightKg: Number(value('LWt_Start')),
    endWeightKg: Number(value('LWt_End')),
    observedAdgKgPerDay: Number(value('DLWG')),
  };
  if (!row.tag || !Number.isInteger(row.cohort) || !Number.isFinite(row.days) || row.days < 1
    || !Number.isInteger(row.ageAtStartDays) || row.ageAtStartDays < 0
    || ![row.startWeightKg, row.endWeightKg, row.observedAdgKgPerDay].every(Number.isFinite)) {
    throw new Error(`Invalid data at Rothamsted CSV line ${row.rowId}`);
  }
  const derived = (row.endWeightKg - row.startWeightKg) / row.days;
  if (Math.abs(derived - row.observedAdgKgPerDay) > 0.011) throw new Error(`DLWG mismatch at CSV line ${row.rowId}`);
  return row;
});
const training = rows.filter(row => row.cohort <= 3);
const heldOut = rows.filter(row => row.cohort === 4);
if (heldOut.length !== 498 || training.length !== 1864) throw new Error('Unexpected cohort coverage; rerun the source audit before evaluation');
const trainingTags = new Set(training.map(row => row.tag));
if (heldOut.some(row => trainingTags.has(row.tag))) throw new Error('Animal ID leakage between training cohorts and held-out cohort 4');
if (audit.population?.classification !== 'young growing dairy-cross-beef cattle; not a mature-cow cohort'
  || audit.population?.ageAtFirstObservedIntervalDays?.animalCount !== 248) {
  throw new Error('Population-age audit is missing or inconsistent; rerun audit:rothamsted-adg');
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
function summarize(group, predicted) {
  if (group.length !== predicted.length || !group.length) throw new Error('Metric input shape mismatch');
  const errors = group.map((row, i) => predicted[i] - row.observedAdgKgPerDay);
  return {
    nAnimalPeriods: group.length,
    meanObservedKgPerAnimalDay: mean(group.map(row => row.observedAdgKgPerDay)),
    meanPredictedKgPerAnimalDay: mean(predicted),
    maeKgPerAnimalDay: mean(errors.map(Math.abs)),
    rmseKgPerAnimalDay: Math.sqrt(mean(errors.map(error => error ** 2))),
    biasPredictedMinusObservedKgPerAnimalDay: mean(errors),
  };
}

const trainingMean = mean(training.map(row => row.observedAdgKgPerDay));
const evaluated = heldOut.map(row => ({...row, predictedAdgKgPerDay: simulateAdg(row)}));
const engineSummary = summarize(evaluated, evaluated.map(row => row.predictedAdgKgPerDay));
const baselineSummary = summarize(evaluated, Array(evaluated.length).fill(trainingMean));
function bootstrapByAnimal(group, replicates = 10_000) {
  const groupedRows = new Map();
  for (const row of group) {
    if (!groupedRows.has(row.tag)) groupedRows.set(row.tag, []);
    groupedRows.get(row.tag).push(row);
  }
  const groups = [...groupedRows.values()];
  if (groups.length < 2) throw new Error('At least two held-out animals are required for cluster bootstrap');
  let randomState = 20261012;
  const random = () => {
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    return randomState / 4_294_967_296;
  };
  const samples = {engineMae: [], baselineMae: [], engineRmse: [], engineBias: [], pairedMaeDifference: []};
  for (let iteration = 0; iteration < replicates; iteration++) {
    const sampledRows = [];
    for (let draw = 0; draw < groups.length; draw++) sampledRows.push(...groups[Math.floor(random() * groups.length)]);
    const enginePredicted = sampledRows.map(row => row.predictedAdgKgPerDay);
    const engine = summarize(sampledRows, enginePredicted);
    const baseline = summarize(sampledRows, Array(sampledRows.length).fill(trainingMean));
    samples.engineMae.push(engine.maeKgPerAnimalDay);
    samples.baselineMae.push(baseline.maeKgPerAnimalDay);
    samples.engineRmse.push(engine.rmseKgPerAnimalDay);
    samples.engineBias.push(engine.biasPredictedMinusObservedKgPerAnimalDay);
    samples.pairedMaeDifference.push(engine.maeKgPerAnimalDay - baseline.maeKgPerAnimalDay);
  }
  const interval = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const quantile = probability => sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
    return {lower95: quantile(0.025), upper95: quantile(0.975)};
  };
  return {
    method: '10,000 percentile bootstrap replicates sampling held-out animals with replacement; all animal-period rows for each sampled animal stay together',
    resamplingUnit: 'animal Tag_Official; repeated periods remain clustered within animal',
    replicates,
    seed: 20261012,
    metricIntervals95: {
      engineMaeKgPerAnimalDay: interval(samples.engineMae),
      engineRmseKgPerAnimalDay: interval(samples.engineRmse),
      engineBiasPredictedMinusObservedKgPerAnimalDay: interval(samples.engineBias),
      baselineMaeKgPerAnimalDay: interval(samples.baselineMae),
      pairedEngineMinusBaselineMaeKgPerAnimalDay: interval(samples.pairedMaeDifference),
    },
    limitation: 'These intervals quantify resampling variability in aggregate metrics within this study only; they are not predictive intervals and do not account for dependence shared by year or the six plots.',
  };
}
const metricBootstrap = bootstrapByAnimal(evaluated);
const byYear = Object.fromEntries([...new Set(evaluated.map(row => row.year))].sort().map(year => {
  const group = evaluated.filter(row => row.year === year);
  return [year, summarize(group, group.map(row => row.predictedAdgKgPerDay))];
}));
const report = {
  classification: 'frozen_external_site_component_diagnostic_not_full_validation_or_calibration',
  source: {
    doi: manifest.source.doi,
    repositoryUrl: manifest.source.repositoryUrl,
    license: manifest.source.license,
    dataSha256: digest(dataBytes),
    integrityAuditSha256: digest(auditBytes),
  },
  population: audit.population,
  engine: {
    sha256: digest(engineBytes),
    seed: 20261012,
    fittedParameters: false,
    simulatedOneAnimalAtATime: true,
    inputs: ['observed starting weight', 'observed elapsed days'],
    assumptions: {housing: 'pasture', diet: 'pasture', weather: 'normal', supplementKgDMPerHeadDay: 0},
  },
  split: {
    trainingCohorts: [1, 2, 3],
    trainingRows: training.length,
    trainingAnimals: trainingTags.size,
    heldOutCohort: 4,
    heldOutYears: [...new Set(heldOut.map(row => row.year))].sort(),
    heldOutRows: heldOut.length,
    heldOutAnimals: new Set(heldOut.map(row => row.tag)).size,
    animalLeakage: false,
    scope: 'later cohorts on the same six North Wyke plots; not new-farm generalization',
  },
  evaluation: {
    target: 'published DLWG reconciled to (end liveweight - start liveweight) / elapsed days',
    engineDefault: engineSummary,
    baseline: {
      method: 'mean observed DLWG from training cohorts 1–3, evaluated on the same cohort-4 animal-period rows',
      trainingMeanKgPerAnimalDay: trainingMean,
      ...baselineSummary,
    },
    animalClusterBootstrap: metricBootstrap,
    byYear,
    rows: evaluated.map(row => ({
      rowId: row.rowId, plot: row.plot, year: row.year, cohort: row.cohort, tag: row.tag,
      days: row.days, startWeightKg: row.startWeightKg,
      observedAdgKgPerDay: row.observedAdgKgPerDay,
      predictedAdgKgPerDay: row.predictedAdgKgPerDay,
    })),
  },
  limitations: [
    'This tests only the ADG component and uses no parameter fitting; it is not full validation of engine.js.',
    'The engine receives only starting weight and days; observed plot, grazing treatment, herbage mass, weather, diet quality and intake are not mapped into the simulation.',
    'The held-out cohort shares the same six plots and research site with training cohorts; the split is temporal and animal-disjoint, not new-farm validation.',
    'The source audit calculates first-observed age from DOB for 248 official tags: 173–747 days (median 231); this is a young cohort, not mature cows.',
    'Rothamsted is a temperate dairy-cross beef system and is not directly representative of the approved USDA/CPER population or Brazilian beef production.',
    'DLWG is derived from the start/end liveweights and elapsed days, so it is not an independent outcome from those measurements.',
    'The result does not validate DMI, costs, pasture stock, confinement comparisons, or prediction intervals; keep product status as sem calibração suficiente.',
  ],
  validated: false,
  calibrated: false,
  productPredictiveIntervalsAvailable: false,
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({classification: report.classification, split: report.split, evaluation: {engineDefault: engineSummary, baseline: baselineSummary, byYear}, validated: false, calibrated: false}, null, 2)}\n`);
