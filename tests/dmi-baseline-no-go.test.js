import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const reportPath = new URL('../docs/evidence/dmi-baseline-no-go-2026-10.json', import.meta.url);
const report = JSON.parse(await readFile(reportPath, 'utf8'));

test('DMI baseline gate stops before fitting without eligible labels or signed readiness', () => {
  const result = spawnSync('python3', ['scripts/validate_dmi_baseline_no_go.py'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  assert.equal(report.decision, 'no_go');
  assert.equal(report.decisionStatus, 'preparatory_unsigned');
  assert.equal(report.sourceReadiness.eligibleSourcesForTarget, 0);
  assert.equal(report.sourceReadiness.signoffStatus, 'pending');
  assert.equal(report.leakageAudit.status, 'not_run_no_eligible_cohort');
  assert.equal(report.heldOutEvaluation.status, 'not_measured');
  assert.equal(report.heldOutEvaluation.metrics.maeKgDMPerAnimalDay, null);
  assert.equal(report.candidateModels.find(model => model.id === 'simple-supervised-baseline').status, 'not_fit');
  assert.equal(report.performance.trainingRuntimeMs, null);
});
