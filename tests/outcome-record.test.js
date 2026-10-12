import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {FarmEngine, createComparisonManifest} from '../engine.js';
import {createScenarioContract} from '../scenario-contract.js';
import {createComparisonArchive, sha256Bytes} from '../comparison-archive.js';
import {validateOutcomeRecord} from '../outcome-record.js';
import {linkFarmSnapshotToManifest} from '../snapshot-manifest-link.js';

const schema = JSON.parse(readFileSync(new URL('../schemas/outcome-record.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({allErrors: true, strict: true, strictRequired: false});
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function fixture(manifestVersion = 1) {
  const sourceSnapshot = JSON.parse(readFileSync(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json', import.meta.url), 'utf8'));
  sourceSnapshot.snapshotKind = 'demonstrative';
  sourceSnapshot.caseDefinition.reviewStatus = 'approved';
  sourceSnapshot.caseDefinition.requiredFields = ['population.species'];
  sourceSnapshot.simulationEligibility = {status: 'ready', missingRequiredFields: []};
  delete sourceSnapshot.simulationEligibility.reason;
  const engineSnapshot = new FarmEngine(81, 1).snapshot();
  const manifest = manifestVersion === 2
    ? createScenarioContract(engineSnapshot, 3)
    : createComparisonManifest(engineSnapshot, 3);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const farmSnapshot = linkFarmSnapshotToManifest(sourceSnapshot, manifestBytes);
  const snapshotBytes = Buffer.from(`${JSON.stringify(farmSnapshot, null, 2)}\n`);
  const engineBytes = readFileSync(new URL('../engine.js', import.meta.url));
  const archive = createComparisonArchive(manifestBytes, engineBytes, '2026-10-11T12:00:00.000Z');
  const archiveBytes = Buffer.from(`${JSON.stringify(archive, null, 2)}\n`);
  const projected = archive.comparison.scenario.weight;
  const record = {
    type: 'agroville-outcome-record',
    version: 1,
    outcomeId: 'outcome-test-001',
    createdAt: '2026-10-15T12:00:00.000Z',
    decision: {status: 'implemented', occurredAt: '2026-10-12T12:00:00.000Z', executedScenario: 'scenario'},
    governance: {consentStatus: 'granted', consentBasis: 'Teste de contrato; sem dados pessoais.', accessStatus: 'authorized', accessBasis: 'Fixture sintética criada em memória.', retentionPolicy: 'Fixture apenas em memória para testes.'},
    review: {status: 'approved', reviewerId: 'domain-reviewer-test', reviewedAt: '2026-10-16T12:00:00.000Z'},
    projection: {archiveSha256: sha256Bytes(archiveBytes), manifestSha256: sha256Bytes(manifestBytes)},
    subject: {entityId: farmSnapshot.lots[0].id, level: 'lot', populationDescription: 'Fixture artificial de teste; não representa animais observados.', snapshotSha256: sha256Bytes(snapshotBytes)},
    observations: [{
      id: 'measurement-test-001', metricPath: 'weight', scenario: 'scenario', status: 'observed',
      value: projected + 2, unit: 'kg/animal', observedAt: '2026-10-16T12:00:00.000Z',
      periodStart: '2026-10-13', periodEnd: '2026-10-16', periodDays: 3,
      method: 'Valor artificial criado no teste.', sourceId: 'test-fixture', sourceTitle: 'Fixture de teste', sourceVersion: '1', sourceLocator: 'tests/outcome-record.test.js',
      quality: 'measured', alignment: {status: 'approved', basis: 'Alinhamento apenas de contrato, não de domínio.', reviewerId: 'domain-reviewer-test', reviewedAt: '2026-10-16T12:00:00.000Z'},
    }],
  };
  return {manifestBytes, engineBytes, farmSnapshot, snapshotBytes, archive, archiveBytes, record};
}

test('v2 manifests pass the existing archive and outcome validation path', () => {
  const {manifestBytes, engineBytes, snapshotBytes, record} = fixture(2);
  const archive = createComparisonArchive(manifestBytes, engineBytes, '2026-10-11T12:00:00.000Z');
  const archiveBytes = Buffer.from(`${JSON.stringify(archive, null, 2)}\n`);

  assert.equal(archive.manifestReference.version, 2);
  assert.equal(archive.comparison.days, 3);
  const v2Record = structuredClone(record);
  v2Record.projection.archiveSha256 = sha256Bytes(archiveBytes);
  const report = validateOutcomeRecord(v2Record, archiveBytes, manifestBytes, snapshotBytes);
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.equal(report.comparisons[0].status, 'comparable-descriptive');
});

test('outcome record links exact manifest and archived projection, then reports descriptive difference after review', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record, archive} = fixture();
  assert.equal(validateSchema(record), true, JSON.stringify(validateSchema.errors));
  const report = validateOutcomeRecord(record, archiveBytes, manifestBytes, snapshotBytes);
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.equal(report.engineSourceSha256, archive.engineSourceSha256);
  assert.deepEqual(report.coverage, {totalObservations: 1, observedValues: 1, comparableValues: 1, unavailableOrBlocked: 0, comparableFractionOfAll: 1});
  assert.equal(report.comparisons[0].status, 'comparable-descriptive');
  assert.equal(report.comparisons[0].difference, 2);
  assert.match(report.comparisons[0].disclaimer, /não estima efeito causal/);
});

test('tampered archived result is blocked when the stored sidecar hash no longer matches', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record} = fixture();
  const tampered = JSON.parse(archiveBytes.toString('utf8'));
  tampered.comparison.scenario.weight += 50;
  const tamperedBytes = Buffer.from(JSON.stringify(tampered));
  const report = validateOutcomeRecord(record, tamperedBytes, manifestBytes, snapshotBytes);
  assert.equal(report.valid, false);
  assert.equal(report.comparisons[0].status, 'not-comparable');
});

test('outcome validation rejects an archive that upgrades the projection to validated even with a refreshed sidecar hash', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record} = fixture();
  const upgraded = JSON.parse(archiveBytes.toString('utf8'));
  upgraded.comparison.validated = true;
  const upgradedBytes = Buffer.from(JSON.stringify(upgraded));
  const upgradedRecord = structuredClone(record);
  upgradedRecord.projection.archiveSha256 = sha256Bytes(upgradedBytes);

  const report = validateOutcomeRecord(upgradedRecord, upgradedBytes, manifestBytes, snapshotBytes);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(message => message.includes('estado demonstrativo não validado')));
  assert.equal(report.comparisons[0].status, 'not-comparable');
});

test('manifest byte changes are rejected even if the parsed JSON still describes the same comparison', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record} = fixture();
  const changedBytes = Buffer.concat([manifestBytes, Buffer.from(' ')]);
  const report = validateOutcomeRecord(record, archiveBytes, changedBytes, snapshotBytes);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(message => message.includes('SHA-256')));
  assert.equal(report.comparisons[0].status, 'not-comparable');
});

test('snapshot digest, eligibility, linked manifest, lot identity, and herd size are required', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record, farmSnapshot} = fixture();
  const changedSnapshot = Buffer.concat([snapshotBytes, Buffer.from(' ')]);
  const staleHash = validateOutcomeRecord(record, archiveBytes, manifestBytes, changedSnapshot);
  assert.equal(staleHash.comparisons[0].status, 'not-comparable');
  assert.ok(staleHash.errors.some(message => message.includes('SHA-256 do snapshot')));

  const unknownLot = structuredClone(record);
  unknownLot.subject.entityId = 'lot-does-not-exist';
  const unknownLotReport = validateOutcomeRecord(unknownLot, archiveBytes, manifestBytes, snapshotBytes);
  assert.equal(unknownLotReport.comparisons[0].status, 'not-comparable');
  assert.ok(unknownLotReport.errors.some(message => message.includes('não corresponde a um lote')));

  const wrongSizeSnapshot = structuredClone(farmSnapshot);
  wrongSizeSnapshot.lots[0].animalIds = [];
  const wrongSizeBytes = Buffer.from(JSON.stringify(wrongSizeSnapshot));
  const wrongSizeRecord = structuredClone(record);
  wrongSizeRecord.subject.snapshotSha256 = sha256Bytes(wrongSizeBytes);
  const wrongSizeReport = validateOutcomeRecord(wrongSizeRecord, archiveBytes, manifestBytes, wrongSizeBytes);
  assert.equal(wrongSizeReport.comparisons[0].status, 'not-comparable');
  assert.ok(wrongSizeReport.errors.some(message => message.toLowerCase().includes('quantidade de animais')));
});

test('coverage reports the number of aligned measurements and preserves a mismatched observed period', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record} = fixture();
  const multiMetric = structuredClone(record);
  const second = structuredClone(multiMetric.observations[0]);
  second.id = 'measurement-test-002';
  second.metricPath = 'gain';
  second.periodDays = 2;
  multiMetric.observations.push(second);
  assert.equal(validateSchema(multiMetric), true, JSON.stringify(validateSchema.errors));
  const report = validateOutcomeRecord(multiMetric, archiveBytes, manifestBytes, snapshotBytes);
  assert.equal(report.coverage.totalObservations, 2);
  assert.equal(report.coverage.observedValues, 2);
  assert.equal(report.coverage.comparableValues, 1);
  assert.equal(report.coverage.unavailableOrBlocked, 1);
  assert.equal(report.coverage.comparableFractionOfAll, 0.5);
  assert.equal(report.comparisons[1].status, 'not-comparable');
  assert.match(report.comparisons[1].reason, /Horizonte observado/);
});

test('pending review, missing consent, unapproved alignment and mismatched horizon never produce an error metric', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record} = fixture();
  for (const change of [
    r => {r.review.status = 'pending'; delete r.review.reviewerId; delete r.review.reviewedAt;},
    r => {r.governance.consentStatus = 'pending';},
    r => {r.governance.accessStatus = 'pending';},
    r => {r.observations[0].alignment.status = 'pending'; delete r.observations[0].alignment.reviewerId; delete r.observations[0].alignment.reviewedAt;},
    r => {r.observations[0].periodDays = 2;},
  ]) {
    const candidate = structuredClone(record);
    change(candidate);
    const report = validateOutcomeRecord(candidate, archiveBytes, manifestBytes, snapshotBytes);
    assert.equal(report.comparisons[0].status, 'not-comparable');
    assert.equal(report.coverage.comparableValues, 0);
    assert.equal(report.coverage.unavailableOrBlocked, 1);
  }
});

test('unsupported units, non-executed decisions, and withdrawn consent block comparison', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record} = fixture();
  for (const change of [
    r => {r.observations[0].unit = 'lb';},
    r => {r.decision.status = 'partially-implemented';},
    r => {r.governance.consentStatus = 'withdrawn';},
  ]) {
    const candidate = structuredClone(record);
    change(candidate);
    const report = validateOutcomeRecord(candidate, archiveBytes, manifestBytes, snapshotBytes);
    assert.equal(report.comparisons[0].status, 'not-comparable');
  }
});

test('wrong or unknown executed scenario, pre-decision observations, uncertain quality and mismatched windows block comparison', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record} = fixture();
  for (const change of [
    r => {r.decision.executedScenario = 'baseline';},
    r => {r.decision.executedScenario = 'unknown';},
    r => {r.observations[0].observedAt = '2026-10-12T12:00:00.000Z';},
    r => {r.observations[0].observedAt = '2026-10-12T11:59:59.000Z';},
    r => {r.observations[0].observedAt = '2026-10-15T23:59:59.000Z';},
    r => {r.observations[0].periodStart = '2026-10-12'; r.observations[0].periodEnd = '2026-10-15';},
    r => {r.observations[0].quality = 'estimated';},
    r => {r.observations[0].quality = 'unknown';},
    r => {r.observations[0].periodEnd = '2026-10-14';},
    r => {r.subject.level = 'animal';},
  ]) {
    const candidate = structuredClone(record);
    change(candidate);
    assert.equal(validateSchema(candidate), true, JSON.stringify(validateSchema.errors));
    const report = validateOutcomeRecord(candidate, archiveBytes, manifestBytes, snapshotBytes);
    assert.equal(report.comparisons[0].status, 'not-comparable');
    assert.equal(report.coverage.comparableValues, 0);
  }
});

test('CLI archives a reproducible comparison without overwriting an existing artifact and validates sidecars', () => {
  const {manifestBytes, snapshotBytes, archiveBytes, record} = fixture();
  const directory = mkdtempSync(join(tmpdir(), 'agroville-outcome-record-'));
  try {
    const manifestPath = join(directory, 'manifest.json');
    const snapshotPath = join(directory, 'snapshot.json');
    const outputPath = join(directory, 'projection.json');
    const outcomePath = join(directory, 'outcome.json');
    writeFileSync(manifestPath, manifestBytes);
    writeFileSync(snapshotPath, snapshotBytes);
    const archiveCommand = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/archive-comparison.js', import.meta.url)), manifestPath, outputPath], {encoding: 'utf8'});
    assert.equal(archiveCommand.status, 0, archiveCommand.stderr);
    const noOverwrite = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/archive-comparison.js', import.meta.url)), manifestPath, outputPath], {encoding: 'utf8'});
    assert.equal(noOverwrite.status, 1);
    assert.match(noOverwrite.stderr, /EEXIST/);
    writeFileSync(outputPath, archiveBytes);
    writeFileSync(outcomePath, JSON.stringify(record));
    const validationCommand = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/validate-outcome-record.js', import.meta.url)), outcomePath, '--archive', outputPath, '--manifest', manifestPath, '--snapshot', snapshotPath], {encoding: 'utf8'});
    assert.equal(validationCommand.status, 0, validationCommand.stderr);
    assert.equal(JSON.parse(validationCommand.stdout).schemaValid, true);
    assert.equal(JSON.parse(validationCommand.stdout).snapshotSchemaValid, true);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
