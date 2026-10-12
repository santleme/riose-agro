import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('frozen engine adult-cow ADG diagnostic is reproducible, no-fit, and separate from CPER', () => {
  execFileSync('npm', ['run', 'audit:engine-adg-zenodo-cows'], {stdio: 'ignore'});
  const report = JSON.parse(readFileSync(new URL('../docs/evidence/engine-adg-zenodo-cows-check.json', import.meta.url), 'utf8'));
  assert.equal(report.classification, 'frozen_no_fit_mature_cow_adg_component_diagnostic_not_validation');
  assert.equal(report.source.datasetDoi, '10.5281/zenodo.3707638');
  assert.equal(report.source.licenseDeclaration, 'CC-BY-4.0');
  assert.equal(report.evaluation.nCows, 27);
  assert.equal(report.evaluation.nBreeds, 3);
  assert.equal(report.evaluation.horizonDays, 70);
  assert.match(report.evaluation.horizonBasis, /exact individual weighing dates are absent/);
  assert.match(report.evaluation.engineParameterFitting, /none/);
  assert.match(report.evaluation.engineInputs, /1 simulated animal/);
  assert.ok(Number.isFinite(report.evaluation.allCows.maeKgPerCowDay));
  assert.ok(Number.isFinite(report.evaluation.allCows.rmseKgPerCowDay));
  assert.equal(Object.keys(report.evaluation.byBreed).length, 3);
  assert.match(report.evaluation.interpretation, /not an independent full-engine validation/);
  assert.ok(report.limits.some(limit => /cannot validate weight trajectories, DMI, cost, forage inventory/.test(limit)));
});
