#!/usr/bin/env node
/**
 * Fixed, no-fit DMI component diagnostic on the public GrASTech zero-supplement arm.
 * Dairy-cow results are not validation of the approved beef-steer CPER case.
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {FarmEngine, metrics} from '../engine.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const INPUT = resolve(ROOT, 'data/grastech-dairy-grazing-dmi/individual-dmi-observations.tsv');
const MANIFEST = resolve(ROOT, 'data/grastech-dairy-grazing-dmi/manifest.json');
const REPORT = resolve(ROOT, 'docs/evidence/grastech-dairy-grazing-dmi-engine-check.json');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function parseTsv(line) {
  return line.split('\t');
}

function readObservations() {
  const [headerLine, ...lines] = readFileSync(INPUT, 'utf8').trim().split(/\r?\n/);
  const headers = parseTsv(headerLine);
  return lines.map(line => {
    const values = parseTsv(line);
    if (values.length !== headers.length) throw new Error(`Malformed normalized TSV row: ${line}`);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    return {
      ...row,
      supplementationLevelKgDmPerDay: Number(row.supplementation_level_kg_dm_day),
      pastureAccessHoursDay: Number(row.pasture_access_hours_day),
      bodyWeightKg: Number(row.body_weight_kg),
      herbageIntakeKgDmPerDay: Number(row.herbage_intake_kg_dm_day),
      totalIntakeKgDmPerDay: Number(row.total_intake_kg_dm_day),
      maizeSilageIntakeKgDmPerDay: Number(row.maize_silage_intake_kg_dm_day),
      soybeanMealIntakeKgDmPerDay: Number(row.soybean_meal_intake_kg_dm_day),
    };
  });
}

function simulateDmi(row) {
  const engine = new FarmEngine(20261012, 1);
  const animal = engine.state.animals[0];
  animal.weight = row.bodyWeightKg;
  animal.initialWeight = row.bodyWeightKg;
  engine.configure({housing: 'pasture', diet: 'pasture', weather: 'normal', supplement: 0});
  engine.tick(24);
  return metrics(engine.state).intake.totalKgDM;
}

function mean(values) {
  if (!values.length) throw new Error('Cannot average an empty set');
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarize(rows, predictionField) {
  const errors = rows.map(row => row[predictionField] - row.totalIntakeKgDmPerDay);
  return {
    nAnimalPeriods: rows.length,
    uniqueCows: new Set(rows.map(row => row.cow_id)).size,
    meanObservedDmiKgDmPerCowDay: mean(rows.map(row => row.totalIntakeKgDmPerDay)),
    meanPredictedDmiKgDmPerCowDay: mean(rows.map(row => row[predictionField])),
    maeKgDmPerCowDay: mean(errors.map(Math.abs)),
    rmseKgDmPerCowDay: Math.sqrt(mean(errors.map(error => error ** 2))),
    biasPredictedMinusObservedKgDmPerCowDay: mean(errors),
  };
}

const manifestBytes = readFileSync(MANIFEST);
const manifest = JSON.parse(manifestBytes);
if (manifest.datasetDoi !== '10.57745/GTTJAR' || manifest.license !== 'Etalab Open License 2.0') {
  throw new Error('Unexpected GrASTech source/license; inspect before using this audit');
}
const sourceRows = readObservations();
if (sourceRows.length !== 168) throw new Error(`Expected 168 source rows, got ${sourceRows.length}`);

const evaluationRows = sourceRows.filter(row => row.experiment_id === 'E1'
  && row.supplementationLevelKgDmPerDay === 0);
if (evaluationRows.length !== 24
  || new Set(evaluationRows.map(row => row.cow_id)).size !== 24
  || new Set(evaluationRows.map(row => row.group)).size !== 6) {
  throw new Error('Unexpected E1 zero-supplement sample; review the study design and selection');
}
for (const row of evaluationRows) {
  if (row.maizeSilageIntakeKgDmPerDay !== 0 || row.soybeanMealIntakeKgDmPerDay !== 0
    || Math.abs(row.totalIntakeKgDmPerDay - row.herbageIntakeKgDmPerDay) > 1e-9) {
    throw new Error(`Zero-supplement row contains non-forage intake: ${row.cow_id}/${row.period_id}`);
  }
  row.enginePredictionKgDmPerDay = simulateDmi(row);
}

const groups = [...new Set(evaluationRows.map(row => row.group))].sort((a, b) => Number(a) - Number(b));
for (const heldOutGroup of groups) {
  const trainingRows = evaluationRows.filter(row => row.group !== heldOutGroup);
  const holdoutRows = evaluationRows.filter(row => row.group === heldOutGroup);
  if (!trainingRows.length || holdoutRows.length !== 4) throw new Error(`Unexpected Latin-square group ${heldOutGroup}`);
  const trainingMean = mean(trainingRows.map(row => row.totalIntakeKgDmPerDay));
  for (const row of holdoutRows) {
    row.baselinePredictionKgDmPerDay = trainingMean;
    row.holdoutGroup = heldOutGroup;
  }
}

const engineMetrics = summarize(evaluationRows, 'enginePredictionKgDmPerDay');
const baselineMetrics = summarize(evaluationRows, 'baselinePredictionKgDmPerDay');
const byHeldOutGroup = Object.fromEntries(groups.map(group => {
  const rows = evaluationRows.filter(row => row.holdoutGroup === group);
  return [group, {
    trainingGroups: groups.filter(value => value !== group),
    trainingN: evaluationRows.length - rows.length,
    evaluation: summarize(rows, 'enginePredictionKgDmPerDay'),
    constantTrainingMeanBaseline: summarize(rows, 'baselinePredictionKgDmPerDay'),
  }];
}));
const engineBytes = readFileSync(resolve(ROOT, 'engine.js'));
const report = {
  classification: 'fixed_default_engine_dmi_component_diagnostic_out_of_approved_cper_domain_not_full_validation',
  source: {
    title: manifest.title,
    datasetDoi: manifest.datasetDoi,
    datasetUrl: manifest.persistentUrl,
    articleDoi: manifest.articleDoi,
    license: manifest.license,
    version: manifest.version,
    retrieved: manifest.retrieved,
    sourceManifestSha256: digest(manifestBytes),
    archivedSourceFiles: manifest.sourceFiles.map(({path, bytes, md5, sha256}) => ({path, bytes, md5, sha256})),
    normalizedFile: 'data/grastech-dairy-grazing-dmi/individual-dmi-observations.tsv',
    normalizedFileSha256: digest(readFileSync(INPUT)),
    population: 'Lactating Holstein dairy cows at one INRAE farm in France; experiment E1, one observation per cow under zero maize-silage/soybean-meal supplementation.',
    target: 'Measured total dry matter intake (kg DM/cow/day), equal to n-alkane-derived herbage intake in this zero-supplement arm.',
    sourceCoverage: {allRows: sourceRows.length, cows: new Set(sourceRows.map(row => row.cow_id)).size, experiments: ['E1', 'E2'], evaluatedRows: evaluationRows.length, evaluatedCows: 24, evaluatedGroups: groups},
    exclusions: 'E1 supplement arms (4/8 kg DM/day) and all E2 arms (5 kg DM/day) are outside the engine configuration/input match and are not included in the score.',
  },
  model: {
    engineSha256: digest(engineBytes),
    seed: 20261012,
    configuration: {housing: 'pasture', diet: 'pasture', weather: 'normal', supplementKgDmPerCowDay: 0, simulatedHours: 24, animals: 1},
    inputs: ['observed morning body weight'],
    calibrationOrParameterFitting: false,
    targetOutput: 'FarmEngine metrics intake.totalKgDM after 24 hours (kg DM/cow/day).',
  },
  evaluation: {
    split: 'Leave-one-Latin-square group out within the E1 zero-supplement arm; the held-out group is excluded from the constant-mean baseline training data.',
    folds: groups.length,
    animalIdentityLeakage: false,
    engineDefault: engineMetrics,
    constantTrainingMeanBaseline: baselineMetrics,
    engineMinusBaselineMaeKgDmPerCowDay: engineMetrics.maeKgDmPerCowDay - baselineMetrics.maeKgDmPerCowDay,
    byHeldOutGroup,
    rows: evaluationRows.map(row => ({
      cowId: row.cow_id, group: row.group, periodId: row.period_id, treatmentId: row.treatment_id,
      bodyWeightKg: row.bodyWeightKg, observedDmiKgDmPerCowDay: row.totalIntakeKgDmPerDay,
      engineDmiKgDmPerCowDay: row.enginePredictionKgDmPerDay,
      baselineDmiKgDmPerCowDay: row.baselinePredictionKgDmPerDay,
    })),
  },
  limitations: [
    'This is a narrow DMI component diagnostic in lactating dairy cows, not the approved USDA/CPER beef-yearling cohort and not a model of ADG.',
    'The engine has no representation of lactation or milk-energy demand; observed liveweight is supplied as the only animal input.',
    'Only the zero-supplement E1 arm is scored so the simulated forage-only configuration matches the treatment. Supplemented arms and E2 have unsupported input combinations and are excluded before scoring.',
    'All observations come from one farm and one experiment. The held-out Latin-square groups do not test site/year transport; there are only four independent groups, so no inferential confidence interval is reported.',
    'The n-alkane intake method and pasture/diet protocol are source-specific; this audit does not validate pasture biomass, costs, animal weight change, or the full engine.',
    'No parameters were fitted or selected using the evaluated rows. The report is a diagnostic, not product calibration or permission to display a prediction interval.',
  ],
  validated: false,
  calibrated: false,
  productPredictiveIntervalsAvailable: false,
};

writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({classification: report.classification, evaluatedRows: evaluationRows.length, engineDefault: engineMetrics, constantTrainingMeanBaseline: baselineMetrics, engineMinusBaselineMaeKgDmPerCowDay: report.evaluation.engineMinusBaselineMaeKgDmPerCowDay, validated: false, calibrated: false}, null, 2)}\n`);
