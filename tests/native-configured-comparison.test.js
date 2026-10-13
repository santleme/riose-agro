import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {compareConfiguredScenarios} from '../src/client/engine.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/configured-comparison-v2-parity.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../schemas/configured-comparison-request-v2.schema.json', import.meta.url), 'utf8'));

function assertEquivalent(actual, expected, tolerance, path = '$') {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', `${path} must be numeric`);
    assert.ok(Math.abs(actual - expected) <= tolerance, `${path}: ${actual} differs from ${expected}`);
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} must be an array`);
    assert.equal(actual.length, expected.length, `${path} length`);
    expected.forEach((value, index) => assertEquivalent(actual[index], value, tolerance, `${path}[${index}]`));
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path} keys`);
    for (const [key, value] of Object.entries(expected)) assertEquivalent(actual[key], value, tolerance, `${path}.${key}`);
  } else {
    assert.equal(actual, expected, path);
  }
}

test('configured comparison v2 schema requires a strict complete request', () => {
  const validate = new Ajv2020({allErrors: true}).compile(schema);
  const sample = fixture.cases[0];
  const request = {
    type: 'configured-comparison', version: 2, snapshot: fixture.snapshot, days: sample.days,
    referenceConfig: sample.referenceConfig, scenarioConfig: sample.scenarioConfig
  };
  assert.equal(validate(request), true);
  for (const invalid of [
    {...request, version: 1},
    {...request, unused: true},
    {...request, days: 0},
    {...request, referenceConfig: {...sample.referenceConfig, supplement: undefined}},
    {...request, scenarioConfig: {...sample.scenarioConfig, weather: 'storm'}}
  ]) assert.equal(validate(invalid), false);
});

test('frozen JS reference vectors cover all one-factor configured comparison arms', () => {
  assert.equal(fixture.sourceImplementation, 'src/client/engine.js#compareConfiguredScenarios');
  assert.deepEqual(fixture.cases.map(({factor}) => factor), ['diet', 'housing', 'weather', 'supplement']);
  for (const vector of fixture.cases) {
    const actual = compareConfiguredScenarios(fixture.snapshot, {
      days: vector.days,
      referenceConfig: vector.referenceConfig,
      scenarioConfig: vector.scenarioConfig
    });
    assertEquivalent(actual, vector.expected, fixture.comparisonTolerance, vector.id);
  }
});
