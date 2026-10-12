import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {FarmEngine,compare} from '../src/client/engine.js';
import {loadWasmMetabolism,updateMetabolismJS} from '../src/client/metabolism-wasm.js';
import {createServer} from '../src/server/server.js';

const wasmBytes=await readFile(new URL('../wasm/riose_core.wasm',import.meta.url));
const baselineCommit='913b36b9fe5c0877c7b857af3e0488cedcfd0e03';
const baselineSource=execFileSync('git',['show',`${baselineCommit}:engine.js`],{encoding:'utf8'});
const {FarmEngine:BaselineFarmEngine}=await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);
const wasmKernel=await loadWasmMetabolism(new URL('http://local.test/wasm/riose_core.wasm'),async()=>
  new Response(wasmBytes,{headers:{'content-type':'application/wasm'}}));

test('WASM metabolism batch matches the legacy JavaScript formula across clamps and states',()=>{
  const input=Float64Array.from([
    360,75,.4,0, 190,99,0,1, 410,0,1.2,0, 200,100,0,0,
  ]);
  assert.deepEqual(wasmKernel(input),updateMetabolismJS(input));
  assert.throws(()=>wasmKernel(new Float64Array(3),1),/input buffer is too small/);
  assert.throws(()=>updateMetabolismJS(new Float64Array(3),1),/input buffer is too small/);
  wasmKernel.dispose();
});

function createWasmFixture({status=0,abiVersion=1,growDuringUpdate=false,allocateFailureAt=Infinity,missingExport}={}){
  const memory=new WebAssembly.Memory({initial:1,maximum:32});
  const allocations=[],releases=[];
  let nextPointer=8,allocationCount=0;
  const allocate=length=>{
    allocationCount++;
    if(allocationCount===allocateFailureAt)return 0;
    const pointer=nextPointer;
    nextPointer+=length*Float64Array.BYTES_PER_ELEMENT+8;
    const required=nextPointer;
    if(required>memory.buffer.byteLength)memory.grow(Math.ceil((required-memory.buffer.byteLength)/65536));
    allocations.push({pointer,length});
    return pointer;
  };
  const release=(pointer,length)=>releases.push({pointer,length});
  const update=(count,inputPointer,outputPointer)=>{
    if(status!==0)return status;
    const input=new Float64Array(memory.buffer,inputPointer,count*4);
    const output=new Float64Array(memory.buffer,outputPointer,count*2);
    for(let index=0;index<count;index++){
      output[index*2]=input[index*4]+1;
      output[index*2+1]=input[index*4+1]+2;
    }
    if(growDuringUpdate)memory.grow(1);
    return 0;
  };
  const exports={memory,riose_abi_version:()=>abiVersion,riose_alloc_f64:allocate,riose_free_f64:release,riose_update_metabolism_batch:update};
  if(missingExport)delete exports[missingExport];
  return {memory,allocations,releases,exports,instance:{exports}};
}

async function withInstantiatedFixture(fixture,callback){
  const original=WebAssembly.instantiateStreaming;
  WebAssembly.instantiateStreaming=async()=>({instance:fixture.instance});
  try{return await callback();}
  finally{WebAssembly.instantiateStreaming=original;}
}

test('WASM validates counts and output capacity before calling the ABI or changing output',async()=>{
  const fixture=createWasmFixture();
  await withInstantiatedFixture(fixture,async()=>{
    const kernel=await loadWasmMetabolism('http://local.test/kernel.wasm',async()=>({ok:true}));
    const output=new Float64Array([71,72,73]);
    assert.throws(()=>kernel(new Float64Array(4),-1,output),/invalid metabolism animal count/);
    assert.throws(()=>kernel(new Float64Array(4),1.5,output),/invalid metabolism animal count/);
    assert.throws(()=>kernel(new Float64Array(4),100_001,output),/invalid metabolism animal count/);
    assert.throws(()=>kernel(new Float64Array(3),1,output),/input buffer is too small/);
    const shortOutput=new Float64Array([99]);
    assert.throws(()=>kernel(new Float64Array(4),1,shortOutput),/output buffer is too small/);
    assert.deepEqual(Array.from(shortOutput),[99]);
    assert.deepEqual(Array.from(output),[71,72,73]);
    assert.equal(fixture.allocations.length,0);
    kernel.dispose();
  });
});

test('WASM capacity grows geometrically, reuses buffers, and recovers after dispose',async()=>{
  const fixture=createWasmFixture();
  await withInstantiatedFixture(fixture,async()=>{
    const kernel=await loadWasmMetabolism('http://local.test/kernel.wasm',async()=>({ok:true}));
    const input=count=>Float64Array.from({length:count*4},(_,index)=>index);
    assert.deepEqual(Array.from(kernel(input(2))),[1,3,5,7]);
    assert.equal(fixture.allocations.length,2);
    assert.deepEqual(Array.from(kernel(input(1))),[1,3]);
    assert.equal(fixture.allocations.length,2,'capacity is reused while the batch fits');
    assert.deepEqual(Array.from(kernel(input(3))),[1,3,5,7,9,11]);
    assert.equal(fixture.allocations.length,4,'capacity grows only when required');
    assert.equal(fixture.releases.length,2,'old buffers are released after successful growth');
    kernel.dispose();
    assert.equal(fixture.releases.length,4);
    kernel.dispose();
    assert.equal(fixture.releases.length,4,'dispose is idempotent');
    kernel(input(1));
    assert.equal(fixture.allocations.length,6,'disposed kernels allocate again on next use');
    kernel.dispose();
  });
});

test('WASM reads fresh views after memory growth and preserves caller output on ABI status errors',async()=>{
  const growing=createWasmFixture({growDuringUpdate:true});
  await withInstantiatedFixture(growing,async()=>{
    const kernel=await loadWasmMetabolism('http://local.test/kernel.wasm',async()=>({ok:true}));
    const output=new Float64Array([88,89,90]);
    const result=kernel(Float64Array.of(10,20,30,0),1,output);
    assert.deepEqual(Array.from(result),[11,22]);
    assert.deepEqual(Array.from(output),[11,22,90]);
    kernel.dispose();
  });
  const failing=createWasmFixture({status:-3});
  await withInstantiatedFixture(failing,async()=>{
    const kernel=await loadWasmMetabolism('http://local.test/kernel.wasm',async()=>({ok:true}));
    const output=new Float64Array([88,89]);
    assert.throws(()=>kernel(Float64Array.of(10,20,30,0),1,output),/WASM metabolism returned status -3/);
    assert.deepEqual(Array.from(output),[88,89]);
    kernel.dispose();
  });
});

test('WASM reports allocation, fetch, compilation, export, and ABI failures clearly',async()=>{
  const allocation=createWasmFixture({allocateFailureAt:2});
  await withInstantiatedFixture(allocation,async()=>{
    const kernel=await loadWasmMetabolism('http://local.test/kernel.wasm',async()=>({ok:true}));
    assert.throws(()=>kernel(new Float64Array(4)),/could not allocate metabolism buffers for 1 animals/);
    assert.equal(allocation.releases.length,1,'partial allocations are released');
    kernel.dispose();
  });
  await assert.rejects(loadWasmMetabolism('http://local.test/kernel.wasm',async()=>({ok:false,status:503})),/WASM fetch failed: 503/);
  const original=WebAssembly.instantiateStreaming;
  WebAssembly.instantiateStreaming=async()=>{throw new TypeError('bad WASM bytes');};
  try{await assert.rejects(loadWasmMetabolism('http://local.test/kernel.wasm',async()=>({ok:true})),/bad WASM bytes/);}
  finally{WebAssembly.instantiateStreaming=original;}
  for(const [fixture,pattern] of [
    [createWasmFixture({missingExport:'riose_update_metabolism_batch'}),/exports do not match riose-core ABI/],
    [createWasmFixture({abiVersion:2}),/exports do not match riose-core ABI/],
  ])await withInstantiatedFixture(fixture,async()=>assert.rejects(loadWasmMetabolism('http://local.test/kernel.wasm',async()=>({ok:true})),pattern));
});

test('failed capacity growth preserves the previous buffers and keeps them usable',async()=>{
  const fixture=createWasmFixture({allocateFailureAt:4});
  await withInstantiatedFixture(fixture,async()=>{
    const kernel=await loadWasmMetabolism('http://local.test/kernel.wasm',async()=>({ok:true}));
    const input=count=>Float64Array.from({length:count*4},(_,index)=>index);
    assert.deepEqual(Array.from(kernel(input(2))),[1,3,5,7]);
    assert.throws(()=>kernel(input(3)),/could not allocate metabolism buffers for 4 animals/);
    assert.equal(fixture.releases.length,1,'only the partially allocated growth buffer is released');
    assert.deepEqual(Array.from(kernel(input(2))),[1,3,5,7],'old capacity remains live after failed growth');
    kernel.dispose();
    assert.equal(fixture.releases.length,3,'the original pair is released on dispose');
  });
});

test('WASM-backed ticks and comparison replay match the original JavaScript engine',()=>{
  const original=new BaselineFarmEngine(917,40),js=new FarmEngine(917,40),wasm=new FarmEngine(917,40);
  for(const engine of [original,js,wasm])engine.configure({housing:'barn',weather:'hot',diet:'balanced',supplement:1.5});
  original.tick(48);js.tick(48);wasm.tick(48,wasmKernel);
  assert.deepEqual(js.snapshot(),original.snapshot());
  assert.deepEqual(wasm.snapshot(),js.snapshot());
  assert.deepEqual(compare(js.snapshot(),3),compare(original.snapshot(),3));
  assert.deepEqual(compare(wasm.snapshot(),3,wasmKernel),compare(original.snapshot(),3));
  wasmKernel.dispose();
});

test('WASM batch accepts a 100000 animal numeric workload independent of renderer limits',()=>{
  const input=new Float64Array(100_000*4);
  for(let index=0;index<100_000;index++){
    const offset=index*4;input[offset]=360;input[offset+1]=75;input[offset+2]=.4;input[offset+3]=0;
  }
  const output=wasmKernel(input,100_000);
  assert.equal(output.length,200_000);
  assert.ok(Number.isFinite(output[199_998]));
  wasmKernel.dispose();
});

test('local server serves the compiled WASM module with its binary MIME type',async t=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/wasm/riose_core.wasm`);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/wasm');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()).subarray(0,4),Buffer.from([0,97,115,109]));
  for(const path of ['/src/client/worker.js?engine=wasm','/src/client/metabolism-wasm.js','/src/client/scenario-storage.js']){
    const asset=await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    assert.equal(asset.status,200,`${path} should be available to the browser Worker`);
  }
});

test('Worker runs the JavaScript default and falls back for unavailable or invalid WASM modules',async t=>{
  const originalFetch=globalThis.fetch,originalSelf=globalThis.self,originalInstantiate=WebAssembly.instantiateStreaming;
  const run=async(engine,fetchImpl,instantiateImpl=originalInstantiate)=>{
    const harness={messages:[],transfers:[],postMessage(message,transfer=[]){this.messages.push(message);this.transfers.push(transfer);}};
    globalThis.self=harness;
    if(fetchImpl)globalThis.fetch=fetchImpl;
    WebAssembly.instantiateStreaming=instantiateImpl;
    const url=new URL(`../src/client/worker.js?engine=${engine}&run=${Math.random()}`,import.meta.url);
    await import(url.href);
    for(const data of [
      {type:'reset',seed:917,count:40},
      {type:'configure',patch:{housing:'barn',weather:'hot',diet:'balanced',supplement:1.5}},
      {type:'tick',hours:48},
      {type:'snapshot'},
    ])await harness.onmessage({data});
    return {snapshot:harness.messages.at(-1),views:harness.messages.filter(message=>message.type==='view'),transfers:harness.transfers};
  };
  t.after(()=>{globalThis.fetch=originalFetch;globalThis.self=originalSelf;WebAssembly.instantiateStreaming=originalInstantiate;});
  const fetchWasm=async()=>new Response(wasmBytes,{headers:{'content-type':'application/wasm'}});
  const javascript=await run('js',originalFetch);
  const wasm=await run('wasm',fetchWasm);
  const unavailableWasm=await run('wasm',async()=>{throw new Error('simulated missing WASM artifact');});
  const compilationFailure=await run('wasm',fetchWasm,async()=>{throw new TypeError('simulated invalid module');});
  const invalidExports=await run('wasm',fetchWasm,async()=>({instance:{exports:{}}}));
  const invalidAbi=await run('wasm',fetchWasm,async()=>({instance:{exports:{memory:new WebAssembly.Memory({initial:1}),riose_abi_version:()=>2,riose_alloc_f64:()=>1,riose_free_f64:()=>{},riose_update_metabolism_batch:()=>0}}}));
  assert.equal(javascript.snapshot.engineImplementation,'javascript-fallback');
  assert.equal(wasm.snapshot.engineImplementation,'riose-core-wasm/0.1.0');
  assert.equal(unavailableWasm.snapshot.engineImplementation,'javascript-fallback');
  for(const failed of [compilationFailure,invalidExports,invalidAbi])assert.equal(failed.snapshot.engineImplementation,'javascript-fallback');
  assert.deepEqual(wasm.snapshot.state,javascript.snapshot.state);
  assert.deepEqual(unavailableWasm.snapshot.state,javascript.snapshot.state);
  for(const failed of [compilationFailure,invalidExports,invalidAbi])assert.deepEqual(failed.snapshot.state,javascript.snapshot.state);
  const withoutImplementation=views=>views.map(({engineImplementation,...view})=>view);
  assert.deepEqual(withoutImplementation(wasm.views),withoutImplementation(javascript.views));
  assert.deepEqual(withoutImplementation(unavailableWasm.views),withoutImplementation(javascript.views));
  assert.equal(javascript.views.at(-1).animalValues.length,40*4);
  assert.equal(javascript.views.at(-1).animalActions.length,40);
  assert.deepEqual(Array.from(javascript.views.at(-1).animalIds),Array.from({length:40},(_,index)=>index+1));
  assert.equal(javascript.transfers.at(-2).length,3,'entity IDs and packed view buffers are transferred instead of copied');
  assert.equal(javascript.views.at(-1).selectedHistory.length,javascript.snapshot.state.animals[0].history.length);
});
