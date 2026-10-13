import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {replayScenarioContract, validateScenarioContract} from '../src/client/scenario-contract.js';
import {executeScenario} from '../scripts/run-scenarios.js';
import {generateScenarioGolden, generateScenarioGoldenBytes, serializeScenarioGolden} from '../scripts/generate-scenario-goldens.js';

const goldenDirectory = fileURLToPath(new URL('./scenario-goldens/', import.meta.url));
const baselineScenarioPath = fileURLToPath(new URL('./scenarios/baseline-pasture.json', import.meta.url));

async function readGolden(id) {
  return readFile(resolve(goldenDirectory, `${id}.json`), 'utf8');
}

test('baseline fixed-seed output matches the versioned golden and preserves ordering', async () => {
  const scenario = JSON.parse(await readFile(baselineScenarioPath, 'utf8'));
  const goldenBytes = await readGolden('baseline-pasture');
  const golden = JSON.parse(goldenBytes);
  const first = await generateScenarioGoldenBytes('baseline-pasture');
  const second = await generateScenarioGoldenBytes('baseline-pasture');

  assert.equal(golden.format, 'riose-js-scenario-golden');
  assert.equal(golden.formatVersion, 1);
  assert.equal(golden.scenarioId, 'baseline-pasture');
  assert.equal(golden.seed, scenario.engine.seed);
  assert.deepEqual(golden.horizon, {value: 24, unit: 'hour'});
  assert.equal(first, second);
  assert.equal(first, goldenBytes);
  assert.deepEqual(executeScenario(scenario).result, golden.output);
  assert.equal(golden.output.state.seed, golden.output.state.seed >>> 0);
  assert.equal(golden.output.state.initialSeed, scenario.engine.seed);
  assert.ok(Number.isInteger(golden.output.state.locomotionSeed));
  assert.ok(golden.output.state.events.every((event, index, events) => index === 0 || events[index - 1].hour >= event.hour));
  for (const animal of golden.output.state.animals) {
    assert.ok(animal.history.every((item, index, history) => index === 0 || history[index - 1].hour <= item.hour));
  }
});

test('housing comparison golden replays the declared contract and freezes each day in order', async () => {
  const goldenBytes = await readGolden('housing-comparison');
  const golden = JSON.parse(goldenBytes);
  const first = await generateScenarioGoldenBytes('housing-comparison');
  const second = await generateScenarioGoldenBytes('housing-comparison');

  assert.equal(golden.formatVersion, 1);
  assert.equal(golden.scenarioId, 'housing-comparison');
  assert.equal(golden.seed, 2026);
  assert.deepEqual(golden.horizon, {value: 30, unit: 'day'});
  assert.equal(first, second);
  assert.equal(first, goldenBytes);
  assert.equal(validateScenarioContract(golden.replayManifest), true);
  assert.deepEqual(replayScenarioContract(golden.replayManifest), golden.output);
  assert.deepEqual(golden.output.rows.map(row => row.day), Array.from({length: 31}, (_, day) => day));
  assert.equal(golden.output.baselineConfig.housing, 'pasture');
  assert.equal(golden.output.scenarioConfig.housing, 'barn');
  assert.deepEqual(golden.endpoints.baseline.metrics, golden.output.baseline);
  assert.deepEqual(golden.endpoints.scenario.metrics, golden.output.scenario);
  assert.equal(golden.endpoints.baseline.hour, golden.replayManifest.baseline.hour + 30 * 24);
  assert.equal(golden.endpoints.scenario.hour, golden.replayManifest.baseline.hour + 30 * 24);
});

test('golden equality detects meaningful deterministic output drift', async () => {
  const expected = await readGolden('baseline-pasture');
  const changed = JSON.parse(expected);
  changed.output.state.animals[0].weight += 1;

  assert.notEqual(serializeScenarioGolden(changed), expected);
});

test('golden generation refuses unsupported and unregistered presets', async () => {
  for (const id of ['heat', 'reduced-feed', 'limited-trough-access']) {
    await assert.rejects(generateScenarioGolden(id), /unsupported/i);
  }
  await assert.rejects(generateScenarioGolden('not-a-scenario'), /Preset não encontrado/);
});
