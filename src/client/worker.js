import {FarmEngine,compare,compareConfiguredScenarios,replayComparisonManifest,validateConfiguredComparisonManifest} from './engine.js';
import {addLotComparisonContext,createLotScopedSnapshot,validateLotComparisonManifest} from './lot-comparison.js';
import {runPopulationComparison} from './population-experiment.js';
import {loadWasmMetabolism,updateMetabolismJS} from './metabolism-wasm.js';
import {createWorkerError,createWorkerResponse,decodeWorkerCommand,normalizeWorkerResponse} from './worker-protocol.js';

let engine=new FarmEngine();
let metabolismKernel=updateMetabolismJS;
let engineImplementation='javascript-fallback';
const wasmRequested=new URL(import.meta.url).searchParams.get('engine')==='wasm';
const wasmReady=wasmRequested?loadWasmMetabolism().then(kernel=>{
  metabolismKernel=kernel;engineImplementation='riose-core-wasm/0.1.0';
}).catch(()=>{}):Promise.resolve();
const nativeComparisonReady=typeof fetch==='function'
  ?fetch('/api/native/configured-comparison').then(response=>response.ok?response.json():null)
    .then(status=>status?.available===true).catch(()=>false)
  :Promise.resolve(false);
const scope=self                                                                                      ;
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
function postSnapshot(){scope.postMessage(createWorkerResponse('state',{state:engine.snapshot()},engineImplementation));}
scope.onmessage=async(event)=>{await wasmReady;let command;try{
  command=decodeWorkerCommand(event.data).command;
  const m=command;
  if(m.type==='reset'){engine=new FarmEngine(m.seed??2026,m.count??24);}
  else if(m.type==='load'){engine=FarmEngine.from(m.snapshot);}
  else if(m.type==='configure'){engine.configure(m.patch                   );postSnapshot();return;}
  else if(m.type==='tick'){engine.tick(m.hours??1,metabolismKernel,false);postSnapshot();return;}
  else if(m.type==='compare'){scope.postMessage(createWorkerResponse('comparison',{data:compare(m.snapshot??engine.snapshot(),m.days??30,metabolismKernel)},engineImplementation));return;}
  else if(m.type==='compareConfigured'){const result=await configuredComparison(m.snapshot,{referenceConfig:m.referenceConfig,scenarioConfig:m.scenarioConfig,days:m.days??30});scope.postMessage(createWorkerResponse('comparison',result,result.engineImplementation));return;}
  else if(m.type==='populationCompare'){const data=runPopulationComparison(m.snapshot,{referenceConfig:m.referenceConfig,scenarioConfig:m.scenarioConfig,days:m.days,onProgress:progress=>scope.postMessage(createWorkerResponse('progress',progress,'javascript-population-observations'))});scope.postMessage(createWorkerResponse('population',{data},'javascript-population-observations'));return;}
  else if(m.type==='compareLotConfigured'){validateLotComparisonManifest(m.manifest);const snapshot=createLotScopedSnapshot(m.manifest.initialSnapshot,m.manifest.lot);const result=await configuredComparison(snapshot,{referenceConfig:m.manifest.scenarios.reference,scenarioConfig:m.manifest.scenarios.scenario,days:m.manifest.periodDays});result.data=addLotComparisonContext(m.manifest,result.data);scope.postMessage(createWorkerResponse('comparison',result,result.engineImplementation));return;}
  else if(m.type==='replayComparison'){scope.postMessage(createWorkerResponse('comparison',{data:replayComparisonManifest(m.manifest,metabolismKernel)},engineImplementation));return;}
  else if(m.type==='replayConfigured'){const result=await replayConfiguredComparison(m.manifest);scope.postMessage(createWorkerResponse('comparison',result,result.engineImplementation));return;}
  else if(m.type==='replayLotConfigured'){validateLotComparisonManifest(m.manifest);const snapshot=createLotScopedSnapshot(m.manifest.initialSnapshot,m.manifest.lot);const result=await configuredComparison(snapshot,{referenceConfig:m.manifest.scenarios.reference,scenarioConfig:m.manifest.scenarios.scenario,days:m.manifest.periodDays});result.data=addLotComparisonContext(m.manifest,result.data);scope.postMessage(createWorkerResponse('comparison',result,result.engineImplementation));return;}
  else if(m.type==='snapshot'){postSnapshot();return;}
  else throw new Error(`Unknown Worker command: ${m.type}.`);
  postSnapshot();
}catch(error){scope.postMessage(createWorkerError(error,command?.type,engineImplementation));}};
