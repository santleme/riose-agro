#!/usr/bin/env node
/**
 * Frozen temporal holdout diagnostic for the engine's illustrative pasture ADG.
 * It is not calibration, causal analysis, or full external validation.
 */
import {createHash} from 'node:crypto';
import {readFileSync, renameSync, writeFileSync} from 'node:fs';
import {FarmEngine, metrics} from '../src/client/engine.js';
import {fileURLToPath} from 'node:url';

const inputPath = new URL('../docs/evidence/usda-cper-ltgi-audit.json', import.meta.url);
const reportPath = new URL('../docs/evidence/engine-adg-usda-cper-ltgi-check.json', import.meta.url);
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const engineBytes = readFileSync(new URL('../src/client/engine.js', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const HOLDOUT_YEARS = [2014, 2015, 2016, 2017, 2018];
const FINAL_HOLDOUT_YEAR = 2019;
const holdout = input.rows.filter(row => row.type === 'steer' && HOLDOUT_YEARS.includes(row.year));
const holdoutIdentityKeys = new Set(holdout.map(row => `${row.owner}|${row.tagColor}|${row.tag}`));
const baselineTraining = input.rows.filter(row => row.type === 'steer'
  && row.year < HOLDOUT_YEARS[0]
  && !holdoutIdentityKeys.has(`${row.owner}|${row.tagColor}|${row.tag}`));

function simulate(row) {
  const engine = new FarmEngine(20261011, 1);
  const animal = engine.state.animals[0];
  animal.weight = row.initialWeightKg;
  animal.initialWeight = row.initialWeightKg;
  engine.configure({housing: 'pasture', diet: 'pasture', weather: 'normal', supplement: 0});
  engine.tick(row.seasonDays * 24);
  const result = metrics(engine.state);
  return (result.weight - row.initialWeightKg) / row.seasonDays;
}

const evaluated = holdout.map(row => ({
  rowId: row.rowId,
  year: row.year,
  type: row.type,
  treatment: row.treatment,
  useFlag: row.useFlag,
  seasonDays: row.seasonDays,
  initialWeightKg: row.initialWeightKg,
  observedRawAdgKgPerDay: row.observedRawAdgKgPerDay,
  observedShrunkAdgKgPerDay: row.observedShrunkAdgKgPerDay,
  predictedAdgKgPerDay: simulate(row),
}));

function summarize(rows, observedField = 'observedRawAdgKgPerDay', predictedValues = rows.map(row => row.predictedAdgKgPerDay)) {
  const n = rows.length;
  if (!n) throw new Error('No rows available for requested summary');
  if (predictedValues.length !== n) throw new Error('Prediction count does not match observations');
  const errors = rows.map((row, index) => predictedValues[index] - row[observedField]);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    n,
    observedField,
    meanObservedKgPerHeadDay: mean(rows.map(row => row[observedField])),
    meanPredictedKgPerHeadDay: mean(predictedValues),
    meanErrorKgPerHeadDay: mean(errors),
    maeKgPerHeadDay: mean(errors.map(Math.abs)),
    rmseKgPerHeadDay: Math.sqrt(mean(errors.map(error => error ** 2))),
  };
}

function grouped(key) {
  return Object.fromEntries([...new Set(evaluated.map(row => row[key]))].sort().map(value => [
    value,
    summarize(evaluated.filter(row => row[key] === value)),
  ]));
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const baselineRawMean = mean(baselineTraining.map(row => row.observedRawAdgKgPerDay));
const baselineShrunkMean = mean(baselineTraining.map(row => row.observedShrunkAdgKgPerDay));
const trainingPredictions = baselineTraining.map(row => simulate(row));
const calibrationScale = trainingPredictions.reduce((sum, predicted, index) => (
  sum + predicted * baselineTraining[index].observedRawAdgKgPerDay
), 0) / trainingPredictions.reduce((sum, predicted) => sum + predicted ** 2, 0);
const intervalCalibrationRows = input.rows.filter(row => row.type === 'steer' && HOLDOUT_YEARS.includes(row.year));
const intervalFinalRows = input.rows.filter(row => row.type === 'steer' && row.year === FINAL_HOLDOUT_YEAR);
const allIntervalEvaluationKeys = new Set([...intervalCalibrationRows, ...intervalFinalRows]
  .map(row => `${row.owner}|${row.tagColor}|${row.tag}`));
const intervalTraining = input.rows.filter(row => row.type === 'steer'
  && row.year < HOLDOUT_YEARS[0]
  && !allIntervalEvaluationKeys.has(`${row.owner}|${row.tagColor}|${row.tag}`));
const intervalTrainingPredictions = intervalTraining.map(row => simulate(row));
const intervalScale = intervalTrainingPredictions.reduce((sum, predicted, index) => (
  sum + predicted * intervalTraining[index].observedRawAdgKgPerDay
), 0) / intervalTrainingPredictions.reduce((sum, predicted) => sum + predicted ** 2, 0);
const calibrationBlockScores = HOLDOUT_YEARS.map(year => {
  const rows = intervalCalibrationRows.filter(row => row.year === year);
  const errors = rows.map(row => Math.abs(row.observedRawAdgKgPerDay - simulate(row) * intervalScale));
  return {year, nAnimalSeasons: rows.length, maxAbsoluteErrorKgPerHeadDay: Math.max(...errors)};
});
function blockQuantile(nominalCoverage) {
  const rank = Math.ceil((calibrationBlockScores.length + 1) * nominalCoverage);
  if (rank > calibrationBlockScores.length) return {nominalCoverage, rank, thresholdKgPerHeadDay: null, finite: false};
  const scores = calibrationBlockScores.map(row => row.maxAbsoluteErrorKgPerHeadDay).sort((a, b) => a - b);
  return {nominalCoverage, rank, thresholdKgPerHeadDay: scores[rank - 1], finite: true};
}
const intervalDiagnostics = [0.8, 0.9].map(nominalCoverage => {
  const quantile = blockQuantile(nominalCoverage);
  if (!quantile.finite) return {...quantile, finalHoldout: null, reason: 'too_few_independent_year_blocks_for_a_finite_split_conformal_threshold'};
  const rows = intervalFinalRows.map(row => {
    const predicted = simulate(row) * intervalScale;
    const observed = row.observedRawAdgKgPerDay;
    const lower = predicted - quantile.thresholdKgPerHeadDay;
    const upper = predicted + quantile.thresholdKgPerHeadDay;
    return {row, predicted, observed, lower, upper, covered: observed >= lower && observed <= upper};
  });
  const summarizeCoverage = subset => ({
    n: subset.length,
    covered: subset.filter(row => row.covered).length,
    empiricalRowCoverage: subset.filter(row => row.covered).length / subset.length,
    allRowsInGroupCovered: subset.every(row => row.covered),
  });
  const summarizePointError = subset => {
    const errors = subset.map(row => row.predicted - row.observed);
    return {
      n: errors.length,
      maeKgPerHeadDay: errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length,
      rmseKgPerHeadDay: Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length),
      biasKgPerHeadDay: errors.reduce((sum, error) => sum + error, 0) / errors.length,
    };
  };
  return {
    ...quantile,
    fullWidthKgPerHeadDay: 2 * quantile.thresholdKgPerHeadDay,
    finalHoldout: {
      year: FINAL_HOLDOUT_YEAR,
      overall: summarizeCoverage(rows),
      pointErrorMetrics: summarizePointError(rows),
      byTreatment: Object.fromEntries([...new Set(rows.map(row => row.row.treatment))].sort().map(treatment => [treatment, summarizeCoverage(rows.filter(row => row.row.treatment === treatment))])),
      byUseFlag: Object.fromEntries([...new Set(rows.map(row => row.row.useFlag))].sort().map(flag => [flag, summarizeCoverage(rows.filter(row => row.row.useFlag === flag))])),
      pointErrorMetricsByTreatment: Object.fromEntries([...new Set(rows.map(row => row.row.treatment))].sort().map(treatment => [treatment, summarizePointError(rows.filter(row => row.row.treatment === treatment))])),
      pointErrorMetricsByUseFlag: Object.fromEntries([...new Set(rows.map(row => row.row.useFlag))].sort().map(flag => [flag, summarizePointError(rows.filter(row => row.row.useFlag === flag))])),
      allCohortRowsCovered: rows.every(row => row.covered),
      rows: rows.map(({row, predicted, observed, lower, upper, covered}) => ({
        rowId: row.rowId,
        treatment: row.treatment,
        useFlag: row.useFlag,
        observedRawAdgKgPerDay: observed,
        calibratedPointAdgKgPerDay: predicted,
        lower80KgPerHeadDay: lower,
        upper80KgPerHeadDay: upper,
        covered,
      })),
    },
  };
});

const report = {
  classification: 'frozen_temporal_holdout_component_diagnostic_not_validation_or_calibration',
  source: {
    doi: input.source.doi,
    sourceUrl: input.source.sourceUrl,
    license: input.source.license,
    sourceSha256: input.source.sha256,
    auditSha256: digest(readFileSync(inputPath)),
    sourceRows: input.source.rows,
  },
  engine: {
    sha256: digest(engineBytes),
    seed: 20261011,
    inputConfiguration: {housing: 'pasture', diet: 'pasture', weather: 'normal', supplementKgDMPerHeadDay: 0},
    fittedParameters: false,
  },
  evaluation: {
    population: 'steers only; all Use.Flag values retained and reported',
    temporalHoldoutYears: HOLDOUT_YEARS,
    n: evaluated.length,
    primaryMetric: 'ADG derived from individual entry/exit weights and season duration',
    primary: summarize(evaluated),
    publishedShrunkAdgSensitivity: summarize(evaluated, 'observedShrunkAdgKgPerDay'),
    baseline: {
      method: 'constant mean steer ADG from all pre-holdout years; identity-proxy overlap with holdout removed',
      trainingYears: [...new Set(baselineTraining.map(row => row.year))].sort((a, b) => a - b),
      nBeforeIdentityPurge: input.rows.filter(row => row.type === 'steer' && row.year < HOLDOUT_YEARS[0]).length,
      nIdentityOverlapRowsRemoved: input.rows.filter(row => row.type === 'steer' && row.year < HOLDOUT_YEARS[0]
        && holdoutIdentityKeys.has(`${row.owner}|${row.tagColor}|${row.tag}`)).length,
      nTraining: baselineTraining.length,
      identityProxy: 'Owner + Tag.Color + Tag (conservatively ignores year and pasture)',
      primary: summarize(evaluated, 'observedRawAdgKgPerDay', Array(evaluated.length).fill(baselineRawMean)),
      publishedShrunkAdgSensitivity: summarize(evaluated, 'observedShrunkAdgKgPerDay', Array(evaluated.length).fill(baselineShrunkMean)),
      limitations: [
        'This is a historical-mean reference, not a published biological equation or a fitted simulator.',
        'Training spans a documented weighing/shrink protocol change; comparison to the later holdout is a basic benchmark and must be interpreted cautiously.',
        'Identity purging uses a tag proxy, not a verified permanent animal identifier.',
      ],
    },
    developmentOnlyCalibration: {
      method: 'single non-negative multiplicative scale minimizing training squared error; engine output is not changed',
      target: 'raw endpoint ADG in kg/head/day',
      trainingYears: [...new Set(baselineTraining.map(row => row.year))].sort((a, b) => a - b),
      nTraining: baselineTraining.length,
      matchingIdentityProxyRowsPurged: true,
      scale: calibrationScale,
      training: summarize(baselineTraining, 'observedRawAdgKgPerDay', trainingPredictions.map(value => value * calibrationScale)),
      temporalHoldout: summarize(evaluated, 'observedRawAdgKgPerDay', evaluated.map(row => row.predictedAdgKgPerDay * calibrationScale)),
      temporalHoldoutAgainstPublishedShrunkAdg: summarize(evaluated, 'observedShrunkAdgKgPerDay', evaluated.map(row => row.predictedAdgKgPerDay * calibrationScale)),
      productionEngineChanged: false,
      limitations: [
        'The one-parameter scale is fit only on pre-holdout data; the 2014–2018 outcomes are not used to choose it.',
        'This is a development experiment for one output, not a validated replacement, and uses no matched initial-pasture or forage-quality inputs.',
        'The training period has a documented weighing/shrink protocol change relative to the later years.',
      ],
    },
    intervalCoverageDiagnostic: {
      classification: 'research_diagnostic_not_product_calibration',
      approach: 'year-block maximum absolute residual threshold around a scale fitted only before 2014',
      scaleFitYears: [...new Set(intervalTraining.map(row => row.year))].sort((a, b) => a - b),
      scaleFitRowsBeforeIdentityPurge: input.rows.filter(row => row.type === 'steer' && row.year < HOLDOUT_YEARS[0]).length,
      scaleFitRowsPurgedForIdentityOverlap: input.rows.filter(row => row.type === 'steer' && row.year < HOLDOUT_YEARS[0]
        && allIntervalEvaluationKeys.has(`${row.owner}|${row.tagColor}|${row.tag}`)).length,
      scaleFitRows: intervalTraining.length,
      scale: intervalScale,
      calibrationYears: HOLDOUT_YEARS,
      calibrationBlocks: calibrationBlockScores,
      finalHoldoutYear: FINAL_HOLDOUT_YEAR,
      finalHoldoutRows: intervalFinalRows.length,
      intervals: intervalDiagnostics,
      limitations: [
        'Only five calibration year blocks are available: an 80% finite-sample block quantile uses the largest block score, while a finite 90% split-conformal threshold is not available.',
        'Year exchangeability is not established; one site, fixed pastures and treatment, and protocol/weather changes limit coverage interpretation.',
        'The interval concerns only individual ADG, not weight trajectories, DMI, costs, pasture stock or the farm comparison.',
        'The diagnostic is not enabled in the product and does not change the “Sem calibração suficiente” status.',
      ],
    },
    byYear: grouped('year'),
    byTreatmentDescriptiveOnly: grouped('treatment'),
    byUseFlag: grouped('useFlag'),
    rows: evaluated,
  },
  interpretation: [
    'This is a fixed, post-2013 temporal holdout chosen before inspecting engine errors; no parameter fitting or threshold tuning was performed.',
    'A constant historical-mean comparator uses only pre-holdout steers and removes matching tag proxies; it is a basic benchmark rather than a biological model.',
    'The engine receives observed entry weight and season duration only. Its pasture biomass, forage growth and intake assumptions are not matched to observed paddock biomass, stocking, weather, diet quality or supplementation.',
    'Observed outcomes are one grazing season per animal; individual rows are clustered within year and the remaining pasture replication is one per treatment.',
    'Treatment summaries are descriptive and cannot establish a causal grazing-intensity effect.',
    'This component diagnostic does not validate the full simulator, DMI, costs, uncertainty intervals, or pasture-versus-barn comparisons.',
  ],
  validated: false,
  calibrated: false,
  productPredictiveIntervalsAvailable: false,
};

const reportFilePath = fileURLToPath(reportPath);
const temporaryReportPath = `${reportFilePath}.${process.pid}.tmp`;
writeFileSync(temporaryReportPath, `${JSON.stringify(report, null, 2)}\n`);
renameSync(temporaryReportPath, reportFilePath);
process.stdout.write(`${JSON.stringify({classification: report.classification, source: report.source, evaluation: {...report.evaluation, rows: `[${evaluated.length} row results]`, intervalCoverageDiagnostic: {...report.evaluation.intervalCoverageDiagnostic, intervals: report.evaluation.intervalCoverageDiagnostic.intervals.map(interval => ({...interval, finalHoldout: interval.finalHoldout ? {...interval.finalHoldout, rows: `[${interval.finalHoldout.rows.length} row results]`} : null}))}}, validated: report.validated, calibrated: report.calibrated, productPredictiveIntervalsAvailable: report.productPredictiveIntervalsAvailable}, null, 2)}\n`);
