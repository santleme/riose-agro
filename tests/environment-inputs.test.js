import test from 'node:test';
import assert from 'node:assert/strict';
import {environmentBaseline,initialEnvironmentState,updateEnvironmentInput,environmentDiffRows} from '../environment-inputs.js';

test('legacy snapshots without numeric environment stay explicitly missing',()=>{
  const state=initialEnvironmentState({snapshotId:'old',farm:{},observations:[]});
  assert.deepEqual(state.current,{temperatureC:'',relativeHumidityPct:''});
  assert.equal(environmentBaseline({}).temperatureC.status,'missing');
  assert.equal(environmentDiffRows(state,{dietLabel:'Pasto'})[0].baseline,'Não informado');
});

test('reported environment inputs validate and retain original observed provenance for comparison',()=>{
  const snapshot={snapshotId:'field-1',farm:{environment:{temperature_c:{path:'farm.environment.temperature_c',value:24,unit:'°C',status:'observed',sourceLocator:'termômetro'} ,relative_humidity_pct:{path:'farm.environment.relative_humidity_pct',value:65,unit:'%',status:'observed',sourceLocator:'higrômetro'}}}};
  let state=initialEnvironmentState(snapshot);
  state=updateEnvironmentInput(state,'temperatureC','28.5');
  assert.equal(state.baseline.temperatureC.value,24);
  assert.equal(state.current.temperatureC,'28.5');
  assert.equal(state.currentSource.temperatureC,'reported');
  assert.equal(environmentDiffRows(state)[0].changed,true);
  assert.throws(()=>updateEnvironmentInput(state,'relativeHumidityPct','101'),/0 e 100/);
});

test('snapshot environmental readings with incompatible units remain visible as unavailable inputs',()=>{
  const state=initialEnvironmentState({snapshotId:'fahrenheit',farm:{environment:{temperature_c:{path:'farm.environment.temperature_c',value:77,unit:'°F',status:'observed',sourceLocator:'weather station'}}}});
  assert.equal(state.baseline.temperatureC.value,null);
  assert.equal(state.baseline.temperatureC.status,'invalid-unit');
  assert.equal(environmentDiffRows(state)[0].baseline,'Unidade incompatível');
});
