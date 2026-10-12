import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {executeScenario, runScenarioDirectory, validateScenario} from '../scripts/run-scenarios.js';

const validScenario = {
  scenarioId: 'test-pasture',
  engine: {seed: 417, animalCount: 2},
  configuration: {housing: 'pasture'},
  run: {hours: 1},
  assertions: [{path: '/state/hour', operator: 'equals', value: 7}],
};

async function withTempDirectory(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'riose-scenarios-'));
  try {
    await callback(directory);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

test('accepts a valid scenario and rejects missing or unsupported input', () => {
  assert.deepEqual(validateScenario(validScenario), {valid: true, errors: []});

  const invalid = validateScenario({...validScenario, engine: {...validScenario.engine, animalCount: 0}});
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /animalCount|minimum/);
  assert.equal(validateScenario({...validScenario, extra: true}).valid, false);
  assert.equal(validateScenario({...validScenario, assertions: [{path: '/state/hour', operator: 'lessThan', value: 'seven'}]}).valid, false);
});

test('passes scalar and approximate assertions', () => {
  const result = executeScenario({
    ...validScenario,
    assertions: [
      {path: '/state/hour', operator: 'equals', value: 7},
      {path: '/metrics/weight', operator: 'greaterThan', value: 300},
      {path: '/state/hour', operator: 'lessThan', value: 8},
      {path: '/state/hour', operator: 'approximatelyEquals', value: 7, tolerance: 0}
    ],
  });
  assert.equal(result.passed, true);
  assert.equal(result.assertions.length, 4);
});

test('reports a failed assertion with expected and actual values', () => {
  const result = executeScenario({
    ...validScenario,
    assertions: [{path: '/state/hour', operator: 'equals', value: 999}],
  });
  assert.equal(result.passed, false);
  assert.match(result.errors[0], /\/state\/hour equals 999; received 7/);
  assert.equal(result.assertions[0].actual, 7);
});

test('missing JSON Pointer values fail as assertions instead of aborting the scenario', () => {
  const result = executeScenario({
    ...validScenario,
    assertions: [{path: '/state/config/diet/missing', operator: 'equals', value: 1}],
  });
  assert.equal(result.passed, false);
  assert.equal(result.assertions[0].actual, null);
  assert.match(result.errors[0], /received undefined/);
});

test('malformed JSON fails one scenario while other fixtures still run', async () => {
  await withTempDirectory(async root => {
    const scenarios = join(root, 'scenarios');
    const results = join(root, 'results');
    await mkdir(scenarios);
    await writeFile(join(scenarios, 'a-malformed.json'), '{"scenarioId":');
    await writeFile(join(scenarios, 'b-valid.json'), JSON.stringify(validScenario));

    const run = await runScenarioDirectory(scenarios, results);
    assert.equal(run.length, 2);
    assert.equal(run[0].passed, false);
    assert.match(run[0].errors[0], /a-malformed\.json/);
    assert.equal(run[1].passed, true);
    assert.equal(JSON.parse(await readFile(join(results, 'a-malformed.result.json'), 'utf8')).passed, false);
    assert.equal(JSON.parse(await readFile(join(results, 'b-valid.result.json'), 'utf8')).passed, true);
  });
});

test('invalid scenario is isolated and produces a diagnostic result', async () => {
  await withTempDirectory(async root => {
    const scenarios = join(root, 'scenarios');
    const results = join(root, 'results');
    await mkdir(scenarios);
    await writeFile(join(scenarios, 'invalid.json'), JSON.stringify({...validScenario, run: {hours: 0}}));
    await writeFile(join(scenarios, 'valid.json'), JSON.stringify(validScenario));

    const run = await runScenarioDirectory(scenarios, results);
    assert.deepEqual(run.map(item => item.passed), [false, true]);
    assert.match(run[0].errors.join('\n'), /hours|minimum/);
  });
});

test('same scenario input produces byte-identical results', () => {
  const first = executeScenario(validScenario);
  const second = executeScenario(validScenario);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('missing or empty scenario directories fail with a readable message', async () => {
  await withTempDirectory(async root => {
    const missing = join(root, 'missing');
    await assert.rejects(runScenarioDirectory(missing, join(root, 'results')), /Cannot read scenario directory/);

    const empty = join(root, 'empty');
    await mkdir(empty);
    await assert.rejects(runScenarioDirectory(empty, join(root, 'empty-results')), /No scenario JSON files found/);
  });
});
