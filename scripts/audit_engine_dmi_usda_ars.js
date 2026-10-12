#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {FarmEngine} from '../src/client/engine.js';
import {engineSourceSha256, ENGINE_SOURCE_FILES} from './engine-source-hash.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const REPORT = resolve(ROOT, 'docs/evidence/usda-ars-feedlot-engine-dmi-check.json');

export function predictDefaultBarnDmiKgPerDay(weightKg) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) throw new Error('Weight must be positive and finite');
  const initial = new FarmEngine(1, 1).snapshot();
  initial.animals[0].weight = weightKg;
  initial.animals[0].initialWeight = weightKg;
  const engine = FarmEngine.from(initial);
  engine.configure({housing: 'barn'});
  const before = {...engine.state.intake};
  engine.tick(24);
  return Object.keys(engine.state.intake).reduce((sum, key) => sum + engine.state.intake[key] - (before[key] ?? 0), 0);
}

function summarize(rows) {
  const errors = rows.map(row => row.predictedDmiKgPerDay - row.observedDmiKgPerDay);
  return {
    nAnimalExperimentRows: rows.length,
    nUniqueAnimalExperimentKeys: new Set(rows.map(row => `${row.experiment}\u0000${row.animalId}`)).size,
    nUniqueAnimalIdsAcrossExperiments: new Set(rows.map(row => row.animalId)).size,
    meanObservedDmiKgPerDay: mean(rows.map(row => row.observedDmiKgPerDay)),
    meanPredictedDmiKgPerDay: mean(rows.map(row => row.predictedDmiKgPerDay)),
    maeKgPerDay: mean(errors.map(Math.abs)),
    rmseKgPerDay: Math.sqrt(mean(errors.map(error => error ** 2))),
    biasPredictedMinusObservedKgPerDay: mean(errors),
  };
}

export function auditDmi() {
  execFileSync('python3', ['scripts/audit_usda_ars_feedlot_dmi.py'], {cwd: ROOT, encoding: 'utf8'});
  const source = JSON.parse(readFileSync(resolve(ROOT, 'docs/evidence/usda-ars-feedlot-dmi-audit.json'), 'utf8'));
  const rows = source.rows.map(row => ({
    ...row,
    predictedDmiKgPerDay: predictDefaultBarnDmiKgPerDay(row.averageWeightKg),
    observedDmiKgPerDay: row.dmiKgPerDay,
  }));
  const overall = summarize(rows);
  const experiments = [...new Set(rows.map(row => row.experiment))].sort();
  if (experiments.length < 2) throw new Error('A leave-one-experiment-out baseline requires at least two experiments');
  const baselineSplits = {};
  const baselineOutOfFoldRows = [];
  for (const heldOutExperiment of experiments) {
    const testRows = rows.filter(row => row.experiment === heldOutExperiment);
    const testAnimalIds = new Set(testRows.map(row => row.animalId));
    const candidateTrainingRows = rows.filter(row => row.experiment !== heldOutExperiment);
    const overlappingAnimalIds = [...new Set(candidateTrainingRows
      .filter(row => testAnimalIds.has(row.animalId))
      .map(row => row.animalId))].sort();
    const trainingRows = candidateTrainingRows.filter(row => !testAnimalIds.has(row.animalId));
    if (!trainingRows.length) throw new Error(`No training rows remain for held-out experiment: ${heldOutExperiment}`);
    const trainingMeanDmiKgPerDay = mean(trainingRows.map(row => row.observedDmiKgPerDay));
    const predictions = testRows.map(row => ({...row, predictedDmiKgPerDay: trainingMeanDmiKgPerDay}));
    baselineOutOfFoldRows.push(...predictions);
    baselineSplits[heldOutExperiment] = {
      trainingExperiments: [...new Set(trainingRows.map(row => row.experiment))].sort(),
      trainingRows: trainingRows.length,
      heldOutExperiment,
      excludedOverlappingAnimalIds: overlappingAnimalIds,
      ...summarize(predictions),
      trainingMeanDmiKgPerDay,
    };
  }
  const leaveOneExperimentOutBaseline = {
    method: 'For each held-out experiment, predict its rows with the row-weighted mean observed DMI from the other experiments; remove training rows whose TAG appears in the held-out experiment; concatenate each row’s one out-of-fold prediction for aggregate metrics.',
    splitUnit: 'Entire experiment, with animal TAGs shared across experiments excluded from that fold training set.',
    fittedOnHeldOutRows: false,
    animalTagsDisjointWithinEachFold: true,
    overall: summarize(baselineOutOfFoldRows),
    byHeldOutExperiment: baselineSplits,
  };
  const baselineMae = leaveOneExperimentOutBaseline.overall.maeKgPerDay;
  return {
    classification: 'fixed_default_dmi_component_check_feedlot_adults_not_full_engine_validation_or_pasture_case',
    source: {
      doi: source.source.doi,
      articleDoi: source.source.articleDoi,
      license: source.source.license,
      sha256: source.source.sha256,
      nAnimalExperimentRows: source.coverage.nAnimalExperimentRows,
      nUniqueAnimalIds: source.coverage.nAnimals,
      nExperiments: source.coverage.nExperiments,
    },
    model: {
      engineSha256: engineSourceSha256(),
      engineSourceFiles: ENGINE_SOURCE_FILES,
      configuration: 'One animal, observed average BW as starting weight, default feed assumptions, barn housing, normal weather, 24-hour run.',
      calibrationOrParameterFitting: false,
      treatmentInputsRepresented: false,
    },
    overall,
    byExperiment: Object.fromEntries([...new Set(rows.map(row => row.experiment))].sort().map(experiment => [experiment, summarize(rows.filter(row => row.experiment === experiment))])),
    leaveOneExperimentOutBaseline,
    sameRowsComparison: {
      nAnimalExperimentRows: overall.nAnimalExperimentRows,
      engineMaeKgPerDay: overall.maeKgPerDay,
      baselineMaeKgPerDay: baselineMae,
      engineMaeMinusBaselineMaeKgPerDay: overall.maeKgPerDay - baselineMae,
      engineToBaselineMaeRatio: overall.maeKgPerDay / baselineMae,
      engineBeatsBaselineOnMae: overall.maeKgPerDay < baselineMae,
    },
    limitations: [
      'This checks only the fixed default DMI component against animal-level summaries from three finishing/feedlot experiments; it is not the approved adult USDA/CPER grazing case and does not validate ADG, costs, pasture stock, or a full engine trajectory.',
      'The source workbook has one row per animal per experiment, not daily DMI/weight pairs. Its compiled DMI and average BW do not document exact within-period alignment in the workbook.',
      'The model receives no treatment, diet composition, climate, or experiment-specific inputs. Experiment-level differences are descriptive, not treatment effects.',
      'The engine errors use fixed defaults without fitting. The baseline mean is computed only from each fold training data; neither analysis reports a confidence interval, prediction interval, calibration claim, or coverage claim.',
      'The leave-one-experiment-out mean is a simple reference benchmark, not a published biological equation; with only three experiments, the fold count is small and the source measurement protocols may differ.',
      'One TAG appears in more than one experiment; the source key is Experiment plus TAG. Experiment-level metrics are kept separate.',
    ],
  };
}

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditDmi();
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
