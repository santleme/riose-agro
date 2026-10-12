import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('NANP public export is checksum-pinned and treatment means cannot masquerade as animal validation', () => {
  const report = JSON.parse(execFileSync('python3', ['scripts/audit_nanp_public_database.py'], {encoding: 'utf8'}));
  assert.equal(report.source.sha256Verified, true);
  assert.equal(report.source.zipIntegrityVerified, true);
  assert.equal(report.source.license, 'U.S. Public Domain label on Ag Data Commons catalog record');
  assert.equal(report.coverage.csvTableRows['performance.csv'], 428532);
  assert.equal(report.coverage.beefDigestibilityGroupsWithDmiAdgBw, 98);
  assert.equal(report.coverage.groupsIdentifiedAsBeef, 98);
  assert.equal(report.coverage.groupsClassifiedAsTreatmentMeans, 98);
  assert.equal(report.granularity.groupsWithoutSubjectId, 98);
  assert.equal(report.granularity.targetValuesWithoutN, 294);
  assert.equal(report.granularity.targetValuesWithoutSEM, 294);
  assert.equal(report.classification, 'public_treatment_mean_candidate_not_individual_engine_validation');
  assert.match(report.decision, /Do not use these rows as individual predictions/);
});
