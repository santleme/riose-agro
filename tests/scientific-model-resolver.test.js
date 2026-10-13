import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BR_CORTE_PASTURE_DMI_MODEL} from '../scientific/br_corte_dmi_adapter.js';
import {BR_CORTE_PASTURE_DMI_IMPLEMENTATION_SOURCE} from '../scientific/br_corte_pasture_dmi.js';
import {defineScientificModel, registerScientificModel, resolveScientificModel, runRegisteredScientificModel} from '../scientific/model-contract.js';
import {FarmEngine, compare, createComparisonManifest} from '../src/client/engine.js';
import {renderSimulationReport} from '../src/client/simulation-report.js';
import {createRunRecord, getRun, recordRun, runCompatibility} from '../src/client/run-history.js';

test('resolves an exact registered scientific model ID and version', () => {
  assert.equal(resolveScientificModel(BR_CORTE_PASTURE_DMI_MODEL.id, '2023'), BR_CORTE_PASTURE_DMI_MODEL);
  assert.throws(() => resolveScientificModel(BR_CORTE_PASTURE_DMI_MODEL.id, '2024'), /Unknown scientific model version/);
  assert.throws(() => resolveScientificModel('unregistered-model', '2023'), /Unknown scientific model version/);
  assert.throws(() => runRegisteredScientificModel({
    id: BR_CORTE_PASTURE_DMI_MODEL.id,
    version: '2024',
    inputs: {bodyWeightKg: 330, adgKgPerDay: 0.5, supplementKgDMPerDay: 1.6}
  }), /Unknown scientific model version/);
});

test('registry rejects model-shaped objects that bypass immutable contract validation', () => {
  const id = 'issue-93-unvalidated-registration';
  const forged = {
    interfaceVersion: 1,
    id,
    version: '1',
    inputs: {value: 'number'},
    outputs: {value: 'number'},
    units: {},
    evidence: {},
    implementationSource: 'return {value}',
    run: ({value}) => ({value})
  };

  assert.throws(() => registerScientificModel(forged), /not created by defineScientificModel/);
  forged.id = 'mutated-after-rejection';
  assert.throws(() => resolveScientificModel(id, '1'), /Unknown scientific model version/);
});

test('registering a newer version never changes the selected calculation or its provenance', () => {
  const id = 'issue-93-version-selection-regression';
  const defineVersion = (version, multiplier) => defineScientificModel({
    id,
    version,
    inputs: {value: 'number'},
    outputs: {value: 'number'},
    units: {value: 'kg'},
    evidence: {status: 'observed', source: `dataset-${version}`, validationNote: `independent-${version}`},
    implementationSource: `return value * ${multiplier}`,
    run: ({value}) => ({value: value * multiplier})
  });
  const v1 = registerScientificModel(defineVersion('1.0.0', 2));
  const original = runRegisteredScientificModel({id, version: '1.0.0', inputs: {value: 3}});
  const v2 = registerScientificModel(defineVersion('2.0.0', 3));
  const newer = runRegisteredScientificModel({id, version: '2.0.0', inputs: {value: 3}});

  assert.equal(resolveScientificModel(id, '1.0.0'), v1);
  assert.equal(resolveScientificModel(id, '2.0.0'), v2);
  assert.deepEqual(original.outputs, {value: 6});
  assert.equal(original.provenance.version, '1.0.0');
  assert.equal(original.provenance.evidenceStatus, 'observed');
  assert.deepEqual(original.provenance.evidenceReferences, [
    {id: 'dataset-1.0.0', locator: 'dataset-1.0.0', status: 'observed'}
  ]);
  assert.equal(newer.outputs.value, 9);
  assert.equal(newer.provenance.version, '2.0.0');
});

test('model IDs and versions remain exact even when they contain the registry delimiter', () => {
  const first = registerScientificModel(defineScientificModel({
    id: 'issue-93-pair@first',
    version: 'version',
    inputs: {value: 'number'},
    outputs: {value: 'number'},
    evidence: {status: 'demonstrative'},
    run: ({value}) => ({value: value + 1})
  }));
  const second = registerScientificModel(defineScientificModel({
    id: 'issue-93-pair',
    version: 'first@version',
    inputs: {value: 'number'},
    outputs: {value: 'number'},
    evidence: {status: 'observed'},
    run: ({value}) => ({value: value + 2})
  }));

  assert.equal(resolveScientificModel(first.id, first.version), first);
  assert.equal(resolveScientificModel(second.id, second.version), second);
  assert.equal(runRegisteredScientificModel({id: first.id, version: first.version, inputs: {value: 5}}).outputs.value, 6);
  assert.equal(runRegisteredScientificModel({id: second.id, version: second.version, inputs: {value: 5}}).outputs.value, 7);
});

test('calculation provenance preserves evidence status and does not invent absent references', () => {
  for (const status of ['demonstrative', 'observed', 'verified']) {
    const id = `issue-93-evidence-status-${status}`;
    registerScientificModel(defineScientificModel({
      id,
      version: '1',
      inputs: {value: 'number'},
      outputs: {value: 'number'},
      evidence: {status, validationNote: 'retained in the calculation result'},
      run: ({value}) => ({value})
    }));
    const result = runRegisteredScientificModel({id, version: '1', inputs: {value: 7}});

    assert.deepEqual(result.outputs, {value: 7});
    assert.equal(result.provenance.evidenceStatus, status);
    assert.deepEqual(result.provenance.evidenceReferences, []);
    assert.deepEqual(result.evidence, {status, validationNote: 'retained in the calculation result'});
    assert.deepEqual(result.scientificProvenance, [result.provenance]);
  }
});

test('registered model result records exact inputs, units, evidence status and implementation hash', () => {
  const inputs = {bodyWeightKg: 330, adgKgPerDay: 0.5, supplementKgDMPerDay: 1.6};
  const result = runRegisteredScientificModel({id: BR_CORTE_PASTURE_DMI_MODEL.id, version: '2023', inputs});
  const {provenance} = result;

  assert.equal(provenance.modelId, BR_CORTE_PASTURE_DMI_MODEL.id);
  assert.equal(provenance.version, '2023');
  assert.deepEqual(provenance.inputs.bodyWeightKg, {value: 330, unit: 'kg'});
  assert.deepEqual(provenance.inputs.adgKgPerDay, {value: 0.5, unit: 'kg/day'});
  assert.deepEqual(provenance.inputs.supplementKgDMPerDay, {value: 1.6, unit: 'kg DM/day'});
  assert.deepEqual(provenance.evidenceReferences, [{id: BR_CORTE_PASTURE_DMI_MODEL.evidence.source, locator: BR_CORTE_PASTURE_DMI_MODEL.evidence.source, status: 'demonstrative'}]);
  assert.equal(provenance.evidenceStatus, 'demonstrative');
  assert.equal(provenance.implementationHash, `sha256:${createHash('sha256').update(BR_CORTE_PASTURE_DMI_IMPLEMENTATION_SOURCE).digest('hex')}`);
  assert.notEqual(provenance.implementationHash, `sha256:${createHash('sha256').update(BR_CORTE_PASTURE_DMI_MODEL.run.toString()).digest('hex')}`);
  assert.match(BR_CORTE_PASTURE_DMI_IMPLEMENTATION_SOURCE, /const finite =/);
  assert.match(BR_CORTE_PASTURE_DMI_IMPLEMENTATION_SOURCE, /validatedDomain/);
  assert.deepEqual(result.scientificProvenance, [provenance]);
});

test('registered provenance snapshots nested inputs before model code and caller mutations', () => {
  const id = 'issue-93-input-snapshot';
  registerScientificModel(defineScientificModel({
    id,
    version: '1',
    inputs: {settings: 'object'},
    outputs: {value: 'number'},
    units: {settings: 'configuration'},
    evidence: {status: 'demonstrative'},
    run: ({settings}) => {
      settings.thresholds[0] = 99;
      settings.enabled = false;
      return {value: settings.thresholds[0]};
    }
  }));
  const inputs = {settings: {thresholds: [3, 5], enabled: true}};
  const result = runRegisteredScientificModel({id, version: '1', inputs});
  const captured = result.provenance.inputs.settings.value;

  assert.deepEqual(captured, {thresholds: [3, 5], enabled: true});
  assert.throws(() => { captured.thresholds[0] = 7; }, TypeError);
  assert.throws(() => { captured.enabled = false; }, TypeError);
  inputs.settings.thresholds[1] = 100;
  inputs.settings.enabled = false;
  assert.deepEqual(result.provenance.inputs.settings, {
    value: {thresholds: [3, 5], enabled: true},
    unit: 'configuration'
  });
});

test('report renders optional scientific provenance and keeps legacy reports readable', () => {
  const snapshot = new FarmEngine(42, 2).snapshot();
  const manifest = createComparisonManifest(snapshot, 1);
  const result = compare(snapshot, 1);
  const legacy = renderSimulationReport(result, manifest);
  assert.doesNotMatch(legacy, /Proveniência de modelos científicos/);

  const modelResult = runRegisteredScientificModel({
    id: BR_CORTE_PASTURE_DMI_MODEL.id,
    version: '2023',
    inputs: {bodyWeightKg: 330, adgKgPerDay: 0.5, supplementKgDMPerDay: 1.6}
  });
  const report = renderSimulationReport({...result, scientificProvenance: modelResult.scientificProvenance}, manifest);
  assert.match(report, /br-corte-2023-eq-2\.6@2023/);
  assert.match(report, /bodyWeightKg=330 kg/);
  assert.match(report, /published-equation|https:\/\/brcorte\.com\.br/);
  assert.match(report, /estado: demonstrative/);
  assert.match(report, /sha256:[a-f0-9]{64}/);
  assert.match(report, /não promove evidência nem valida o modelo/);
});

test('old replay manifests remain compatible and new reports retain their selected model version', () => {
  const snapshot = new FarmEngine(42, 2).snapshot();
  const manifest = createComparisonManifest(snapshot, 1);
  const comparison = compare(snapshot, 1);
  const legacy = createRunRecord({manifest, result: comparison, now: 1, id: 'legacy-run'});
  assert.equal(runCompatibility(legacy).supported, true);
  assert.equal(legacy.result.scientificProvenance, undefined);

  const scientific = runRegisteredScientificModel({
    id: BR_CORTE_PASTURE_DMI_MODEL.id,
    version: '2023',
    inputs: {bodyWeightKg: 330, adgKgPerDay: 0.5, supplementKgDMPerDay: 1.6}
  });
  const withProvenance = createRunRecord({
    manifest,
    result: {...comparison, scientificProvenance: scientific.scientificProvenance},
    now: 2,
    id: 'model-run'
  });
  assert.equal(runCompatibility(withProvenance).supported, true);
  const savedProvenance = withProvenance.result.scientificProvenance[0];
  assert.equal(savedProvenance.modelId, BR_CORTE_PASTURE_DMI_MODEL.id);
  assert.equal(savedProvenance.version, '2023');
  assert.deepEqual(savedProvenance.inputs, scientific.provenance.inputs);
  assert.deepEqual(savedProvenance.evidenceReferences, scientific.provenance.evidenceReferences);
  assert.equal(savedProvenance.evidenceStatus, scientific.provenance.evidenceStatus);
  assert.equal(savedProvenance.implementationHash, scientific.provenance.implementationHash);
  assert.equal(withProvenance.manifest.version, 1);

  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value))};
  recordRun(withProvenance, storage);
  const reopened = getRun('model-run', storage);
  assert.deepEqual(reopened.result.scientificProvenance, scientific.scientificProvenance);
  assert.equal(reopened.result.scientificProvenance[0].version, '2023');
});
