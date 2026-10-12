import {execFileSync} from 'node:child_process';
import {FarmEngine} from '../src/client/engine.js';
import {calculateFeeding} from '../src/client/feeding-model.js';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';

const seed=20261012;
const repetitions=process.env.ANIMAL_LAYOUT_REPETITIONS?Number(process.env.ANIMAL_LAYOUT_REPETITIONS):31;
const warmups=8;
const resultPath=process.env.ANIMAL_LAYOUT_OUTPUT??'docs/evidence/animal-layout-study-2026-10.json';
const maintenance=5.3;
const gainFactor=0.22;

function summarize(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return {sampleCount:sorted.length,medianMs:sorted[Math.floor(sorted.length/2)],minMs:sorted[0],maxMs:sorted.at(-1)};
}
function update(weight,energy,intake,resting){
  const gain=(intake-maintenance*(weight/360)/24)*gainFactor;
  return [Math.max(200,weight+gain),Math.max(0,Math.min(100,energy+(resting?5:intake*4-1.5)))];
}
function inputsFromEngine(count){
  const engine=new FarmEngine(seed,count);
  const c=engine.state.config;
  return engine.state.animals.map((animal,index)=>{
    const hour=index%24;
    const resting=hour<6||hour>=21;
    const feeding=calculateFeeding({weight:animal.weight,housing:c.housing,heatFactor:1,pastureAvailableKgDM:engine.state.pastures[animal.patch],diet:c.diet,supplementKgDMPerDay:c.supplement,assumptions:{baseDemandKgDM:8,maintenanceKgDM:maintenance,gainFactor}});
    return {id:animal.id,weight:animal.weight,energy:animal.energy,intake:feeding.energyIntakeKgDM,resting};
  });
}
function runAos(rows){
  const output=new Float64Array(rows.length*2);
  for(let index=0;index<rows.length;index++){
    const animal=rows[index];const [weight,energy]=update(animal.weight,animal.energy,animal.intake,animal.resting);
    output[index*2]=weight;output[index*2+1]=energy;
  }
  return output;
}
function runAosInPlace(rows){
  for(let index=0;index<rows.length;index++){
    const animal=rows[index];
    [animal.weight,animal.energy]=update(animal.weight,animal.energy,animal.intake,animal.resting);
  }
}
function runColumns(weights,energies,intakes,resting,output){
  for(let index=0;index<weights.length;index++){
    const [weight,energy]=update(weights[index],energies[index],intakes[index],resting[index]!==0);
    output[index*2]=weight;output[index*2+1]=energy;
  }
}
function materializeAos(rows,values){
  return rows.map((animal,index)=>({id:animal.id,weight:values[index*2],energy:values[index*2+1]}));
}
function materializeColumns(rows,values){
  const snapshot=new Array(rows.length);
  for(let index=0;index<rows.length;index++)snapshot[index]={id:rows[index].id,weight:values[index*2],energy:values[index*2+1]};
  return snapshot;
}
function memorySnapshot(){
  globalThis.gc?.();
  return {heapUsedBytes:process.memoryUsage().heapUsed,arrayBuffersBytes:process.memoryUsage().arrayBuffers};
}
function collect(fn){
  for(let i=0;i<warmups;i++)fn();
  const samples=[];
  for(let i=0;i<repetitions;i++){const start=performance.now();fn();samples.push(performance.now()-start);}
  return summarize(samples);
}
function assertClose(actual,expected,label){
  if(actual.length!==expected.length)throw new Error(`${label}: output length differs`);
  for(let i=0;i<actual.length;i++)if(Math.abs(actual[i]-expected[i])>1e-10)throw new Error(`${label}: output differs at ${i}: ${actual[i]} vs ${expected[i]}`);
}

const rows=[];
for(const count of [100,1_000,10_000]){
  const animals=inputsFromEngine(count);
  const expected=runAos(animals);
  const aosState=animals.map(animal=>({...animal}));
  const columnsState=animals.map(animal=>({...animal}));
  const memoryWithObjects=memorySnapshot();
  const weights=new Float64Array(count),energies=new Float64Array(count),intakes=new Float64Array(count),resting=new Uint8Array(count),columnsOut=new Float64Array(count*2);
  const scatteredWeights=new Float64Array(count),scatteredEnergies=new Float64Array(count);
  const memoryWithColumns=memorySnapshot();
  const packed=new Float64Array(count*4),packedOut=new Float64Array(count*2);
  for(let i=0;i<count;i++){
    const animal=animals[i];weights[i]=animal.weight;energies[i]=animal.energy;intakes[i]=animal.intake;resting[i]=animal.resting?1:0;
    packed.set([animal.weight,animal.energy,animal.intake,animal.resting?1:0],i*4);
  }
  runColumns(weights,energies,intakes,resting,columnsOut);assertClose(columnsOut,expected,'typed columns');
  const aosSnapshot=materializeAos(animals,expected);
  const columnsSnapshot=materializeColumns(animals,columnsOut);
  if(JSON.stringify(aosSnapshot)!==JSON.stringify(columnsSnapshot))throw new Error('snapshot materialization differs');
  runAosInPlace(aosState);
  for(let i=0;i<count;i++){const a=columnsState[i];weights[i]=a.weight;energies[i]=a.energy;intakes[i]=a.intake;resting[i]=a.resting?1:0;}
  runColumns(weights,energies,intakes,resting,columnsOut);
  for(let i=0;i<count;i++){columnsState[i].weight=columnsOut[i*2];columnsState[i].energy=columnsOut[i*2+1];}
  assertClose(aosState.flatMap(a=>[a.weight,a.energy]),columnsState.flatMap(a=>[a.weight,a.energy]),'in-place AoS and columns');
  const native=JSON.parse(execFileSync('cargo',['run','--quiet','--release','-p','riose-core','--bin','bench-layout'],{input:JSON.stringify({input:Array.from(packed),repetitions}),encoding:'utf8',maxBuffer:16*1024*1024}));
  assertClose(native.output,expected,'native Rust');
  const aos=collect(()=>runAosInPlace(aosState));
  const columnsKernel=collect(()=>runColumns(weights,energies,intakes,resting,columnsOut));
  const gather=collect(()=>{for(let i=0;i<count;i++){const a=animals[i];weights[i]=a.weight;energies[i]=a.energy;intakes[i]=a.intake;resting[i]=a.resting?1:0;}});
  const scatter=collect(()=>{for(let i=0;i<count;i++){scatteredWeights[i]=columnsOut[i*2];scatteredEnergies[i]=columnsOut[i*2+1];}});
  const endToEndColumns=collect(()=>{
    for(let i=0;i<count;i++){const a=columnsState[i];weights[i]=a.weight;energies[i]=a.energy;intakes[i]=a.intake;resting[i]=a.resting?1:0;}
    runColumns(weights,energies,intakes,resting,columnsOut);
    for(let i=0;i<count;i++){const a=columnsState[i];a.weight=columnsOut[i*2];a.energy=columnsOut[i*2+1];scatteredWeights[i]=a.weight;scatteredEnergies[i]=a.energy;}
  });
  const snapshotAos=collect(()=>materializeAos(animals,expected));
  const snapshotColumns=collect(()=>materializeColumns(animals,columnsOut));
  rows.push({animals:count,fixture:{seed,source:'FarmEngine initialization plus current feeding model',inputValues:4,branchMix:{restingAnimals:animals.filter(a=>a.resting).length}},outputsIdentical:true,memory:{heapUsedWithObjectsBytes:memoryWithObjects.heapUsedBytes,heapUsedWithColumnsBytes:memoryWithColumns.heapUsedBytes,heapDeltaAfterPreallocatedColumnsBytes:memoryWithColumns.heapUsedBytes-memoryWithObjects.heapUsedBytes,typedBuffersExactBytes:weights.byteLength+energies.byteLength+intakes.byteLength+resting.byteLength+columnsOut.byteLength},measurements:{aosEndToEnd:aos,typedColumnsKernel:columnsKernel,typedColumnsGather:gather,typedColumnsScatter:scatter,typedColumnsEndToEnd:endToEndColumns,snapshotMaterializationAos:snapshotAos,snapshotMaterializationColumns:snapshotColumns,nativeRustKernel:summarize(native.samplesMs)},allocationNotes:{perSnapshotVariantObjects:count,typedBufferAllocations:5,peakAllocationCounts:'not instrumented'}});
}
const report={study:'animal-layout-aos-vs-aligned-columns',date:new Date().toISOString().slice(0,10),runtime:{node:process.version,rustc:execFileSync('rustc',['--version'],{encoding:'utf8'}).trim(),optimization:'Rust --release'},workload:{seed,repetitions,warmups,populations:[100,1000,10000],hoursPerBenchmarkIteration:1,source:'deterministic FarmEngine fixture; actual calculateFeeding output; fixed scenario branch order'},results:rows,decision:'Keep object-per-animal state. The isolated typed-column kernel excludes gather/scatter and is not a production end-to-end win unless typedColumnsEndToEnd repeatedly beats AoS with identical outputs.',limitations:['This isolates one-hour weight/energy transition after feeding; it does not benchmark a full 24-hour engine tick or renderer.','Native Rust measures the same packed numeric kernel and fixture but excludes JSON serialization, FFI and process startup.','Heap snapshots are process-level readings after GC and include engine/test harness memory; they are directional. Typed-buffer bytes are exact. Peak allocation counts are not instrumented; per-snapshot output object counts are known.','Feed intake is calculated once from the deterministic initial scenario state and reused to isolate transition layout.']};
await writeFile(resultPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({resultPath,results:rows.map(({animals,measurements})=>({animals,measurements}))},null,2));
