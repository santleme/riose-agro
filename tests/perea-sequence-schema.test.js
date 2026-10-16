import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

test('semi-Markov research sequence is versioned, sourced, and schema-valid', () => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/perea-behavior-sequence-v1.schema.json', import.meta.url), 'utf8'));
  const record = JSON.parse(execFileSync('python3', ['scripts/science/behavior/emit_perea_semimarkov_fixture.py'], {encoding: 'utf8'}));
  const ajv = new Ajv2020({allErrors: true, strict: true});
  const validate = ajv.compile(schema);

  assert.equal(validate(record), true, JSON.stringify(validate.errors));
  assert.equal(record.candidate.status, 'research_only');
  assert.equal(record.generatedMinutes, record.observations.length);
  assert.equal(record.requestedMinutes, record.generatedMinutes);
  assert.ok(record.training.animalIds.every(id => !['AH:2008', 'BH:5111', 'BR:8065', 'RC:35'].includes(id)));

  const invalid = structuredClone(record);
  invalid.observations[0].behavior = 'drinking';
  assert.equal(validate(invalid), false);
});
