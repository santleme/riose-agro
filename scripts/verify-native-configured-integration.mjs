#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createServer} from '../src/server/server.js';
import {compareConfiguredScenarios,createConfiguredComparisonManifest} from '../src/client/engine.js';
import {normalizeWorkerResponse} from '../src/client/worker-protocol.js';
import {createRunRecord,runCompatibility} from '../src/client/run-history.js';

const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/configured-comparison-v2-parity.json',import.meta.url),'utf8'));
const runner=resolve(process.env.RIOSE_RUNNER_PATH??'target/release/riose-run');
const server=createServer({env:{RIOSE_NATIVE_COMPARISON:'true',RIOSE_RUNNER_PATH:runner}});
const oldFetch=globalThis.fetch,oldSelf=globalThis.self;

function compareTrees(actual,expected,tolerance,path='$',stats={maxAbsDifference:0}){
  if(typeof expected==='number'){
    assert.equal(typeof actual,'number',`${path} must stay numeric`);
    const difference=Math.abs(actual-expected);
    stats.maxAbsDifference=Math.max(stats.maxAbsDifference,difference);
    assert.ok(difference<=tolerance,`${path}: ${actual} differs from ${expected} by ${difference}`);
  }else if(Array.isArray(expected)){
    assert.ok(Array.isArray(actual),`${path} must stay an array`);
    assert.equal(actual.length,expected.length,`${path} length`);
    expected.forEach((value,index)=>compareTrees(actual[index],value,tolerance,`${path}[${index}]`,stats));
  }else if(expected&&typeof expected==='object'){
    assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),`${path} fields`);
    for(const [key,value] of Object.entries(expected))compareTrees(actual[key],value,tolerance,`${path}.${key}`,stats);
  }else assert.equal(actual,expected,path);
  return stats;
}

class MemoryStorage{
  #values=new Map();
  getItem(key){return this.#values.get(key)??null;}
  setItem(key,value){this.#values.set(key,String(value));}
}

await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const origin=`http://127.0.0.1:${server.address().port}`;
globalThis.fetch=(url,options)=>oldFetch(new URL(url,origin),options);
try{
  const available=await (await fetch('/api/native/configured-comparison')).json();
  assert.deepEqual(available,{available:true,backend:'local-rust'});
  const rows=[];
  for(const vector of fixture.cases){
    const worker={messages:[],postMessage(message){this.messages.push(message);}};
    globalThis.self=worker;
    await import(`../src/client/worker.js?native-integration-${vector.factor}-${Math.random()}`);
    const options={days:vector.days,referenceConfig:vector.referenceConfig,scenarioConfig:vector.scenarioConfig};
    const start=performance.now();
    await worker.onmessage({data:{protocolVersion:1,type:'compareConfigured',snapshot:fixture.snapshot,...options}});
    const nativeResponse=normalizeWorkerResponse(worker.messages.at(-1));
    const latencyMs=Number((performance.now()-start).toFixed(3));
    assert.equal(nativeResponse.execution.backend,'local-rust');
    assert.equal(nativeResponse.execution.fallbackUsed,false);
    const nativeParity=compareTrees(nativeResponse.data,vector.expected,fixture.comparisonTolerance,vector.factor);
    const jsParity=compareTrees(nativeResponse.data,compareConfiguredScenarios(fixture.snapshot,options),fixture.comparisonTolerance,`${vector.factor}.javascript`);
    const manifest=createConfiguredComparisonManifest(fixture.snapshot,options);
    await worker.onmessage({data:{protocolVersion:1,type:'replayConfigured',manifest}});
    const replay=normalizeWorkerResponse(worker.messages.at(-1));
    assert.equal(replay.execution.backend,'local-rust');
    assert.deepEqual(replay.data,nativeResponse.data,`${vector.factor} native replay must be deterministic`);
    const history=createRunRecord({manifest,result:nativeResponse.data,execution:nativeResponse.execution,id:`native-${vector.factor}`});
    assert.equal(runCompatibility(history).supported,true);
    const storage=new MemoryStorage();
    const {recordRun,exportRunHistory}=await import('../src/client/run-history.js');
    recordRun(history,storage);
    const exported=JSON.parse(exportRunHistory(storage));
    assert.deepEqual(exported.runs[0].execution,history.execution);
    rows.push({factor:vector.factor,days:vector.days,comparisonRows:nativeResponse.data.rows.length,
      tolerance:fixture.comparisonTolerance,maxAbsDifferenceVsRustFixture:nativeParity.maxAbsDifference,
      maxAbsDifferenceVsJavaScript:jsParity.maxAbsDifference,workerToNativeRoundTripMs:latencyMs,
      replay:'passed',historyCompatibility:'passed',historyExecutor:history.execution.backend,
      buildId:history.execution.buildId,runId:history.execution.runId,inputSha256:history.execution.inputSha256});
  }
  process.stdout.write(`${JSON.stringify({format:'riose-native-configured-integration-v1',node:process.version,
    runner:process.env.RIOSE_RUNNER_PATH?'custom local executable':'target/release/riose-run',
    workload:{factors:rows.map(row=>row.factor),source:'frozen configured-comparison v2 fixture'},
    measurement:{samplesPerFactor:1,latencyIncludes:'Worker request/reply, local HTTP route, native process startup, stdin/stdout JSON and process exit',
      p95:'not reported; one smoke sample per factor'},rows},null,2)}\n`);
}finally{
  globalThis.fetch=oldFetch;globalThis.self=oldSelf;
  await new Promise(resolveClose=>server.close(resolveClose));
}
