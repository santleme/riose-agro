import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {validateFarmSnapshot} from '../snapshot-validator.js';
import {linkFarmSnapshotToManifest} from '../snapshot-manifest-link.js';
import {FarmEngine, createComparisonManifest} from '../engine.js';
import {createScenarioContract} from '../scenario-contract.js';

const example = JSON.parse(readFileSync(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../schemas/farm-snapshot.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({allErrors: true, strict: true, strictRequired: false});
addFormats(ajv);
const validateSchema = ajv.compile(schema);

test('public USDA snapshot matches the complete JSON Schema', () => {
  assert.equal(validateSchema(example), true, JSON.stringify(validateSchema.errors));

  const missingOperations = structuredClone(example);
  delete missingOperations.operations;
  assert.equal(validateSchema(missingOperations), false);

  const invalidSourceUrl = structuredClone(example);
  invalidSourceUrl.sourceCatalog[0].url = 'not a URL';
  assert.equal(validateSchema(invalidSourceUrl), false);

  const noRequiredFields = structuredClone(example);
  noRequiredFields.caseDefinition.requiredFields = [];
  assert.equal(validateSchema(noRequiredFields), false);
  assert.equal(validateFarmSnapshot(noRequiredFields).semanticValid, false);

  assert.equal(validateFarmSnapshot(missingOperations).semanticValid, true);
});

test('optional visual paddock and lot links are schema-checked and must resolve to real entities', () => {
  const linked = structuredClone(example);
  linked.paddocks[0].domainZoneId = 'paddock-1';
  linked.lots[0].paddockId = linked.paddocks[0].id;
  assert.equal(validateSchema(linked), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateFarmSnapshot(linked).semanticValid, true);

  const unknownPaddock = structuredClone(linked);
  unknownPaddock.lots[0].paddockId = 'missing-paddock';
  assert.equal(validateSchema(unknownPaddock), true);
  assert.ok(validateFarmSnapshot(unknownPaddock).errors.some(message => message.includes("piquete 'missing-paddock' não existe")));

  const duplicateZone = structuredClone(linked);
  duplicateZone.paddocks.push({...structuredClone(duplicateZone.paddocks[0]), id: 'other-paddock'});
  assert.ok(validateFarmSnapshot(duplicateZone).errors.some(message => message.includes("domainZoneId duplicado 'paddock-1'")));
});

test('snapshot CLI reports valid but ineligible examples and can enforce eligibility', () => {
  const samplePath = new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json', import.meta.url);
  const scriptPath = new URL('../scripts/validate-farm-snapshot.js', import.meta.url);
  const reportRun = spawnSync(process.execPath, [fileURLToPath(scriptPath), fileURLToPath(samplePath)], {encoding: 'utf8'});
  assert.equal(reportRun.status, 0, reportRun.stderr);
  const report = JSON.parse(reportRun.stdout);
  assert.equal(report.schemaValid, true);
  assert.equal(report.valid, true);
  assert.equal(report.simulationEligible, false);

  const gateRun = spawnSync(process.execPath, [fileURLToPath(scriptPath), fileURLToPath(samplePath), '--require-eligible'], {encoding: 'utf8'});
  assert.equal(gateRun.status, 2, gateRun.stderr);
  assert.equal(JSON.parse(gateRun.stdout).simulationEligible, false);
});

test('snapshot CLI rejects structurally invalid documents before eligibility can pass', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agroville-snapshot-'));
  try {
    const invalidPath = join(directory, 'invalid.json');
    const invalid = structuredClone(example);
    delete invalid.operations;
    writeFileSync(invalidPath, JSON.stringify(invalid));
    const scriptPath = new URL('../scripts/validate-farm-snapshot.js', import.meta.url);
    const run = spawnSync(process.execPath, [fileURLToPath(scriptPath), invalidPath, '--require-eligible'], {encoding: 'utf8'});
    assert.equal(run.status, 1, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.schemaValid, false);
    assert.equal(report.valid, false);
    assert.ok(report.errors.some(message => message.includes('operations')));
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('public USDA snapshot documents provenance and blocks unsupported simulation', () => {
  const result = validateFarmSnapshot(example);
  assert.equal(result.semanticValid, true);
  assert.equal(result.simulationEligible, false);
  assert.deepEqual(example.caseDefinition.requiredFields, [
    'animal.eartag-242.adg_60d',
    'animal.eartag-242.mean_grazing_bout_duration_5min',
    'animal.eartag-242.mean_grazing_velocity',
  ]);
  assert.deepEqual(result.missingRequiredFields, []);
  assert.ok(result.blockers.some(message => message.includes('revisão de domínio')));
  assert.ok(result.blockers.some(message => message.includes('não é um estado-base executável')));
  assert.equal(example.simulationEligibility.status, 'not-applicable');
  assert.equal(example.manifestReference.status, 'not-linked');
});

test('review-pending is distinct from blocked when no required fields are missing', () => {
  const pending = structuredClone(example);
  pending.snapshotKind = 'farm-baseline';
  pending.caseDefinition.requiredFields = ['population.species'];
  pending.simulationEligibility.missingRequiredFields = [];
  pending.simulationEligibility.status = 'review-pending';
  delete pending.simulationEligibility.reason;

  const result = validateFarmSnapshot(pending);
  assert.equal(result.semanticValid, true);
  assert.equal(result.simulationEligible, false);
  assert.deepEqual(result.missingRequiredFields, []);
  assert.ok(result.blockers.some(message => message.includes('revisão de domínio')));

  pending.simulationEligibility.status = 'ready';
  assert.equal(validateFarmSnapshot(pending).semanticValid, false);
});

test('an observed study slice cannot be marked simulation-ready even after case approval', () => {
  const invalid = structuredClone(example);
  invalid.snapshotKind = 'observed-study-slice';
  invalid.caseDefinition.reviewStatus = 'approved';
  invalid.caseDefinition.requiredFields = ['population.species'];
  invalid.simulationEligibility.status = 'ready';
  invalid.simulationEligibility.missingRequiredFields = [];
  delete invalid.simulationEligibility.reason;
  assert.equal(validateSchema(invalid), true);
  assert.ok(validateFarmSnapshot(invalid).errors.some(message => message.includes("status deve ser 'not-applicable'")));
  assert.equal(validateFarmSnapshot(invalid).simulationEligible, false);

  const missingReason = structuredClone(example);
  delete missingReason.simulationEligibility.reason;
  assert.equal(validateSchema(missingReason), false);
});

test('missing values cannot be silently populated or downgraded to measurements', () => {
  const invalid = structuredClone(example);
  const startWeight = invalid.observations.find(field => field.path.endsWith('start_weight_kg'));
  startWeight.value = 360;
  assert.equal(validateFarmSnapshot(invalid).semanticValid, false);

  const mislabeled = structuredClone(example);
  const dmi = mislabeled.observations.find(field => field.path.endsWith('dmi_kg_day'));
  dmi.status = 'observed';
  assert.equal(validateFarmSnapshot(mislabeled).semanticValid, false);
});

test('snapshot source references and readiness gaps are checked across the contract', () => {
  const invalid = structuredClone(example);
  invalid.observations[0].sourceId = 'unregistered-source';
  assert.equal(validateFarmSnapshot(invalid).semanticValid, false);

  const stale = structuredClone(example);
  stale.simulationEligibility.missingRequiredFields.push('animal.eartag-242.start_weight_kg');
  assert.ok(validateFarmSnapshot(stale).errors.some(message => message.includes('não corresponde')));
});

test('repeated measurements keep stable IDs and time while allowing the same metric path', () => {
  const repeated = structuredClone(example);
  const first = repeated.observations.find(observation => observation.path.endsWith('mean_grazing_velocity'));
  const second = {
    ...structuredClone(first),
    measurementId: 'usda-cper-eartag-242-velocity-period-2',
    period: 'Second study period; exact calendar date not supplied by the summary row.',
    sourceLocator: 'Moo2019-20_dailymetrics_w_ADG_by_studyperiod.csv row 3 / MeanVelo',
    value: first.value + 0.2,
  };
  repeated.observations.push(second);
  assert.equal(validateSchema(repeated), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateFarmSnapshot(repeated).semanticValid, true);

  const duplicateId = structuredClone(repeated);
  duplicateId.observations.at(-1).measurementId = first.measurementId;
  assert.ok(validateFarmSnapshot(duplicateId).errors.some(message => message.includes('measurementId duplicado')));

  const duplicatePeriod = structuredClone(repeated);
  duplicatePeriod.observations.at(-1).period = first.period;
  assert.ok(validateFarmSnapshot(duplicatePeriod).errors.some(message => message.includes('mesmo instante/período')));

  const missingTime = structuredClone(repeated);
  delete missingTime.observations.at(-1).observedAt;
  assert.equal(validateSchema(missingTime), false);
  const unexplainedTime = structuredClone(repeated);
  delete unexplainedTime.observations.at(-1).timeMissingReason;
  assert.equal(validateSchema(unexplainedTime), false);
});

test('operation and history events require sourced values under stable event paths', () => {
  const withEvent = structuredClone(example);
  withEvent.sourceCatalog.push({
    id: 'operator-log-fixture',
    title: 'Test-only operator log fixture',
    url: 'https://example.invalid/operator-log-fixture',
    version: 'fixture-1',
    license: 'test-only',
    accessedDate: '2026-10-11',
  });
  withEvent.operations.events.push({
    id: 'supplement-change-001',
    type: 'supplement-change',
    occurredAt: '2026-10-01T10:00:00Z',
    status: 'observed',
    sourceId: 'operator-log-fixture',
    sourceLocator: 'Operator log row 1',
    populationValidity: 'This research site and recorded event only.',
    fields: [{
      path: 'operations.supplement-change-001.supplement_kg_dm_day',
      value: 1,
      unit: 'kg DM/animal/day',
      status: 'observed',
      sourceId: 'operator-log-fixture',
      sourceLocator: 'Operator log row 1 / supplement',
      populationValidity: 'This event only.',
    }],
  });
  assert.equal(validateSchema(withEvent), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateFarmSnapshot(withEvent).semanticValid, true);

  const wrongPath = structuredClone(withEvent);
  wrongPath.operations.events[0].fields[0].path = 'history.supplement-change-001.supplement_kg_dm_day';
  assert.ok(validateFarmSnapshot(wrongPath).errors.some(message => message.includes('path deve começar com')));

  const unregisteredSource = structuredClone(withEvent);
  unregisteredSource.history.events = [structuredClone(unregisteredSource.operations.events[0])];
  unregisteredSource.history.events[0].sourceId = 'unknown-source';
  assert.ok(validateFarmSnapshot(unregisteredSource).errors.some(message => message.includes('fonte unknown-source não existe')));

  const untracedField = structuredClone(withEvent);
  delete untracedField.operations.events[0].fields[0].sourceLocator;
  assert.equal(validateSchema(untracedField), false);
});

test('snapshot links to the comparison manifest by exact file digest and version', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agroville-manifest-link-'));
  try {
    const manifestBytes = Buffer.from(JSON.stringify(createComparisonManifest(new FarmEngine(417, 5).snapshot(), 30)));
    const digest = createHash('sha256').update(manifestBytes).digest('hex');
    const linked = structuredClone(example);
    linked.manifestReference = {status: 'linked', type: 'agroville-comparison', version: 1, sha256: digest};
    assert.equal(validateSchema(linked), true, JSON.stringify(validateSchema.errors));
    assert.equal(validateFarmSnapshot(linked).semanticValid, true);

    const snapshotPath = join(directory, 'snapshot.json');
    const manifestPath = join(directory, 'comparison.json');
    writeFileSync(snapshotPath, JSON.stringify(linked));
    writeFileSync(manifestPath, manifestBytes);
    const scriptPath = new URL('../scripts/validate-farm-snapshot.js', import.meta.url);
    const matching = spawnSync(process.execPath, [fileURLToPath(scriptPath), snapshotPath, '--manifest', manifestPath], {encoding: 'utf8'});
    assert.equal(matching.status, 0, matching.stderr);
    assert.equal(JSON.parse(matching.stdout).manifestReferenceChecked, true);
    assert.equal(JSON.parse(matching.stdout).manifestReferenceValid, true);

    writeFileSync(manifestPath, Buffer.concat([manifestBytes, Buffer.from(' ')]));
    const mismatch = spawnSync(process.execPath, [fileURLToPath(scriptPath), snapshotPath, '--manifest', manifestPath], {encoding: 'utf8'});
    assert.equal(mismatch.status, 1);
    assert.ok(JSON.parse(mismatch.stdout).errors.some(message => message.includes('SHA-256')));
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('existing farm snapshots can reference a validated v2 comparison contract', () => {
  const source = structuredClone(example);
  source.snapshotKind = 'farm-baseline';
  source.simulationEligibility.status = 'review-pending';
  delete source.simulationEligibility.reason;
  const manifest = createScenarioContract(new FarmEngine(417, 5).snapshot(), 30);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const linked = linkFarmSnapshotToManifest(source, manifestBytes);

  assert.equal(linked.manifestReference.type, 'agroville-comparison');
  assert.equal(linked.manifestReference.version, 2);
  assert.equal(linked.manifestReference.sha256, createHash('sha256').update(manifestBytes).digest('hex'));
  assert.equal(validateSchema(linked), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateFarmSnapshot(linked).semanticValid, true);
});

test('snapshot link command validates and links the exact manifest bytes without mutating the source', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agroville-link-snapshot-'));
  try {
    const source = structuredClone(example);
    source.snapshotKind = 'farm-baseline';
    source.simulationEligibility.status = 'review-pending';
    const manifestBytes = Buffer.from(JSON.stringify(createComparisonManifest(new FarmEngine(17, 5).snapshot(), 30)));
    const snapshotPath = join(directory, 'snapshot.json');
    const manifestPath = join(directory, 'comparison.json');
    const outputPath = join(directory, 'linked.snapshot.json');
    writeFileSync(snapshotPath, JSON.stringify(source));
    writeFileSync(manifestPath, manifestBytes);

    const scriptPath = new URL('../scripts/link-farm-snapshot.js', import.meta.url);
    const run = spawnSync(process.execPath, [fileURLToPath(scriptPath), '--snapshot', snapshotPath, '--manifest', manifestPath, '--output', outputPath], {encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
    const linked = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.deepEqual(linked.manifestReference, {
      status: 'linked',
      type: 'agroville-comparison',
      version: 1,
      sha256: createHash('sha256').update(manifestBytes).digest('hex'),
    });
    assert.deepEqual(JSON.parse(readFileSync(snapshotPath, 'utf8')), source);
    assert.equal(JSON.parse(run.stdout).simulationEligible, false);

    const validationScript = new URL('../scripts/validate-farm-snapshot.js', import.meta.url);
    const check = spawnSync(process.execPath, [fileURLToPath(validationScript), outputPath, '--manifest', manifestPath], {encoding: 'utf8'});
    assert.equal(check.status, 0, check.stderr);
    assert.equal(JSON.parse(check.stdout).manifestReferenceValid, true);
    assert.equal(JSON.parse(check.stdout).simulationEligible, false);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('snapshot link helper rejects study slices and already-linked snapshots', () => {
  const manifestBytes = Buffer.from(JSON.stringify(createComparisonManifest(new FarmEngine(17, 5).snapshot(), 30)));
  assert.throws(() => linkFarmSnapshotToManifest(example, manifestBytes), /Recorte observacional/);
  const alreadyLinked = structuredClone(example);
  alreadyLinked.snapshotKind = 'farm-baseline';
  alreadyLinked.manifestReference.status = 'linked';
  assert.throws(() => linkFarmSnapshotToManifest(alreadyLinked, manifestBytes), /not-linked/);
});

test('snapshot entity IDs and lot membership must form consistent references', () => {
  const wrongLot = structuredClone(example);
  wrongLot.animals[0].lotId = 'unknown-lot';
  const wrongLotResult = validateFarmSnapshot(wrongLot);
  assert.ok(wrongLotResult.errors.some(message => message.includes("lote 'unknown-lot' não existe")));
  assert.ok(wrongLotResult.errors.some(message => message.includes('não corresponde ao lote')));

  const missingAnimal = structuredClone(example);
  missingAnimal.lots[0].animalIds = ['unknown-animal'];
  assert.ok(validateFarmSnapshot(missingAnimal).errors.some(message => message.includes("animal 'unknown-animal' não existe")));

  const duplicateId = structuredClone(example);
  duplicateId.animals.push(structuredClone(duplicateId.animals[0]));
  assert.ok(validateFarmSnapshot(duplicateId).errors.some(message => message.includes("animals: id duplicado 'eartag-242'")));
});

test('field paths must match their entity and observations cannot reference unknown entities', () => {
  const misplacedCategory = structuredClone(example);
  misplacedCategory.animals[0].category.path = 'animal.someone-else.category';
  assert.ok(validateFarmSnapshot(misplacedCategory).errors.some(message => message.includes("category: caminho deve ser 'animal.eartag-242.category'")));

  const unknownAnimalObservation = structuredClone(example);
  unknownAnimalObservation.observations.push({
    ...structuredClone(unknownAnimalObservation.observations[0]),
    path: 'animal.unknown-animal.weight_kg',
  });
  assert.ok(validateFarmSnapshot(unknownAnimalObservation).errors.some(message => message.includes('animal referenciado não existe')));
});

test('malformed snapshots return validation errors instead of throwing', () => {
  assert.equal(validateFarmSnapshot(null).semanticValid, false);
  assert.equal(validateFarmSnapshot({}).semanticValid, false);
  const missingManifestStatus = structuredClone(example);
  delete missingManifestStatus.manifestReference.status;
  assert.ok(validateFarmSnapshot(missingManifestStatus).errors.some(message => message.includes('manifestReference.status')));

  const malformedRequiredPath = structuredClone(example);
  malformedRequiredPath.caseDefinition.requiredFields.push('');
  assert.ok(validateFarmSnapshot(malformedRequiredPath).errors.some(message => message.includes('caminho vazio ou inválido')));

  for (const key of ['animals', 'lots', 'paddocks']) {
    const malformedEntity = structuredClone(example);
    malformedEntity[key][0] = null;
    assert.doesNotThrow(() => validateFarmSnapshot(malformedEntity));
    assert.equal(validateFarmSnapshot(malformedEntity).semanticValid, false);
  }
});

test('entity observation paths require a field and reference an existing entity', () => {
  for (const path of ['animal.ghost', 'paddock.ghost', 'lot.ghost']) {
    const invalid = structuredClone(example);
    invalid.observations.push({...structuredClone(invalid.observations[0]), path});
    assert.equal(validateFarmSnapshot(invalid).semanticValid, false, path);
    assert.ok(validateFarmSnapshot(invalid).errors.some(message => message.includes('caminho de entidade precisa incluir id e campo')), path);
  }

  const unknownLot = structuredClone(example);
  unknownLot.observations.push({...structuredClone(unknownLot.observations[0]), path: 'lot.unknown.weight_kg'});
  assert.ok(validateFarmSnapshot(unknownLot).errors.some(message => message.includes('lote referenciado não existe')));
});
