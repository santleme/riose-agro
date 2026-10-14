import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FarmEngine} from '../src/client/engine.js';
import {loadWasmMetabolism,updateMetabolismJS} from '../src/client/metabolism-wasm.js';
import {createLotComparisonManifest,createLotScopedSnapshot,compareLotConfiguredScenarios,replayLotComparisonManifest,validateLotComparisonManifest,LOT_COMPARISON_MANIFEST_TYPE} from '../src/client/lot-comparison.js';
import {createRunRecord,recordRun,getRun,runCompatibility,RUN_HISTORY_KEY} from '../src/client/run-history.js';

const makeManifest=(snapshot,patchIndex=1)=>createLotComparisonManifest(snapshot,{
  patchIndex,domainZoneId:`paddock-${patchIndex+1}`,periodDays:3,
  alternativeSupplementKgDMPerAnimalPerDay:snapshot.config.supplement===2?2.5:2
});

test('lot selection has stable identity and the intervention changes only selected-lot supplement',()=>{
  const snapshot=new FarmEngine(60413,20).snapshot(),before=structuredClone(snapshot),manifest=makeManifest(snapshot,2);
  assert.equal(manifest.type,LOT_COMPARISON_MANIFEST_TYPE);
  assert.equal(manifest.type,'riose-configured-comparison');
  assert.equal(manifest.targetScope.kind,'lot');
  assert.equal(manifest.targetScope.lotId,'demo-lot-03');
  assert.equal(manifest.targetScope.paddockId,'demo-paddock-03');
  assert.ok(manifest.targetScope.animalIds.length>0);
  assert.ok(manifest.targetScope.unaffectedAnimalIds.length>0);
  assert.deepEqual(snapshot,before,'preparing the intervention must not mutate the live state');
  assert.deepEqual(Object.keys(manifest.scenarios.reference).filter(key=>manifest.scenarios.reference[key]!==manifest.scenarios.scenario[key]),['supplement']);
  assert.equal(manifest.scenarios.reference.supplement,snapshot.config.supplement);
  assert.equal(manifest.targetScope.model.id,'agroville-engine');
  assert.equal(manifest.targetScope.model.status,'demonstrative_unvalidated');
  assert.equal(manifest.targetScope.model.evidenceStatus,'demonstrative');
  assert.deepEqual(manifest.targetScope.model.evidenceReferences,[]);
  assert.equal(manifest.targetScope.model.validated,false);
  assert.equal(manifest.seed,snapshot.initialSeed);
  assert.equal(manifest.targetScope.populationScope,'selected-lot-only');
  assert.deepEqual(createLotScopedSnapshot(snapshot,manifest.targetScope).animals.map(animal=>animal.id),manifest.targetScope.animalIds);
  assert.throws(()=>validateLotComparisonManifest({...manifest,targetScope:{...manifest.targetScope,animalIds:[...manifest.targetScope.unaffectedAnimalIds]}}),/identidade|targetScope/);
});

test('lot comparison is deterministic, isolated, and replays from the same seed',()=>{
  const snapshot=new FarmEngine(20261013,24).snapshot(),manifest=makeManifest(snapshot,0),before=structuredClone(manifest.initialSnapshot);
  const first=compareLotConfiguredScenarios(manifest),second=compareLotConfiguredScenarios(manifest);
  assert.deepEqual(first,second);
  assert.deepEqual(replayLotComparisonManifest(manifest),first);
  assert.deepEqual(manifest.initialSnapshot,before);
  assert.equal(first.herdSize,manifest.targetScope.animalIds.length);
  assert.equal(first.seed,manifest.seed);
  assert.equal(first.lot.lotId,manifest.targetScope.lotId);
  assert.equal(first.model.id,manifest.targetScope.model.id);
  assert.equal(first.initialConfig.supplement,manifest.scenarios.reference.supplement);
  assert.equal(first.scenarioConfig.supplement,manifest.scenarios.scenario.supplement);
  assert.equal(first.comparisonFactor,'supplement');
  assert.notEqual(first.reference.gain,first.scenario.gain,'the selected lot should respond to the intervention');
  assert.equal(first.rows[0].referenceWeight,first.rows[0].scenarioWeight);
  assert.equal(first.rows.at(-1).referencePastureKgDM,first.rows.at(-1).referencePastureByPaddock[manifest.targetScope.patchIndex]);
  assert.equal(first.rows.at(-1).scenarioPastureKgDM,first.rows.at(-1).scenarioPastureByPaddock[manifest.targetScope.patchIndex]);
  for(const row of first.rows)for(let paddock=0;paddock<4;paddock++)if(paddock!==manifest.targetScope.patchIndex){
    assert.equal(row.referencePastureByPaddock[paddock],row.scenarioPastureByPaddock[paddock],'unrelated paddock state should remain invariant');
  }
  assert.deepEqual(manifest.targetScope.unaffectedAnimalIds,manifest.initialSnapshot.animals.filter(animal=>animal.patch!==manifest.targetScope.patchIndex).map(animal=>animal.id).sort((a,b)=>a-b));
  const scoped=createLotScopedSnapshot(manifest.initialSnapshot,manifest.targetScope);
  assert.deepEqual(scoped.animals.map(animal=>animal.id),manifest.targetScope.animalIds,'unselected entities must not enter either engine arm');
});

test('lot identity is independent of animal array order and replay resolves by stable IDs',()=>{
  const snapshot=new FarmEngine(417,24).snapshot(),forward=makeManifest(snapshot,1),reordered={...snapshot,animals:[...snapshot.animals].reverse()},reverse=makeManifest(reordered,1);
  assert.deepEqual(reverse.targetScope.animalIds,forward.targetScope.animalIds);
  assert.deepEqual(createLotScopedSnapshot(reordered,reverse.targetScope).animals.map(animal=>animal.id),forward.targetScope.animalIds);
  assert.deepEqual(replayLotComparisonManifest(reverse),replayLotComparisonManifest(forward));
});

test('lot comparison preserves manifest, executor and deterministic replay in local history',()=>{
  const snapshot=new FarmEngine(71,12).snapshot(),manifest=makeManifest(snapshot,3),result=compareLotConfiguredScenarios(manifest);
  const run=createRunRecord({manifest,result,engineImplementation:'javascript-fallback',id:'lot-run'}),storage=new Map();
  const adapter={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
  recordRun(run,adapter);
  const saved=getRun('lot-run',adapter);
  assert.equal(saved.manifest.type,LOT_COMPARISON_MANIFEST_TYPE);
  assert.equal(saved.executor.engineImplementation,'javascript-fallback');
  assert.equal(saved.manifest.targetScope.lotId,manifest.targetScope.lotId);
  assert.deepEqual(replayLotComparisonManifest(saved.manifest),saved.result);
  assert.equal(runCompatibility(saved).supported,true);
  assert.match(storage.get(RUN_HISTORY_KEY),/synthetic-demonstration/);
});

test('supported native WASM and JavaScript kernels have exact lot comparison parity',async t=>{
  const bytes=await readFile(new URL('../wasm/riose_core.wasm',import.meta.url));
  const wasm=await loadWasmMetabolism(new URL('http://lot.test/riose_core.wasm'),async()=>new Response(bytes,{headers:{'content-type':'application/wasm'}}));
  t.after(()=>wasm.dispose());
  const manifest=makeManifest(new FarmEngine(2026,16).snapshot(),1);
  assert.deepEqual(compareLotConfiguredScenarios(manifest,wasm),compareLotConfiguredScenarios(manifest,updateMetabolismJS));
});

test('observed snapshots are rejected as lot simulation state rather than silently converted',()=>{
  const observed={...new FarmEngine(8,8).snapshot(),snapshotKind:'observed',observations:[{id:'obs-1',value:5,unit:'kg'}]};
  assert.throws(()=>makeManifest(observed,0),/somente leitura/);
});
