import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBehaviorComponentMessage} from '../src/server/behavior-component-contract.js';
const provenance = [{kind: 'model', id: 'engine-demo-v1', uri: 'docs/architecture/behavioral-agent-components.md', sha256: 'a'.repeat(64)}];
const base = {
  implementation: {id: 'fixture', version: '1.0.0', evidenceStatus: 'demonstrative', domain: 'schema fixture only'},
  population: {populationId: 'cohort-fixture', animalId: 'animal-01'},
  time: {start: '2026-10-15T06:00:00Z', end: '2026-10-15T06:10:00Z', timeZone: 'UTC', offsetStatus: 'explicit', basis: 'model_step'},
  provenance,
  limitations: ['Software contract fixture; not a biological result.'],
};

const validMessages = [
  {
    ...base, interfaceVersion: 'riose.behavior-policy/v1', componentId: 'behavior-policy',
    ontology: {id: 'fixture-activity/v1', version: '1', labels: ['grazing', 'resting']}, seed: 4,
    sequence: [{activity: 'grazing', durationMinutes: 8}, {activity: 'resting', durationMinutes: 2}],
  },
  {
    ...base, interfaceVersion: 'riose.physiological-state/v1', componentId: 'physiological-state',
    fields: [{id: 'energy', value: null, unit: 'unspecified', status: 'not_available', origin: 'not computed'}],
  },
  {
    implementation: base.implementation, interfaceVersion: 'riose.environment-snapshot/v1', componentId: 'environment', populationId: 'cohort-fixture',
    time: base.time, provenance: base.provenance, limitations: base.limitations,
    values: [{id: 'air_temperature', value: 30, unit: 'degC', status: 'observed', origin: 'weather station fixture'}],
  },
  {
    ...base, interfaceVersion: 'riose.observation-model/v1', componentId: 'observation-model',
    stage: 'human_annotated', ontology: {id: 'fixture-activity/v1', version: '1', labels: ['grazing', 'resting']},
    records: [{timestamp: '2026-10-15T06:00:00Z', label: 'grazing', status: 'annotated'}],
  },
  {
    implementation: base.implementation, interfaceVersion: 'riose.intervention-effect/v1', componentId: 'intervention-model',
    provenance: base.provenance, limitations: base.limitations,
    population: {populationId: 'cohort-fixture', description: 'Fixture cohort'}, interventionId: 'supplement-A', comparatorId: 'control',
    outcome: {id: 'adg', unit: 'kg/day', timeHorizon: '30 days'}, design: 'none available', effectStatus: 'unsupported', effect: null,
  },
];

test('each of the five scientific component envelopes validates at v1', () => {
  for (const [index, message] of validMessages.entries()) {
    const result = validateBehaviorComponentMessage(message);
    assert.equal(result.valid, true, `fixture ${index}: ${JSON.stringify(result.errors)}`);
  }
});

test('version mismatch, missing provenance and values disguised as unavailable are rejected', () => {
  const [behavior, physiology] = validMessages;
  assert.equal(validateBehaviorComponentMessage({...behavior, interfaceVersion: 'riose.behavior-policy/v2'}).valid, false);
  assert.equal(validateBehaviorComponentMessage({...behavior, provenance: []}).valid, false);
  const invalidState = structuredClone(physiology);
  invalidState.fields[0].value = 12;
  assert.equal(validateBehaviorComponentMessage(invalidState).valid, false);
});

test('unsupported intervention output cannot contain a numeric effect', () => {
  const unsupported = structuredClone(validMessages[4]);
  unsupported.effect = {estimate: 0.2, unit: 'kg/day', methodId: 'unvalidated'};
  assert.equal(validateBehaviorComponentMessage(unsupported).valid, false);
  const supported = validateBehaviorComponentMessage({...unsupported, effectStatus: 'supported'});
  assert.equal(supported.valid, true, JSON.stringify(supported.errors));
});

test('a behavior sequence cannot invent an activity outside its declared ontology', () => {
  const message = structuredClone(validMessages[0]);
  message.sequence[0].activity = 'feeding';
  assert.equal(validateBehaviorComponentMessage(message).valid, false);
});

test('an observation with unknown UTC offset preserves local wall-clock time without conversion', () => {
  const message = structuredClone(validMessages[3]);
  message.time = {start: '2022-11-21T07:35', end: '2022-11-21T07:36', timeZone: 'America/Denver', offsetStatus: 'unknown', basis: 'observed_clock'};
  message.records[0].timestamp = '2022-11-21T07:35';
  assert.equal(validateBehaviorComponentMessage(message).valid, true);
  message.records[0].timestamp += 'Z';
  assert.equal(validateBehaviorComponentMessage(message).valid, false);
});
