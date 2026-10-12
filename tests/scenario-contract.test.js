import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {FarmEngine, createComparisonManifest, replayComparisonManifest, validateComparisonManifest} from '../engine.js';
import {
  createScenarioContract,
  replayScenarioContract,
  SCENARIO_ENGINE_VERSION,
  upgradeComparisonManifestToScenarioContract,
  validateScenarioContract,
} from '../scenario-contract.js';

const schema = JSON.parse(await readFile(new URL('../schemas/scenario-contract.schema.json', import.meta.url), 'utf8'));
const validateSchema = new Ajv2020({allErrors: true, strict: false}).compile(schema);

function fixture(seed = 2741) {
  const engine = new FarmEngine(seed, 5);
  engine.configure({diet: 'balanced', supplement: 1.5, weather: 'rain'});
  engine.tick(48);
  return engine.snapshot();
}

test('v2 contract validates structurally and semantically and replays the recorded inputs', () => {
  const snapshot = fixture();
  const contract = createScenarioContract(snapshot, 17, {scenarioId: 'test-rainy-herd'});
  const imported = JSON.parse(JSON.stringify(contract));

  assert.equal(validateSchema(imported), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateScenarioContract(imported), true);
  assert.equal(imported.version, 2);
  assert.equal(imported.type, 'agroville-comparison');
  assert.deepEqual(imported.baseline, snapshot);
  assert.deepEqual(imported.target_scope.animal_ids, snapshot.animals.map(animal => String(animal.id)));
  assert.equal(imported.duration.value, 17);
  assert.equal(imported.seed, snapshot.initialSeed);
  assert.equal(imported.engine_version, SCENARIO_ENGINE_VERSION);
  assert.equal(imported.validated, false);
  assert.deepEqual(replayScenarioContract(imported), replayScenarioContract(JSON.parse(JSON.stringify(imported))));
});

test('legacy v1 manifests stay readable and adapt with an explicit unknown engine-version fallback', () => {
  const snapshot = fixture(417);
  const legacy = createComparisonManifest(snapshot, 8);
  const roundTrip = JSON.parse(JSON.stringify(legacy));
  const upgraded = upgradeComparisonManifestToScenarioContract(roundTrip);

  assert.equal(validateComparisonManifest(roundTrip), true);
  assert.deepEqual(replayScenarioContract(roundTrip), replayComparisonManifest(roundTrip));
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.engine_version, 'legacy-unspecified');
  assert.deepEqual(upgraded.baseline, roundTrip.initialSnapshot);
  assert.deepEqual(replayScenarioContract(upgraded), replayComparisonManifest(roundTrip));
});

test('optional scenario identity uses a deterministic default or the requested ID', () => {
  const snapshot = fixture(91);
  const defaults = createScenarioContract(snapshot, 3);
  const overrides = createScenarioContract(snapshot, 3, {scenarioId: 'chosen-id'});

  assert.equal(defaults.scenario_id, 'scenario-91-3');
  assert.equal(defaults.engine_version, SCENARIO_ENGINE_VERSION);
  assert.equal(overrides.scenario_id, 'chosen-id');
  assert.equal(overrides.engine_version, SCENARIO_ENGINE_VERSION);
});

test('missing, unsupported, and contradictory v2 data fail with understandable messages', () => {
  const contract = createScenarioContract(fixture(), 5);
  const missingScope = structuredClone(contract);
  delete missingScope.target_scope;
  assert.throws(() => validateScenarioContract(missingScope), /obrigatório\(s\): target_scope/);

  const inventedScience = structuredClone(contract);
  inventedScience.engine_version = '';
  assert.throws(() => validateScenarioContract(inventedScience), /engine_version deve ser agroville-engine\/1/);

  const unknownEngine = structuredClone(contract);
  unknownEngine.engine_version = 'future-engine/99';
  assert.throws(() => validateScenarioContract(unknownEngine), /engine_version deve ser agroville-engine\/1/);

  const invalidSeed = structuredClone(contract);
  invalidSeed.seed += 1;
  assert.throws(() => validateScenarioContract(invalidSeed), /seed deve corresponder/);

  const badDuration = structuredClone(contract);
  badDuration.duration.value = 366;
  assert.throws(() => validateScenarioContract(badDuration), /Período do manifesto deve ser de 1–365 dias/);

  const badTarget = structuredClone(contract);
  badTarget.target_scope.animal_ids.pop();
  assert.throws(() => validateScenarioContract(badTarget), /target_scope.animal_ids deve corresponder/);
});

test('checked-in example runs twice with identical outputs', async () => {
  const {spawnSync} = await import('node:child_process');
  const script = fileURLToPath(new URL('../examples/scenario-contract-v2.js', import.meta.url));
  const first = spawnSync(process.execPath, [script], {encoding: 'utf8'});
  const second = spawnSync(process.execPath, [script], {encoding: 'utf8'});

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /"reproducible": true/);
});
