import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {createBrCorteSensitivityManifest, evaluateBrCorteSensitivityManifest, validateBrCorteSensitivityManifest} from '../src/client/br-corte-sensitivity.js';

const reference = JSON.parse(readFileSync(new URL('./fixtures/scientific-numeric-reference-v1.json', import.meta.url), 'utf8')).fixtures.brCorte2023Eq26Table214;
const schema = JSON.parse(readFileSync(new URL('../schemas/br-corte-dmi-sensitivity-request-v1.schema.json', import.meta.url), 'utf8'));
const base = {
  bodyWeightKg: 400,
  adgKgPerDay: 0.5,
  animalCount: 200,
  durationDays: 30,
  minimumSupplementKgDMPerHeadPerDay: 1.4,
  maximumSupplementKgDMPerHeadPerDay: 1.8,
  stepKgDMPerHeadPerDay: 0.2,
};

test('reviewed sensitivity manifest uses the exact model input, units, and bounded interval', () => {
  const manifest = createBrCorteSensitivityManifest(base);
  assert.equal(validateBrCorteSensitivityManifest(manifest), true);
  assert.equal(manifest.type, 'riose-br-corte-dmi-sensitivity');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.model.id, 'br-corte-2023-eq-2.6');
  assert.equal(manifest.inputs.sweep.input, 'supplementKgDMPerDay');
  assert.equal(manifest.inputs.sweep.unit, 'kg DM/head/day');
  assert.deepEqual(manifest.inputs.sweep.values, [1.4, 1.6, 1.8]);
  assert.equal(new Ajv2020({allErrors: true}).validate(schema, manifest), true);
});

test('sensitivity rows come from registered Eq. 2.6 and preserve fixed inputs and units', () => {
  const result = evaluateBrCorteSensitivityManifest(createBrCorteSensitivityManifest(base));
  const referenceIndex = result.rows.findIndex(row => row.supplementKgDMPerHeadPerDay === reference.inputs.supplementKgDMPerDay.value);
  assert.notEqual(referenceIndex, -1);
  assert.ok(Math.abs(result.rows[referenceIndex].totalDmiKgDMPerHeadPerDay - reference.expected.calculatedTotalDmiKgDMPerDay) < 1e-12);
  assert.ok(result.rows.every(row => row.bodyWeightKg === 400 && row.adgKgPerDay === 0.5 && row.inPublishedInputRange));
  assert.ok(result.rows.every(row => row.provenance.modelId === result.model.id && /^sha256:[a-f0-9]{64}$/.test(row.provenance.implementationHash)));
  assert.equal(result.localSensitivity.derivative, 0.7732);
  assert.ok(Math.abs((result.rows[2].totalDmiKgDMPerHeadPerDay - result.rows[0].totalDmiKgDMPerHeadPerDay) / 0.4 - result.localSensitivity.derivative) < 1e-12);
  assert.equal(result.localSensitivity.unit, '(kg DM/head/day output)/(kg DM/head/day input)');
  assert.match(result.interpretation, /not a causal effect/);
  assert.equal(result.validated, false);
});

test('sensitivity population totals and optional supplement costs are transparent arithmetic', () => {
  const result = evaluateBrCorteSensitivityManifest(createBrCorteSensitivityManifest({...base, supplementPricePerKgDM: 4, currency: 'BRL'}));
  const row = result.rows[1];
  assert.equal(row.supplementKgDM, 1.6 * 200 * 30);
  assert.equal(row.supplementCost, 1.6 * 200 * 30 * 4);
  assert.equal(row.currency, 'BRL');
  assert.ok(Math.abs(row.herdTotalDmiKgDM - row.totalDmiKgDMPerHeadPerDay * 200 * 30) < 1e-8);
  const withoutCost = evaluateBrCorteSensitivityManifest(createBrCorteSensitivityManifest(base));
  assert.ok(withoutCost.rows.every(item => item.supplementCost === null && item.currency === null));
});

test('sensitivity sweep is deterministic and records no prediction interval', () => {
  const manifest = createBrCorteSensitivityManifest(base);
  const first = evaluateBrCorteSensitivityManifest(manifest);
  const second = evaluateBrCorteSensitivityManifest(manifest);
  assert.deepEqual(first, second);
  assert.equal(first.predictionInterval, null);
  assert.equal(first.rows[0].deltaFromMinimumKgDMPerHeadPerDay, 0);
});

test('sensitivity validation rejects unsupported fields, out-of-domain ranges, and invalid increments', () => {
  const manifest = createBrCorteSensitivityManifest(base);
  assert.throws(() => createBrCorteSensitivityManifest({...base, unused: true}), /only/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, bodyWeightKg: 500}), /bodyWeightKg/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, adgKgPerDay: 1.5}), /adgKgPerDay/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, minimumSupplementKgDMPerHeadPerDay: -0.01}), /published/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, maximumSupplementKgDMPerHeadPerDay: 5.33}), /published/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, stepKgDMPerHeadPerDay: 0}), /step/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, stepKgDMPerHeadPerDay: 0.3}), /divide the interval/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, minimumSupplementKgDMPerHeadPerDay: 0, maximumSupplementKgDMPerHeadPerDay: 5, stepKgDMPerHeadPerDay: 0.04}), /101 points/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, minimumSupplementKgDMPerHeadPerDay: 1.6, maximumSupplementKgDMPerHeadPerDay: 1.6}), /greater than minimum/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, currency: 'BRL'}), /currency/);
  assert.throws(() => createBrCorteSensitivityManifest({...base, supplementPricePerKgDM: 4}), /currency/);
  assert.throws(() => validateBrCorteSensitivityManifest({...manifest, assumptions: {...manifest.assumptions, adg: 'predicted'}}), /assumptions/);
});
