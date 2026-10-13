import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FarmEngine} from '../src/client/engine.js';
import {BR_CORTE_PASTURE_DMI_MODEL} from '../scientific/br_corte_dmi_adapter.js';
import {defineScientificModel, runRegisteredScientificModel, runScientificModel, SCIENTIFIC_MODEL_INTERFACE_VERSION} from '../scientific/model-contract.js';

const numericReferences = JSON.parse(readFileSync(new URL('./fixtures/scientific-numeric-reference-v1.json', import.meta.url), 'utf8'));
const table214 = numericReferences.fixtures.brCorte2023Eq26Table214;

test('scientific adapter satisfies the common contract and exposes its version and evidence', () => {
  assert.equal(BR_CORTE_PASTURE_DMI_MODEL.interfaceVersion, SCIENTIFIC_MODEL_INTERFACE_VERSION);
  assert.equal(BR_CORTE_PASTURE_DMI_MODEL.version, '2023');
  assert.equal(BR_CORTE_PASTURE_DMI_MODEL.inputs.bodyWeightKg, 'number');
  assert.equal(BR_CORTE_PASTURE_DMI_MODEL.outputs.totalDmiKgDMPerDay, 'number');
  assert.equal(BR_CORTE_PASTURE_DMI_MODEL.evidence.source, 'https://brcorte.com.br/assets/book2023/br/02.pdf');
});

test('scientific model accepts valid inputs and returns contract-shaped outputs', () => {
  const result = runScientificModel(BR_CORTE_PASTURE_DMI_MODEL, {
    bodyWeightKg: 330,
    adgKgPerDay: 0.5,
    supplementKgDMPerDay: 1.6
  });

  assert.equal(result.modelId, 'br-corte-2023-eq-2.6');
  assert.equal(result.version, '2023');
  assert.equal(typeof result.outputs.totalDmiKgDMPerDay, 'number');
  assert.equal(typeof result.outputs.inValidatedDomain, 'boolean');
  assert.equal(result.evidence.evidenceType, 'published-equation-with-independent-validation-ranges');
});

test('BR-CORTE scientific adapter preserves reference units and the published reference result', () => {
  assert.equal(BR_CORTE_PASTURE_DMI_MODEL.units.bodyWeightKg, table214.inputs.bodyWeightKg.unit);
  assert.equal(BR_CORTE_PASTURE_DMI_MODEL.units.adgKgPerDay, table214.inputs.adgKgPerDay.unit);
  assert.equal(BR_CORTE_PASTURE_DMI_MODEL.units.supplementKgDMPerDay, table214.inputs.supplementKgDMPerDay.unit);
  const result = runScientificModel(BR_CORTE_PASTURE_DMI_MODEL, {
    bodyWeightKg: table214.inputs.bodyWeightKg.value,
    adgKgPerDay: table214.inputs.adgKgPerDay.value,
    supplementKgDMPerDay: table214.inputs.supplementKgDMPerDay.value
  });
  assert.ok(Math.abs(result.outputs.totalDmiKgDMPerDay - table214.expected.calculatedTotalDmiKgDMPerDay) < 1e-12);
  assert.equal(result.outputs.inValidatedDomain, true);
});

test('registered model lookup records immutable ID/version/input/evidence/hash provenance', () => {
  const inputs = {
    bodyWeightKg: table214.inputs.bodyWeightKg.value,
    adgKgPerDay: table214.inputs.adgKgPerDay.value,
    supplementKgDMPerDay: table214.inputs.supplementKgDMPerDay.value
  };
  const result = runRegisteredScientificModel({id: BR_CORTE_PASTURE_DMI_MODEL.id, version: BR_CORTE_PASTURE_DMI_MODEL.version, inputs});
  const provenance = result.provenance;

  assert.equal(provenance.modelId, 'br-corte-2023-eq-2.6');
  assert.equal(provenance.version, '2023');
  assert.deepEqual(provenance.inputs, {
    bodyWeightKg: {value: 400, unit: 'kg'},
    adgKgPerDay: {value: 0.5, unit: 'kg/day'},
    supplementKgDMPerDay: {value: 1.6, unit: 'kg DM/day'}
  });
  assert.deepEqual(provenance.evidenceReferences, [{
    id: 'https://brcorte.com.br/assets/book2023/br/02.pdf',
    locator: 'https://brcorte.com.br/assets/book2023/br/02.pdf',
    status: 'demonstrative'
  }]);
  assert.equal(provenance.evidenceStatus, 'demonstrative');
  assert.match(provenance.implementationHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(result.scientificProvenance, [provenance]);
  assert.throws(() => runRegisteredScientificModel({id: BR_CORTE_PASTURE_DMI_MODEL.id, version: 'unknown', inputs}), /Unknown scientific model version/);
});

test('nested evidence metadata cannot mutate model configuration between runs', () => {
  const result = runScientificModel(BR_CORTE_PASTURE_DMI_MODEL, {
    bodyWeightKg: 330,
    adgKgPerDay: 0.5,
    supplementKgDMPerDay: 1.6
  });

  assert.throws(() => { result.evidence.validationRanges.bodyWeightKg[0] = 400; }, TypeError);
  assert.equal(runScientificModel(BR_CORTE_PASTURE_DMI_MODEL, {
    bodyWeightKg: 330,
    adgKgPerDay: 0.5,
    supplementKgDMPerDay: 1.6
  }).outputs.inValidatedDomain, true);
});

test('scientific model reports missing and invalid inputs clearly', () => {
  assert.throws(
    () => runScientificModel(BR_CORTE_PASTURE_DMI_MODEL, {bodyWeightKg: 330}),
    /inputs\.adgKgPerDay is required/
  );
  assert.throws(
    () => runScientificModel(BR_CORTE_PASTURE_DMI_MODEL, {
      bodyWeightKg: '330',
      adgKgPerDay: 0.5,
      supplementKgDMPerDay: 1.6
    }),
    /inputs\.bodyWeightKg must be number/
  );
  assert.throws(
    () => runScientificModel(BR_CORTE_PASTURE_DMI_MODEL, {
      bodyWeightKg: 0,
      adgKgPerDay: 0.5,
      supplementKgDMPerDay: 1.6
    }),
    /bodyWeightKg must be greater than zero/
  );
});

test('scientific model rejects missing versions, unsupported interface versions, and outputs that break the contract', () => {
  assert.throws(() => defineScientificModel({
    id: 'missing-version', inputs: {value: 'number'}, outputs: {value: 'number'}, evidence: {}, run: value => value
  }), /version must be a non-empty string/);
  assert.throws(() => runScientificModel({...BR_CORTE_PASTURE_DMI_MODEL, interfaceVersion: 2}, {}), /Unsupported scientific model interface version/);

  const brokenOutputModel = defineScientificModel({
    id: 'broken-output', version: '1', inputs: {value: 'number'}, outputs: {value: 'number'}, evidence: {}, run: () => ({value: 'not a number'})
  });
  assert.throws(() => runScientificModel(brokenOutputModel, {value: 1}), /outputs\.value must be number/);
});

test('legacy engine still runs without scientific modules or new configuration', () => {
  const engine = new FarmEngine(2026, 2);
  const snapshot = engine.tick(1);

  assert.equal(snapshot.animals.length, 2);
  assert.equal(snapshot.hour, 7);
  assert.equal(engine.metrics().weight > 0, true);
});
