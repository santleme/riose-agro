import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareConfiguredScenarios,createConfiguredComparisonManifest} from '../src/client/engine.js';
import {normalizeWorkerResponse} from '../src/client/worker-protocol.js';
import {createRunRecord,runCompatibility} from '../src/client/run-history.js';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/configured-comparison-v2-parity.json',import.meta.url),'utf8'));

async function withWorker(t,fetchImpl,callback){
  const oldSelf=globalThis.self,oldFetch=globalThis.fetch;
  const worker={messages:[],postMessage(message){this.messages.push(message);}};
  globalThis.self=worker;globalThis.fetch=fetchImpl;
  t.after(()=>{globalThis.self=oldSelf;globalThis.fetch=oldFetch;});
  await import(`../src/client/worker.js?native-comparison-test=${Math.random()}`);
  return callback(worker);
}

test('configured Worker prefers available Rust and preserves execution provenance with a replayable history record',async t=>{
  const vector=fixture.cases[0],snapshot=fixture.snapshot;
  const fetchImpl=async(_url,options)=>options?{ok:true,json:async()=>({comparison:vector.expected,
    engine:{engineVersion:'0.1.0',buildId:'native-test-build',modelStatus:'demonstrative_unvalidated',validated:false},
    runId:'sha256:'+'b'.repeat(64),inputSha256:'sha256:'+'b'.repeat(64)})}:{ok:true,json:async()=>({available:true,backend:'local-rust'})};
  await withWorker(t,fetchImpl,async worker=>{
    await worker.onmessage({data:{protocolVersion:1,type:'compareConfigured',snapshot,days:vector.days,
      referenceConfig:vector.referenceConfig,scenarioConfig:vector.scenarioConfig}});
    const response=normalizeWorkerResponse(worker.messages.at(-1));
    assert.equal(response.engineImplementation,'riose-core-native/0.1.0');
    assert.deepEqual(response.data,vector.expected);
    assert.equal(response.execution.backend,'local-rust');
    assert.equal(response.execution.fallbackUsed,false);
    const manifest=createConfiguredComparisonManifest(snapshot,{days:vector.days,referenceConfig:vector.referenceConfig,scenarioConfig:vector.scenarioConfig});
    const run=createRunRecord({manifest,result:response.data,execution:response.execution,id:'native-run-history'});
    assert.equal(run.execution.buildId,'native-test-build');
    assert.equal(runCompatibility(run).supported,true);
  });
});

test('configured Worker falls back to JavaScript and marks a native execution failure',async t=>{
  const vector=fixture.cases[1],snapshot=fixture.snapshot;
  const fetchImpl=async(_url,options)=>options?{ok:false,status:502}:{ok:true,json:async()=>({available:true,backend:'local-rust'})};
  await withWorker(t,fetchImpl,async worker=>{
    await worker.onmessage({data:{protocolVersion:1,type:'compareConfigured',snapshot,days:vector.days,
      referenceConfig:vector.referenceConfig,scenarioConfig:vector.scenarioConfig}});
    const response=normalizeWorkerResponse(worker.messages.at(-1));
    const expected=compareConfiguredScenarios(snapshot,{days:vector.days,referenceConfig:vector.referenceConfig,scenarioConfig:vector.scenarioConfig});
    assert.deepEqual(response.data,expected);
    assert.equal(response.execution.backend,'local-js');
    assert.equal(response.execution.fallbackUsed,true);
    assert.equal(response.execution.fallbackReason,'native_runner_failed');
  });
});
