import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBatchExperimentManifest, createExperimentResultRecord, digestExperimentManifest, digestScenario, parseExperimentResultJsonl, serializeExperimentResultJsonl, sha256Digest, validateBatchExperimentManifest, verifyExperimentResults} from '../scripts/experiments/batch-manifest.js';
import {FarmEngine, createComparisonManifest, validateComparisonManifest} from '../src/client/engine.js';
import {validateFarmSnapshot} from '../src/client/snapshot-validator.js';
import {createScenarioContract} from '../src/client/scenario-contract.js';
import {HARNESS_FORMAT, validateScenarioIdentity} from '../scripts/experiments/scenario-dispatch.js';

const validRun = (overrides = {}) => {
  const scenario = {type: 'agroville-comparison', version: 1, scenarioId: 'pasture-baseline', durationDays: 14};
  const outputs = {averageWeightKg: {value: 331.2, unit: 'kg/animal'}};
  return {
    runId: 'run-001', scenarioFormat: 'agroville-comparison', scenarioVersion: 1, scenarioId: null, scenarioRef: 'scenarios/pasture-baseline.json', scenarioDigest: digestScenario(scenario), seed: 42,
    engine: {id: 'agroville-comparison', version: 'v1.2.0', buildDigest: sha256Digest('engine-build'), status: 'provided'},
    models: [{id: 'br-corte-2023-eq-2.6', version: '2023', implementationDigest: sha256Digest('model-source'), status: 'provided'}],
    datasets: [{id: 'dataset-abc', digest: sha256Digest('dataset'), uri: 'https://example.org/data.csv', status: 'provided'}],
    evidence: [{id: 'publication-xyz', digest: null, uri: 'https://example.org/paper', status: 'provided'}],
    inputs: {initialWeight: {value: 330, unit: 'kg/animal'}},
    outputs, status: 'completed', outputDigest: sha256Digest(outputs), resultDigest: sha256Digest('persisted record'), resultRef: 'results.jsonl#run-001',
    ...overrides
  };
};

test('validates versioned manifest schema, deterministic digest, and key-order independent scenario digest', () => {
  const manifest = createBatchExperimentManifest({experimentId: 'exp-2026-001', createdAt: '2026-10-12T12:00:00.000Z', runs: [validRun()]});
  assert.equal(manifest.type, 'riose-batch-experiment');
  assert.equal(manifest.version, 1);
  assert.match(manifest.manifestDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(digestExperimentManifest(manifest), manifest.manifestDigest);
  assert.equal(manifest.manifestDigest, createBatchExperimentManifest({experimentId: 'exp-2026-001', createdAt: '2026-10-12T12:00:00.000Z', runs: [validRun()]}).manifestDigest);
  assert.notEqual(digestExperimentManifest({...manifest, experimentId: 'changed'}), manifest.manifestDigest);
  assert.equal(digestScenario({a: 1, b: 2}), digestScenario({b: 2, a: 1}));
  assert.equal(validateBatchExperimentManifest(manifest), manifest);
  const tampered = structuredClone(manifest);
  tampered.runs[0].seed = 43;
  assert.throws(() => validateBatchExperimentManifest(tampered), /digest mismatch/);
});

test('rejects unsupported manifest versions and malformed run invariants', () => {
  const manifest = createBatchExperimentManifest({experimentId: 'exp-unknown', runs: [validRun()]});
  assert.throws(() => validateBatchExperimentManifest({...manifest, version: 2}), /Unsupported experiment manifest type\/version/);
  assert.throws(() => createBatchExperimentManifest({experimentId: 'duplicate', runs: [validRun(), validRun()]}), /runId must be unique/);
  assert.throws(() => createBatchExperimentManifest({experimentId: 'missing-engine-version', runs: [validRun({engine: {id: 'engine', version: null, buildDigest: null, status: 'provided'}})]}), /requires an exact id and version/);
});

test('makes missing provenance explicit and only completed runs carry output links', () => {
  const run = validRun({
    runId: 'planned-001', engine: {id: null, version: null, buildDigest: null, status: 'missing'},
    models: [{id: null, version: null, implementationDigest: null, status: 'missing'}],
    datasets: [{id: null, digest: null, uri: null, status: 'missing'}],
    evidence: [{id: null, digest: null, uri: null, status: 'missing'}],
    outputs: {}, status: 'planned', outputDigest: null, resultDigest: null, resultRef: null
  });
  const manifest = createBatchExperimentManifest({experimentId: 'missing-provenance', runs: [run]});
  assert.equal(validateBatchExperimentManifest(manifest), manifest);
});

test('result digest and manifest linkage detect changed, missing, duplicate, and unlinked results', () => {
  const run = validRun();
  const manifest = createBatchExperimentManifest({experimentId: 'linked', runs: [run]});
  const record = createExperimentResultRecord({runId: run.runId, outputs: run.outputs});
  const jsonl = serializeExperimentResultJsonl([record]);
  assert.deepEqual(parseExperimentResultJsonl(jsonl), [record]);
  assert.deepEqual(verifyExperimentResults(manifest, [record], {resultRefByRunId: {'run-001': 'results.jsonl#run-001'}, resultDigestByRunId: {'run-001': run.resultDigest}}), {valid: true, completedRuns: 1, resultRecords: 1});
  assert.throws(() => verifyExperimentResults(manifest, []), /Missing result record/);
  assert.throws(() => verifyExperimentResults(manifest, [record, record]), /Duplicate result record/);
  assert.throws(() => verifyExperimentResults(manifest, [{...record, outputs: {averageWeightKg: {value: 1, unit: 'kg'}}}]), /Output digest mismatch/);
  const other = createExperimentResultRecord({runId: 'other-run', outputs: run.outputs});
  assert.throws(() => verifyExperimentResults(manifest, [other]), /not linked from manifest/);
  assert.throws(() => verifyExperimentResults(manifest, [record], {resultRefByRunId: {'run-001': 'wrong.jsonl#1'}}), /Result reference mismatch/);
  assert.throws(() => verifyExperimentResults(manifest, [record], {resultDigestByRunId: {'run-001': sha256Digest('different')}}), /Result digest mismatch/);
});

test('legacy comparison manifest and farm snapshot schemas remain readable and unchanged', async () => {
  const snapshot = new FarmEngine(42, 2).snapshot();
  const oldManifest = createComparisonManifest(snapshot, 7);
  assert.equal(validateComparisonManifest(oldManifest), true);
  const oldSchema = JSON.parse(await readFile(new URL('../schemas/scenario-contract.schema.json', import.meta.url), 'utf8'));
  const newSchema = JSON.parse(await readFile(new URL('../schemas/batch-experiment-manifest-v1.schema.json', import.meta.url), 'utf8'));
  const oldSnapshot = JSON.parse(await readFile(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json', import.meta.url), 'utf8'));
  assert.equal(oldSchema.properties.version.const, 2);
  assert.equal(newSchema.properties.version.const, 1);
  assert.equal(oldManifest.type, 'agroville-comparison');
  assert.equal(validateFarmSnapshot(oldSnapshot).semanticValid, true);
});

test('canonical digests reject unsupported JavaScript values instead of silently changing bytes', () => {
  assert.throws(() => sha256Digest({x: undefined}), /cannot encode undefined/);
  assert.throws(() => sha256Digest({x: Number.NaN}), /finite numbers/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => sha256Digest(cyclic), /circular references/);
});

test('scenario identity dispatch validates comparison v1/v2, harness, and native request families', async () => {
  const snapshot = new FarmEngine(42, 2).snapshot();
  const v1 = createComparisonManifest(snapshot, 7);
  const v2 = createScenarioContract(snapshot, 7, {scenarioId: 'comparison-v2'});
  const harness = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));
  const native = {type: 'baseline', version: 1, seed: 42, animalCount: 2, configuration: {diet: 'pasture', housing: 'pasture', weather: 'normal', supplement: 0}, hours: 24};
  assert.equal(validateScenarioIdentity({scenarioFormat: 'agroville-comparison', scenarioVersion: 1, scenarioId: null, scenarioRef: 'scenarios/comparison-v1.json', seed: 42, scenario: v1}).scenarioDigest, digestScenario(v1));
  assert.equal(validateScenarioIdentity({scenarioFormat: 'agroville-comparison', scenarioVersion: 2, scenarioId: 'comparison-v2', scenarioRef: 'scenarios/comparison-v2.json', seed: 42, scenario: v2}).scenarioDigest, digestScenario(v2));
  assert.equal(validateScenarioIdentity({scenarioFormat: HARNESS_FORMAT, scenarioVersion: 1, scenarioId: harness.scenarioId, scenarioRef: 'scenarios/harness.json', seed: harness.engine.seed, scenario: harness}).scenarioFormat, HARNESS_FORMAT);
  assert.equal(validateScenarioIdentity({scenarioFormat: 'baseline', scenarioVersion: 1, scenarioId: null, scenarioRef: 'requests/native.json', seed: native.seed, scenario: native}).scenarioFormat, 'baseline');
});

test('scenario dispatch fails closed for unknown versions, formats, identity mismatches, and invalid input', async () => {
  const harness = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));
  const identity = {scenarioFormat: HARNESS_FORMAT, scenarioVersion: 1, scenarioId: harness.scenarioId, scenarioRef: 'scenarios/harness.json', seed: harness.engine.seed, scenario: harness};
  assert.throws(() => validateScenarioIdentity({...identity, scenarioFormat: 'unknown-family'}), /Unsupported scenario format/);
  assert.throws(() => validateScenarioIdentity({...identity, scenarioVersion: 2}), /Invalid or unsupported/);
  assert.throws(() => validateScenarioIdentity({...identity, scenarioId: 'other'}), /ID mismatch/);
  assert.throws(() => validateScenarioIdentity({...identity, scenarioRef: '../harness.json'}), /safe relative path/);
  assert.throws(() => validateScenarioIdentity({...identity, seed: harness.engine.seed + 1}), /seed does not match/);
  assert.throws(() => validateScenarioIdentity({...identity, scenario: {...harness, assertions: []}}), /Invalid or unsupported/);
  assert.throws(() => validateScenarioIdentity({...identity, scenarioRef: undefined}), /safe relative path/);
});

test('native request dispatch matches riose-run config and request bounds before hashing', () => {
  const fields = {scenarioFormat: 'baseline', scenarioVersion: 1, scenarioId: null, scenarioRef: 'requests/native.json', seed: 42};
  const native = {type: 'baseline', version: 1, seed: 42, animalCount: 2, configuration: {diet: 'pasture', housing: 'pasture', weather: 'normal', supplement: 0}, hours: 24};
  assert.throws(() => validateScenarioIdentity({...fields, scenario: {...native, configuration: {...native.configuration, diet: 'unsupported'}}}), /configuration diet is unsupported/);
  assert.throws(() => validateScenarioIdentity({...fields, scenario: {...native, hours: 0}}), /baseline scenario inputs are invalid/);
  assert.throws(() => validateScenarioIdentity({...fields, scenario: {...native, configuration: {...native.configuration, unrecognized: true}}}), /request contract/);
});

test('scenario semantic digest is stable for key order and changes for semantic input', async () => {
  const harness = JSON.parse(await readFile(new URL('../tests/scenarios/baseline-pasture.json', import.meta.url), 'utf8'));
  const fields = {scenarioFormat: HARNESS_FORMAT, scenarioVersion: 1, scenarioId: harness.scenarioId, scenarioRef: 'scenarios/harness.json', seed: harness.engine.seed};
  const first = validateScenarioIdentity({...fields, scenario: harness});
  const reordered = validateScenarioIdentity({...fields, scenario: Object.fromEntries(Object.entries(harness).reverse())});
  const changed = validateScenarioIdentity({...fields, scenario: {...harness, run: {...harness.run, hours: harness.run.hours + 1}}});
  assert.equal(first.scenarioDigest, reordered.scenarioDigest);
  assert.notEqual(first.scenarioDigest, changed.scenarioDigest);
});
