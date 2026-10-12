import test from 'node:test';
import assert from 'node:assert/strict';
import {FarmEngine,compare,createComparisonManifest} from '../engine.js';
import {COMPARISON_ENGINE_VERSION,createRunRecord,getRun,listRuns,recordRun,runCompatibility,RUN_HISTORY_KEY} from '../run-history.js';

class MemoryStorage{
  constructor(values=new Map()){this.values=values;}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){this.values.set(key,String(value));}
}

function completedRun({id='run-1',now=Date.UTC(2026,9,12),seed=15}={}){
  const snapshot=new FarmEngine(seed,3).snapshot(),manifest=createComparisonManifest(snapshot,2);
  return createRunRecord({manifest,result:compare(snapshot,2),id,now});
}

test('stores completed runs and supports listing and lookup by ID',()=>{
  const storage=new MemoryStorage(),run=completedRun();
  assert.equal(recordRun(run,storage),run);
  assert.deepEqual(listRuns(storage),[run]);
  assert.equal(getRun(run.id,storage).status,'completed');
  assert.equal(getRun('missing',storage),null);
});

test('sorts runs newest first and data remains available after re-reading storage',()=>{
  const storage=new MemoryStorage();
  recordRun(completedRun({id:'older',now:1000}),storage);
  recordRun(completedRun({id:'newer',now:2000}),storage);
  const reopenedStorage=new MemoryStorage(storage.values);
  assert.deepEqual(listRuns(reopenedStorage).map(run=>run.id),['newer','older']);
});

test('persists failed execution status and a brief error summary',()=>{
  const storage=new MemoryStorage(),manifest=createComparisonManifest(new FarmEngine(1,2).snapshot(),1);
  const failed=createRunRecord({manifest,status:'failed',error:new Error('engine unavailable'),id:'failed'});
  recordRun(failed,storage);
  assert.equal(getRun('failed',storage).status,'failed');
  assert.equal(getRun('failed',storage).error,'engine unavailable');
  assert.equal(runCompatibility(failed).supported,false);
});

test('starts with an empty list when history is absent',()=>{
  assert.deepEqual(listRuns(new MemoryStorage()),[]);
});

test('rejects a duplicate run ID without changing the stored item',()=>{
  const storage=new MemoryStorage(),run=completedRun();
  recordRun(run,storage);
  assert.throws(()=>recordRun({...run,result:{changed:true}},storage),/já existe/);
  assert.deepEqual(getRun(run.id,storage),run);
});

test('refuses corrupted storage without overwriting it',()=>{
  const storage=new MemoryStorage();storage.setItem(RUN_HISTORY_KEY,'{"version":1,"runs":[');
  assert.throws(()=>listRuns(storage),/corrompido/);
  assert.equal(storage.getItem(RUN_HISTORY_KEY),'{"version":1,"runs":[');
});

test('refuses unknown history formats without overwriting them',()=>{
  const storage=new MemoryStorage(),raw=JSON.stringify({version:2,runs:[]});storage.setItem(RUN_HISTORY_KEY,raw);
  assert.throws(()=>recordRun(completedRun(),storage),/formato inválido/);
  assert.equal(storage.getItem(RUN_HISTORY_KEY),raw);
});

test('reports unavailable local storage explicitly',()=>{
  assert.throws(()=>listRuns({getItem(){throw new DOMException('denied','SecurityError');}}),/indisponível/);
});

test('does not persist arbitrary imported fields, credentials or local paths',()=>{
  const storage=new MemoryStorage(),snapshot=new FarmEngine(9,2).snapshot();
  snapshot.apiKey='shh-secret-value';snapshot.localPath='C:\\Users\\alice\\private.json';
  const manifest=createComparisonManifest(snapshot,1);manifest.token='shh-manifest-token';
  const run=createRunRecord({manifest,result:compare(snapshot,1),id:'safe'});
  recordRun(run,storage);
  const saved=storage.getItem(RUN_HISTORY_KEY);
  assert.doesNotMatch(saved,/shh-secret-value|shh-manifest-token|private\.json|apiKey|localPath/);
});

test('stores and replays the canonical manifest snapshot used by the run',()=>{
  const snapshot=new FarmEngine(31,4).snapshot(),manifest=createComparisonManifest(snapshot,3);
  const run=createRunRecord({manifest,result:compare(snapshot,3),id:'canonical'});
  assert.equal(run.manifest.version,manifest.version);
  assert.equal(runCompatibility(run).supported,true);
  assert.equal(run.manifest.initialSnapshot.initialSeed,run.seed);
  assert.deepEqual(compare(run.manifest.initialSnapshot,run.manifest.periodDays),run.result);
});

test('marks a future manifest version as unsupported before replay',()=>{
  const run=completedRun();run.manifest.version=99;
  assert.match(runCompatibility(run).reason,/manifesto não suportada/);
});

test('marks a run from an incompatible engine version before replay',()=>{
  const run=completedRun();run.engineVersion='agroville-comparison-next';
  assert.match(runCompatibility(run).reason,/motor incompatível/);
});

test('handles local storage quota errors without hiding the run result',()=>{
  const storage={getItem(){return null;},setItem(){throw new DOMException('quota exceeded','QuotaExceededError');}};
  assert.throws(()=>recordRun(completedRun(),storage),/continua disponível/);
});

test('records the explicit compatibility version and bounds the history to 20 runs',()=>{
  const storage=new MemoryStorage();
  for(let i=0;i<21;i++)recordRun(completedRun({id:`run-${i}`,now:i+1}),storage);
  const runs=listRuns(storage);
  assert.equal(runs.length,20);
  assert.equal(runs[0].engineVersion,COMPARISON_ENGINE_VERSION);
  assert.equal(runs.some(run=>run.id==='run-0'),false);
});
