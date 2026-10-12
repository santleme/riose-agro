import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('CPER association report keeps animal periods clustered and distinct from engine validation', () => {
  const report = JSON.parse(execFileSync('python3', ['scripts/analyze_usda_cper_association.py'], {encoding: 'utf8'}));
  assert.equal(report.source.doi, '10.15482/USDA.ADC/1524788');
  assert.equal(report.source.sha256Verified, true);
  assert.equal(report.classification, 'within_study_observational_association_exploration_not_engine_validation');
  assert.match(report.question, /yearling beef steers \(approximately one year old\)/);
  assert.doesNotMatch(report.question, /adult cattle|adult steers/i);
  assert.equal(report.coverage.animalPeriodRows, 36);
  assert.equal(report.coverage.uniqueAnimals, 33);
  assert.equal(Object.keys(report.coverage.repeatedAnimalIds).length, 3);
  assert.equal(report.features.GBD_5min.bootstrapReplicates, 5000);
  assert.equal(report.features.GBD_5min.clusterUnit.startsWith('Eartag'), true);
  assert.ok(report.features.GBD_5min.spearmanRho < 0);
  assert.ok(report.features.MeanVelo.spearmanRho > 0);
  assert.ok(report.features.MeanVelo.withinPeriodDescriptiveAssociations['1'].spearmanRho < 0);
  assert.deepEqual(Object.keys(report.features.MeanVelo.withinPastureDescriptiveAssociations), ['15E', '19N', '22W', '23E']);
  assert.deepEqual(Object.keys(report.features.MeanVelo.leaveOnePeriodOutSensitivity), ['1', '2', '3']);
  assert.equal(report.features.MeanVelo.leaveOnePeriodOutSensitivity['2'].nAnimalPeriods, 22);
  assert.ok(report.features.MeanVelo.leaveOnePeriodOutSensitivity['2'].spearmanRho < 0.25);
  assert.ok(report.features.MeanVelo.withinPastureDescriptiveAssociations['15E'].nUniqueAnimals < report.features.MeanVelo.withinPastureDescriptiveAssociations['15E'].nAnimalPeriods);
  assert.match(report.limits[2], /not independent validation folds/);
  assert.match(report.limits[3], /not prediction intervals/);
  assert.match(report.limits[5], /does not validate DMI/);
});
