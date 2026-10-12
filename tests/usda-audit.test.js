import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('USDA CPER feasibility audit groups periods by animal and does not claim engine validation', () => {
  const raw = execFileSync('python3', ['scripts/audit_usda_cper_validation.py'], {encoding: 'utf8'});
  const report = JSON.parse(raw);

  assert.equal(report.coverage.rowCount, 36);
  assert.equal(report.coverage.animalCount, 33);
  assert.equal(report.source.sha256Verified, true);
  assert.equal(report.source.verifiedSnapshotFiles.length, 4);
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

test('default engine ADG range check stays explicitly descriptive and verifies equal housing gain', () => {
  const raw = execFileSync('node', ['scripts/audit_engine_adg_range.js'], {encoding: 'utf8'});
  const report = JSON.parse(raw);
  const [pasture, barn] = report.defaultEngineRuns;
  assert.equal(report.classification, 'face_validity_range_check_only_not_validation_or_calibration');
  assert.equal(report.engine.seed, 1);
  assert.equal(report.source.doi, '10.15482/USDA.ADC/1524788');
  assert.equal(report.source.rowCount, 36);
  assert.equal(report.observedAdgKgPerAnimalDay.nAnimalPeriodRows, 36);
  assert.ok(Math.abs(pasture.derivedAdgKgPerAnimalDay - barn.derivedAdgKgPerAnimalDay) < 1e-12);
  assert.ok(Math.abs(pasture.differenceFromObservedRowMeanKgPerDay + 0.9014334981) < 1e-8);
  assert.match(report.interpretation.join(' '), /cannot estimate prediction error/);
  assert.match(report.interpretation.join(' '), /same gain/);
  const docs = readFileSync(new URL('../docs/evidence/engine-adg-range-check.json', import.meta.url), 'utf8');
  assert.match(docs, /not_validation_or_calibration/);
});

test('USDA HPGRS long-term audit checks public hashes and reports missing identity/outlier limits', () => {
  const raw = execFileSync('python3', ['scripts/audit_usda_hpgrs_longterm.py'], {encoding: 'utf8'});
  const report = JSON.parse(raw);
  assert.equal(report.dataset.doi, '10.15482/USDA.ADC/1528521');
  assert.equal(report.dataset.sha256Verified, true);
  assert.equal(report.dataset.figshareMd5Verified, true);
  assert.equal(report.coverage.rows, 1018);
  assert.equal(report.coverage.yearCount, 38);
  assert.equal(report.identity.missingTagRows, 495);
  assert.equal(report.identity.duplicateYearTagGroups.length, 0);
  assert.equal(report.adgKgPerAnimalDay.rows, 1018);
  assert.ok(report.weightGainConsistency.differencesWithinOrEqualTo0_1kg === 1018);
  assert.match(report.sourceLimitations.join(' '), /outliers beyond ±2 SD/);
  assert.match(report.sourceLimitations.join(' '), /does not.*validate engine\.js/);
});
