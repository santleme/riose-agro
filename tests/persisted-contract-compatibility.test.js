import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {FarmEngine, createComparisonManifest} from '../src/client/engine.js';
import {createScenarioContract, validateReproducibilityManifest} from '../src/client/scenario-contract.js';
import {validateFarmSnapshot} from '../src/client/snapshot-validator.js';
import {createComparisonArchive} from '../src/client/comparison-archive.js';
import {validateOutcomeRecord} from '../src/client/outcome-record.js';
import {linkFarmSnapshotToManifest} from '../src/client/snapshot-manifest-link.js';
import {createRunRecord, listRuns, runCompatibility, RUN_HISTORY_KEY} from '../src/client/run-history.js';
import {readEngineSourceBundle} from '../scripts/science/engine-audits/engine-source-hash.js';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const sourceSnapshot = JSON.parse(readFileSync(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json', import.meta.url), 'utf8'));

function outcomeFixture() {
  const engineSnapshot = new FarmEngine(81, 1).snapshot();
  const manifestBytes = Buffer.from(JSON.stringify(createComparisonManifest(engineSnapshot, 3)));
  const farmSnapshot = structuredClone(sourceSnapshot);
  farmSnapshot.snapshotKind = 'demonstrative';
  farmSnapshot.caseDefinition.reviewStatus = 'approved';
  farmSnapshot.caseDefinition.requiredFields = ['population.species'];
  farmSnapshot.simulationEligibility = {status: 'ready', missingRequiredFields: []};
  delete farmSnapshot.simulationEligibility.reason;
  const linkedSnapshot = linkFarmSnapshotToManifest(farmSnapshot, manifestBytes);
  const snapshotBytes = Buffer.from(`${JSON.stringify(linkedSnapshot, null, 2)}\n`);
  const archive = createComparisonArchive(manifestBytes, readEngineSourceBundle(), '2026-10-11T12:00:00.000Z');
  const archiveBytes = Buffer.from(`${JSON.stringify(archive, null, 2)}\n`);
  const projected = archive.comparison.scenario.weight;
  const record = {
    type: 'agroville-outcome-record', version: 1, outcomeId: 'compatibility-fixture',
    createdAt: '2026-10-15T12:00:00.000Z',
    decision: {status: 'implemented', occurredAt: '2026-10-12T12:00:00.000Z', executedScenario: 'scenario'},
    governance: {consentStatus: 'granted', consentBasis: 'Synthetic fixture.', accessStatus: 'authorized', accessBasis: 'Synthetic fixture.', retentionPolicy: 'Test memory only.'},
    review: {status: 'approved', reviewerId: 'test-reviewer', reviewedAt: '2026-10-16T12:00:00.000Z'},
    projection: {archiveSha256: sha256(archiveBytes), manifestSha256: sha256(manifestBytes)},
    subject: {entityId: linkedSnapshot.lots[0].id, level: 'lot', populationDescription: 'Synthetic contract fixture.', snapshotSha256: sha256(snapshotBytes)},
    observations: [{
      id: 'compatibility-observation', metricPath: 'weight', scenario: 'scenario', status: 'observed',
      value: projected + 2, unit: 'kg/animal', observedAt: '2026-10-16T12:00:00.000Z',
      periodStart: '2026-10-13', periodEnd: '2026-10-16', periodDays: 3,
      method: 'Synthetic contract fixture.', sourceId: 'test', sourceTitle: 'Test', sourceVersion: '1', sourceLocator: 'in-memory',
      quality: 'measured', alignment: {status: 'approved', basis: 'Contract fixture only.', reviewerId: 'test-reviewer', reviewedAt: '2026-10-16T12:00:00.000Z'}
    }]
  };
  return {manifestBytes, snapshotBytes, archiveBytes, record};
}

test('persisted contract matrix has valid reader fixtures and fails closed on unsupported versions', () => {
  const snapshot = structuredClone(sourceSnapshot);
  const engineSnapshot = new FarmEngine(551, 2).snapshot();
  const manifestV1 = createComparisonManifest(engineSnapshot, 6);
  const manifestV2 = createScenarioContract(engineSnapshot, 6);
  const {manifestBytes, snapshotBytes, archiveBytes, record} = outcomeFixture();
  const run = createRunRecord({manifest: manifestV1, result: {fixture: true}, now: Date.parse('2026-10-15T12:00:00.000Z'), id: 'compatibility-run'});
  const storage = new Map([[RUN_HISTORY_KEY, JSON.stringify({version: 1, runs: [run]})]]);
  const memoryStorage = {getItem: key => storage.get(key) ?? null};

  const cases = [
    {
      label: 'farm snapshot schema 0.1.0',
      valid: () => validateFarmSnapshot(snapshot).semanticValid,
      unsupported: () => validateFarmSnapshot({...snapshot, schemaVersion: '0.2.0'}).semanticValid
    },
    {
      label: 'comparison manifest v1',
      valid: () => validateReproducibilityManifest(manifestV1),
      unsupported: () => validateReproducibilityManifest({...structuredClone(manifestV1), version: 3})
    },
    {
      label: 'comparison manifest v2',
      valid: () => validateReproducibilityManifest(manifestV2),
      unsupported: () => validateReproducibilityManifest({...structuredClone(manifestV2), version: 3})
    },
    {
      label: 'comparison result archive v1',
      valid: () => validateOutcomeRecord(record, archiveBytes, manifestBytes, snapshotBytes).valid,
      unsupported: () => {
        const archive = JSON.parse(archiveBytes.toString('utf8'));
        archive.version = 2;
        return validateOutcomeRecord(record, Buffer.from(JSON.stringify(archive)), manifestBytes, snapshotBytes).valid;
      }
    },
    {
      label: 'outcome record v1',
      valid: () => validateOutcomeRecord(record, archiveBytes, manifestBytes, snapshotBytes).valid,
      unsupported: () => validateOutcomeRecord({...structuredClone(record), version: 2}, archiveBytes, manifestBytes, snapshotBytes).valid
    },
    {
      label: 'browser run history v1',
      valid: () => runCompatibility(listRuns(memoryStorage)[0]).supported,
      unsupported: () => {
        const badStorage = {getItem: key => JSON.stringify({version: 2, runs: [run]})};
        return listRuns(badStorage).length > 0;
      }
    }
  ];

  for (const {label, valid, unsupported} of cases) {
    assert.doesNotThrow(valid, `${label}: valid serialized fixture is accepted`);
    assert.ok(valid(), `${label}: valid fixture is supported`);
    let unsupportedResult;
    try {
      unsupportedResult = unsupported();
    } catch {
      continue;
    }
    assert.notEqual(unsupportedResult, true, `${label}: unsupported version is rejected`);
  }
});
