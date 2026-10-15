#!/usr/bin/env node
/**
 * Execute the frozen CPER 2009–2013 internal leave-one-year-out ADG protocol.
 * Lines after 2013 are skipped after reading only their Year field; outcome
 * columns from those years are never parsed or used.
 */
import {createHash} from 'node:crypto';
import {createReadStream, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {FarmEngine, metrics} from '../../../src/client/engine.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const PROTOCOL_PATH = path.join(ROOT, 'experiments/diagnostics/adg/preregister-cper-internal-cv-2026-10.json');
export const INPUT_PATH = path.join(ROOT, 'data/usda-cper-ltgi-2000-2019/LTGI_2000-2019_all_weights_published.csv');
export const OUTPUT_JSON = path.join(ROOT, 'experiments/diagnostics/adg/cper-internal-cv-2026-10.json');
export const OUTPUT_MD = path.join(ROOT, 'experiments/diagnostics/adg/cper-internal-cv-2026-10.md');
const LB_TO_KG = 0.45359237;

export function parseCsvRecord(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { values.push(value); value = ''; }
    else value += char;
  }
  if (quoted) throw new Error('Malformed CSV record: unterminated quoted field');
  values.push(value);
  return values;
}

export async function readDevelopmentRows(inputPath = INPUT_PATH, years = [2009, 2010, 2011, 2012, 2013]) {
  const allowedYears = new Set(years.map(Number));
  const stream = createInterface({input: createReadStream(inputPath, {encoding: 'utf8'}), crlfDelay: Infinity});
  let headers = null;
  let indexes = null;
  const rows = [];
  for await (const line of stream) {
    if (headers === null) {
      headers = parseCsvRecord(line.replace(/^\uFEFF/, ''));
      indexes = Object.fromEntries(headers.map((name, index) => [name, index]));
      for (const required of ['Year', 'Type', 'Pasture', 'Treatment', 'Owner', 'Tag.Color', 'Tag', 'Season.Days', 'on_Weight', 'off_Weight', 'Use.Flag']) {
        if (indexes[required] === undefined) throw new Error(`Missing required CPER column: ${required}`);
      }
      if (indexes.Year !== 1) throw new Error('Expected Year to be the second source field for safe year-first filtering');
      continue;
    }
    if (!line) continue;
    // The source's first two fields are unquoted Concatenate and Year. For
    // excluded years, inspect only the year token; never parse outcome columns.
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);
    if (firstComma < 0 || secondComma < 0) throw new Error('Malformed CPER record before Year field');
    const yearToken = line.slice(firstComma + 1, secondComma);
    if (!allowedYears.has(Number(yearToken))) continue;
    const values = parseCsvRecord(line);
    const get = name => values[indexes[name]]?.trim() ?? '';
    if (get('Type').toLowerCase() !== 'steer') continue;
    const year = Number(get('Year'));
    const days = Number(get('Season.Days'));
    const initialWeightLb = Number(get('on_Weight'));
    const finalWeightLb = Number(get('off_Weight'));
    if (!Number.isInteger(year) || !(days > 0) || !(initialWeightLb > 0) || !(finalWeightLb > 0)
      || ![days, initialWeightLb, finalWeightLb].every(Number.isFinite)) {
      throw new Error(`Invalid CPER development row for year ${yearToken}`);
    }
    const owner = get('Owner');
    const tagColor = get('Tag.Color');
    const tag = get('Tag');
    const pasture = get('Pasture');
    const treatment = get('Treatment').toLowerCase();
    const identity = `${owner}|${tagColor}|${tag}`;
    rows.push({
      rowId: `${year}|${pasture}|steer|${identity}`,
      year, pasture, treatment, owner, tagColor, tag, identity,
      useFlag: get('Use.Flag') || '(missing)',
      initialWeightKg: initialWeightLb * LB_TO_KG,
      seasonDays: days,
      observedRawAdgKgPerDay: (finalWeightLb - initialWeightLb) * LB_TO_KG / days,
    });
  }
  return rows;
}

export function createYearFolds(rows, years = [2009, 2010, 2011, 2012, 2013]) {
  return years.map(year => {
    const testRows = rows.filter(row => row.year === year);
    const testIdentities = new Set(testRows.map(row => row.identity));
    const trainRows = rows.filter(row => row.year !== year && !testIdentities.has(row.identity));
    const overlap = trainRows.some(row => testIdentities.has(row.identity));
    if (!testRows.length || !trainRows.length || overlap) throw new Error(`Invalid leave-year-out fold ${year}`);
    return {year, trainRows, testRows, purgedIdentityCount: new Set(rows.filter(row => row.year !== year && testIdentities.has(row.identity)).map(row => row.identity)).size};
  });
}

export function metricSummary(observed, predicted) {
  if (observed.length !== predicted.length || !observed.length) throw new Error('Metrics require matching non-empty observations and predictions');
  const errors = observed.map((value, index) => predicted[index] - value);
  return {
    n: errors.length,
    maeKgPerHeadDay: errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length,
    rmseKgPerHeadDay: Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length),
    biasPredictedMinusObservedKgPerHeadDay: errors.reduce((sum, error) => sum + error, 0) / errors.length,
  };
}

function simulateEngine(row) {
  const engine = new FarmEngine(20261011, 1);
  const animal = engine.state.animals[0];
  animal.weight = row.initialWeightKg;
  animal.initialWeight = row.initialWeightKg;
  engine.configure({housing: 'pasture', diet: 'pasture', weather: 'normal', supplement: 0});
  engine.tick(row.seasonDays * 24);
  const result = metrics(engine.state);
  return (result.weight - row.initialWeightKg) / row.seasonDays;
}

function solveLinearSystem(matrix) {
  const n = matrix.length;
  const augmented = matrix.map(row => row.slice());
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    if (Math.abs(augmented[pivot][col]) < 1e-10) throw new Error('M1 OLS design matrix is singular');
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
    const divisor = augmented[col][col];
    for (let j = col; j <= n; j += 1) augmented[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const scale = augmented[row][col];
      for (let j = col; j <= n; j += 1) augmented[row][j] -= scale * augmented[col][j];
    }
  }
  return augmented.map(row => row[n]);
}

export function fitOls(trainRows) {
  const numericMeans = ['initialWeightKg', 'seasonDays'].map(field => trainRows.reduce((sum, row) => sum + row[field], 0) / trainRows.length);
  const numericScales = ['initialWeightKg', 'seasonDays'].map((field, index) => {
    const variance = trainRows.reduce((sum, row) => sum + (row[field] - numericMeans[index]) ** 2, 0) / trainRows.length;
    return Math.sqrt(variance) || 1;
  });
  const vector = row => [1,
    (row.initialWeightKg - numericMeans[0]) / numericScales[0],
    (row.seasonDays - numericMeans[1]) / numericScales[1],
    Number(row.treatment === 'light'), Number(row.treatment === 'moderate')];
  const dimension = 5;
  const normal = Array.from({length: dimension}, () => Array(dimension + 1).fill(0));
  for (const row of trainRows) {
    const x = vector(row);
    const y = row.observedRawAdgKgPerDay;
    for (let i = 0; i < dimension; i += 1) {
      for (let j = 0; j < dimension; j += 1) normal[i][j] += x[i] * x[j];
      normal[i][dimension] += x[i] * y;
    }
  }
  return {coefficients: solveLinearSystem(normal), numericMeans, numericScales};
}

export function predictOls(coefficients, rows) {
  const {coefficients: beta, numericMeans, numericScales} = coefficients;
  return rows.map(row => [1,
    (row.initialWeightKg - numericMeans[0]) / numericScales[0],
    (row.seasonDays - numericMeans[1]) / numericScales[1],
    Number(row.treatment === 'light'), Number(row.treatment === 'moderate')]
    .reduce((sum, value, index) => sum + value * beta[index], 0));
}

export function foldTrainingScale(observed, predictions) {
  const denom = predictions.reduce((sum, value) => sum + value * value, 0);
  if (!denom) return 0;
  return Math.max(0, observed.reduce((sum, value, index) => sum + predictions[index] * value, 0) / denom);
}

function flagCounts(rows) {
  return Object.fromEntries([...new Set(rows.map(row => row.useFlag))].sort().map(flag => [flag, rows.filter(row => row.useFlag === flag).length]));
}

export function passesAdvancementRule(candidate, reference, threshold) {
  return candidate.pooled.maeKgPerHeadDay <= reference.pooled.maeKgPerHeadDay * (1 - threshold.pooledMaeReductionAtLeast)
    && candidate.yearMacro.maeKgPerHeadDay < reference.yearMacro.maeKgPerHeadDay
    && Math.abs(candidate.pooled.biasPredictedMinusObservedKgPerHeadDay) <= Math.abs(reference.pooled.biasPredictedMinusObservedKgPerHeadDay)
    && candidate.byYear.every(fold => fold.metrics.maeKgPerHeadDay <= fold.referenceMaeKgPerHeadDay + threshold.maxAllowedYearMaeWorseningKgPerHeadDay);
}

export function evaluateRows(rows, protocol, {enginePredictor = simulateEngine} = {}) {
  const expectedYears = protocol.cohort.developmentYears;
  if (rows.some(row => !expectedYears.includes(row.year) || !Number.isFinite(row.observedRawAdgKgPerDay))) {
    throw new Error('Input contains rows outside the pre-registered development cohort');
  }
  const folds = createYearFolds(rows, expectedYears);
  const names = ['M0', 'M1', 'M2', 'M3'];
  const predictions = Object.fromEntries(names.map(id => [id, []]));
  const byYear = Object.fromEntries(names.map(id => [id, []]));
  const foldReports = [];
  for (const fold of folds) {
    const trainY = fold.trainRows.map(row => row.observedRawAdgKgPerDay);
    const mean = trainY.reduce((sum, value) => sum + value, 0) / trainY.length;
    const ols = fitOls(fold.trainRows);
    const trainEngine = fold.trainRows.map(enginePredictor);
    const testEngine = fold.testRows.map(enginePredictor);
    const scale = foldTrainingScale(trainY, trainEngine);
    const perCandidate = {
      M0: fold.testRows.map(() => mean),
      M1: predictOls(ols, fold.testRows),
      M2: testEngine,
      M3: testEngine.map(value => value * scale),
    };
    const observed = fold.testRows.map(row => row.observedRawAdgKgPerDay);
    const report = {
      year: fold.year,
      trainN: fold.trainRows.length,
      testN: fold.testRows.length,
      purgedIdentityCount: fold.purgedIdentityCount,
      trainYearCounts: Object.fromEntries(expectedYears.filter(year => year !== fold.year).map(year => [year, fold.trainRows.filter(row => row.year === year).length])),
      testTreatmentCounts: Object.fromEntries(['light', 'moderate', 'heavy'].map(treatment => [treatment, fold.testRows.filter(row => row.treatment === treatment).length])),
      testUseFlagCounts: flagCounts(fold.testRows),
      m3ScaleFitOnTrainingOnly: scale,
      candidates: {},
    };
    for (const id of names) {
      const metricsForFold = metricSummary(observed, perCandidate[id]);
      byYear[id].push({year: fold.year, metrics: metricsForFold, referenceMaeKgPerHeadDay: id === 'M0' ? metricsForFold.maeKgPerHeadDay : metricSummary(observed, perCandidate.M0).maeKgPerHeadDay});
      predictions[id].push(...perCandidate[id]);
      report.candidates[id] = metricsForFold;
    }
    foldReports.push(report);
  }
  const observedOof = folds.flatMap(fold => fold.testRows.map(row => row.observedRawAdgKgPerDay));
  const candidateReports = {};
  for (const id of names) {
    const yearMetrics = byYear[id].map(fold => fold.metrics);
    candidateReports[id] = {
      pooled: metricSummary(observedOof, predictions[id]),
      yearMacro: Object.fromEntries(['maeKgPerHeadDay', 'rmseKgPerHeadDay', 'biasPredictedMinusObservedKgPerHeadDay'].map(key => [key, yearMetrics.reduce((sum, value) => sum + value[key], 0) / yearMetrics.length])),
      byYear: byYear[id],
    };
  }
  const reference = candidateReports.M0;
  for (const id of names) candidateReports[id].passesAdvancementRule = id !== 'M0'
    && passesAdvancementRule(candidateReports[id], reference, protocol.operationalAdvancementRule);
  return {folds: foldReports, candidates: candidateReports, oofRowCount: observedOof.length};
}

export async function run({inputPath = INPUT_PATH, protocolPath = PROTOCOL_PATH, enginePredictor} = {}) {
  const protocol = JSON.parse(readFileSync(protocolPath, 'utf8'));
  if (!['preregistered_not_run', 'preregistered_and_executed'].includes(protocol.status)) throw new Error(`Unexpected protocol status: ${protocol.status}`);
  if (protocol.cohort.seasonDurationAtPrediction !== 'known_horizon') throw new Error('Protocol must freeze duration as a known prediction horizon');
  const rows = await readDevelopmentRows(inputPath, protocol.cohort.developmentYears);
  if (rows.length !== protocol.cohort.trainRowsBeforeIdentityPurge) throw new Error(`Expected ${protocol.cohort.trainRowsBeforeIdentityPurge} protocol rows, found ${rows.length}`);
  const evaluated = evaluateRows(rows, protocol, enginePredictor ? {enginePredictor} : undefined);
  const report = {
    schemaVersion: '1.0.0',
    classification: 'internal_cper_yearling_steer_adg_leave_one_year_out_diagnostic_not_validation',
    protocol: {
      path: path.relative(ROOT, protocolPath),
      sha256: createHash('sha256').update(readFileSync(protocolPath)).digest('hex'),
      sourceDoi: protocol.cohort.sourceDoi,
      developmentYears: protocol.cohort.developmentYears,
      target: 'raw endpoint ADG, (off_Weight - on_Weight) * 0.45359237 / Season.Days, kg/head/day',
      seasonDurationAvailability: 'Season.Days is treated as a known-at-prediction horizon by explicit pre-registration; conclusions apply only when the horizon is specified before prediction.',
      identityProxy: protocol.cohort.identityProxy,
      identityProxyLimitation: 'Owner|Tag.Color|Tag is a conservative proxy, not a guaranteed permanent animal identifier.',
      excludedRowsOrPredictors: protocol.excludedPredictors,
      noCgrecOrPost2013OutcomesRead: true,
      noDmiOrFullEngineValidation: true,
    },
    cohort: {
      rowCount: rows.length,
      population: 'CPER yearling steers; non-steers excluded by protocol.',
      byYear: Object.fromEntries(protocol.cohort.developmentYears.map(year => [year, rows.filter(row => row.year === year).length])),
      useFlagCounts: flagCounts(rows),
      treatmentCounts: Object.fromEntries(['light', 'moderate', 'heavy'].map(treatment => [treatment, rows.filter(row => row.treatment === treatment).length])),
      pastureTreatmentMapping: Object.fromEntries([...new Set(rows.map(row => row.treatment))].sort().map(treatment => [treatment, [...new Set(rows.filter(row => row.treatment === treatment).map(row => row.pasture))]])),
      seasonDaysRange: [Math.min(...rows.map(row => row.seasonDays)), Math.max(...rows.map(row => row.seasonDays))],
    },
    candidates: protocol.candidates,
    folds: evaluated.folds,
    results: evaluated.candidates,
    oofRowCount: evaluated.oofRowCount,
    selectedCandidate: Object.entries(evaluated.candidates).find(([id, value]) => id !== 'M0' && value.passesAdvancementRule)?.[0] ?? null,
    interpretation: 'Internal development only. A passing candidate does not establish external transport, mature-cow/DMI validity, causal treatment effects, or full-engine validation. CGREC and all CPER 2014+ outcomes were not used.',
    limitations: protocol.limitations,
  };
  return report;
}

function markdown(report) {
  const lines = [
    '# CPER ADG internal leave-one-year-out evaluation',
    '',
    `Classification: **${report.classification}**`,
    '',
    `Population: ${report.cohort.population} (${report.cohort.rowCount} rows, ${report.oofRowCount} OOF predictions).`,
    `Development years: ${report.protocol.developmentYears.join(', ')}. Duration is treated as a **known-at-prediction horizon** per the frozen protocol. No CGREC or CPER 2014+ outcomes were read or used.`,
    '',
    '## Candidate metrics',
    '',
    '| Candidate | Pooled MAE | Pooled RMSE | Pooled bias | Year-macro MAE | Gate |',
    '|---|---:|---:|---:|---:|---|',
  ];
  for (const [id, result] of Object.entries(report.results)) lines.push(`| ${id} | ${result.pooled.maeKgPerHeadDay.toFixed(3)} | ${result.pooled.rmseKgPerHeadDay.toFixed(3)} | ${result.pooled.biasPredictedMinusObservedKgPerHeadDay.toFixed(3)} | ${result.yearMacro.maeKgPerHeadDay.toFixed(3)} | ${result.passesAdvancementRule ? 'passes' : id === 'M0' ? 'reference' : 'does not pass'} |`);
  lines.push('', '## Fold results', '', '| Held year | Train n | Test n | Purged identities | M0 MAE | M1 MAE | M2 MAE | M3 MAE |', '|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const fold of report.folds) lines.push(`| ${fold.year} | ${fold.trainN} | ${fold.testN} | ${fold.purgedIdentityCount} | ${fold.candidates.M0.maeKgPerHeadDay.toFixed(3)} | ${fold.candidates.M1.maeKgPerHeadDay.toFixed(3)} | ${fold.candidates.M2.maeKgPerHeadDay.toFixed(3)} | ${fold.candidates.M3.maeKgPerHeadDay.toFixed(3)} |`);
  lines.push('', `Selected candidate under the frozen operational rule: **${report.selectedCandidate ?? 'none'}**.`, '', report.interpretation, '', 'The prediction target is raw endpoint ADG in kg/head/day. `Use.Flag` is reported but never used as a feature; final weight, gain, ADG-derived values, year, pasture ID, and group identifiers are excluded from predictors. Treatment is represented by the prespecified one-hot terms (heavy reference).', '', 'This five-year internal CV is not an independent external validation and does not validate DMI or the full Riose engine.', '');
  return lines.join('\n');
}

async function main() {
  const report = await run();
  const tempJson = `${OUTPUT_JSON}.${process.pid}.tmp`;
  const tempMd = `${OUTPUT_MD}.${process.pid}.tmp`;
  writeFileSync(tempJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(tempMd, markdown(report));
  renameSync(tempJson, OUTPUT_JSON);
  renameSync(tempMd, OUTPUT_MD);
  console.log(JSON.stringify({classification: report.classification, oofRowCount: report.oofRowCount, selectedCandidate: report.selectedCandidate, metrics: Object.fromEntries(Object.entries(report.results).map(([id, item]) => [id, item.pooled]))}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
