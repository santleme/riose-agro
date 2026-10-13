import {FarmEngine,compare,replayComparisonManifest} from './engine.js';
import {loadWasmMetabolism,updateMetabolismJS} from './metabolism-wasm.js';
import {createViewLayout,createWorkerError,createWorkerResponse,decodeWorkerCommand} from './worker-protocol.js';

let engine=new FarmEngine();
let metabolismKernel=updateMetabolismJS;
let engineImplementation='javascript-fallback';
let selectedAnimalId=1;
const wasmRequested=new URL(import.meta.url).searchParams.get('engine')==='wasm';
const wasmReady=wasmRequested?loadWasmMetabolism().then(kernel=>{
  metabolismKernel=kernel;engineImplementation='riose-core-wasm/0.1.0';
}).catch(()=>{}):Promise.resolve();
const scope=self                                                                                      ;
const fullStateUpdates=new URL(import.meta.url).searchParams.get('product')==='1';
const actionCodes={grazing:0,feeding:1,drinking:2,resting:3};
function postSnapshot(){scope.postMessage(createWorkerResponse('state',{state:engine.snapshot()},engineImplementation));}
function postUpdate(){if(fullStateUpdates)postSnapshot();else postView();}
function postView(){
  const state=engine.state,animals=state.animals,ids=new Uint32Array(animals.length),values=new Float64Array(animals.length*4),actions=new Uint8Array(animals.length);
  for(let index=0;index<animals.length;index++){
    const animal=animals[index],offset=index*4;
    ids[index]=animal.id;
    values[offset]=animal.x;values[offset+1]=animal.y;values[offset+2]=animal.weight;values[offset+3]=animal.initialWeight;
    actions[index]=actionCodes[animal.action]??0;
  }
  const selectedAnimal=animals.find(animal=>animal.id===selectedAnimalId)??animals[0];
  scope.postMessage(createWorkerResponse('view',{hour:state.hour,pastures:state.pastures,cost:state.cost,intake:state.intake,config:state.config,events:state.events.slice(0,20),animalIds:ids,animalValues:values,animalActions:actions,viewLayout:createViewLayout(animals.length),selectedAnimalId:selectedAnimal?.id??null,selectedHistory:engine.historyFor(selectedAnimal)},engineImplementation),[ids.buffer,values.buffer,actions.buffer]);
}
scope.onmessage=async(event)=>{await wasmReady;let command;try{
  command=decodeWorkerCommand(event.data).command;
  const m=command;
  if(m.type==='reset'){engine=new FarmEngine(m.seed??2026,m.count??24);selectedAnimalId=1;}
  else if(m.type==='load'){engine=FarmEngine.from(m.snapshot);selectedAnimalId=m.selectedAnimalId??1;}
  else if(m.type==='configure'){engine.configure(m.patch                   );postUpdate();return;}
  else if(m.type==='select'){selectedAnimalId=m.animalId;postUpdate();return;}
  else if(m.type==='tick'){engine.tick(m.hours??1,metabolismKernel,false);postUpdate();return;}
  else if(m.type==='compare'){scope.postMessage(createWorkerResponse('comparison',{data:compare(m.snapshot??engine.snapshot(),m.days??30,metabolismKernel)},engineImplementation));return;}
  else if(m.type==='replayComparison'){scope.postMessage(createWorkerResponse('comparison',{data:replayComparisonManifest(m.manifest,metabolismKernel)},engineImplementation));return;}
  else if(m.type==='snapshot'){postSnapshot();return;}
  else throw new Error(`Unknown Worker command: ${m.type}.`);
  postSnapshot();
}catch(error){scope.postMessage(createWorkerError(error,command?.type,engineImplementation));}};
