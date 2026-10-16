import test from 'node:test';
import assert from 'node:assert/strict';
import {FarmEngine} from '../src/client/engine.js';
import {replayScenarioSetManifest, createScenarioSetManifest} from '../src/client/scenario-set.js';
import {interpretScenarioLabPrompt} from '../src/client/scenario-lab-intent.js';
import {canonicalScenarioLabJson, createScenarioLabArchive, validateScenarioLabArchive} from '../src/client/scenario-lab-integrity.js';

const request = 'Compare 0.5 kg DM/head/day, 1 kg DM/head/day, and 1.5 kg DM/head/day for 3 cattle over 2 days in hot weather.';
function scenarioSet() {
  const engine = new FarmEngine(712, 3);
  engine.configure({weather: 'hot'});
  const snapshot = engine.snapshot();
  const shared = {...snapshot.config, weather: 'hot'};
  return createScenarioSetManifest({snapshot, durationDays: 2, scenarioId: 'integrity-run-712', scenarios: [
    {id: 'baseline', label: 'Baseline', role: 'baseline', config: {...shared, supplement: 0.5}},
    {id: 'scenario-a', label: 'Scenario A', role: 'intervention', config: {...shared, supplement: 1}},
    {id: 'scenario-b', label: 'Scenario B', role: 'intervention', config: {...shared, supplement: 1.5}},
  ]});
}

test('archive binds prompt, validated intent, exact confirmed manifest, execution provenance, and output digest', async () => {
  const manifest = scenarioSet();
  const results = replayScenarioSetManifest(manifest);
  const intent = interpretScenarioLabPrompt(request);
  const archive = await createScenarioLabArchive({manifest, results, sourcePrompt: request, intent});
  assert.equal((await validateScenarioLabArchive(archive)).type, 'riose-scenario-lab-archive');
  assert.equal(archive.provenance.confirmedManifestSha256, archive.provenance.executedManifestSha256);
  assert.equal(archive.provenance.executor, 'javascript-scenario-set');
  assert.equal(archive.provenance.resultExecutor, results.executor);
  assert.equal(archive.provenance.seed, manifest.seed);
  assert.equal(archive.provenance.engine.version, manifest.engineVersion);
  assert.equal(archive.provenance.scientificModel.status, 'not-used');
  assert.deepEqual(archive.provenance.units, results.units);
  assert.deepEqual(archive.provenance.assumptions, results.assumptions);
  assert.deepEqual(archive.provenance.hypothesis, {statement: request, origin: 'user question', status: 'not independently evaluated'});
});

test('version 2 archive preserves AI interpretation provenance while version 1 remains importable', async () => {
  const manifest = scenarioSet();
  const results = replayScenarioSetManifest(manifest);
  const intent = interpretScenarioLabPrompt(request);
  const interpretation = {source: 'llm', provider: 'groq', model: 'openai/gpt-oss-20b'};
  const archive = await createScenarioLabArchive({manifest, results, sourcePrompt: request, intent, interpretation});
  assert.equal(archive.version, 2);
  assert.deepEqual(archive.request.interpretation, interpretation);
  assert.deepEqual(archive.provenance.interpreter, interpretation);
  assert.equal(archive.request.relationship, 'validated-ai-draft');
  await validateScenarioLabArchive(archive);

  const manuallyRevisedManifest = structuredClone(manifest);
  manuallyRevisedManifest.scenarios[1].config.supplement = 1.25;
  const manuallyRevised = await createScenarioLabArchive({
    manifest: manuallyRevisedManifest,
    results: replayScenarioSetManifest(manuallyRevisedManifest),
    sourcePrompt: request,
    intent,
    interpretation,
    relationship: 'manual-revision',
  });
  assert.deepEqual(manuallyRevised.request.intent, intent);
  assert.equal(manuallyRevised.request.relationship, 'manual-revision');
  assert.deepEqual(manuallyRevised.provenance.interpreter, interpretation);
  await validateScenarioLabArchive(manuallyRevised);

  const legacy = structuredClone(await createScenarioLabArchive({manifest, results, sourcePrompt: request, intent}));
  legacy.version = 1;
  delete legacy.request.interpretation;
  delete legacy.provenance.interpreter;
  assert.equal((await validateScenarioLabArchive(legacy)).version, 1);
});

test('scenario results must match every confirmed arm and run dimension', async () => {
  const manifest = scenarioSet();
  const results = replayScenarioSetManifest(manifest);
  for (const [key, value] of [['seed', manifest.seed + 1], ['durationDays', 3], ['factor', 'weather'], ['engineVersion', 'other-engine']]) {
    await assert.rejects(createScenarioLabArchive({manifest, results: {...results, [key]: value}}), /do not match the confirmed manifest/);
  }
  const changedArm = structuredClone(results);
  changedArm.scenarios[0].config.supplement = 2;
  await assert.rejects(createScenarioLabArchive({manifest, results: changedArm}), /do not match the confirmed manifest/);
});

test('archive validation detects changed manifest, results, provenance, and intent', async () => {
  const manifest = scenarioSet();
  const results = replayScenarioSetManifest(manifest);
  const good = await createScenarioLabArchive({manifest, results, sourcePrompt: request, intent: interpretScenarioLabPrompt(request)});
  const changedOutput = structuredClone(good); changedOutput.results.baseline.rows[0].meanWeightKg += 0.1;
  await assert.rejects(validateScenarioLabArchive(changedOutput), /result digest/);
  const changedInput = structuredClone(good); changedInput.manifest.initialSnapshot.animals[0].name = 'Changed animal';
  await assert.rejects(validateScenarioLabArchive(changedInput), /manifest digest/);
  const changedProvenance = structuredClone(good); changedProvenance.provenance.executor = 'unregistered-runner';
  await assert.rejects(validateScenarioLabArchive(changedProvenance), /provenance/);
  const mismatchedIntent = interpretScenarioLabPrompt(request.replace('3 cattle', '4 cattle'));
  await assert.rejects(createScenarioLabArchive({manifest, results, sourcePrompt: request, intent: mismatchedIntent}), /intent does not match/);
  await assert.rejects(createScenarioLabArchive({manifest, results, executedManifestSha256: '0'.repeat(64)}), /Worker execution digest does not match/);
});

test('replaying an exported scenario set produces canonically identical numeric outputs', async () => {
  const manifest = scenarioSet();
  const first = replayScenarioSetManifest(manifest);
  const archive = await createScenarioLabArchive({manifest, results: first});
  const recovered = await validateScenarioLabArchive(JSON.parse(JSON.stringify(archive)));
  const repeated = replayScenarioSetManifest(recovered.manifest);
  assert.equal(canonicalScenarioLabJson(repeated), canonicalScenarioLabJson(archive.results));
});
