import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {FarmEngine} from '../src/client/engine.js';
import {updateMetabolismJS} from '../src/client/metabolism-wasm.js';

const seed=2026,animalCount=24,repetitions=3;
const endpoint=(process.env.COMPUTE_SERVICE_URL??'http://127.0.0.1:8766').replace(/\/$/,'');
const engine=new FarmEngine(seed,animalCount);
let inputBatch,cpuReference;
engine.tick(1,(input,count,output)=>{
  inputBatch=Array.from(input.slice(0,count*4));
  cpuReference=Array.from(updateMetabolismJS(input,count,output).slice(0,count*2));
  return Float64Array.from(cpuReference);
},false);
const inputSha256=createHash('sha256').update(JSON.stringify(inputBatch)).digest('hex');
const outputSha256=values=>createHash('sha256').update(JSON.stringify(values)).digest('hex');
const availabilityResponse=await fetch(`${endpoint}/api/compute/backends`,{signal:AbortSignal.timeout(5_000)});
if(!availabilityResponse.ok)throw new Error(`Backend detection failed with HTTP ${availabilityResponse.status}`);
const availability=await availabilityResponse.json();
const backends=['cpu','auto','cuda','rocm'];
const absoluteTolerance=1e-12,relativeTolerance=1e-12;
const results={};

async function execute(backend){
  const started=performance.now();
  const response=await fetch(`${endpoint}/api/compute/v1`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({contract_version:'1',operation:'livestock_metabolism_batch',
      payload:{count:animalCount,values:inputBatch},preferred_backend:backend}),
    signal:AbortSignal.timeout(30_000),
  });
  const elapsedMs=performance.now()-started;
  const result=await response.json();
  if(!response.ok)throw new Error(`${backend} request failed with HTTP ${response.status}: ${result.error??'unknown error'}`);
  if(result.backend_requested!==backend||!Array.isArray(result.result?.values)||result.result.values.length!==cpuReference.length){
    throw new Error(`${backend} returned invalid workload or backend metadata`);
  }
  let maxAbsoluteError=0,maxRelativeError=0;
  for(let index=0;index<cpuReference.length;index++){
    const actual=result.result.values[index],expected=cpuReference[index],absolute=Math.abs(expected-actual);
    const relative=expected===0?absolute:absolute/Math.abs(expected);
    if(!Number.isFinite(actual)||absolute>absoluteTolerance+relativeTolerance*Math.abs(expected)){
      throw new Error(`${backend} parity failed at output ${index}: expected=${expected} actual=${actual}`);
    }
    maxAbsoluteError=Math.max(maxAbsoluteError,absolute);
    maxRelativeError=Math.max(maxRelativeError,relative);
  }
  return {values:result.result.values,elapsedMs,backendUsed:result.backend_used,
    backendSelected:result.backend_selected,fallbackUsed:result.fallback_used,
    fallbackReason:result.execution_metadata?.fallback_reason??null,
    device:result.execution_metadata?.device_name??null,
    runtimeVersion:result.execution_metadata?.cuda_version??result.execution_metadata?.rocm_version??null,
    torchVersion:result.execution_metadata?.torch_version??null,maxAbsoluteError,maxRelativeError};
}

const cpu=await execute('cpu');
if(cpu.backendUsed!=='cpu'||cpu.fallbackUsed)throw new Error('CPU reference request did not execute on CPU');
for(const backend of backends.slice(1)){
  const rows=[];
  for(let index=0;index<repetitions;index++)rows.push(await execute(backend));
  const first=JSON.stringify(rows[0].values);
  if(rows.some(row=>JSON.stringify(row.values)!==first))throw new Error(`${backend} output changed across repeated executions`);
  const expectedBackend=backend==='auto'
    ?(availability.auto_order??['cuda','rocm']).find(name=>availability[name]?.available)??'cpu'
    :backend;
  const expectedAvailable=expectedBackend!=='cpu'&&availability[expectedBackend]?.available===true;
  if(expectedAvailable&&rows.some(row=>row.backendUsed==='cpu'))throw new Error(`${backend} detected an accelerator but fell back to CPU`);
  if(!expectedAvailable&&rows.some(row=>row.backendUsed!=='cpu'||!row.fallbackUsed))throw new Error(`${backend} unavailable-runtime response was not reported as CPU fallback`);
  results[backend]={requestedBackend:backend,expectedBackend,availability:backend==='auto'?availability:availability[backend],
    backendUsed:[...new Set(rows.map(row=>row.backendUsed))],fallbackUsed:rows.some(row=>row.fallbackUsed),
    fallbackReasons:[...new Set(rows.map(row=>row.fallbackReason).filter(Boolean))],runs:rows.length,
    deterministic:rows.every(row=>JSON.stringify(row.values)===first),
    parity:{passed:true,absoluteTolerance,relativeTolerance,maxAbsoluteError:Math.max(...rows.map(row=>row.maxAbsoluteError)),
      maxRelativeError:Math.max(...rows.map(row=>row.maxRelativeError))},
    outputSha256:outputSha256(rows[0].values),elapsedMs:rows.map(row=>row.elapsedMs),
    device:rows[0].device,runtimeVersion:rows[0].runtimeVersion,torchVersion:rows[0].torchVersion};
}

process.stdout.write(JSON.stringify({status:'COMPUTE_BACKEND_PARITY_CAPTURED',workload:'riose-livestock-metabolism-batch',
  seed,animalCount,steps:1,input:{values:inputBatch,sha256:inputSha256},cpuReference:{backendUsed:cpu.backendUsed,
    output:cpu.values,outputSha256:outputSha256(cpu.values),elapsedMs:cpu.elapsedMs},availability,
  parityContract:{absoluteTolerance,relativeTolerance,fields:['weight','energy'],ordering:'input animal order'},
  repeatedRuns:repetitions,backends:results,physicalEvidence:{cuda:results.cuda.backendUsed.includes('cuda')?'executed':'not_executed',
    rocm:results.rocm.backendUsed.includes('amd_rocm')?'executed':'not_executed'},
  timingScope:'end-to-end local service request latency; not an accelerator speedup claim'},null,2)+'\n');
