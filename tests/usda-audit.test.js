import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('USDA CPER feasibility audit groups periods by animal and does not claim engine validation', () => {
  const raw = execFileSync('python3', ['scripts/audit_usda_cper_validation.py'], {encoding: 'utf8'});
  const report = JSON.parse(raw);

  assert.equal(report.coverage.rowCount, 36);
  assert.equal(report.coverage.animalCount, 33);
  assert.equal(report.source.sha256Verified, true);
  assert.deepEqual(report.source.verifiedSnapshotFiles, ['period.csv', 'period_dict.csv', 'daily.csv', 'daily_dict.csv']);
  assert.equal(report.source.verifiedDataFiles.length, 2);
  assert.equal(report.source.verifiedDictionaryFiles.length, 2);
  assert.deepEqual(report.coverage.rowsByGainPeriod, {'1': 9, '2': 14, '3': 13});
  assert.equal(report.groupedBaseline.foldCount, 33);
  assert.equal(report.groupedBaseline.testRowCount, 36);
  assert.equal(report.groupedBaseline.animalLeakage, false);
  assert.equal(report.withinStudyPeriodHoldout.foldCount, 3);
  assert.equal(report.withinStudyPeriodHoldout.testRowCount, 36);
  assert.equal(report.withinStudyPeriodHoldout.animalLeakage, false);
  assert.ok(report.withinStudyPeriodHoldout.folds.every(fold => fold.animalOverlap === 0));
  assert.equal(report.twoFeatureAdgModel.groupedByAnimal.foldCount, 33);
  assert.equal(report.twoFeatureAdgModel.withinStudyPeriodHoldout.foldCount, 3);
  assert.ok(report.twoFeatureAdgModel.groupedByAnimal.maeKgPerSteerDay < report.groupedBaseline.maeKgPerSteerDay);
  assert.match(report.twoFeatureAdgModel.featureSelection, /same study dataset/);
  assert.equal(report.engineValidation.evaluated, false);
  assert.ok(report.engineValidation.notUsableFor.includes('validating current engine.js'));
  assert.ok(Number.isFinite(report.groupedBaseline.maeKgPerSteerDay));
  assert.ok(Number.isFinite(report.groupedBaseline.rmseKgPerSteerDay));
});
