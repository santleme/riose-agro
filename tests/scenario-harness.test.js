import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {executeScenario, runScenarioDirectory, validateScenario} from '../scripts/experiments/run-scenarios.js';

const fixturePath = fileURLToPath(new URL('./scenarios/baseline-pasture.json', import.meta.url));
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

test('valid scenario fixture runs and its assertions pass', () => {
  assert.deepEqual(validateScenario(fixture), {valid: true, errors: []});
  const result = executeScenario(fixture);
  assert.equal(result.passed, true);
  assert.equal(result.assertions.length, 3);
  assert.ok(result.result.state);
  assert.ok(result.result.metrics.weight > 300);
});

test('invalid and missing scenarios return readable validation failures', () => {
  const invalid = executeScenario({...fixture, engine: {...fixture.engine, animalCount: 0}});
  const missing = executeScenario(undefined);

  assert.equal(invalid.passed, false);
  assert.match(invalid.errors.join('\n'), /animalCount/);
  assert.equal(missing.passed, false);
  assert.ok(missing.errors.length > 0);
});

test('failed assertions are captured in the result without throwing', () => {
  const result = executeScenario({...fixture, assertions: [
    {path: '/metrics/weight', operator: 'greaterThan', value: 1000},
  ]});

  assert.equal(result.passed, false);
  assert.equal(result.assertions[0].passed, false);
  assert.match(result.errors[0], /Expected \/metrics\/weight greaterThan 1000/);
  assert.ok(result.result.state);
});

test('JSON Pointer assertions cannot read inherited properties', () => {
  const result = executeScenario({...fixture, assertions: [
    {path: '/state/config/constructor/name', operator: 'equals', value: 'Object'},
  ]});

  assert.equal(result.passed, false);
  assert.equal(result.assertions[0].actual, null);
});

test('the same scenario produces an identical result on every run', () => {
  assert.deepEqual(executeScenario(fixture), executeScenario(JSON.parse(JSON.stringify(fixture))));
});

test('malformed scenarios fail in isolation and each case writes a result file', async t => {
  const root = await mkdtemp(join(tmpdir(), 'riose-scenarios-'));
  const scenarioDirectory = join(root, 'scenarios');
  const resultDirectory = join(root, 'results');
  await mkdir(scenarioDirectory);
  await writeFile(join(scenarioDirectory, 'a-malformed.json'), '{');
  await writeFile(join(scenarioDirectory, 'b-valid.json'), JSON.stringify(fixture));
  t.after(() => rm(root, {recursive: true, force: true}));

  const results = await runScenarioDirectory(scenarioDirectory, resultDirectory);
  assert.deepEqual(results.map(result => [result.file, result.passed]), [
    ['a-malformed.json', false],
    ['b-valid.json', true],
  ]);
  assert.match(results[0].errors[0], /a-malformed\.json/);
  assert.equal(JSON.parse(await readFile(join(resultDirectory, 'a-malformed.result.json'), 'utf8')).passed, false);
  assert.equal(JSON.parse(await readFile(join(resultDirectory, 'b-valid.result.json'), 'utf8')).passed, true);
});

test('result files are ignored when fixture and result directories are the same', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'riose-scenarios-in-place-'));
  await writeFile(join(directory, 'baseline.json'), JSON.stringify(fixture));
  t.after(() => rm(directory, {recursive: true, force: true}));

  const first = await runScenarioDirectory(directory, directory);
  const second = await runScenarioDirectory(directory, directory);

  assert.deepEqual(first.map(result => [result.file, result.passed]), [['baseline.json', true]]);
  assert.deepEqual(second.map(result => [result.file, result.passed]), [['baseline.json', true]]);
  assert.equal(JSON.parse(await readFile(join(directory, 'baseline.result.json'), 'utf8')).passed, true);
  await assert.rejects(readFile(join(directory, 'baseline.result.result.json')));
});
