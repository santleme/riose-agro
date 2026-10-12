import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BR_CORTE_PASTURE_DMI_MODEL} from '../scientific/br_corte_dmi_adapter.js';
import {BR_CORTE_PASTURE_DMI_IMPLEMENTATION_SOURCE} from '../scientific/br_corte_pasture_dmi.js';
import {resolveScientificModel, runRegisteredScientificModel} from '../scientific/model-contract.js';
import {FarmEngine, compare, createComparisonManifest} from '../src/client/engine.js';
import {renderSimulationReport} from '../src/client/simulation-report.js';
import {createRunRecord, runCompatibility} from '../src/client/run-history.js';

test('resolves an exact registered scientific model ID and version', () => {
  assert.equal(resolveScientificModel(BR_CORTE_PASTURE_DMI_MODEL.id, '2023'), BR_CORTE_PASTURE_DMI_MODEL);
  assert.throws(() => resolveScientificModel(BR_CORTE_PASTURE_DMI_MODEL.id, '2024'), /Unknown scientific model version/);
  assert.throws(() => resolveScientificModel('unregistered-model', '2023'), /Unknown scientific model version/);
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
  assert.equal(withProvenance.result.scientificProvenance[0].version, '2023');
  assert.equal(withProvenance.manifest.version, 1);
});
