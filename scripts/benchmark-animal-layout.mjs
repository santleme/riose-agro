import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {FarmEngine,ASSUMPTIONS} from '../src/client/engine.js';
import {calculateFeeding} from '../src/client/feeding-model.js';
import {getWeatherRules} from '../src/client/environment-model.js';
import {assertBenchmarkReport,benchmarkReport,measurement,summarizeSamples} from './benchmark-report.mjs';
import {evaluateAnimalLayoutDecision} from './animal-layout-decision.mjs';
import {sampleAllocations} from './benchmark-allocation-sampling.mjs';

const scenarioPath=new URL('../tests/scenarios/baseline-pasture.json',import.meta.url);
const scenario=JSON.parse(await readFile(scenarioPath,'utf8'));
const repetitions=Number(process.env.ANIMAL_LAYOUT_REPETITIONS??31);
const warmups=8;
const allocationSamplingIntervalBytes=4096;
if(!Number.isInteger(repetitions)||repetitions<3)throw new Error('ANIMAL_LAYOUT_REPETITIONS must be an integer of at least 3');
if(typeof globalThis.gc!=='function')throw new Error('Run this memory/allocation benchmark with node --expose-gc.');
const resultPath=process.env.ANIMAL_LAYOUT_OUTPUT??'docs/evidence/animal-layout-study-2026-10.json';
const maintenance=ASSUMPTIONS.maintenanceKgDM;
const gainFactor=ASSUMPTIONS.gainFactor;

function summarize(values){
  const stats=summarizeSamples(values);
  return {...stats,observations:[...values]};
}
function nextWeight(weight,intake){
  const gain=(intake-maintenance*(weight/360)/24)*gainFactor;
  return Math.max(200,weight+gain);
}
function nextEnergy(energy,intake,resting){
  return Math.max(0,Math.min(100,energy+(resting?5:intake*4-1.5)));
}
function fixtureEngine(count,hour){
  const engine=new FarmEngine(scenario.engine.seed,count);
  engine.configure(scenario.configuration);
  engine.state.hour=hour-1;
  return engine;
}
function inputsForActualTransition(engine){
  const state=engine.state;
  const config=state.config;
  const targetHour=state.hour+1;
  const time=targetHour%24;
  const environment=getWeatherRules(config.weather);
  const pastures=state.pastures.map(value=>Math.min(2400,value+ASSUMPTIONS.dailyPastureGrowthKgDM*environment.pastureGrowthMultiplier/24));
  return state.animals.map(animal=>{
    const observedThirst=Math.max(0,Math.min(100,animal.thirst+environment.thirstPerHour));
    const reason=time<6||time>=21?'rest_window':observedThirst>65?'thirst_threshold':config.housing==='pasture'?'pasture_housing':'barn_housing';
    const action=reason==='rest_window'?'resting':reason==='thirst_threshold'?'drinking':reason==='pasture_housing'?'grazing':'feeding';
    const feeding=calculateFeeding({weight:animal.weight,housing:config.housing,heatFactor:environment.heatMultiplier,pastureAvailableKgDM:pastures[animal.patch],diet:config.diet,supplementKgDMPerDay:config.supplement,assumptions:ASSUMPTIONS});
    if(config.housing==='pasture')pastures[animal.patch]=feeding.pastureAfterFeedingKgDM;
    return {id:animal.id,weight:animal.weight,energy:animal.energy,intake:feeding.energyIntakeKgDM,resting:action==='resting'};
  });
}
function runAos(rows,output){
  for(let index=0;index<rows.length;index++){
    const animal=rows[index];
    output[index*2]=nextWeight(animal.weight,animal.intake);
    output[index*2+1]=nextEnergy(animal.energy,animal.intake,animal.resting);
  }
}
function runAosInPlace(rows){
  for(let index=0;index<rows.length;index++){
    const animal=rows[index];
    animal.weight=nextWeight(animal.weight,animal.intake);
    animal.energy=nextEnergy(animal.energy,animal.intake,animal.resting);
  }
}
function runColumns(weights,energies,intakes,resting,outputWeights,outputEnergies){
  for(let index=0;index<weights.length;index++){
    outputWeights[index]=nextWeight(weights[index],intakes[index]);
    outputEnergies[index]=nextEnergy(energies[index],intakes[index],resting[index]!==0);
  }
}
function materializeAos(rows,values){
  return rows.map((animal,index)=>({id:animal.id,weight:values[index*2],energy:values[index*2+1]}));
}
function materializeColumns(ids,weights,energies){
  const snapshot=new Array(ids.length);
  for(let index=0;index<ids.length;index++)snapshot[index]={id:ids[index],weight:weights[index],energy:energies[index]};
  return snapshot;
}
function interleaveColumns(weights,energies){
  const values=new Float64Array(weights.length*2);
  for(let index=0;index<weights.length;index++){values[index*2]=weights[index];values[index*2+1]=energies[index];}
  return values;
}
function memorySnapshot(){
  globalThis.gc?.();
  const memory=process.memoryUsage();
  return {heapUsedBytes:memory.heapUsed,arrayBuffersBytes:memory.arrayBuffers};
}
function collect(fn,iterationsPerSample=1){
  for(let index=0;index<warmups;index++)for(let run=0;run<iterationsPerSample;run++)fn();
  const samples=[];
  for(let index=0;index<repetitions;index++){
    const start=performance.now();
    for(let run=0;run<iterationsPerSample;run++)fn();
    samples.push((performance.now()-start)/iterationsPerSample);
  }
  return summarize(samples);
}
function collectPaired(firstFn,secondFn,iterationsPerSample=1){
  const runPair=(firstIndex)=>{
    const first=firstIndex?firstFn:secondFn;
    const second=firstIndex?secondFn:firstFn;
    const time=fn=>{
      const start=performance.now();
      for(let run=0;run<iterationsPerSample;run++)fn();
      return (performance.now()-start)/iterationsPerSample;
    };
    const firstMs=time(first);
    const secondMs=time(second);
    return {firstMs,secondMs};
  };
  for(let index=0;index<warmups;index++)runPair(index%2===0);
  const firstSamples=[],secondSamples=[],orderBySample=[];
  for(let index=0;index<repetitions;index++){
    const firstIndex=(warmups+index)%2===0;
    const pair=runPair(firstIndex);
    firstSamples.push(firstIndex?pair.firstMs:pair.secondMs);
    secondSamples.push(firstIndex?pair.secondMs:pair.firstMs);
    orderBySample.push(firstIndex?'AoS-then-SoA':'SoA-then-AoS');
  }
  return {first:summarize(firstSamples),second:summarize(secondSamples),orderBySample};
}
function expectedAfterRepeatedTransitions(rows,count){
  const expected=rows.map(row=>({...row}));
  for(let iteration=0;iteration<count;iteration++)for(const animal of expected){animal.weight=nextWeight(animal.weight,animal.intake);animal.energy=nextEnergy(animal.energy,animal.intake,animal.resting);}
  return expected.flatMap(animal=>[animal.weight,animal.energy]);
}
function collectTransfer(packetFactory){
  const samples=[];
  let verification=null;
  for(let index=0;index<warmups+repetitions;index++){
    const packet=packetFactory();
    const transferList=Object.values(packet).map(view=>view.buffer);
    const start=performance.now();
    const moved=structuredClone(packet,{transfer:transferList});
    const elapsed=performance.now()-start;
    if(index<warmups)continue;
    samples.push(elapsed);
    if(!verification)verification=moved;
  }
  return {statistics:summarize(samples),verification};
}
function assertClose(actual,expected,label){
  if(actual.length!==expected.length)throw new Error(`${label}: output length differs`);
  for(let index=0;index<actual.length;index++)if(Math.abs(actual[index]-expected[index])>1e-10)throw new Error(`${label}: output differs at ${index}: ${actual[index]} vs ${expected[index]}`);
}
function assertSnapshotsEqual(actual,expected,label){
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${label}: snapshot output differs`);
}

const rows=[];
for(const count of [100,1_000,10_000]){
  for(const hour of [7,22]){
    const inputEngine=fixtureEngine(count,hour);
    const inputs=inputsForActualTransition(inputEngine);
    const expectedEngine=FarmEngine.from(inputEngine.snapshot());
    expectedEngine.tick(1,undefined,false);
    const expected=expectedEngine.state.animals.flatMap(animal=>[animal.weight,animal.energy]);
    const aosOutput=new Float64Array(count*2);
    runAos(inputs,aosOutput);
    assertClose(aosOutput,expected,`AoS against FarmEngine tick (${hour})`);

    const memoryWithObjects=memorySnapshot();
    const ids=Int32Array.from(inputs,animal=>animal.id);
    const weights=new Float64Array(count),energies=new Float64Array(count),intakes=new Float64Array(count),resting=new Uint8Array(count);
    const outputWeights=new Float64Array(count),outputEnergies=new Float64Array(count);
    for(let index=0;index<count;index++){
      const animal=inputs[index];weights[index]=animal.weight;energies[index]=animal.energy;intakes[index]=animal.intake;resting[index]=animal.resting?1:0;
    }
    const memoryWithColumns=memorySnapshot();
    runColumns(weights,energies,intakes,resting,outputWeights,outputEnergies);
    assertClose(interleaveColumns(outputWeights,outputEnergies),expected,'typed columns against FarmEngine tick');
    const nativeInput=new Float64Array(count*4);
    for(let index=0;index<count;index++)nativeInput.set([weights[index],energies[index],intakes[index],resting[index]],index*4);
    const native=JSON.parse(execFileSync('cargo',['run','--quiet','--release','-p','riose-core','--bin','bench-layout'],{input:JSON.stringify({input:Array.from(nativeInput),warmups,repetitions}),encoding:'utf8',maxBuffer:16*1024*1024}));
    assertClose(native.output,expected,'native Rust against FarmEngine tick');

    const aosState=inputs.map(animal=>({...animal}));
    const columnsState=inputs.map(animal=>({...animal}));
    const scatterState=inputs.map(animal=>({...animal}));
    const iterationsPerSample=count<=100?512:count<=1_000?64:8;
    const columnSnapshot=materializeColumns(ids,outputWeights,outputEnergies);
    const aosSnapshot=materializeAos(inputs,aosOutput);
    assertSnapshotsEqual(columnSnapshot,aosSnapshot,'snapshot materialization');
    const columnsKernel=collect(()=>runColumns(weights,energies,intakes,resting,outputWeights,outputEnergies),iterationsPerSample);
    const gather=collect(()=>{for(let index=0;index<count;index++){const animal=inputs[index];weights[index]=animal.weight;energies[index]=animal.energy;intakes[index]=animal.intake;resting[index]=animal.resting?1:0;}},iterationsPerSample);
    const scatter=collect(()=>{for(let index=0;index<count;index++){const animal=scatterState[index];animal.weight=outputWeights[index];animal.energy=outputEnergies[index];}},iterationsPerSample);
    const pairedEndToEnd=collectPaired(()=>runAosInPlace(aosState),()=>{
      for(let index=0;index<count;index++){const animal=columnsState[index];weights[index]=animal.weight;energies[index]=animal.energy;intakes[index]=animal.intake;resting[index]=animal.resting?1:0;}
      runColumns(weights,energies,intakes,resting,outputWeights,outputEnergies);
      for(let index=0;index<count;index++){const animal=columnsState[index];animal.weight=outputWeights[index];animal.energy=outputEnergies[index];}
    },iterationsPerSample);
    const aos=pairedEndToEnd.first;
    const endToEndColumns=pairedEndToEnd.second;
    const timedTransitions=(warmups+repetitions)*iterationsPerSample;
    const expectedRepeated=expectedAfterRepeatedTransitions(inputs,timedTransitions);
    assertClose(aosState.flatMap(animal=>[animal.weight,animal.energy]),expectedRepeated,'AoS benchmark result sink');
    assertClose(columnsState.flatMap(animal=>[animal.weight,animal.energy]),expectedRepeated,'SoA benchmark result sink');
    const snapshotAos=collect(()=>materializeAos(inputs,aosOutput),iterationsPerSample);
    const snapshotColumns=collect(()=>materializeColumns(ids,outputWeights,outputEnergies),iterationsPerSample);

    const objectSnapshot=materializeAos(inputs,aosOutput);
    const objectTransfer=collect(()=>structuredClone(objectSnapshot));
    const inputTransfer=collectTransfer(()=>({ids:ids.slice(),weights:weights.slice(),energies:energies.slice(),intakes:intakes.slice(),resting:resting.slice()}));
    const outputTransfer=collectTransfer(()=>({weights:outputWeights.slice(),energies:outputEnergies.slice()}));
    if(inputTransfer.verification.ids[0]!==inputs[0].id||outputTransfer.verification.weights.length!==count)throw new Error('typed transfer did not preserve stable IDs/output length');
    const serializedSnapshot=JSON.stringify(objectSnapshot);
    const jsonSerialization=collect(()=>JSON.stringify(objectSnapshot));
    const typedBufferBytes=ids.byteLength+weights.byteLength+energies.byteLength+intakes.byteLength+resting.byteLength+outputWeights.byteLength+outputEnergies.byteLength;
    const memoryDelta={heapUsedBytes:memoryWithColumns.heapUsedBytes-memoryWithObjects.heapUsedBytes,arrayBuffersBytes:memoryWithColumns.arrayBuffersBytes-memoryWithObjects.arrayBuffersBytes};
    const restingCount=inputs.reduce((total,animal)=>total+(animal.resting?1:0),0);
    rows.push({animals:count,hour,iterationsPerSample,fixture:{path:'tests/scenarios/baseline-pasture.json',scenarioId:scenario.scenarioId,seed:scenario.engine.seed,scaledFromAnimals:scenario.engine.animalCount,branchMix:{resting:restingCount,active:count-restingCount}},outputsIdentical:true,pairedComparison:{paired:true,orderBySample:pairedEndToEnd.orderBySample},memory:{aosAfterGc:memoryWithObjects,afterAddingColumnBuffersAfterGc:memoryWithColumns,processDeltaAfterGc:memoryDelta,typedBufferBytesExact:typedBufferBytes},allocationNotes:{transitionTemporaryObjects:0,snapshotObjectsPerMaterialization:count,typedArrayBuffers:7,peakAllocationsInstrumented:false},measurements:{aosEndToEnd:aos,typedColumnsKernel:columnsKernel,typedColumnsGather:gather,typedColumnsScatter:scatter,typedColumnsEndToEnd:endToEndColumns,nativeRustKernel:summarize(native.samplesMs),snapshotMaterializationAos:snapshotAos,snapshotMaterializationColumns:snapshotColumns,objectSnapshotStructuredClone:objectTransfer,jsonSerialization},transfer:{inputStructuredCloneTransfer:inputTransfer.statistics,outputStructuredCloneTransfer:outputTransfer.statistics,inputBytes:ids.byteLength+weights.byteLength+energies.byteLength+intakes.byteLength+resting.byteLength,outputBytes:outputWeights.byteLength+outputEnergies.byteLength,jsonSnapshotBytes:Buffer.byteLength(serializedSnapshot)},complexity:{productionCodeChanged:false,alignedColumns:6,stableIdColumn:1,requiredPasses:['gather object fields','update numeric columns','scatter results to objects'],separateSnapshotMaterializer:true,peakAllocationsInstrumented:false}});
  }
}
for(const row of rows){
  const count=row.animals;
  const inputEngine=fixtureEngine(count,row.hour);
  const inputs=inputsForActualTransition(inputEngine);
  const allocationIterations=Math.max(100,Math.ceil(1_000_000/count));
  const allocationAosState=inputs.map(animal=>({...animal}));
  const allocationColumnState=inputs.map(animal=>({...animal}));
  const allocationScatterState=inputs.map(animal=>({...animal}));
  const allocationWeights=new Float64Array(count),allocationEnergies=new Float64Array(count),allocationIntakes=new Float64Array(count),allocationResting=new Uint8Array(count);
  const allocationOutputWeights=new Float64Array(count),allocationOutputEnergies=new Float64Array(count);
  const allocationAosOutput=new Float64Array(count*2);
  const allocationIds=Int32Array.from(inputs,animal=>animal.id);
  for(let index=0;index<count;index++){
    const animal=inputs[index];allocationWeights[index]=animal.weight;allocationEnergies[index]=animal.energy;allocationIntakes[index]=animal.intake;allocationResting[index]=animal.resting?1:0;
  }
  runAos(inputs,allocationAosOutput);
  runColumns(allocationWeights,allocationEnergies,allocationIntakes,allocationResting,allocationOutputWeights,allocationOutputEnergies);
  assertSnapshotsEqual(
    materializeAos(inputs,allocationAosOutput),
    materializeColumns(allocationIds,allocationOutputWeights,allocationOutputEnergies),
    'allocation-profile snapshot materialization fixture',
  );
  let sampledAosSnapshot=null,sampledColumnsSnapshot=null;
  const allocationProfiles={
    aosTransition:await sampleAllocations(()=>runAosInPlace(allocationAosState),allocationIterations,allocationSamplingIntervalBytes,import.meta.url),
    typedColumnsKernel:await sampleAllocations(()=>runColumns(allocationWeights,allocationEnergies,allocationIntakes,allocationResting,allocationOutputWeights,allocationOutputEnergies),allocationIterations,allocationSamplingIntervalBytes,import.meta.url),
    typedColumnsGather:await sampleAllocations(()=>{for(let index=0;index<count;index++){const animal=allocationColumnState[index];allocationWeights[index]=animal.weight;allocationEnergies[index]=animal.energy;allocationIntakes[index]=animal.intake;allocationResting[index]=animal.resting?1:0;}},allocationIterations,allocationSamplingIntervalBytes,import.meta.url),
    typedColumnsScatter:await sampleAllocations(()=>{for(let index=0;index<count;index++){const animal=allocationScatterState[index];animal.weight=allocationOutputWeights[index];animal.energy=allocationOutputEnergies[index];}},allocationIterations,allocationSamplingIntervalBytes,import.meta.url),
    typedColumnsEndToEnd:await sampleAllocations(()=>{
      for(let index=0;index<count;index++){const animal=allocationColumnState[index];allocationWeights[index]=animal.weight;allocationEnergies[index]=animal.energy;allocationIntakes[index]=animal.intake;allocationResting[index]=animal.resting?1:0;}
      runColumns(allocationWeights,allocationEnergies,allocationIntakes,allocationResting,allocationOutputWeights,allocationOutputEnergies);
      for(let index=0;index<count;index++){const animal=allocationColumnState[index];animal.weight=allocationOutputWeights[index];animal.energy=allocationOutputEnergies[index];}
    },allocationIterations,allocationSamplingIntervalBytes,import.meta.url),
    snapshotMaterializationAos:await sampleAllocations(()=>{sampledAosSnapshot=materializeAos(inputs,allocationAosOutput);},allocationIterations,allocationSamplingIntervalBytes,import.meta.url),
    snapshotMaterializationColumns:await sampleAllocations(()=>{sampledColumnsSnapshot=materializeColumns(allocationIds,allocationOutputWeights,allocationOutputEnergies);},allocationIterations,allocationSamplingIntervalBytes,import.meta.url),
  };
  if(sampledAosSnapshot?.length!==count||sampledColumnsSnapshot?.length!==count)throw new Error('allocation sampling did not retain complete snapshot projections');
  row.allocationNotes={...row.allocationNotes,allocationSamplingIterations:allocationIterations,allocationSamplingMethod:'V8 HeapProfiler sampled allocation profile; profile timings are excluded from benchmark measurements',profiles:allocationProfiles};
}
const limitations=['The checked-in baseline-pasture fixture provides the seed/configuration; its three-animal count is scaled to the supported benchmark populations. The one-hour transition input and expected output are generated from FarmEngine itself at active hour 7 and rest hour 22.','Native Rust measures the identical packed input in a pure kernel; it excludes JSON serialization, FFI, Worker queueing and process startup.','Heap/ArrayBuffer readings are process snapshots after GC; exact typed-buffer byte counts are attributable. V8 allocation sampling estimates allocated bytes and identifies sampled call sites, but is statistical and does not measure exact allocation counts or peak live memory. The separate profiling pass is excluded from all timing observations.','Snapshot materialization projects stable ID, weight and energy, not every public FarmEngine snapshot field. JSON serialization separately measures this output projection.'];
const phaseMeasurements=[];
for(const row of rows){
  const details={population:{animals:row.animals,hour:row.hour},source:'scripts/benchmark-animal-layout.mjs'};
  for(const [key,value] of Object.entries(row.measurements)){
    const phase=key.startsWith('snapshot')||key==='objectSnapshotStructuredClone'?'snapshot':key==='jsonSerialization'?'serialization':'engine';
    const iterationsPerSample=['aosEndToEnd','typedColumnsKernel','typedColumnsGather','typedColumnsScatter','typedColumnsEndToEnd','snapshotMaterializationAos','snapshotMaterializationColumns'].includes(key)?row.iterationsPerSample:1;
    phaseMeasurements.push(measurement(phase,key,'ms',summarizeSamples(value.observations),{...details,implementation:key,iterationsPerSample}));
  }
  phaseMeasurements.push(measurement('worker','inputStructuredCloneTransfer','ms',summarizeSamples(row.transfer.inputStructuredCloneTransfer.observations),{...details,bytes:row.transfer.inputBytes,implementation:'typed-column buffers transferred with structuredClone transfer list'}));
  phaseMeasurements.push(measurement('worker','outputStructuredCloneTransfer','ms',summarizeSamples(row.transfer.outputStructuredCloneTransfer.observations),{...details,bytes:row.transfer.outputBytes,implementation:'typed-column buffers transferred with structuredClone transfer list'}));
}
const report=benchmarkReport({
  name:'animal-layout-aos-vs-aligned-columns',
  runtime:{rustc:execFileSync('rustc',['--version'],{encoding:'utf8'}).trim(),optimization:'Rust --release'},
  workload:{seed:scenario.engine.seed,populations:rows.map(row=>({animals:row.animals,scope:'FarmEngine one-hour transition fixture',limit:'FarmEngine maximum 10000',hour:row.hour,iterationsPerSample:row.iterationsPerSample})),repetitions,warmups,fixture:scenario.scenarioId},
  configuration:{warmupRuns:warmups,repetitions},
  phases:{
    engine:{status:'measured',measurements:phaseMeasurements.filter(item=>item.phase==='engine')},
    snapshot:{status:'measured',measurements:phaseMeasurements.filter(item=>item.phase==='snapshot')},
    serialization:{status:'measured',measurements:phaseMeasurements.filter(item=>item.phase==='serialization')},
    worker:{status:'measured',measurements:phaseMeasurements.filter(item=>item.phase==='worker')},
  },
  timingBoundaries:[
    {phase:'engine',timed:['One-hour transition update; AoS writes object state, SoA end-to-end includes gather, aligned numeric update, and scatter.','Native Rust loop over preallocated packed buffers.'],notTimed:['FarmEngine construction, input derivation/feeding, full 24-hour tick, renderer, FFI and process startup.']},
    {phase:'snapshot',timed:['Projection of ID, weight and energy into one output object per animal; structuredClone of the AoS projection.'],notTimed:['Transition kernel execution.']},
    {phase:'worker',timed:['Node structuredClone transfer-list ownership handoff of preallocated numeric input and output buffers.'],notTimed:['Worker scheduling, message queue latency, browser postMessage and computation.']},
    {phase:'serialization',timed:['JSON.stringify of the same AoS output projection.'],notTimed:['Disk I/O and parsing.']},
  ],
  results:{rows,allocationProfiling:{method:'V8 HeapProfiler.startSampling/stopSampling',samplingIntervalBytes:allocationSamplingIntervalBytes,warmupIterations:8,iterationsPerProfile:'max(100, ceil(1000000 / animalCount))',attributedUrl:import.meta.url,profileTimingIncludedInBenchmarkMeasurements:false,estimatedAllocatedBytesAreStatistical:true},codeComplexity:{productionRepresentation:'object per animal',prototypeRepresentation:'six aligned numeric buffers plus stable ID index',additionalPasses:'gather, update, scatter',separateSnapshotMaterializer:true}},
  limitations,
});
report.study='animal-layout-aos-vs-aligned-columns';
report.date=new Date().toISOString().slice(0,10);
report.decisionEvidence=evaluateAnimalLayoutDecision(rows);
report.decision=report.decisionEvidence.recommendation;
report.runtime={...report.runtime,node:process.version};
assertBenchmarkReport(report);
await writeFile(resultPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({resultPath,decision:report.decision,summary:rows.map(row=>({animals:row.animals,hour:row.hour,measurements:Object.fromEntries(Object.entries(row.measurements).map(([key,value])=>[key,value.median])),transfer:{inputMs:row.transfer.inputStructuredCloneTransfer.median,outputMs:row.transfer.outputStructuredCloneTransfer.median},memory:row.memory,typedBufferBytes:row.memory.typedBufferBytesExact}))},null,2));
