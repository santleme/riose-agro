import {FarmEngine,compare,replayComparisonManifest} from './engine.js';
import {loadWasmMetabolism,updateMetabolismJS} from './metabolism-wasm.js';

let engine=new FarmEngine();
let metabolismKernel=updateMetabolismJS;
let engineImplementation='javascript-fallback';
const wasmRequested=new URL(import.meta.url).searchParams.get('engine')==='wasm';
const wasmReady=wasmRequested?loadWasmMetabolism().then(kernel=>{
  metabolismKernel=kernel;engineImplementation='riose-core-wasm/0.1.0';
}).catch(()=>{}):Promise.resolve();
const scope=self                                                                                      ;
scope.onmessage=async(event)=>{await wasmReady;try{
  const m=event.data;
  if(m.type==='reset')engine=new FarmEngine(m.seed??2026,m.count??24);
  else if(m.type==='load')engine=FarmEngine.from(m.snapshot);
  else if(m.type==='configure')engine.configure(m.patch                   );
  else if(m.type==='tick')engine.tick(m.hours??1,metabolismKernel);
  else if(m.type==='compare'){scope.postMessage({type:'comparison',data:compare(m.snapshot??engine.snapshot(),m.days??30,metabolismKernel),engineImplementation});return;}
  else if(m.type==='replayComparison'){scope.postMessage({type:'comparison',data:replayComparisonManifest(m.manifest,metabolismKernel),engineImplementation});return;}
  else if(m.type==='snapshot'){}
  scope.postMessage({type:'state',state:engine.snapshot(),engineImplementation});
}catch(error){scope.postMessage({type:'error',message:String(error)});}};
