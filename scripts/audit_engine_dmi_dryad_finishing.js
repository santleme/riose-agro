#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {predictDefaultBarnDmiKgPerDay} from './audit_engine_dmi_usda_ars.js';
import {engineSourceSha256, ENGINE_SOURCE_FILES} from './engine-source-hash.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DATA = resolve(ROOT, 'data/dryad-finishing-steers/Database_09-11-2025.csv');
const REPORT = resolve(ROOT, 'docs/evidence/engine-dmi-dryad-finishing-check.json');

export function auditDryadFinishingDmi() {
  execFileSync('python3', ['scripts/audit_dryad_finishing_steers.py'], {cwd: ROOT, encoding: 'utf8'});
  const source = JSON.parse(readFileSync(resolve(ROOT, 'docs/evidence/dryad-finishing-steers-audit.json'), 'utf8'));
  const lines = readFileSync(DATA, 'utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const headers = lines.shift().split(',');
  const rows = lines.map(line => Object.fromEntries(line.split(',').map((value, index) => [headers[index], value])));
  if (rows.length !== 446) throw new Error(`Expected 446 rows, got ${rows.length}`);
  const pairs = rows.map(row => ({
    project: row.Project,
    animalId: row.Animal,
    observedDmiKgPerDay: Number(row.DMI_Fin),
    observedWeightKg: Number(row.SMBW_Fin),
    predictedDmiKgPerDay: predictDefaultBarnDmiKgPerDay(Number(row.SMBW_Fin)),
  }));
  const summarize = subset => {
    const errors = subset.map(row => row.predictedDmiKgPerDay - row.observedDmiKgPerDay);
    const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
    return {
      nAnimalExperimentRows: subset.length,
      meanObservedDmiKgPerDay: mean(subset.map(row => row.observedDmiKgPerDay)),
      meanPredictedDmiKgPerDay: mean(subset.map(row => row.predictedDmiKgPerDay)),
      maeKgPerDay: mean(errors.map(Math.abs)),
      rmseKgPerDay: Math.sqrt(mean(errors.map(error => error ** 2))),
      biasPredictedMinusObservedKgPerDay: mean(errors),
    };
  };
  const projects = [...new Set(pairs.map(row => row.project))].sort();
  const folds = {};
  const outOfFoldBaseline = [];
  for (const heldOutProject of projects) {
    const training = pairs.filter(row => row.project !== heldOutProject);
    const holdout = pairs.filter(row => row.project === heldOutProject);
    const trainingMean = training.reduce((sum, row) => sum + row.observedDmiKgPerDay, 0) / training.length;
    const baselinePredictions = holdout.map(row => ({...row, predictedDmiKgPerDay: trainingMean}));
    outOfFoldBaseline.push(...baselinePredictions);
    folds[heldOutProject] = {
      trainingProjects: projects.filter(project => project !== heldOutProject),
      nTrainingRows: training.length,
      heldOutProject,
      nHoldoutRows: holdout.length,
      trainingMeanDmiKgPerDay: trainingMean,
      fixedEngine: summarize(holdout),
      trainingMeanBaseline: summarize(baselinePredictions),
    };
  }
  const fixedEngine = summarize(pairs);
  const baseline = summarize(outOfFoldBaseline);
  return {
    classification: 'fixed_default_dmi_component_diagnostic_in_independent_feedlot_finishing_data_not_pasture_validation_or_full_engine_validation',
    source: {
      datasetDoi: source.source.datasetDoi,
      articleDoi: source.source.articleDoi,
      license: source.source.license,
      sha256: source.source.sha256,
      nRows: source.coverage.nRows,
      nExperiments: source.coverage.nExperiments,
      experimentIds: projects,
      animalIdKey: 'Project + Animal',
      dmiUnit: 'kg/head/day',
    },
    model: {
      engineSha256: engineSourceSha256(),
      engineSourceFiles: ENGINE_SOURCE_FILES,
      configuration: 'One animal, observed shrunk mid-body weight as starting weight, default feed assumptions, barn housing, normal weather, 24-hour run.',
      calibrationOrParameterFitting: false,
      dietCompositionUsed: false,
      comparisonTarget: 'reported finishing-phase daily DMI summary',
    },
    fixedEngineOverall: fixedEngine,
    byExperiment: Object.fromEntries(projects.map(project => [project, summarize(pairs.filter(row => row.project === project))])),
    leaveOneExperimentOutBaseline: {
      method: 'For each held-out project, use the row-weighted mean DMI from the other four independent projects; no rows from the held-out experiment enter the baseline.',
      splitUnit: 'Entire independent experiment/project; source key is Project + Animal.',
      nFolds: projects.length,
      fittedOnHeldOutRows: false,
      overall: baseline,
      byHeldOutProject: folds,
    },
    sameRowsComparison: {
      nAnimalExperimentRows: fixedEngine.nAnimalExperimentRows,
      engineMaeKgPerDay: fixedEngine.maeKgPerDay,
      baselineMaeKgPerDay: baseline.maeKgPerDay,
      engineMaeMinusBaselineMaeKgPerDay: fixedEngine.maeKgPerDay - baseline.maeKgPerDay,
      engineToBaselineMaeRatio: fixedEngine.maeKgPerDay / baseline.maeKgPerDay,
      engineBeatsBaselineOnMae: fixedEngine.maeKgPerDay < baseline.maeKgPerDay,
    },
    interpretation: {
      transferToPastureCase: false,
      fullEngineValidated: false,
      probabilityIntervalsCalibrated: false,
      parametersChanged: false,
    },
    limitations: [
      'This is a feedlot finishing cohort, not the approved USDA/CPER pasture case. Results cannot validate grazing intake, ADG/pasture associations, pasture balance, costs, or the housing counterfactual.',
      'The fixed engine check receives observed weight only; diet composition and treatment in the source are not mapped to model inputs.',
      'DMI is an animal-by-experiment finishing-period summary, not a daily time series aligned to the engine trajectory.',
      'The reported default-engine errors are fixed predictions without calibration. The five-project cross-validation applies only to the simple training-mean baseline.',
      'Five experiment folds are too few to establish uncertainty coverage or calibrate a prediction interval; no confidence/prediction interval is reported.',
      'The source was assembled to evaluate methane equations. This audit makes no claim about methane model performance.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditDryadFinishingDmi();
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
