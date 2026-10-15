import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('Dryad grazing-yearling audit verifies source and keeps ADG evidence descriptive', () => {
  const report = JSON.parse(execFileSync('python3', ['scripts/science/source-audits/audit_dryad_grazing_yearlings.py'], {encoding: 'utf8'}));
  assert.equal(report.source.doi, '10.5061/dryad.dbrv15fg8');
  assert.equal(report.source.license, 'CC0-1.0');
  assert.equal(report.source.sha256Verified, true);
  assert.equal(report.coverage.modelSteers, 154);
  assert.equal(report.coverage.uniqueModelSteerIds, 154);
  assert.equal(report.coverage.modelRowsWithAdgAndBw, 154);
  assert.equal(report.coverage.visitRows, 2820);
  assert.equal(report.coverage.visitSteers, 141);
  assert.equal(report.interpretation.engineValidation, false);
  assert.equal(report.interpretation.dmiObserved, false);
});
