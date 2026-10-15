import {createHash} from 'node:crypto';
import {FarmEngine} from '../src/client/engine.js';
import {updateMetabolismJS} from '../src/client/metabolism-wasm.js';

const contractVersion='1';
const animalCount=24;
const engine=new FarmEngine(2026,animalCount);
let inputBatch,cpuValues;
engine.tick(1,(input,count,output)=>{
  inputBatch=input.slice(0,count*4);
  const result=updateMetabolismJS(input,count,output);
  cpuValues=Array.from(result.slice(0,count*2));
  return result;
},false);
const inputHash=createHash('sha256').update(JSON.stringify(Array.from(inputBatch))).digest('hex');
const endpoint=process.env.AMD_COMPUTE_URL??'http://127.0.0.1:8766/api/compute/v1';
const response=await fetch(endpoint,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({contract_version:contractVersion,operation:'livestock_metabolism_batch',
    payload:{count:animalCount,values:Array.from(inputBatch)},preferred_backend:'amd'}),
  signal:AbortSignal.timeout(30_000),
});
const result=await response.json();
if(!response.ok)throw new Error(`AMD service returned ${response.status}: ${result.error??'unknown_error'}`);
if(result.backend_used!=='amd_rocm'||result.fallback_used!==false){
  throw new Error(`AMD backend did not execute; backend=${result.backend_used??'unknown'} fallback=${result.fallback_used===true} reason=${result.execution_metadata?.fallback_reason??'unreported'}`);
}
const amdValues=result.result?.values;
if(!Array.isArray(amdValues)||amdValues.length!==cpuValues.length)throw new Error('AMD metabolism output length did not match CPU output');
const absoluteTolerance=1e-12,relativeTolerance=1e-12;
let maxAbsoluteDifference=0;
for(let index=0;index<cpuValues.length;index++){
  const absoluteDifference=Math.abs(cpuValues[index]-amdValues[index]);
  const tolerance=absoluteTolerance+relativeTolerance*Math.abs(cpuValues[index]);
  if(!Number.isFinite(amdValues[index])||absoluteDifference>tolerance){
    throw new Error(`CPU/AMD parity failed at output ${index}: cpu=${cpuValues[index]} amd=${amdValues[index]} tolerance=${tolerance}`);
  }
  maxAbsoluteDifference=Math.max(maxAbsoluteDifference,absoluteDifference);
}
process.stdout.write(JSON.stringify({
  status:'AMD_PRODUCT_PATH_FUNCTIONAL',contractVersion,workload:'riose-livestock-metabolism-batch',
  seed:2026,animalCount,inputSha256:inputHash,backendRequested:result.backend_requested,backendUsed:result.backend_used,
  device:result.execution_metadata?.device_name??null,rocmVersion:result.execution_metadata?.rocm_version??null,
  parity:{passed:true,outputs:amdValues.length,absoluteTolerance,relativeTolerance,maxAbsoluteDifference},
},null,2)+'\n');
