import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {FarmEngine,compare} from '../engine.js';
import {loadWasmMetabolism,updateMetabolismJS} from '../metabolism-wasm.js';
import {createServer} from '../server.js';

const wasmBytes=await readFile(new URL('../wasm/riose_core.wasm',import.meta.url));
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

test('WASM-backed engine ticks and comparison replay match the JavaScript fallback',()=>{
  const js=new FarmEngine(917,40),wasm=new FarmEngine(917,40);
  js.configure({housing:'barn',weather:'hot',diet:'balanced',supplement:1.5});
  wasm.configure({housing:'barn',weather:'hot',diet:'balanced',supplement:1.5});
  js.tick(48);wasm.tick(48,wasmKernel);
  assert.deepEqual(wasm.snapshot(),js.snapshot());
  assert.deepEqual(compare(wasm.snapshot(),3,wasmKernel),compare(js.snapshot(),3));
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
  for(const path of ['/worker.js?engine=wasm','/metabolism-wasm.js']){
    const asset=await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    assert.equal(asset.status,200,`${path} should be available to the browser Worker`);
  }
});

test('Worker runs the JavaScript default and the opt-in WASM route with identical state',async t=>{
  const originalFetch=globalThis.fetch,originalSelf=globalThis.self;
  const run=async(engine,fetchImpl)=>{
    const harness={messages:[],postMessage(message){this.messages.push(message);}};
    globalThis.self=harness;
    if(fetchImpl)globalThis.fetch=fetchImpl;
    const url=new URL(`../worker.js?engine=${engine}&run=${Math.random()}`,import.meta.url);
    await import(url.href);
    for(const data of [
      {type:'reset',seed:917,count:40},
      {type:'configure',patch:{housing:'barn',weather:'hot',diet:'balanced',supplement:1.5}},
      {type:'tick',hours:48},
    ])await harness.onmessage({data});
    return harness.messages.at(-1);
  };
  t.after(()=>{globalThis.fetch=originalFetch;globalThis.self=originalSelf;});
  const fetchWasm=async()=>new Response(wasmBytes,{headers:{'content-type':'application/wasm'}});
  const javascript=await run('js',originalFetch);
  const wasm=await run('wasm',fetchWasm);
  const unavailableWasm=await run('wasm',async()=>{throw new Error('simulated missing WASM artifact');});
  assert.equal(javascript.engineImplementation,'javascript-fallback');
  assert.equal(wasm.engineImplementation,'riose-core-wasm/0.1.0');
  assert.equal(unavailableWasm.engineImplementation,'javascript-fallback');
  assert.deepEqual(wasm.state,javascript.state);
  assert.deepEqual(unavailableWasm.state,javascript.state);
});
