import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('fixed engine DMI check on public SDSU hay-fed cohort stays descriptive and unfitted', () => {
  execFileSync('npm', ['run', 'audit:engine-dmi-sdsu'], {encoding: 'utf8'});
  const report = JSON.parse(readFileSync('docs/evidence/sdsu-engine-dmi-check.json', 'utf8'));
  assert.equal(report.classification, 'fixed_default_dmi_component_diagnostic_out_of_approved_cper_domain_not_full_engine_validation');
  assert.equal(report.source.license, 'CC BY');
  assert.equal(report.source.sourceRowsForSelectedCohortWithDerivedDmiAndWeight, 571);
  assert.equal(report.overallUnfiltered.nAnimalDays, 571);
  assert.equal(report.overallUnfiltered.animals, 7);
  assert.equal(report.overallUnfiltered.dates, 84);
  assert.equal(report.overallUnfiltered.maeKgPerDay, 4.130869455762411);
  assert.equal(report.model.calibrationOrParameterFitting, false);
  assert.equal(report.dataChecks.screenedObservationFilterUsesObservedDmiPctBodyweight, true);
  assert.equal(report.limitations.length >= 4, true);
});
