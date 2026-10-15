import {FarmEngine,compare,compareConfiguredScenarios,replayComparisonManifest,validateConfiguredComparisonManifest} from './engine.js';
import {addLotComparisonContext,createLotScopedSnapshot,validateLotComparisonManifest} from './lot-comparison.js';
import {loadWasmMetabolism,updateMetabolismJS} from './metabolism-wasm.js';
import {runAmdMetabolismBatch} from './amd-metabolism.js';
import {createViewLayout,createWorkerError,createWorkerResponse,decodeWorkerCommand,normalizeWorkerResponse} from './worker-protocol.js';

let engine=new FarmEngine();
let metabolismKernel=updateMetabolismJS;
let engineImplementation='javascript-fallback';
let backendPreference='cpu';
let execution={backend:'cpu',device:null};
let selectedAnimalId=1;
const wasmRequested=new URL(import.meta.url).searchParams.get('engine')==='wasm';
const wasmReady=wasmRequested?loadWasmMetabolism().then(kernel=>{
  metabolismKernel=kernel;engineImplementation='riose-core-wasm/0.1.0';
}).catch(()=>{}):Promise.resolve();
const nativeComparisonReady=typeof fetch==='function'
  ?fetch('/api/native/configured-comparison').then(response=>response.ok?response.json():null)
    .then(status=>status?.available===true).catch(()=>false)
  :Promise.resolve(false);
const scope=self                                                                                      ;
const fullStateUpdates=new URL(import.meta.url).searchParams.get('product')==='1';
const actionCodes={grazing:0,feeding:1,drinking:2,resting:3};
async function configuredComparison(snapshot,options){
  const available=await nativeComparisonReady;
  if(available){
    try{
      const request={type:'configured-comparison',version:2,snapshot,days:options.days??30,
        referenceConfig:options.referenceConfig,scenarioConfig:options.scenarioConfig};
      const response=await fetch('/api/native/configured-comparison',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(120_000)});
      if(!response.ok)throw new Error(`native_http_${response.status}`);
      const native=await response.json(),metadata=native.engine;
      if(!metadata||metadata.validated!==false||typeof metadata.engineVersion!=='string'||typeof metadata.buildId!=='string')throw new Error('native_metadata_invalid');
      const execution={backend:'local-rust',engineVersion:metadata.engineVersion,engineImplementation:`riose-core-native/${metadata.engineVersion}`,buildId:metadata.buildId,
        modelStatus:metadata.modelStatus,runId:native.runId,inputSha256:native.inputSha256,fallbackUsed:false};
      const result={data:native.comparison,execution,engineImplementation:`riose-core-native/${metadata.engineVersion}`};
      normalizeWorkerResponse(createWorkerResponse('comparison',result,result.engineImplementation));
      return result;
    }catch(error){
      const data=compareConfiguredScenarios(snapshot,options,metabolismKernel);
      return {data,engineImplementation,execution:{backend:'local-js',engineImplementation,fallbackUsed:true,
        fallbackReason:error?.code==='INVALID_RESPONSE'||error?.message==='native_metadata_invalid'?'native_result_invalid':'native_runner_failed'}};
    }
  }
  const data=compareConfiguredScenarios(snapshot,options,metabolismKernel);
  return {data,engineImplementation,execution:{backend:'local-js',engineImplementation,fallbackUsed:false,availability:'native_runner_unavailable'}};
}
async function replayConfiguredComparison(manifest){
  validateConfiguredComparisonManifest(manifest);
  return configuredComparison(manifest.initialSnapshot,{days:manifest.periodDays,
    referenceConfig:manifest.scenarios.reference,scenarioConfig:manifest.scenarios.scenario});
}
async function tickWithAmd(hours){
  const candidate=FarmEngine.from(engine.snapshot());
  for(let step=0;step<hours;step++){
    let batch;
    candidate.tick(1,(input,count,output)=>{
      batch=input.slice(0,count*4);
      return updateMetabolismJS(input,count,output);
    },false);
    const result=await runAmdMetabolismBatch(batch,candidate.state.animals.length);
    for(let index=0;index<candidate.state.animals.length;index++){
      const animal=candidate.state.animals[index],offset=index*2;
      animal.weight=result.values[offset];animal.energy=result.values[offset+1];
    }
    execution={backend:result.backend,device:result.device,rocmVersion:result.rocmVersion};
  }
  engine=candidate;
  engineImplementation='pytorch-rocm/livestock-metabolism-v1';
}
function postSnapshot(){scope.postMessage(createWorkerResponse('state',{state:engine.snapshot(),execution},engineImplementation));}
function postUpdate(){if(fullStateUpdates)postSnapshot();else postView();}
function postView(){
  const state=engine.state,animals=state.animals,ids=new Uint32Array(animals.length),values=new Float64Array(animals.length*4),actions=new Uint8Array(animals.length);
  for(let index=0;index<animals.length;index++){
    const animal=animals[index],offset=index*4;
    ids[index]=animal.id;
    const position=engine.viewState.get(animal.id);
    values[offset]=position.x;values[offset+1]=position.y;values[offset+2]=animal.weight;values[offset+3]=animal.initialWeight;
    actions[index]=actionCodes[animal.action]??0;
  }
  const selectedAnimal=animals.find(animal=>animal.id===selectedAnimalId)??animals[0];
  scope.postMessage(createWorkerResponse('view',{hour:state.hour,pastures:state.pastures,cost:state.cost,intake:state.intake,config:state.config,events:state.events.slice(0,20),animalIds:ids,animalValues:values,animalActions:actions,viewLayout:createViewLayout(animals.length),selectedAnimalId:selectedAnimal?.id??null,selectedHistory:engine.historyFor(selectedAnimal),execution},engineImplementation),[ids.buffer,values.buffer,actions.buffer]);
}
scope.onmessage=async(event)=>{await wasmReady;let command;try{
  command=decodeWorkerCommand(event.data).command;
  const m=command;
  if(m.type==='setBackend'){
    backendPreference=m.backend;
    execution=m.backend==='cpu'?{backend:'cpu',device:null}:{backend:'amd-requested',device:null};
    engineImplementation=m.backend==='cpu'?'javascript-fallback':'amd-rocm-pending';
    postSnapshot();return;
  }
  if(m.type==='reset'){engine=new FarmEngine(m.seed??2026,m.count??24);selectedAnimalId=1;}
  else if(m.type==='load'){engine=FarmEngine.from(m.snapshot);selectedAnimalId=m.selectedAnimalId??1;}
  else if(m.type==='configure'){engine.configure(m.patch                   );postUpdate();return;}
  else if(m.type==='select'){selectedAnimalId=m.animalId;postUpdate();return;}
  else if(m.type==='tick'){
    if(backendPreference==='amd')await tickWithAmd(m.hours??1);
    else{engine.tick(m.hours??1,metabolismKernel,false);execution={backend:metabolismKernel===updateMetabolismJS?'cpu':'wasm-cpu',device:null};}
    postUpdate();return;
  }
  else if(m.type==='compare'){scope.postMessage(createWorkerResponse('comparison',{data:compare(m.snapshot??engine.snapshot(),m.days??30,metabolismKernel)},engineImplementation));return;}
  else if(m.type==='compareConfigured'){const result=await configuredComparison(m.snapshot,{referenceConfig:m.referenceConfig,scenarioConfig:m.scenarioConfig,days:m.days??30});scope.postMessage(createWorkerResponse('comparison',result,result.engineImplementation));return;}
  else if(m.type==='compareLotConfigured'){validateLotComparisonManifest(m.manifest);const snapshot=createLotScopedSnapshot(m.manifest.initialSnapshot,m.manifest.lot);const result=await configuredComparison(snapshot,{referenceConfig:m.manifest.scenarios.reference,scenarioConfig:m.manifest.scenarios.scenario,days:m.manifest.periodDays});result.data=addLotComparisonContext(m.manifest,result.data);scope.postMessage(createWorkerResponse('comparison',result,result.engineImplementation));return;}
  else if(m.type==='replayComparison'){scope.postMessage(createWorkerResponse('comparison',{data:replayComparisonManifest(m.manifest,metabolismKernel)},engineImplementation));return;}
  else if(m.type==='replayConfigured'){const result=await replayConfiguredComparison(m.manifest);scope.postMessage(createWorkerResponse('comparison',result,result.engineImplementation));return;}
  else if(m.type==='replayLotConfigured'){validateLotComparisonManifest(m.manifest);const snapshot=createLotScopedSnapshot(m.manifest.initialSnapshot,m.manifest.lot);const result=await configuredComparison(snapshot,{referenceConfig:m.manifest.scenarios.reference,scenarioConfig:m.manifest.scenarios.scenario,days:m.manifest.periodDays});result.data=addLotComparisonContext(m.manifest,result.data);scope.postMessage(createWorkerResponse('comparison',result,result.engineImplementation));return;}
  else if(m.type==='snapshot'){postSnapshot();return;}
  else throw new Error(`Unknown Worker command: ${m.type}.`);
  postSnapshot();
}catch(error){scope.postMessage(createWorkerError(error,command?.type,engineImplementation));}};
