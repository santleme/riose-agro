#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync, writeFileSync} from 'node:fs';
import {FarmEngine} from '../../../src/client/engine.js';
import {engineSourceSha256, ENGINE_SOURCE_FILES} from './engine-source-hash.js';

const ROOT = resolve(new URL('../../../', import.meta.url).pathname);
const EXPORTER = resolve(ROOT, 'scripts/export_mendeley_nellore_dmi_weight_pairs.py');
const REPORT = resolve(ROOT, 'docs/evidence/mendeley-nellore-engine-dmi-check.json');

export function predictDefaultBarnDmiKgPerDay(initialWeightKg) {
  if (!Number.isFinite(initialWeightKg) || initialWeightKg <= 0) throw new Error('Weight must be positive and finite');
  const seedEngine = new FarmEngine(1, 1);
  const initial = seedEngine.snapshot();
  initial.animals[0].weight = initialWeightKg;
  initial.animals[0].initialWeight = initialWeightKg;
  const engine = FarmEngine.from(initial);
  engine.configure({housing: 'barn'});
  const before = {...engine.state.intake};
  engine.tick(24);
  const after = engine.state.intake;
  return Object.keys(after).reduce((total, key) => total + after[key] - (before[key] ?? 0), 0);
}

export function auditDmi() {
  const source = JSON.parse(execFileSync('python3', [EXPORTER], {cwd: ROOT, encoding: 'utf8'}));
  const rows = source.pairs.map(row => ({
    ...row,
    predictedDmiKgPerDay: predictDefaultBarnDmiKgPerDay(row.liveweightKg),
  }));
  if (!rows.length) throw new Error('No exact-date individual DMI/weight pairs available');

  const summarize = subset => {
    const errors = subset.map(row => row.predictedDmiKgPerDay - row.observedDmiKgPerDay);
    return {
      nAnimalDays: subset.length,
      animals: new Set(subset.map(row => row.animalId)).size,
      dates: new Set(subset.map(row => row.date)).size,
      meanObservedDmiKgPerDay: mean(subset.map(row => row.observedDmiKgPerDay)),
      meanPredictedDmiKgPerDay: mean(subset.map(row => row.predictedDmiKgPerDay)),
      maeKgPerDay: mean(errors.map(Math.abs)),
      rmseKgPerDay: Math.sqrt(mean(errors.map(error => error ** 2))),
      biasPredictedMinusObservedKgPerDay: mean(errors),
    };
  };
  const overall = summarize(rows);
  overall.animalClusterBootstrap = clusterBootstrap(rows, summarize, 5000, 20261011);
  const byTreatment = Object.fromEntries([...new Set(rows.map(row => row.treatment))].sort().map(treatment => [
    treatment,
    summarize(rows.filter(row => row.treatment === treatment)),
  ]));
  return {
    classification: 'fixed_default_dmi_component_check_out_of_approved_cper_domain_not_full_engine_validation',
    source: {
      doi: '10.17632/cctgpznjrc.1',
      articleDoi: '10.1371/journal.pone.0331238',
      license: source.license,
      sha256: source.sourceSha256,
      candidateWeightRows: source.weightRows,
      exactSameAnimalDateObservedDmiPairs: source.exactDatePairsWithObservedDmi,
    },
    model: {
      engineSha256: engineSourceSha256(),
      engineSourceFiles: ENGINE_SOURCE_FILES,
      configuration: 'One animal, observed same-date liveweight as starting weight, default feed assumptions, barn housing, normal weather, 24-hour run.',
      calibrationOrParameterFitting: false,
      treatmentAndWeatherInputsRepresented: false,
    },
    overall,
    byTreatment,
    limitations: [
      'This is a single-output DMI check on adult Nellore cattle in a feedlot; it is not the approved USDA/CPER grazing case and does not validate ADG, costs, pasture stock, shade effects, or the full engine.',
      'Only exact same-animal, same-calendar-date liveweight/DMI pairs were used. The relative time of weighing and the daily intake window is not documented in this alignment.',
      'The fixed model receives no shade, ration composition, or daily weather input in this check. Treatment-specific summaries are descriptive and are not estimates of shade effects.',
      'Rows repeat within animal. The animal-cluster bootstrap intervals quantify resampling uncertainty in the fixed-model error metrics for this dataset; they are not prediction intervals, engine-output uncertainty, or evidence of calibration/coverage.',
      'No parameters were fitted or selected on this dataset.',
    ],
  };
}

function clusterBootstrap(rows, summarize, replicates, seed) {
  const clusters = new Map();
  for (const row of rows) {
    if (!clusters.has(row.animalId)) clusters.set(row.animalId, []);
    clusters.get(row.animalId).push(row);
  }
  const animalIds = [...clusters.keys()].sort();
  const random = seededRandom(seed);
  const metrics = {maeKgPerDay: [], rmseKgPerDay: [], biasPredictedMinusObservedKgPerDay: []};
  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const sample = [];
    for (let draw = 0; draw < animalIds.length; draw += 1) {
      const selected = animalIds[Math.floor(random() * animalIds.length)];
      sample.push(...clusters.get(selected));
    }
    const summary = summarize(sample);
    for (const metric of Object.keys(metrics)) metrics[metric].push(summary[metric]);
  }
  return {
    unit: 'animalId; every date row for a sampled animal is retained together',
    replicates,
    seed,
    interval: '95% percentile interval for fixed-default error metrics',
    percentileIntervals: Object.fromEntries(Object.entries(metrics).map(([metric, values]) => [metric, [quantile(values, 0.025), quantile(values, 0.975)]])),
  };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}


if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditDmi();
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
