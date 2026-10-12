import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('Maremmana public cohort audit preserves licensing, leakage, endpoint checks, and uncertainty limits', () => {
  const report = JSON.parse(execFileSync('node', ['scripts/audit_zenodo_maremmana_adg.js'], {encoding: 'utf8'}));

  assert.equal(report.source.doi, '10.5281/zenodo.12568499');
  assert.equal(report.source.license, 'CC BY 4.0');
  assert.match(report.source.population.classification, /not mature cows/);
  assert.deepEqual(report.source.population.initialMeanAgeDaysByYearAndSystem, {
    2021: {PA: {mean: 314, sd: 46}, SP: {mean: 331, sd: 66}},
    2022: {PA: {mean: 331, sd: 34}, SP: {mean: 330, sd: 38}},
  });
  assert.equal(report.integrity.filesVerified, 5);
  assert.equal(report.integrity.rawRows, 542);
  assert.equal(report.coverage.animalsSharedBetweenYears, 0);
  assert.equal(report.coverage.animalsByYear['2021'], 50);
  assert.equal(report.coverage.animalsByYear['2022'], 40);
  assert.equal(report.coverage.intervalsCrossingSystemChangeExcluded, 1);
  assert.equal(report.coverage.derivedIntervalsByYear['2022'], 236);
  assert.equal(report.coverage.reportedAdgReconciliation.checked, 446);
  assert.equal(report.coverage.reportedAdgReconciliation.matchesWithinRoundingTolerance, 404);
  assert.equal(report.coverage.reportedAdgReconciliation.mismatches, 42);

  const uncertainty = report.evaluation.metricSamplingUncertainty;
  assert.equal(uncertainty.replicates, 10000);
  assert.equal(uncertainty.animals, 40);
  assert.match(uncertainty.unit, /animal/);
  assert.match(uncertainty.method, /unique animals with replacement/);
  assert.match(uncertainty.method, /every observed interval and grazing system/);
  assert.match(uncertainty.pairedComparison, /same resampled animal intervals/);
  assert.match(uncertainty.interpretation, /not prediction intervals/);
  const delta = uncertainty.percentileIntervals.engineMinusBaselineMaeKgPerAnimalDay;
  assert.ok(delta.lower95 < 0 && delta.upper95 > 0, 'MAE difference interval should include zero');
  assert.equal(report.classification, 'public_external_year_holdout_adg_component_diagnostic_not_full_validation');
  assert.match(report.evaluation.interpretation, /not calibration/);
});
