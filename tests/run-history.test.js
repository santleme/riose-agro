import test from 'node:test';
import assert from 'node:assert/strict';
import {FarmEngine,compare,createComparisonManifest,createConfiguredComparisonManifest} from '../src/client/engine.js';
import {COMPARISON_ENGINE_VERSION,createRunRecord,getRun,listRuns,recordRun,runCompatibility,RUN_HISTORY_KEY,MAX_RUN_HISTORY_BYTES,getRunHistoryStats,exportRunHistory,clearRunHistory,updateRunConditionalCost} from '../src/client/run-history.js';
import {calculateConditionalSupplementCosts} from '../src/client/conditional-supplement-cost.js';

class MemoryStorage{
  constructor(values=new Map()){this.values=values;}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
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

test('persists reviewed user-priced costs with a run and can clear an edited price without changing replay compatibility',()=>{
  const storage=new MemoryStorage(),snapshot=new FarmEngine(31,24).snapshot();
  const options={days:3,referenceConfig:{...snapshot.config,supplement:0.5},scenarioConfig:{...snapshot.config,supplement:1.5}};
  const manifest=createConfiguredComparisonManifest(snapshot,options);
  const result=compare(snapshot,3);
  const cost=calculateConditionalSupplementCosts({animalCount:24,days:3,scenarios:[
    {id:'baseline',label:'Baseline',supplementKgDMPerAnimalPerDay:0.5},
    {id:'intervention',label:'Intervention',supplementKgDMPerAnimalPerDay:1.5}],pricePerKgDM:4,currency:'BRL',scope:'experiment'});
  const run=createRunRecord({manifest,result,conditionalCost:cost,id:'priced-run'});
  recordRun(run,storage);
  assert.equal(getRun('priced-run',storage).conditionalCost.scenarios[1].expense,432);
  assert.equal(runCompatibility(getRun('priced-run',storage)).supported,true);
  const tampered=structuredClone(getRun('priced-run',storage));tampered.conditionalCost.scenarios[1].expense=1;
  assert.equal(runCompatibility(tampered).supported,false,'tampered stored arithmetic must not be replayable as provenance');
  updateRunConditionalCost('priced-run',null,storage);
  assert.equal(Object.hasOwn(getRun('priced-run',storage),'conditionalCost'),false);
  assert.equal(runCompatibility(getRun('priced-run',storage)).supported,true);
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

test('whitelists nested imported snapshot config and intake fields before persistence',()=>{
  const storage=new MemoryStorage(),snapshot=new FarmEngine(9,2).snapshot();
  const manifest=createComparisonManifest(snapshot,1);
  manifest.initialSnapshot.config.apiKey='shh-config-secret';
  manifest.initialSnapshot.config.extraConfig='unapproved';
  manifest.initialSnapshot.intake.password='shh-intake-secret';
  manifest.initialSnapshot.intake.extraIntake='unapproved';
  const run=createRunRecord({manifest,result:compare(snapshot,1),id:'nested-safe'});

  recordRun(run,storage);

  const saved=storage.getItem(RUN_HISTORY_KEY);
  const persisted=getRun(run.id,storage).manifest;
  assert.doesNotMatch(saved,/shh-config-secret|shh-intake-secret|unapproved|apiKey|password|extraConfig|extraIntake/);
  assert.deepEqual(Object.keys(persisted.initialSnapshot.config).sort(),['diet','housing','supplement','weather']);
  assert.deepEqual(Object.keys(persisted.initialSnapshot.intake).sort(),['barnBaseKgDM','dietExtraKgDM','pastureKgDM','supplementKgDM']);
  assert.deepEqual(Object.keys(persisted.scenarios.reference).sort(),['diet','housing','supplement','weather']);
  assert.deepEqual(Object.keys(persisted.scenarios.scenario).sort(),['diet','housing','supplement','weather']);
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

test('fails closed when a saved run has missing or future history provenance',()=>{
  const run=completedRun();
  for(const version of [undefined,2]){
    const candidate=structuredClone(run);
    if(version===undefined)delete candidate.provenance.historyVersion;
    else candidate.provenance.historyVersion=version;
    assert.equal(runCompatibility(candidate).supported,false);
    assert.match(runCompatibility(candidate).reason,/registro de histórico incompatível/);
  }
});

test('handles local storage quota errors without hiding the run result',()=>{
  const storage={getItem(){return null;},setItem(){throw new DOMException('quota exceeded','QuotaExceededError');}};
  assert.throws(()=>recordRun(completedRun(),storage),/continua disponível/);
});

test('keeps the previous persisted history when a replacement write fails',()=>{
  const previous=completedRun({id:'previous'}),raw=JSON.stringify({version:1,runs:[previous]}),storage={
    getItem(){return raw;},
    setItem(){throw new DOMException('quota exceeded','QuotaExceededError');}
  };
  assert.throws(()=>recordRun(completedRun({id:'new'}),storage),/continua disponível/);
  assert.equal(storage.getItem(RUN_HISTORY_KEY),raw);
});

test('rejects a run larger than the byte budget without touching the saved history',()=>{
  const previous=completedRun({id:'previous'}),raw=JSON.stringify({version:1,runs:[previous]});
  let writes=0;
  const storage={getItem(){return raw;},setItem(){writes++;}};
  const oversized=completedRun({id:'oversized'});oversized.payload='x'.repeat(MAX_RUN_HISTORY_BYTES);

  assert.throws(()=>recordRun(oversized,storage),/histórico anterior foi preservado/);
  assert.equal(writes,0);
  assert.equal(storage.getItem(RUN_HISTORY_KEY),raw);
});

test('enforces the serialized UTF-8 byte budget while retaining newer records first',()=>{
  const storage=new MemoryStorage(),older=completedRun({id:'older',now:1000}),newer=completedRun({id:'newer',now:2000});
  older.payload='é'.repeat(650_000);
  newer.payload='🐄'.repeat(220_000);
  recordRun(older,storage);
  recordRun(newer,storage);

  const raw=storage.getItem(RUN_HISTORY_KEY),stats=getRunHistoryStats(storage);
  assert.deepEqual(listRuns(storage).map(run=>run.id),['newer']);
  assert.equal(stats.bytes,new TextEncoder().encode(raw).byteLength);
  assert.ok(stats.bytes<=MAX_RUN_HISTORY_BYTES);
});

test('skips a legacy oversized record and continues retaining smaller older records',()=>{
  const oldest=completedRun({id:'oldest',now:1000}),tooLarge=completedRun({id:'large',now:2000});
  oldest.payload='a'.repeat(700_000);
  tooLarge.payload='b'.repeat(MAX_RUN_HISTORY_BYTES);
  const storage=new MemoryStorage(new Map([[RUN_HISTORY_KEY,JSON.stringify({version:1,runs:[tooLarge,oldest]})]]));

  recordRun(completedRun({id:'incoming',now:4000}),storage);

  assert.deepEqual(listRuns(storage).map(run=>run.id),['incoming','oldest']);
  assert.ok(getRunHistoryStats(storage).bytes<=MAX_RUN_HISTORY_BYTES);
});

test('applies byte and count caps together without letting a large run block smaller records',()=>{
  const largeButLowerPriority=completedRun({id:'large',now:2000});largeButLowerPriority.payload='b'.repeat(400_000);
  const smallRuns=Array.from({length:21},(_,index)=>completedRun({id:`small-${index}`,now:100+index}));
  const storage=new MemoryStorage(new Map([[RUN_HISTORY_KEY,JSON.stringify({version:1,runs:[largeButLowerPriority,...smallRuns]})]]));
  const incoming=completedRun({id:'incoming',now:3000});incoming.payload='a'.repeat(1_800_000);

  recordRun(incoming,storage);

  const runs=listRuns(storage),ids=new Set(runs.map(run=>run.id));
  assert.equal(runs.length,20);
  assert.ok(ids.has('incoming'));
  assert.ok(!ids.has('large'));
  assert.equal(smallRuns.filter(run=>ids.has(run.id)).length,19);
  assert.ok(getRunHistoryStats(storage).bytes<=MAX_RUN_HISTORY_BYTES);
});

test('reports exact stored UTF-8 usage, including non-ASCII JSON content',()=>{
  const storage=new MemoryStorage(),run=completedRun();run.note='forragem 🐄';recordRun(run,storage);
  const raw=storage.getItem(RUN_HISTORY_KEY),stats=getRunHistoryStats(storage);
  assert.equal(stats.count,1);
  assert.equal(stats.bytes,new TextEncoder().encode(raw).byteLength);
  assert.equal(stats.maxBytes,MAX_RUN_HISTORY_BYTES);
});

test('exports the stored text without mutation, including malformed JSON',()=>{
  const raw='{"version":1,"runs":[broken';
  const storage=new MemoryStorage(new Map([[RUN_HISTORY_KEY,raw],['other','keep']]));
  assert.equal(exportRunHistory(storage),raw);
  assert.equal(storage.getItem(RUN_HISTORY_KEY),raw);
  assert.equal(storage.getItem('other'),'keep');
});

test('exports a valid empty envelope when no history exists',()=>{
  assert.deepEqual(JSON.parse(exportRunHistory(new MemoryStorage())),{version:1,runs:[]});
});

test('clears only the run-history key after an explicit cleanup request',()=>{
  const storage=new MemoryStorage(new Map([[RUN_HISTORY_KEY,'{}'],['scenario','keep']]));
  clearRunHistory(storage);
  assert.equal(storage.getItem(RUN_HISTORY_KEY),null);
  assert.equal(storage.getItem('scenario'),'keep');
});

test('reports interrupted cleanup without claiming the history was removed',()=>{
  const raw=JSON.stringify({version:1,runs:[completedRun()]}),storage={
    getItem(){return raw;},
    removeItem(){throw new DOMException('denied','SecurityError');}
  };
  assert.throws(()=>clearRunHistory(storage),/não conseguiu limpar/);
  assert.equal(storage.getItem(RUN_HISTORY_KEY),raw);
});

test('uses a stable ID order for equal timestamps',()=>{
  const storage=new MemoryStorage();
  recordRun(completedRun({id:'z',now:1000}),storage);
  recordRun(completedRun({id:'a',now:1000}),storage);
  assert.deepEqual(listRuns(storage).map(run=>run.id),['a','z']);
});

test('records the explicit compatibility version and bounds the history to 20 runs',()=>{
  const storage=new MemoryStorage();
  for(let i=0;i<21;i++)recordRun(completedRun({id:`run-${i}`,now:i+1}),storage);
  const runs=listRuns(storage);
  assert.equal(runs.length,20);
  assert.equal(runs[0].engineVersion,COMPARISON_ENGINE_VERSION);
  assert.equal(runs.some(run=>run.id==='run-0'),false);
});
