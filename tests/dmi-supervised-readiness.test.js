import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const reportPath = new URL('../docs/evidence/dmi-supervised-readiness-2026-10.json', import.meta.url);
const report = JSON.parse(await readFile(reportPath, 'utf8'));

test('supervised DMI readiness report validates its target, evidence links, and no-go decision', () => {
  const result = spawnSync('python3', ['scripts/validate_dmi_supervised_readiness.py'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  assert.equal(report.decision, 'no_go');
  assert.equal(report.estimand.unitOfAnalysis, 'animal-period');
  assert.equal(report.eligibility.outcomeUnit, 'kg DM/animal/day');
  assert.equal(report.reviewedMatrix.reviewedSourceCount, 18);
  assert.equal(report.reviewedMatrix.eligibleSourcesForTarget, 0);
  assert.equal(report.reviewedMatrix.conditionalSourcesForTarget, 0);
  assert.equal(report.reviewedMatrix.ineligibleOrUnavailableSourcesForTarget, 18);
  assert.equal(
    report.reviewedMatrix.eligibleSourcesForTarget + report.reviewedMatrix.conditionalSourcesForTarget + report.reviewedMatrix.ineligibleOrUnavailableSourcesForTarget,
    report.reviewedMatrix.reviewedSourceCount
  );
  assert.equal(report.signoff.status, 'pending');
  assert.equal(report.signoff.projectOwner, 'not_recorded');
  assert.equal(report.signoff.domainExpertReview, 'pending_not_obtained');
  assert.ok(report.blockers.some(reason => reason.includes('total-DMI estimand')));
  assert.ok(report.nextEvidenceRequired.some(requirement => requirement.includes('Project-owner signoff')));
  assert.equal(report.performance.modelTrainingPerformed, false);
  for (const candidate of report.candidateEvidence) {
    assert.equal(existsSync(new URL(`../${candidate.source}`, import.meta.url)), true, candidate.source);
    for (const reference of candidate.references) {
      if (!reference.startsWith('http://') && !reference.startsWith('https://')) {
        assert.equal(existsSync(new URL(`../${reference}`, import.meta.url)), true, reference);
      }
    }
  }
});
