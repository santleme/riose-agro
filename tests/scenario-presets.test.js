import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_PRESET_CATALOG_VERSION,SCENARIO_PRESETS,createScenarioPresetSnapshot,getScenarioPreset,runScenarioPreset,validateScenarioPresetCatalog} from '../src/client/scenario-presets.js';

test('scenario preset catalog is versioned, valid, and has unique IDs',()=>{
  assert.equal(SCENARIO_PRESET_CATALOG_VERSION,1);
  assert.equal(validateScenarioPresetCatalog(),true);
  assert.equal(new Set(SCENARIO_PRESETS.map(preset=>preset.id)).size,SCENARIO_PRESETS.length);
  assert.ok(SCENARIO_PRESETS.every(preset=>preset.version===1));
});

test('presets can be selected and supported entries declare reproducible inputs',()=>{
  const baseline=getScenarioPreset('baseline');
  const housing=getScenarioPreset('housing-comparison');
  assert.equal(baseline.execution,'reset');
  assert.equal(housing.intervention.factor,'housing');
  assert.deepEqual(createScenarioPresetSnapshot('baseline'),createScenarioPresetSnapshot('housing-comparison'));
});

test('supported demonstration repeats with the same snapshot, seed, and duration',()=>{
  const first=runScenarioPreset('housing-comparison');
  const second=runScenarioPreset('housing-comparison');
  assert.equal(first.result.days,30);
  assert.equal(first.result.comparisonFactor,'housing');
  assert.deepEqual(first.result,second.result);
});

test('unsupported candidates remain catalogued and cannot execute',()=>{
  for(const id of ['heat','reduced-feed','limited-trough-access']){
    assert.equal(getScenarioPreset(id).status,'unsupported');
    assert.throws(()=>runScenarioPreset(id),/Indisponível|não tem suporte|não é representado/);
  }
});

test('unsupported candidates do not invent initial state, duration, or seed',()=>{
  for(const preset of SCENARIO_PRESETS.filter(item=>item.status==='unsupported')){
    assert.equal(preset.initialState,null);
    assert.equal(preset.durationDays,null);
    assert.equal(preset.seed,null);
  }
});
