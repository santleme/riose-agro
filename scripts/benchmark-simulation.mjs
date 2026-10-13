import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {FarmEngine} from '../src/client/engine.js';
import {loadWasmMetabolism,updateMetabolismJS} from '../src/client/metabolism-wasm.js';
import {benchmarkReport,measurement} from './benchmark-report.mjs';

const repetitions=Number(process.env.BENCH_REPETITIONS??25);
const simulationWarmups=Number(process.env.BENCH_SIMULATION_WARMUPS??10);
const kernelWarmups=Number(process.env.BENCH_KERNEL_WARMUPS??50);
const snapshotWarmups=Number(process.env.BENCH_SNAPSHOT_WARMUPS??10);
const baselineCommit='913b36b9fe5c0877c7b857af3e0488cedcfd0e03';
const baselineSource=execFileSync('git',['show',`${baselineCommit}:engine.js`],{encoding:'utf8'});
const {FarmEngine:BaselineFarmEngine}=await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);
const wasmBytes=await readFile(new URL('../wasm/riose_core.wasm',import.meta.url));
const wasmKernel=await loadWasmMetabolism(new URL('http://benchmark.local/riose_core.wasm'),async()=>
  new Response(wasmBytes,{headers:{'content-type':'application/wasm'}}));

function percentiles(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const median=sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
  return {sampleCount:sorted.length,medianMs:median,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],spreadMs:{min:sorted[0],max:sorted.at(-1),range:sorted.at(-1)-sorted[0]},observationsMs:values};
}

function timeSimulation(count,kernel,Engine=FarmEngine){
  const timings=[];
  for(let run=0;run<repetitions+simulationWarmups;run++){
    const engine=new Engine(20261012,count);
    const start=performance.now();engine.tick(24,kernel);const elapsed=performance.now()-start;
    if(run>=simulationWarmups)timings.push(elapsed);
  }
  return percentiles(timings);
}

function timeKernel(count,kernel){
  const input=new Float64Array(count*4);
  for(let index=0;index<count;index++){
    const offset=index*4;input[offset]=330+(index%70);input[offset+1]=75;
    input[offset+2]=(index%100)/100;input[offset+3]=index%6===0?1:0;
  }
  const output=new Float64Array(count*2);
  for(let warmup=0;warmup<kernelWarmups;warmup++)kernel(input,count,output);
  const timings=[];
  for(let run=0;run<repetitions;run++){
    const start=performance.now();const result=kernel(input,count,output);const elapsed=performance.now()-start;
    if(result.length!==count*2)throw new Error('kernel returned wrong output length');
    timings.push(elapsed);
  }
  return percentiles(timings);
}

function timeSnapshotTransfer(count){
  const engine=new FarmEngine(20261012,count);
  const snapshot=engine.snapshot();
  const json=JSON.stringify(snapshot);
  const measure=operation=>{
    for(let warmup=0;warmup<snapshotWarmups;warmup++)operation();
    const timings=[];
    for(let run=0;run<repetitions;run++){
      const start=performance.now();operation();timings.push(performance.now()-start);
    }
    return percentiles(timings);
  };
  return {
    animals:count,
    engineSnapshotClone:measure(()=>engine.snapshot()),
    structuredCloneProxy:measure(()=>structuredClone(snapshot)),
    jsonStringify:{...measure(()=>JSON.stringify(snapshot)),bytes:Buffer.byteLength(json)},
  };
}

const simulation=[];
for(const count of [100,1_000,10_000]){
  simulation.push({animals:count,baselineJavaScript:timeSimulation(count,updateMetabolismJS,BaselineFarmEngine),javascript:timeSimulation(count,updateMetabolismJS),wasm:timeSimulation(count,wasmKernel)});
}
const kernel=[];
for(const count of [100,1_000,10_000,100_000]){
  kernel.push({animals:count,javascript:timeKernel(count,updateMetabolismJS),wasm:timeKernel(count,wasmKernel)});
}
const stateTransfer=[100,1_000,10_000].map(timeSnapshotTransfer);

const results={
  environment:{node:process.version,platform:process.platform,arch:process.arch,wasmBytes:wasmBytes.length},
  baselineCommit,repetitions,warmupRuns:{simulation:simulationWarmups,kernel:kernelWarmups,stateTransfer:snapshotWarmups},seed:20261012,tickHours:24,
  notes:['Simulation timings include the JS engine tick and final snapshot clone, but exclude construction and rendering.','State-transfer rows separately time engine snapshot cloning, structuredClone as a Worker-transfer proxy, and JSON.stringify.','Kernel timings include JS/WASM bridge copies and result-buffer handling.','100000 animals is a numeric-kernel-only case because FarmEngine currently caps herds at 10000.','Memory allocation counts are not exposed by this harness.'],
  simulation,kernel,stateTransfer,
  wasmLinearMemoryBytes:wasmKernel.memoryBytes(),
  processMemoryAfterBytes:process.memoryUsage(),
};
const engineMeasurements=simulation.flatMap(row=>['baselineJavaScript','javascript','wasm'].map(implementation=>measurement('engine','tick24h','ms',row[implementation],{population:row.animals,scope:'FarmEngine',implementation})));
const kernelMeasurements=kernel.flatMap(row=>['javascript','wasm'].map(implementation=>measurement('engine','metabolismBatch','ms',row[implementation],{population:row.animals,scope:'numeric-kernel',implementation,limit:row.animals>10_000?'numeric-kernel-only':null})));
const snapshotMeasurements=stateTransfer.flatMap(row=>['engineSnapshotClone','structuredCloneProxy','jsonStringify'].map(operation=>measurement(operation==='jsonStringify'?'serialization':'snapshot',operation,'ms',row[operation],{population:row.animals,bytes:row[operation].bytes??null})));
console.log(JSON.stringify(benchmarkReport({
  name:'simulation-engine',
  runtime:{rust:process.env.RUSTC_VERSION??null},
  workload:{seed:20261012,populations:[...simulation.map(row=>({animals:row.animals,scope:'FarmEngine',limit:'FarmEngine maximum 10000'})),...kernel.filter(row=>row.animals===100_000).map(row=>({animals:row.animals,scope:'numeric-kernel-only',limit:'isolated numeric kernel; not FarmEngine or renderer'}))]},
  configuration:{warmupRuns:{simulation:simulationWarmups,kernel:kernelWarmups,stateTransfer:snapshotWarmups},repetitions},
  phases:{
    engine:{status:'measured',measurements:[...engineMeasurements,...kernelMeasurements]},
    snapshot:{status:'measured',measurements:snapshotMeasurements.filter(item=>item.phase==='snapshot')},
    serialization:{status:'measured',measurements:snapshotMeasurements.filter(item=>item.phase==='serialization')},
  },
  timingBoundaries:[
    {phase:'engine',timed:['FarmEngine.tick(24) including its final snapshot clone.','JS/WASM metabolism batch including ABI copies.'],notTimed:['FarmEngine construction.','Rendering and Worker messaging.']},
    {phase:'snapshot',timed:['engine.snapshot() clone or structuredClone of the captured snapshot.'],notTimed:['Engine construction and simulation tick.']},
    {phase:'serialization',timed:['JSON.stringify of the captured full snapshot.'],notTimed:['JSON.parse and storage/compression.']},
  ],
  results,
  limitations:results.notes,
}),null,2));
wasmKernel.dispose();
