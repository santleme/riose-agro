import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('public USDA-ARS CPER LTGI source and frozen engine ADG holdout are reproducible', () => {
  execFileSync('python3', ['scripts/audit_usda_cper_ltgi.py'], {encoding: 'utf8'});
  const source = JSON.parse(readFileSync('docs/evidence/usda-cper-ltgi-audit.json', 'utf8'));
  assert.equal(source.source.license, 'U.S. Public Domain');
  assert.match(source.source.sha256, /^[a-f0-9]{64}$/);
  assert.match(source.source.dictionarySha256, /^[a-f0-9]{64}$/);
  assert.equal(source.source.rows, 1283);
  assert.equal(source.coverage.uniqueAnimalSeasonKeys, 1283);
  assert.equal(source.coverage.allFinitePositiveWeightsAndDays, true);

  execFileSync('node', ['scripts/audit_engine_adg_usda_cper_ltgi.js'], {encoding: 'utf8'});
  const reportPath = 'docs/evidence/engine-adg-usda-cper-ltgi-check.json';
  const firstRun = readFileSync(reportPath, 'utf8');
  const model = JSON.parse(firstRun);
  assert.equal(model.classification, 'frozen_temporal_holdout_component_diagnostic_not_validation_or_calibration');
  assert.deepEqual(model.evaluation.temporalHoldoutYears, [2014, 2015, 2016, 2017, 2018]);
  assert.equal(model.evaluation.n, 343);
  assert.equal(model.evaluation.primary.maeKgPerHeadDay, 0.4138139704473392);
  assert.equal(model.evaluation.baseline.nTraining, 302);
  assert.equal(model.evaluation.baseline.nIdentityOverlapRowsRemoved, 18);
  assert.equal(model.evaluation.baseline.primary.maeKgPerHeadDay, 0.16389487680335504);
  assert.equal(model.evaluation.baseline.primary.n, model.evaluation.primary.n);
  assert.equal(model.evaluation.developmentOnlyCalibration.scale, 1.7973239005092165);
  assert.equal(model.evaluation.developmentOnlyCalibration.nTraining, 302);
  assert.equal(model.evaluation.developmentOnlyCalibration.temporalHoldout.maeKgPerHeadDay, 0.17834433406594624);
  assert.equal(model.evaluation.developmentOnlyCalibration.temporalHoldout.n, model.evaluation.primary.n);
  assert.equal(model.evaluation.developmentOnlyCalibration.productionEngineChanged, false);
  const intervals = model.evaluation.intervalCoverageDiagnostic;
  assert.equal(intervals.classification, 'research_diagnostic_not_product_calibration');
  assert.equal(intervals.calibrationBlocks.length, 5);
  assert.equal(intervals.finalHoldoutYear, 2019);
  assert.equal(intervals.scaleFitRows, 302);
  assert.equal(intervals.scaleFitRowsPurgedForIdentityOverlap, 18);
  assert.equal(intervals.intervals[0].nominalCoverage, 0.8);
  assert.equal(intervals.intervals[0].thresholdKgPerHeadDay, 0.7651262900392395);
  assert.equal(intervals.intervals[0].fullWidthKgPerHeadDay, 1.530252580078479);
  assert.equal(intervals.intervals[0].finalHoldout.overall.covered, 68);
  assert.ok(Math.abs(intervals.intervals[0].finalHoldout.pointErrorMetrics.maeKgPerHeadDay - 0.19901780558581644) < 1e-12);
  assert.ok(Math.abs(intervals.intervals[0].finalHoldout.pointErrorMetrics.rmseKgPerHeadDay - 0.25048755684492346) < 1e-12);
  assert.ok(Math.abs(intervals.intervals[0].finalHoldout.pointErrorMetrics.biasKgPerHeadDay - (-0.13068694098299183)) < 1e-12);
  assert.deepEqual(Object.fromEntries(Object.entries(intervals.intervals[0].finalHoldout.byTreatment).map(([key, value]) => [key, [value.covered, value.n]])), {
    heavy: [33, 33], light: [17, 17], moderate: [18, 18],
  });
  assert.ok(Math.abs(intervals.intervals[0].finalHoldout.pointErrorMetricsByTreatment.moderate.maeKgPerHeadDay - 0.25181481827015323) < 1e-12);
  assert.deepEqual(Object.fromEntries(Object.entries(intervals.intervals[0].finalHoldout.byUseFlag).map(([key, value]) => [key, [value.covered, value.n]])), {
    '0': [63, 63], outlier: [3, 3], 'remove.from.study': [2, 2],
  });
  assert.equal(intervals.intervals[0].finalHoldout.allCohortRowsCovered, true);
  assert.equal(intervals.intervals[0].finalHoldout.rows.length, 68);
  assert.equal(new Set(intervals.intervals[0].finalHoldout.rows.map(row => row.rowId)).size, 68);
  const uncertaintyPolicy = readFileSync('docs/politica-incerteza.md', 'utf8');
  assert.match(uncertaintyPolicy, /Cobertura empírica da banda 80%/);
  assert.match(uncertaintyPolicy, /68\/68/);
  assert.match(uncertaintyPolicy, /Use\.Flag = outlier/);
  assert.match(uncertaintyPolicy, /3\/14 em 1994/);
  assert.equal(intervals.intervals[1].nominalCoverage, 0.9);
  assert.equal(intervals.intervals[1].finite, false);
  assert.equal(intervals.intervals[1].thresholdKgPerHeadDay, null);
  assert.deepEqual(model.evaluation.baseline.trainingYears, [2009, 2010, 2011, 2012, 2013]);
  assert.deepEqual(Object.fromEntries(Object.entries(model.evaluation.byUseFlag).map(([flag, result]) => [flag, result.n])), {
    '0': 321,
    outlier: 16,
    'remove.from.study': 6,
  });
  assert.equal(model.engine.fittedParameters, false);
  assert.equal(model.validated, false);
  assert.equal(model.calibrated, false);
  assert.equal(model.productPredictiveIntervalsAvailable, false);
  assert.equal(model.evaluation.rows.every(row => row.type === 'steer'), true);
  assert.equal(model.evaluation.rows.every(row => model.evaluation.temporalHoldoutYears.includes(row.year)), true);
  assert.equal(model.evaluation.rows.length, model.evaluation.n);

  execFileSync('node', ['scripts/audit_engine_adg_usda_cper_ltgi.js'], {encoding: 'utf8'});
  assert.equal(readFileSync(reportPath, 'utf8'), firstRun);
});
