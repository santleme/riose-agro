import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {auditDmi} from '../scripts/science/engine-audits/audit_engine_dmi_mendeley.js';

test('Mendeley Nellore feedlot audit verifies the public workbook and preserves missing DMI', () => {
  const raw = execFileSync('python3', ['scripts/science/source-audits/audit_mendeley_nellore_feedlot.py'], {encoding: 'utf8'});
  const report = JSON.parse(raw);

  assert.equal(report.source.sha256Verified, true);
  assert.equal(report.source.license, 'CC BY 4.0');
  assert.equal(report.coverage.animals, 47);
  assert.equal(report.coverage.dmiAnimalDayPairs, 3854);
  assert.equal(report.coverage.dmiObservedValues, 3757);
  assert.equal(report.coverage.dmiMissingValuesAmongAnimalDayPairs, 97);
  assert.equal(report.coverage.dmiBlankTrailingRows, 1222);
  assert.equal(report.coverage.duplicateDmiAnimalDays, 0);
  assert.equal(report.coverage.liveweightRows, 282);
  assert.equal(report.coverage.drinkingEvents, 19388);
  assert.equal(report.coverage.weatherRows, 7968);
  assert.equal(report.coverage.duplicateWeatherTimestamps, 1);
  assert.deepEqual(report.coverage.groupAnimals, {'No shade': 23, Shade: 24});
  assert.equal(report.interpretation.engineValidation, false);
});

test('fixed default engine DMI check uses only exact same-animal/date Nellore pairs and stays scoped', () => {
  const report = auditDmi();
  const storedEvidence = JSON.parse(readFileSync('docs/evidence/mendeley-nellore-engine-dmi-check.json', 'utf8'));
  assert.match(storedEvidence.model.engineSha256, /^[a-f0-9]{64}$/, 'archived evidence retains the source fingerprint used when it was produced');
  assert.notEqual(storedEvidence.model.engineSha256, report.model.engineSha256, 'the current source fingerprint changes when visual state is removed; archived scientific evidence remains historical');
  assert.equal(report.classification, 'fixed_default_dmi_component_check_out_of_approved_cper_domain_not_full_engine_validation');
  assert.equal(report.source.license, 'CC BY 4.0');
  assert.equal(report.source.candidateWeightRows, 282);
  assert.equal(report.source.exactSameAnimalDateObservedDmiPairs, 219);
  assert.equal(report.overall.nAnimalDays, 219);
  assert.equal(report.overall.animals, 47);
  assert.equal(report.overall.dates, 5);
  assert.ok(Math.abs(report.overall.maeKgPerDay - 2.339599670981843) < 1e-12);
  assert.ok(Math.abs(report.overall.biasPredictedMinusObservedKgPerDay - 1.276354832623449) < 1e-12);
  const bootstrap = report.overall.animalClusterBootstrap;
  assert.equal(bootstrap.replicates, 5000);
  assert.equal(bootstrap.seed, 20261011);
  assert.match(bootstrap.unit, /every date row for a sampled animal is retained together/);
  assert.match(bootstrap.interval, /error metrics/);
  assert.deepEqual(Object.keys(bootstrap.percentileIntervals).sort(), [
    'biasPredictedMinusObservedKgPerDay', 'maeKgPerDay', 'rmseKgPerDay',
  ]);
  for (const [lower, upper] of Object.values(bootstrap.percentileIntervals)) {
    assert.ok(Number.isFinite(lower) && lower <= upper);
  }
  assert.deepEqual(auditDmi().overall.animalClusterBootstrap, bootstrap, 'the fixed seed must reproduce bootstrap intervals');
  assert.match(report.limitations.join(' '), /not prediction intervals, engine-output uncertainty/);
  assert.equal(report.model.calibrationOrParameterFitting, false);
  assert.equal(report.model.treatmentAndWeatherInputsRepresented, false);
  assert.match(report.classification, /not_full_engine_validation/);
  assert.ok(report.limitations.some(value => value.includes('not the approved USDA/CPER grazing case')));
});
