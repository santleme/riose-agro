#!/usr/bin/env node
/**
 * Transport diagnostic: apply CPER-only ADG settings to public CGREC steer seasons.
 * No CGREC outcomes are used to tune or select the engine/calibration.
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {parseCgrecCsv} from '../src/client/adult-data-model.js';
import {FarmEngine, metrics} from '../src/client/engine.js';

const dataDir = new URL('../data/usda-cgrec-longterm/', import.meta.url);
const sourcePath = new URL('Streeter-ND_1989-2015_compiled.csv', dataDir);
const manifestPath = new URL('manifest.json', dataDir);
const sourceAuditPath = new URL('../docs/evidence/usda-cgrec-longterm-audit.json', import.meta.url);
const cperPath = new URL('../docs/evidence/engine-adg-usda-cper-ltgi-check.json', import.meta.url);
const outputPath = new URL('../docs/evidence/engine-adg-usda-cgrec-transport-check.json', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const md5 = bytes => createHash('md5').update(bytes).digest('hex');
const currentEngineSha256 = sha256(readFileSync(new URL('../src/client/engine.js', import.meta.url)));
const sourceBytes = readFileSync(sourcePath);
const sourceManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sourceAudit = JSON.parse(readFileSync(sourceAuditPath, 'utf8'));
const cper = JSON.parse(readFileSync(cperPath, 'utf8'));
const fileEntry = sourceManifest.files.find(file => file.name === 'Streeter-ND_1989-2015_compiled.csv');
if (!fileEntry || sha256(sourceBytes) !== fileEntry.sha256 || md5(sourceBytes) !== fileEntry.md5_expected) {
  throw new Error('CGREC source checksum mismatch');
}

const sourceRows = parseCgrecCsv(new TextDecoder('windows-1252').decode(sourceBytes));
if (cper.engine?.sha256 !== currentEngineSha256) {
  throw new Error('CPER component report is stale for the current engine.js; regenerate it before transport evaluation');
}
const rows = sourceRows.filter(row => ['steer', 's'].includes(row.sex.toLowerCase())
  && Number.isFinite(row.year)
  && Number.isFinite(row.days) && row.days > 0
  && Number.isFinite(row.initialWeightKg) && row.initialWeightKg > 0
  && Number.isFinite(row.finalWeightKg) && row.finalWeightKg > 0)
  .map(row => ({
    sourceRecordId: row.recordId,
    year: row.year,
    age: 'Yearling',
    sex: row.sex,
    tag: row.tag,
    pasture: row.pasture,
    treatment: row.treatment,
    seasonDays: row.days,
    initialWeightKg: row.initialWeightKg,
    finalWeightKg: row.finalWeightKg,
    observedRawAdgKgPerDay: (row.finalWeightKg - row.initialWeightKg) / row.days,
    sourceReportedAdgKgPerDay: row.adgKg,
  }));
if (!rows.length || new Set(rows.map(row => row.sourceRecordId)).size !== rows.length) {
  throw new Error('No eligible CGREC steers or duplicate source line IDs');
}
if (sourceAudit.dataset.sha256_verified !== true
  || sourceAudit.steer_validation_rows.length !== rows.length
  || new Set(sourceAudit.steer_validation_rows.map(row => row.sourceRecordId)).size !== rows.length) {
  throw new Error('CGREC integrity audit does not match the parsed external evaluation cohort');
}

function predict(row) {
  const farm = new FarmEngine(20261011, 1);
  const animal = farm.state.animals[0];
  animal.weight = row.initialWeightKg;
  animal.initialWeight = row.initialWeightKg;
  farm.configure({housing: 'pasture', diet: 'pasture', weather: 'normal', supplement: 0});
  farm.tick(row.seasonDays * 24);
  return (metrics(farm.state).weight - row.initialWeightKg) / row.seasonDays;
}

const cperScale = cper.evaluation.developmentOnlyCalibration.scale;
const cperHistoricalMean = cper.evaluation.baseline.primary.meanPredictedKgPerHeadDay;
const cperInterval80 = cper.evaluation.intervalCoverageDiagnostic.intervals.find(interval => interval.nominalCoverage === 0.8);
if (!cperInterval80?.finite || !Number.isFinite(cperInterval80.thresholdKgPerHeadDay)) {
  throw new Error('CPER 80% ADG interval threshold is not finite');
}
const cperIntervalThreshold = cperInterval80.thresholdKgPerHeadDay;
const evaluated = rows.map(row => {
  const defaultAdg = predict(row);
  const cperScaledAdg = defaultAdg * cperScale;
  const lower = cperScaledAdg - cperIntervalThreshold;
  const upper = cperScaledAdg + cperIntervalThreshold;
  return {
    ...row,
    defaultEngineAdgKgPerDay: defaultAdg,
    cperScaleAdgKgPerDay: cperScaledAdg,
    cperInterval80LowerKgPerHeadDay: lower,
    cperInterval80UpperKgPerHeadDay: upper,
    cperInterval80Covered: row.observedRawAdgKgPerDay >= lower && row.observedRawAdgKgPerDay <= upper,
    cperHistoricalMeanAdgKgPerDay: cperHistoricalMean,
  };
});

function summarize(subset, predictedField, observedField = 'observedRawAdgKgPerDay') {
  const errors = subset.map(row => row[predictedField] - row[observedField]);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    n: subset.length,
    meanObservedKgPerHeadDay: mean(subset.map(row => row[observedField])),
    meanPredictedKgPerHeadDay: mean(subset.map(row => row[predictedField])),
    meanErrorKgPerHeadDay: mean(errors),
    maeKgPerHeadDay: mean(errors.map(Math.abs)),
    rmseKgPerHeadDay: Math.sqrt(mean(errors.map(error => error ** 2))),
  };
}

function grouped(by, predictedField) {
  return Object.fromEntries([...new Set(evaluated.map(row => row[by]))].sort().map(key => [
    key,
    summarize(evaluated.filter(row => row[by] === key), predictedField),
  ]));
}
function summarizeIntervalCoverage(subset) {
  const covered = subset.filter(row => row.cperInterval80Covered).length;
  return {
    n: subset.length,
    covered,
    empiricalRowCoverage: covered / subset.length,
    allRecordsCovered: covered === subset.length,
  };
}

const models = [
  ['defaultEngineAdgKgPerDay', 'defaultEngine'],
  ['cperScaleAdgKgPerDay', 'cperTrainingScale'],
  ['cperHistoricalMeanAdgKgPerDay', 'cperTrainingMeanBaseline'],
];
const report = {
  classification: 'external_site_transport_diagnostic_not_full_validation',
  source: {
    title: sourceManifest.title,
    doi: sourceManifest.doi,
    sourceUrl: sourceManifest.url,
    license: sourceManifest.license.name,
    sha256: sha256(sourceBytes),
    md5: md5(sourceBytes),
    totalRows: sourceRows.length,
    eligibleSteerYearlings: rows.length,
    integrityAuditSha256: sha256(readFileSync(sourceAuditPath)),
    years: [...new Set(rows.map(row => row.year))].sort((a, b) => a - b),
    recordsIn2015: rows.filter(row => row.year === 2015).length,
    inputUnitConversion: 'pounds to kg with the exact factor 0.45359237',
  },
  transferFromCper: {
    cperSourceDoi: cper.source.doi,
    cperEngineSha256: cper.engine.sha256,
    engineSha256: currentEngineSha256,
    developmentYears: cper.evaluation.developmentOnlyCalibration.trainingYears,
    developmentN: cper.evaluation.developmentOnlyCalibration.nTraining,
    multiplicativeScale: cperScale,
    historicalMeanKgPerHeadDay: cperHistoricalMean,
    cgrecOutcomesUsedForFitting: false,
  },
  evaluation: {
    population: 'yearling steers only; all eligible records retained, no CGREC model selection or parameter fitting',
    observedOutcome: 'raw endpoint ADG derived from (final weight - initial weight) / ADG_DAYS',
    engineInputs: 'observed initial weight and duration; default illustrative pasture state and configuration',
    models: Object.fromEntries(models.map(([field, name]) => [name, {
      primary: summarize(evaluated, field),
      byYear: grouped('year', field),
      byTreatmentDescriptiveOnly: grouped('treatment', field),
    }])),
    publishedAdgSensitivity: Object.fromEntries(models.map(([field, name]) => [
      name,
      summarize(evaluated, field, 'sourceReportedAdgKgPerDay'),
    ])),
    cperCalibrated80IntervalTransport: {
      nominalCoverageFromCper: 0.8,
      cperThresholdKgPerHeadDay: cperIntervalThreshold,
      fullWidthKgPerHeadDay: 2 * cperIntervalThreshold,
      cperCalibrationYears: cper.evaluation.intervalCoverageDiagnostic.calibrationYears,
      cperFinalHoldoutYear: cper.evaluation.intervalCoverageDiagnostic.finalHoldoutYear,
      externalSiteCoverage: summarizeIntervalCoverage(evaluated),
      byYear: Object.fromEntries([...new Set(evaluated.map(row => row.year))].sort((a, b) => a - b).map(year => [
        year,
        summarizeIntervalCoverage(evaluated.filter(row => row.year === year)),
      ])),
      byTreatmentDescriptiveOnly: Object.fromEntries([...new Set(evaluated.map(row => row.treatment))].sort().map(treatment => [
        treatment,
        summarizeIntervalCoverage(evaluated.filter(row => row.treatment === treatment)),
      ])),
      rows: evaluated.map(row => ({
        sourceRecordId: row.sourceRecordId,
        year: row.year,
        treatment: row.treatment,
        observedRawAdgKgPerDay: row.observedRawAdgKgPerDay,
        cperScaleAdgKgPerDay: row.cperScaleAdgKgPerDay,
        lowerKgPerHeadDay: row.cperInterval80LowerKgPerHeadDay,
        upperKgPerHeadDay: row.cperInterval80UpperKgPerHeadDay,
        covered: row.cperInterval80Covered,
      })),
    },
    rows: evaluated,
  },
  interpretation: [
    'CGREC is a separate North Dakota research station and does not share the CPER animal cohort; the analysis is an external-site transport diagnostic.',
    'Steer records occur in only three years (1989, 1994 and 2015); the 2015 subset is the largest year, but all eligible years are retained in the primary summary.',
    'The default and CPER-scaled model runs use no observed pasture biomass, group stocking, weather, forage quality or supplementation inputs.',
    'Treatment summaries are descriptive. They do not estimate causal effects of stocking rate.',
    'This comparison covers only ADG and does not validate intake, costs, forage stock, counterfactuals, uncertainty intervals or the full simulator.',
  ],
  validated: false,
  calibratedOnCgrec: false,
};

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({classification: report.classification, source: report.source, transferFromCper: report.transferFromCper, models: Object.fromEntries(models.map(([, name]) => [name, report.evaluation.models[name].primary])), validated: report.validated}, null, 2)}\n`);
