import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {FarmEngine,metrics,compare,compareConfiguredScenarios,createComparisonManifest,validateComparisonManifest,createConfiguredComparisonManifest,validateConfiguredComparisonManifest,replayComparisonManifest,replayConfiguredComparisonManifest} from '../src/client/engine.js';
import {SCENARIO_PRESETS,getScenarioPreset,createScenarioPresetSnapshot} from '../src/client/scenario-presets.js';
import {simulateNelorePastureScenario,analyzePastureDmiSensitivity,BR_CORTE_PASTURE_DMI} from '../scientific/br_corte_pasture_dmi.js';
import {createRunRecord,recordRun,listRuns,getRun,runCompatibility,getRunHistoryStats,exportRunHistory,clearRunHistory,MAX_RUNS,MAX_RUN_HISTORY_BYTES,RUN_HISTORY_KEY} from '../src/client/run-history.js';
import {encodeScenarioSnapshot,decodeScenarioSnapshot} from '../src/client/scenario-storage.js';
import {resolveLotSelection,formatLotArea,resolveDemoLot,isolateDemoLotSnapshot,createDemoLotContext,validateDemoLotContext,createDemoLotManifestEnvelope,validateDemoLotManifestEnvelope,DEMO_LOT_MODEL} from '../src/client/lot-selection.js';
import {assessLotSimulationReadiness} from '../src/client/lot-simulation-readiness.js';
import {validateFarmSnapshot} from '../src/client/snapshot-validator.js';
import {calculateLotMetrics,findPaddockField} from '../src/client/lot-metrics.js';
import {createLotComparisonManifest,createLotScopedSnapshot,compareLotConfiguredScenarios,replayLotComparisonManifest,validateLotComparisonManifest,LOT_COMPARISON_MANIFEST_TYPE} from '../src/client/lot-comparison.js';
import {calculateThi,THI_SOURCE} from '../src/client/thermal-index.js';
import {initialEnvironmentState,updateEnvironmentInput,environmentDiffRows} from '../src/client/environment-inputs.js';
import {createViewLayout,normalizeWorkerResponse,WORKER_PROTOCOL_VERSION} from '../src/client/worker-protocol.js';
import {combineLegacySnapshot,createAnimalViewStateDTO,separateLegacySnapshot} from '../src/client/animal-view-state.js';

// Execute the UI handlers against a small DOM/worker harness, without browser dependencies.
async function openFarm(saved=[],activeId=null,promptValue=null,seedStorage=[],confirmValue=true){
const html=await readFile(new URL('../lab.html',import.meta.url),'utf8');
  const elements=new Map(),messages=[],workerMessages=[],downloads=[],storage=new Map([['agroville-scenarios-v1',JSON.stringify(saved)],['agroville-active-scenario-v1',activeId],...seedStorage]);
  let scheduledFrame,mapDrawCalls=0;const drawing=new Proxy({}, {get:(_,key)=>key==='drawImage'?()=>mapDrawCalls++:()=>{}});
  function element(){return {value:'',textContent:'',innerHTML:'',disabled:false,dataset:{},files:[],scrollTop:0,clientHeight:400,classList:{toggle(){}},addEventListener(name,handler){this['on'+name]=handler;},setAttribute(key,value){this[key]=value;},replaceChildren(){},add(){},getContext:()=>drawing,getBoundingClientRect(){return {left:0,top:0,width:576,height:336};},setPointerCapture(){},showModal(){this.open=true;},close(){this.open=false;},click(){this.clicked=true;}};}
  for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
  let worker,fetches=0,lastState=null;
  const context=vm.createContext({
    metrics,createComparisonManifest,validateComparisonManifest,createConfiguredComparisonManifest,validateConfiguredComparisonManifest,createLotComparisonManifest,createLotScopedSnapshot,compareLotConfiguredScenarios,replayLotComparisonManifest,validateLotComparisonManifest,LOT_COMPARISON_MANIFEST_TYPE,simulateNelorePastureScenario,analyzePastureDmiSensitivity,BR_CORTE_PASTURE_DMI,SCENARIO_PRESETS,getScenarioPreset,createScenarioPresetSnapshot,createRunRecord,recordRun,listRuns,getRun,runCompatibility,getRunHistoryStats,exportRunHistory,clearRunHistory,MAX_RUNS,MAX_RUN_HISTORY_BYTES,encodeScenarioSnapshot,decodeScenarioSnapshot,resolveLotSelection,formatLotArea,assessLotSimulationReadiness,validateFarmSnapshot,calculateLotMetrics,findPaddockField,calculateThi,THI_SOURCE,initialEnvironmentState,updateEnvironmentInput,environmentDiffRows,normalizeWorkerResponse,WORKER_PROTOCOL_VERSION,combineLegacySnapshot,createAnimalViewStateDTO,separateLegacySnapshot,structuredClone,Blob,
    Worker:class {constructor(){worker=this;}postMessage(message){workerMessages.push(structuredClone(message));if(message.type==='snapshot'){if(lastState&&worker.onmessage)worker.onmessage({data:{type:'state',state:structuredClone(lastState),engineImplementation:'javascript-fallback'}});return;}messages.push(structuredClone(message));}},
    resolveDemoLot,isolateDemoLotSnapshot,createDemoLotContext,validateDemoLotContext,createDemoLotManifestEnvelope,validateDemoLotManifestEnvelope,DEMO_LOT_MODEL,
    document:{getElementById:id=>elements.get(id),createElement:()=>element(),querySelectorAll:()=>[],addEventListener(){}},
    window:{addEventListener(){}},location:{search:''},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    Option:class {},URLSearchParams,Image:class {set src(value){this.onload?.();}},performance:{now:()=>0},requestAnimationFrame(callback){scheduledFrame=callback;},setTimeout(){return 1;},clearTimeout(){},
    URL:{createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},
    fetch(url){if(String(url).startsWith('/api/')){fetches++;throw new Error('comparison must not invoke the LLM');}if(String(url)==='/assets/manifest.json')return Promise.resolve({ok:true,json:async()=>({atlases:{test:{image:'test.png'}},assets:['cow-beef','cow-dairy'].map(id=>({id,frame:{atlas:'test',x:0,y:0,w:1,h:1}}))})});return Promise.resolve({ok:false,json:async()=>({})});},
    prompt:()=>promptValue,confirm:()=>confirmValue
  });
  let source=(await readFile(new URL('../src/client/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
  const workerStart=source.indexOf('const workerUrl=');
  const workerEnd=source.indexOf("const worker=new Worker(workerUrl,{type:'module'});",workerStart)+"const worker=new Worker(workerUrl,{type:'module'});".length;
  source=source.slice(0,workerStart)+"const worker=new Worker();"+source.slice(workerEnd);
  vm.runInContext(source,context,{filename:'app.js'});
  const deliver=(type,value,engineImplementation='javascript-fallback')=>{if(type==='state')lastState=structuredClone(value);worker.onmessage({data:{type,...(type==='state'?{state:value,engineImplementation}:type==='error'?{message:value}:type==='view'?{...value,engineImplementation}:{data:value,engineImplementation})}});};
  return {elements,messages,workerMessages,downloads,storage,deliver,readState:()=>vm.runInContext('structuredClone(state)',context),readViewState:()=>vm.runInContext('structuredClone(viewState)',context),selectPaddock(index){vm.runInContext(`selectPaddock(${index})`,context);},setScientificPreviewActive(value){vm.runInContext('scientificPreviewActive='+Boolean(value),context);},renderLotSelection(){vm.runInContext('renderLotSelection()',context);},fetches:()=>fetches,renderMap(time=1000){mapDrawCalls=0;scheduledFrame(time);return mapDrawCalls;}};
}
async function waitFor(check,timeout=5000){const deadline=Date.now()+timeout;while(!check()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(check(),'timed out waiting for the browser harness');}

test('map comparison freezes one snapshot, changes one configured factor only, and never applies the alternative',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(89,5);
  assert.equal(ui.workerMessages[0].protocolVersion,WORKER_PROTOCOL_VERSION,'the browser sends the versioned Worker envelope');
  farm.configure({diet:'balanced',supplement:1.5,weather:'rain',housing:'barn'});
  farm.tick(24);
  const snapshot=farm.snapshot();
  ui.deliver('state',snapshot,'riose-core-wasm/0.1.0');
  assert.match(ui.elements.get('engine-status').textContent,/RUST\/WASM/);
  assert.match(ui.elements.get('animal-history').innerHTML,/Estado observado pelo motor/);
  assert.doesNotMatch(ui.elements.get('animal-history').innerHTML,/Estado simulado registrado pelo motor/);
  ui.messages.length=0;
  ui.elements.get('experiment').onclick();
  ui.elements.get('compare').onclick();
  assert.equal(ui.messages.length,1,'a second click must not replace the in-flight comparison snapshot');
  const request=ui.messages[0];
  assert.equal(request.type,'compareConfigured');
  assert.deepEqual(request.snapshot,snapshot);
  assert.equal(request.days,30);
  assert.deepEqual(Object.keys(request.referenceConfig).filter(key=>request.referenceConfig[key]!==request.scenarioConfig[key]),['housing']);
  assert.equal(ui.elements.get('play')['aria-label'],'Continuar simulação');
  const otherFarm=new FarmEngine(12,24);
  otherFarm.configure({weather:'hot'});
  ui.deliver('state',otherFarm.snapshot());
  const result=compareConfiguredScenarios(request.snapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:request.days});
  ui.deliver('comparison',result);
  assert.match(ui.elements.get('compareconfig').textContent,/5 animais.*Balanceada.*1,5.*pasto.*chuvoso/);
  assert.equal(ui.elements.get('comparison').open,true);
  assert.match(ui.elements.get('results').innerHTML,/Diferença alternativa − base:/);
  assert.match(ui.elements.get('results').innerHTML,/relativa:/);
  assert.match(ui.elements.get('comparison-assumptions').innerHTML,/Sem calibração suficiente/);
  assert.match(ui.elements.get('compareconfig').textContent,/Semente: 89/);
  assert.match(ui.elements.get('comparison-variables').innerHTML,/Identidade no snapshot executado · 5 animais/);
  assert.match(ui.elements.get('comparison-variables').innerHTML,/IDs e pesos abaixo são entradas do estado simulado/);
  assert.match(ui.elements.get('comparison-variables').innerHTML,/sprites da fazenda são apenas representativos/);
  for(const animal of snapshot.animals)assert.match(ui.elements.get('comparison-variables').innerHTML,new RegExp('>'+animal.id+'<'));
  assert.equal(result.validated,false);
  assert.deepEqual(farm.snapshot(),snapshot);
  assert.equal(ui.messages.some(message=>message.type==='configure'),false);
  assert.equal(ui.fetches(),0);
});

test('farm map lot flow runs, scopes, persists and replays the selected demo lot',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(3501,24),initial=farm.snapshot();
  ui.deliver('state',initial);
  ui.selectPaddock(1);
  assert.match(ui.elements.get('lot-selection-status').textContent,/Conecte um snapshot/);
  assert.match(ui.elements.get('demo-lot-status').textContent,/demo-paddock-2/);
  assert.equal(ui.elements.get('demo-lot-compare').disabled,false);
  assert.deepEqual(JSON.parse(ui.storage.get('agroville-farm-selection-v1')),{domainZoneId:'paddock-2',lotId:null,demoLotId:'demo-paddock-2'});
  ui.elements.set('lot-demo-intervention',{value:'supplement'});
  const selectedLot=initial.animals.filter(animal=>animal.patch===1).map(animal=>animal.id);
  ui.elements.get('demo-lot-compare').onclick();
  const request=ui.messages.at(-1);
  assert.equal(request.type,'compareConfigured');
  assert.deepEqual(request.snapshot.animals.map(animal=>animal.id),selectedLot);
  assert.ok(request.snapshot.animals.every(animal=>animal.patch===1));
  assert.equal(request.snapshot.initialSeed,initial.initialSeed);
  assert.deepEqual(Object.keys(request.referenceConfig).filter(key=>request.referenceConfig[key]!==request.scenarioConfig[key]),['supplement']);
  const result=compareConfiguredScenarios(request.snapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:request.days});
  ui.deliver('comparison',result);
  assert.match(ui.elements.get('lot-comparison-context').innerHTML,/demo-paddock-2/);
  const history=JSON.parse(ui.storage.get('agroville-run-history-v1'));
  assert.equal(history.runs.length,1);
  assert.equal(history.runs[0].lotContext.lotId,'demo-paddock-2');
  assert.equal(history.runs[0].manifest.type,'riose-configured-comparison');
  ui.elements.get('run-history-select').value=history.runs[0].id;
  ui.elements.get('run-history-replay').onclick();
  assert.equal(ui.messages.at(-1).type,'replayConfigured');
  assert.equal(ui.messages.at(-1).manifest.type,'riose-configured-comparison');
  ui.deliver('comparison',compareConfiguredScenarios(request.snapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:request.days}));
  assert.equal(JSON.parse(ui.storage.get('agroville-run-history-v1')).runs.length,2);
});

test('configured comparison captures one snapshot, sends two configs differing only by the selected factor, and labels its outputs demonstrative',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(91,5);farm.configure({diet:'pasture',weather:'rain',supplement:1});const snapshot=farm.snapshot();ui.deliver('state',snapshot);
  ui.elements.get('comparison-factor').value='diet';ui.elements.get('comparison-factor').onchange();
  assert.equal(ui.elements.get('comparison-reference').value,'pasture');assert.equal(ui.elements.get('comparison-scenario').value,'balanced');
  ui.elements.get('compare').onclick();
  ui.deliver('state',snapshot);
  const request=ui.messages.at(-1);assert.equal(request.type,'compareConfigured');assert.deepEqual(request.snapshot,snapshot);assert.equal(request.days,30);
  const changed=Object.keys(request.referenceConfig).filter(key=>request.referenceConfig[key]!==request.scenarioConfig[key]);assert.deepEqual(changed,['diet']);
  const result=compareConfiguredScenarios(request.snapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:request.days});
  ui.deliver('comparison',result);
  assert.match(ui.elements.get('compareconfig').textContent,/Único fator configurado diferente: dieta/);
  assert.match(ui.elements.get('compareconfig').textContent,/motor agroville-engine\/1/);
  assert.match(ui.elements.get('compareconfig').textContent,/Referência: volumoso \/ pasto; alternativa: balanceada/);
  assert.match(ui.elements.get('comparison-assumptions').innerHTML,/não demonstram efeito causal/);
  assert.equal(result.validated,false);assert.deepEqual(farm.snapshot(),snapshot);
});

test('configured comparison manifest import validates and replays through the additive worker command',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(77,4).snapshot(),referenceConfig={...snapshot.config,weather:'normal'},scenarioConfig={...snapshot.config,weather:'hot'};
  const manifest=createConfiguredComparisonManifest(snapshot,{referenceConfig,scenarioConfig,days:7});validateConfiguredComparisonManifest(manifest);
  await ui.elements.get('manifest-file').onchange({target:{files:[{text:async()=>JSON.stringify(manifest)}]}});
  assert.equal(ui.messages.at(-1).type,'replayConfigured');assert.deepEqual(ui.messages.at(-1).manifest,manifest);
  ui.deliver('comparison',replayConfiguredComparisonManifest(manifest));
  assert.match(ui.elements.get('compareconfig').textContent,/Único fator configurado diferente: clima/);
  assert.match(ui.elements.get('compareconfig').textContent,/Referência: ameno; alternativa: calor/);
});

test('supplement comparison exposes kg MS per animal per day and serializes numeric values',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(44,3).snapshot();ui.deliver('state',snapshot);ui.elements.get('comparison-factor').value='supplement';ui.elements.get('comparison-factor').onchange();
  ui.elements.get('comparison-reference').value='0.5';ui.elements.get('comparison-scenario').value='2';ui.elements.get('comparison-reference').onchange();
  assert.equal(ui.elements.get('comparison-reference-unit').textContent,'kg MS/animal/dia');assert.equal(ui.elements.get('comparison-scenario-unit').textContent,'kg MS/animal/dia');
  ui.elements.get('compare').onclick();ui.deliver('state',snapshot);const request=ui.messages.at(-1);
  assert.equal(request.referenceConfig.supplement,0.5);assert.equal(request.scenarioConfig.supplement,2);
  const result=compareConfiguredScenarios(snapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:30});ui.deliver('comparison',result);
  assert.match(ui.elements.get('compareconfig').textContent,/Referência: 0,5 kg MS\/animal\/dia; alternativa: 2,0 kg MS\/animal\/dia/);
  assert.match(ui.elements.get('comparison-variables').innerHTML,/Fator alterado: suplemento/);
  assert.match(ui.elements.get('comparison-variables').innerHTML,/0,5 kg MS\/animal\/dia/);
  ui.elements.get('export').onclick();
  const csv=await ui.downloads.at(-1).text();
  assert.match(csv,/fator_comparado,valor_referencia,valor_alternativa/);
  assert.match(csv,/suplemento,0\.5,2/);
  assert.doesNotMatch(csv,/confinamento_final|pasto_final/);
});

test('configured comparison worker errors retain the last successful result and manifest',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(19,3).snapshot();ui.deliver('state',snapshot);ui.elements.get('compare').onclick();ui.deliver('state',snapshot);
  const first=ui.messages.at(-1);ui.deliver('comparison',compareConfiguredScenarios(first.snapshot,{referenceConfig:first.referenceConfig,scenarioConfig:first.scenarioConfig,days:first.days}));
  ui.elements.get('manifest-export').onclick();const previousManifest=await ui.downloads.at(-1).text();
  ui.elements.get('comparison-factor').value='weather';ui.elements.get('comparison-factor').onchange();ui.elements.get('compare').onclick();ui.deliver('state',snapshot);
  assert.equal(ui.messages.at(-1).type,'compareConfigured');ui.deliver('error','Comparison failed');
  assert.equal(ui.elements.get('compare').disabled,false);assert.match(ui.elements.get('notice').textContent,/Comparison failed/);
  ui.elements.get('manifest-export').onclick();assert.equal(await ui.downloads.at(-1).text(),previousManifest);
});

test('worker view keeps motion outside scientific state and joins values by stable ID after reorder',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(31,3).snapshot();
  ui.deliver('state',snapshot);
  const diet=ui.elements.get('diet');diet.value='balanced';diet.onchange({target:diet});
  const animals=[...snapshot.animals].reverse(),ids=new Uint32Array(animals.map(animal=>animal.id));
  const values=new Float64Array(animals.length*4),actions=new Uint8Array(animals.length),actionNames=['grazing','feeding','drinking','resting'];
  animals.forEach((animal,index)=>{const offset=index*4;values.set([100+animal.id,200+animal.id,300+animal.id,400+animal.id],offset);actions[index]=animal.id%actionNames.length;});
  ui.deliver('view',{hour:snapshot.hour+1,pastures:snapshot.pastures,cost:snapshot.cost,intake:snapshot.intake,
    config:{...snapshot.config,diet:'balanced'},events:snapshot.events.slice(0,20),animalIds:ids,animalValues:values,animalActions:actions,
    viewLayout:createViewLayout(animals.length),selectedAnimalId:1,selectedHistory:[]});
  const updated=ui.readState();
  const positions=new Map(ui.readViewState().animals.map(animal=>[animal.id,animal]));
  for(const animal of updated.animals){
    assert.equal(Object.hasOwn(animal,'x'),false);
    assert.equal(Object.hasOwn(animal,'y'),false);
    assert.deepEqual([positions.get(animal.id).x,positions.get(animal.id).y,animal.weight,animal.initialWeight],
      [100+animal.id,200+animal.id,300+animal.id,400+animal.id]);
    assert.equal(animal.action,actionNames[animal.id%actionNames.length]);
  }
});

test('Worker view reordering preserves selected animal identity and Canvas hit testing',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(104,3).snapshot();
  ui.deliver('state',snapshot);
  ui.elements.get('animals').onclick({target:{closest:()=>({dataset:{animal:'2'}})}});
  const ids=new Uint32Array([3,2,1]),values=new Float64Array([330,230,503,603,320,220,502,602,310,210,501,601]);
  ui.deliver('view',{hour:snapshot.hour,pastures:snapshot.pastures,cost:snapshot.cost,intake:snapshot.intake,config:snapshot.config,events:snapshot.events,
    animalIds:ids,animalValues:values,animalActions:new Uint8Array([0,1,2]),viewLayout:createViewLayout(3),selectedAnimalId:2,selectedHistory:[]});
  assert.match(ui.elements.get('animalname').innerHTML,/#002/);
  assert.equal(ui.elements.get('animalweight').textContent,'502,0 kg');
  const map=ui.elements.get('map'),event={clientX:320,clientY:220,pointerId:1};
  map.onpointerdown(event);map.onpointerup(event);
  assert.equal(ui.messages.at(-1).type,'select');
  assert.equal(ui.messages.at(-1).animalId,2);
});

test('observational lot snapshots fail closed at the FarmEngine comparison gate',async()=>{
  const snapshot=JSON.parse(await readFile(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json',import.meta.url),'utf8'));
  const readiness=assessLotSimulationReadiness(snapshot,snapshot.lots[0]);
  assert.equal(readiness.status,'blocked');
  assert.equal(readiness.snapshotId,snapshot.snapshotId);
  assert.deepEqual(readiness.animalIds,['eartag-242']);
  assert.deepEqual(readiness.blockers.map(item=>item.code),[
    'NOT_FARM_BASELINE','SNAPSHOT_NOT_ELIGIBLE','NO_REVIEWED_ENGINE_ADAPTER','NO_OBSERVED_INTERVENTION'
  ]);
  assert.match(readiness.blockers.at(-1).message,/ADG observado/);
});

test('connected observed lot stays descriptive and is never attributed to the demonstrative comparison',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(702,8).snapshot();
  ui.deliver('state',snapshot);
  const farmSnapshot=JSON.parse(await readFile(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json',import.meta.url),'utf8'));
  farmSnapshot.paddocks[0].domainZoneId='paddock-1';farmSnapshot.lots[0].paddockId='19N';
  await ui.elements.get('snapshot-connect-file').onchange({target:{files:[{text:async()=>JSON.stringify(farmSnapshot)}]}});
  assert.equal(ui.elements.get('lot-compare').disabled,true,'selection waits for a spatial link from map zone to snapshot paddock');
  const patch={x:28,y:38,w:148,h:104};let point;
  for(let y=patch.y+2;y<patch.y+patch.h-2&&!point;y+=2)for(let x=patch.x+2;x<patch.x+patch.w-2;x+=2)if(snapshot.animals.every(animal=>animal.patch!==0||Math.hypot(animal.x-x,animal.y-y)>=16)){point={x,y};break;}
  assert.ok(point,'fixture leaves a tappable area in the paddock');
  const map=ui.elements.get('map'),event={clientX:point.x,clientY:point.y,pointerId:1};map.onpointerdown(event);map.onpointerup(event);
  assert.equal(ui.elements.get('lot-compare').disabled,true);
  assert.match(ui.elements.get('lot-compare').textContent,/bloqueada/);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/eartag-242/);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/Não informada/);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/não definem uma intervenção pareada/);
  assert.deepEqual(JSON.parse(ui.storage.get('agroville-farm-selection-v1')),{domainZoneId:'paddock-1',lotId:farmSnapshot.lots[0].id,demoLotId:'demo-paddock-1'});
  assert.equal(ui.messages.some(message=>message.type==='compareConfigured'),false);
  assert.equal(ui.storage.has('agroville-last-lot-comparison-v1'),false);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/eartag-242/);
});

test('the map runs, records and replays a one-factor comparison for only its registered demo lot',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(812,8),baseline=farm.snapshot();ui.deliver('state',baseline);
  const patch={x:28,y:38,w:148,h:104};let point;
  for(let y=patch.y+2;y<patch.y+patch.h-2&&!point;y+=2)for(let x=patch.x+2;x<patch.x+patch.w-2;x+=2)if(baseline.animals.filter(animal=>animal.patch===0).every(animal=>Math.hypot(animal.x-x,animal.y-y)>=16)){point={x,y};break;}
  assert.ok(point,'selected paddock has an open map point');
  const map=ui.elements.get('map'),event={clientX:point.x,clientY:point.y,pointerId:1};map.onpointerdown(event);map.onpointerup(event);
  assert.equal(ui.elements.get('demo-lot-compare').disabled,false);
  assert.equal(ui.elements.get('lot-compare').disabled,true,'observed data stays blocked');
  assert.deepEqual(JSON.parse(ui.storage.get('agroville-farm-selection-v1')),{domainZoneId:'paddock-1',lotId:null,demoLotId:'demo-paddock-1'});
  ui.elements.get('lot-demo-intervention').value='diet';ui.elements.get('lot-demo-intervention').onchange();
  ui.elements.get('demo-lot-compare').onclick();
  const request=ui.messages.at(-1),lotSnapshot=request.snapshot;
  assert.equal(request.type,'compareConfigured');
  assert.ok(lotSnapshot.animals.length>0);
  assert.ok(lotSnapshot.animals.every(animal=>animal.patch===0));
  assert.deepEqual(Object.keys(request.referenceConfig).filter(key=>request.referenceConfig[key]!==request.scenarioConfig[key]),['diet']);
  assert.equal(request.referenceConfig.diet,baseline.config.diet);
  assert.equal(lotSnapshot.initialSeed,baseline.initialSeed);
  assert.deepEqual(farm.snapshot(),baseline,'the whole-farm simulator state is not mutated');
  const demoContext=createDemoLotContext(resolveDemoLot(baseline,0),'diet',request.referenceConfig,request.scenarioConfig);
  const demoManifest=createDemoLotManifestEnvelope(createConfiguredComparisonManifest(lotSnapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:request.days}),demoContext);
  assert.equal(validateDemoLotManifestEnvelope(demoManifest),true);
  const legacyEnvelope=structuredClone(demoManifest);legacyEnvelope.manifest.type='agroville-comparison';
  assert.throws(()=>validateDemoLotManifestEnvelope(legacyEnvelope),/manifesto configurado/);
  const invalidIdEnvelope=structuredClone(demoManifest);invalidIdEnvelope.lotContext.animalIds[0]=0;invalidIdEnvelope.manifest.initialSnapshot.animals[0].id=0;
  assert.throws(()=>validateDemoLotManifestEnvelope(invalidIdEnvelope),/incompatível/);
  validateConfiguredComparisonManifest(demoManifest.manifest);
  const result=compareConfiguredScenarios(lotSnapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:request.days});
  ui.deliver('comparison',result);
  const history=listRuns({getItem:key=>ui.storage.get(key)??null});
  assert.equal(history.length,1);
  assert.equal(history[0].lotContext.lotId,'demo-paddock-1');
  assert.equal(history[0].lotContext.model.status,'demonstrative_unvalidated');
  assert.deepEqual(history[0].lotContext.animalIds,lotSnapshot.animals.map(animal=>animal.id));
  assert.match(ui.elements.get('lot-comparison-context').innerHTML,/demo-paddock-1/);
  ui.elements.get('export').onclick();
  const csv=await ui.downloads.at(-1).text();
  assert.match(csv,/escopo_lote_id,animais_lote_ids,modelo_id,modelo_versao,modelo_status,evidencia_modelo_status,evidencia_modelo_referencia/);
  assert.match(csv,/demo-paddock-1/);
  assert.match(csv,/riose-registered-demo-lot,1\.0\.0,demonstrative_unvalidated,no_empirical_validation,src\/client\/engine\.js/);
  ui.elements.get('manifest-export').onclick();
  assert.equal(JSON.parse(await ui.downloads.at(-1).text()).lotContext.lotId,'demo-paddock-1');
  const exported=await ui.downloads.at(-1).text();
  await ui.elements.get('manifest-file').onchange({target:{files:[{text:async()=>exported}]}});
  assert.equal(ui.messages.at(-1).type,'replayConfigured');
  assert.deepEqual(ui.readState(),separateLegacySnapshot(baseline).state);
  ui.elements.get('run-history-select').value=history[0].id;ui.elements.get('run-history-replay').onclick();
  assert.equal(ui.messages.at(-1).type,'replayConfigured');
  assert.deepEqual(ui.messages.at(-1).manifest,history[0].manifest);
  assert.equal(ui.elements.get('demo-lot-status').textContent.includes('não validado'),true);
  assert.equal(DEMO_LOT_MODEL.status,'demonstrative_unvalidated');
});

test('demo lot comparisons stay disabled during scientific preview',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(902,8).snapshot();ui.deliver('state',snapshot);
  const patch={x:28,y:38,w:148,h:104};let point;
  for(let y=patch.y+2;y<patch.y+patch.h-2&&!point;y+=2)for(let x=patch.x+2;x<patch.x+patch.w-2;x+=2)if(snapshot.animals.filter(animal=>animal.patch===0).every(animal=>Math.hypot(animal.x-x,animal.y-y)>=16)){point={x,y};break;}
  assert.ok(point);
  const map=ui.elements.get('map'),event={clientX:point.x,clientY:point.y,pointerId:1};map.onpointerdown(event);map.onpointerup(event);
  assert.equal(ui.elements.get('demo-lot-compare').disabled,false);
  ui.setScientificPreviewActive(true);ui.renderLotSelection();
  assert.equal(ui.elements.get('demo-lot-compare').disabled,true);
  assert.match(ui.elements.get('demo-lot-status').textContent,/prévia científica BR-CORTE/);
  ui.elements.get('demo-lot-compare').onclick();
  assert.equal(ui.messages.some(message=>message.type==='snapshot'),false);
});

test('lot metrics, environmental edits, THI and linked selection persist through the existing comparison and reload',async()=>{
  const ui=await openFarm(),simulatorSnapshot=new FarmEngine(702,8).snapshot();ui.deliver('state',simulatorSnapshot);
  const farmSnapshot=JSON.parse(await readFile(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json',import.meta.url),'utf8'));
  farmSnapshot.paddocks[0].domainZoneId='paddock-1';farmSnapshot.lots[0].paddockId='19N';
  farmSnapshot.farm.environment={temperature_c:{path:'farm.environment.temperature_c',value:24,unit:'°C',status:'observed',sourceId:'usda-cper-moonitor-2019-2020',sourceLocator:'estação meteorológica',populationValidity:'ambiente no local'},relative_humidity_pct:{path:'farm.environment.relative_humidity_pct',value:60,unit:'%',status:'observed',sourceId:'usda-cper-moonitor-2019-2020',sourceLocator:'estação meteorológica',populationValidity:'ambiente no local'}};
  farmSnapshot.observations.push({path:'paddock.19N.area_ha',value:0.5,unit:'ha',status:'observed',sourceId:'usda-cper-moonitor-2019-2020',sourceLocator:'croqui do piquete',populationValidity:'área do piquete',measurementId:'fixture-area-0-5ha',observedAt:'2019-01-01T00:00:00Z'},{path:'paddock.19N.trough_length_m',value:12,unit:'m',status:'observed',sourceId:'usda-cper-moonitor-2019-2020',sourceLocator:'croqui do piquete',populationValidity:'infraestrutura do piquete',measurementId:'fixture-trough-12m',observedAt:'2019-01-01T00:00:00Z'});
  await ui.elements.get('snapshot-connect-file').onchange({target:{files:[{text:async()=>JSON.stringify(farmSnapshot)}]}});
  const patch={x:28,y:38,w:148,h:104};let point;
  for(let y=patch.y+2;y<patch.y+patch.h-2&&!point;y+=2)for(let x=patch.x+2;x<patch.x+patch.w-2;x+=2)if(simulatorSnapshot.animals.every(animal=>animal.patch!==0||Math.hypot(animal.x-x,animal.y-y)>=16)){point={x,y};break;}
  assert.ok(point);
  const map=ui.elements.get('map'),event={clientX:point.x,clientY:point.y,pointerId:1};map.onpointerdown(event);map.onpointerup(event);
  assert.equal(ui.elements.get('environment-temperature').value,'24');
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/12,00 m\/animal/);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/2,00 animais\/ha/);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/5.000,00 m²\/animal/);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/animais ÷ área em hectares/);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/área convertida para m² ÷ animais/);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/comprimento de cocho ÷ animais do lote/);
  ui.elements.get('environment-temperature').value='26.8';ui.elements.get('environment-temperature').onchange({target:ui.elements.get('environment-temperature')});
  ui.elements.get('environment-humidity').value='57.5';ui.elements.get('environment-humidity').onchange({target:ui.elements.get('environment-humidity')});
  assert.match(ui.elements.get('environment-thi').textContent,/75,0/);
  const persisted=JSON.parse(ui.storage.get('agroville-environment-scenario-v1'));
  assert.equal(persisted.baseline.temperatureC.value,24);assert.equal(persisted.current.temperatureC,'26.8');
  assert.equal(ui.elements.get('lot-compare').disabled,true,'connected observational data cannot silently become the demonstrative engine state');
  ui.elements.get('compare').onclick();ui.deliver('state',simulatorSnapshot);
  assert.deepEqual(ui.messages.at(-1).snapshot,simulatorSnapshot);
  const request=ui.messages.at(-1);ui.deliver('comparison',compareConfiguredScenarios(simulatorSnapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:30}));
  assert.equal(ui.elements.get('lot-comparison-context').hidden,true);
  assert.equal(ui.storage.has('agroville-last-lot-comparison-v1'),false);
  const savedRun=JSON.parse(ui.storage.get('agroville-run-history-v1')).runs[0];
  assert.equal(savedRun.environmentState.current.temperatureC,'26.8');
  assert.equal(savedRun.environmentState.current.relativeHumidityPct,'57.5');
  assert.match(ui.elements.get('comparison-variables').innerHTML,/24 °C/);
  assert.match(ui.elements.get('comparison-variables').innerHTML,/26\.8 °C/);
  assert.match(ui.elements.get('comparison-thermal').innerHTML,/75,0/);
  assert.match(ui.elements.get('comparison-thermal').innerHTML,/índice ambiental/);
  ui.elements.get('comparison').close();
  const reopened=await openFarm([],null,null,[...ui.storage]);
  assert.equal(reopened.elements.get('environment-temperature').value,'26.8');
  assert.match(reopened.elements.get('lot-selection-details').innerHTML,/eartag-242/);
  assert.equal(JSON.parse(reopened.storage.get('agroville-farm-selection-v1')).lotId,farmSnapshot.lots[0].id);
});

test('legacy snapshots leave absent environmental values unavailable and invalid snapshots do not replace them',async()=>{
  const ui=await openFarm();
  const legacy=JSON.parse(await readFile(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json',import.meta.url),'utf8'));
  await ui.elements.get('snapshot-connect-file').onchange({target:{files:[{text:async()=>JSON.stringify(legacy)}]}});
  assert.equal(ui.elements.get('environment-temperature').value,'');
  assert.equal(ui.elements.get('environment-humidity').value,'');
  assert.match(ui.elements.get('environment-thi').textContent,/indisponível/i);
  assert.equal(ui.storage.has('agroville-farm-snapshot-v1'),true);
  await ui.elements.get('snapshot-connect-file').onchange({target:{files:[{text:async()=>JSON.stringify({schemaVersion:'0.1.0',snapshotId:'partial'})}]}});
  assert.match(ui.elements.get('notice').textContent,/Campos obrigatórios ausentes/);
  assert.equal(JSON.parse(ui.storage.get('agroville-farm-snapshot-v1')).snapshotId,legacy.snapshotId);
});

test('completed comparison is persisted and its original manifest can be replayed',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(17,3).snapshot();
  ui.deliver('state',farm);
  ui.elements.get('compare').onclick();
  const request=ui.messages.at(-1),result=compareConfiguredScenarios(request.snapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:request.days});
  ui.deliver('comparison',result);
  const saved=listRuns({getItem:key=>ui.storage.get(key)??null});
  assert.equal(saved.length,1);
  assert.equal(saved[0].status,'completed');
  ui.elements.get('run-history-select').value=saved[0].id;
  ui.elements.get('run-history-replay').onclick();
  assert.equal(ui.messages.at(-1).type,'replayConfigured');
  assert.deepEqual(ui.messages.at(-1).manifest,saved[0].manifest);
});

test('failed comparison is recorded without a stack trace',async()=>{
  const ui=await openFarm();ui.deliver('state',new FarmEngine(17,3).snapshot());
  ui.elements.get('compare').onclick();
  ui.deliver('error','engine failed');
  const saved=listRuns({getItem:key=>ui.storage.get(key)??null});
  assert.equal(saved[0].status,'failed');
  assert.equal(saved[0].error,'engine failed');
  assert.doesNotMatch(JSON.stringify(saved[0]),/stack|C:\\Users/);
});

test('run-history controls export the stored envelope and clear only run history',async()=>{
  const manifest=createComparisonManifest(new FarmEngine(17,3).snapshot(),30),run=createRunRecord({manifest,result:compare(manifest.initialSnapshot,30),id:'history-copy'});
  const raw=JSON.stringify({version:1,runs:[run]}),ui=await openFarm([],null,null,[[RUN_HISTORY_KEY,raw]]);
  assert.match(ui.elements.get('run-history-status').textContent,/1\/20 execução/);
  assert.match(ui.elements.get('run-history-status').textContent,/2 MiB do limite local/);

  ui.elements.get('run-history-export').onclick();
  assert.equal(ui.downloads.length,1);
  assert.equal(await ui.downloads[0].text(),raw);

  ui.elements.get('run-history-clear').onclick();
  assert.equal(ui.storage.has(RUN_HISTORY_KEY),false);
  assert.equal(ui.storage.has('agroville-scenarios-v1'),true);
  assert.match(ui.elements.get('notice').textContent,/Histórico local removido/);
});

test('run-history cleanup leaves storage unchanged when confirmation is declined',async()=>{
  const raw='malformed history',ui=await openFarm([],null,null,[[RUN_HISTORY_KEY,raw]],false);
  ui.elements.get('run-history-clear').onclick();
  assert.equal(ui.storage.get(RUN_HISTORY_KEY),raw);
});

test('large herds use a bounded accessible animal-list window',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(81,10_000);
  ui.deliver('state',farm.snapshot());
  const list=ui.elements.get('animals');
  assert.equal((list.innerHTML.match(/class="animal-row/g)??[]).length,12);
  assert.match(list.innerHTML,/aria-setsize="10000"/);
  list.scrollTop=960;list.onscroll();
  assert.equal((list.innerHTML.match(/class="animal-row/g)??[]).length,15);
  assert.match(list.innerHTML,/aria-posinset="18"/);
});

test('map only draws animals inside the zoomed camera viewport',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(91,100);
  ui.deliver('state',farm.snapshot());await new Promise(resolve=>setTimeout(resolve,0));ui.elements.get('play').onclick();
  for(let zoom=0;zoom<8;zoom++)ui.elements.get('zoomin').onclick();
  const drawCalls=ui.renderMap();
  assert.ok(drawCalls>1,'the terrain remains visible');
  assert.ok(drawCalls-1<farm.state.animals.length,'offscreen animals do not issue sprite draws');
});

test('compressed scenario snapshots round-trip and load from the versioned storage format',async()=>{
  const farm=new FarmEngine(823,1000);farm.tick(24);const snapshot=farm.snapshot();
  const snapshotData=await encodeScenarioSnapshot(snapshot);
  assert.deepEqual(await decodeScenarioSnapshot(snapshotData),snapshot);
  assert.ok(snapshotData.length*4/3<JSON.stringify(snapshot).length*.6,'gzip should substantially reduce this repeated state');
  const saved={type:'agroville-scenarios-gzip-v1',scenarios:[{id:'packed',name:'Compactado',selected:1,summary:{hour:snapshot.hour,config:snapshot.config,eventCount:snapshot.events.length},snapshotData}]};
  const ui=await openFarm(saved,'packed');await waitFor(()=>ui.messages.some(message=>message.type==='load'));
  assert.equal(ui.messages[0].type,'load');
  assert.deepEqual(ui.messages[0].snapshot,snapshot);
});

test('scenario save writes compressed data and legacy snapshots migrate without changing state',async()=>{
  const snapshot=new FarmEngine(774,300).snapshot(),ui=await openFarm([],null,'Compacto');
  ui.deliver('state',snapshot);ui.elements.get('scenario-save').onclick();
  await new Promise(resolve=>setTimeout(resolve,50));
  const stored=JSON.parse(ui.storage.get('agroville-scenarios-v1'));
  assert.equal(stored.type,'agroville-scenarios-gzip-v1');
  assert.equal(stored.scenarios.length,1);
  assert.deepEqual(await decodeScenarioSnapshot(stored.scenarios[0].snapshotData),snapshot);

  const legacy={id:'old',name:'Legado',selected:1,snapshot},legacyUi=await openFarm([legacy]);
  await new Promise(resolve=>setTimeout(resolve,50));
  const migrated=JSON.parse(legacyUi.storage.get('agroville-scenarios-v1'));
  assert.equal(migrated.type,'agroville-scenarios-gzip-v1');
  assert.deepEqual(await decodeScenarioSnapshot(migrated.scenarios[0].snapshotData),snapshot);
});

test('manifest can be reopened from the map and uses its herd, conditions and horizon in UI and CSV',async()=>{
  const ui=await openFarm();
  ui.deliver('state',new FarmEngine(2026,24).snapshot());
  ui.messages.length=0;
  ui.elements.get('manifest-open').onclick();
  assert.equal(ui.elements.get('manifest-file').clicked,true);
  const farm=new FarmEngine(123,3);
  farm.configure({weather:'rain'});
  const manifest=createComparisonManifest(farm.snapshot(),7);
  await ui.elements.get('manifest-file').onchange({target:{files:[{text:async()=>JSON.stringify(manifest)}]}});
  assert.equal(ui.messages[0].type,'replayComparison');
  assert.equal(ui.messages.some(message=>message.type==='load'||message.type==='configure'),false);
  const result=replayComparisonManifest(ui.messages[0].manifest);
  ui.deliver('comparison',result);
  assert.match(ui.elements.get('compareconfig').textContent,/Horizonte: 7 dias.*3 animais.*Configurações iguais fora do fator: Volumoso \/ pasto.*chuvoso/);
  assert.match(ui.elements.get('chart')['aria-label'],/kg\/animal durante 7 dias/);
  const consumption=(result.rows.at(-1).scenarioConsumptionKgDM/3).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
  assert.ok(ui.elements.get('results').innerHTML.includes(consumption+' kg MS/animal'));
  assert.match(ui.elements.get('results').innerHTML,/relativa: indefinida \(base zero\)/);
  assert.doesNotMatch(ui.elements.get('results').innerHTML,/NaN|Infinity/);
  ui.elements.get('export').onclick();
  const csv=await ui.downloads.at(-1).text(),lines=csv.split('\n');
  const header=lines[0].split(','),last=lines.at(-1).split(',');
  assert.equal(Number(last[header.indexOf('consumo_alternativa_kgMS_animal')]),Number((result.rows.at(-1).scenarioConsumptionKgDM/3).toFixed(4)));
  ui.elements.get('manifest-export').onclick();
  assert.deepEqual(JSON.parse(await ui.downloads.at(-1).text()),manifest);
  assert.equal(ui.fetches(),0);
});

test('reopened saved snapshots flow into the existing comparison manifest unchanged',async()=>{
  const farm=new FarmEngine(91,4);
  farm.configure({diet:'concentrate',supplement:2,weather:'hot'});
  farm.tick(48);
  const saved={id:'saved-91',name:'Cenário salvo',snapshot:farm.snapshot(),selected:2};
  const ui=await openFarm([saved]);
  ui.deliver('state',new FarmEngine().snapshot());
  ui.messages.length=0;
  ui.elements.get('scenario-select').onchange({target:{value:saved.id}});
  assert.equal(ui.messages[0].type,'load');
  assert.deepEqual(ui.messages[0].snapshot,saved.snapshot);
  ui.deliver('state',FarmEngine.from(ui.messages[0].snapshot).snapshot());
  ui.elements.get('compare').onclick();
  const request=ui.messages.at(-1);
  assert.equal(request.type,'compareConfigured');
  assert.deepEqual(request.snapshot,saved.snapshot);
  ui.deliver('comparison',compareConfiguredScenarios(request.snapshot,{referenceConfig:request.referenceConfig,scenarioConfig:request.scenarioConfig,days:request.days}));
  ui.elements.get('manifest-export').onclick();
  const manifest=JSON.parse(await ui.downloads.at(-1).text());
  assert.deepEqual(manifest.initialSnapshot,saved.snapshot);
  assert.deepEqual(replayConfiguredComparisonManifest(manifest),compareConfiguredScenarios(saved.snapshot,{referenceConfig:manifest.scenarios.reference,scenarioConfig:manifest.scenarios.scenario,days:30}));
});

test('invalid manifest leaves the current comparison available',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(5,2).snapshot();
  ui.deliver('state',snapshot);
  ui.elements.get('compare').onclick();
  ui.deliver('comparison',compare(snapshot,30));
  const before=ui.messages.length;
  await ui.elements.get('manifest-file').onchange({target:{files:[{text:async()=>'{"type":"unknown"}'}]}});
  assert.equal(ui.messages.length,before);
  assert.match(ui.elements.get('notice').textContent,/Manifesto inválido:/);
  assert.equal(ui.elements.get('compare').disabled,false);
  ui.elements.get('manifest-export').onclick();
  assert.deepEqual(JSON.parse(await ui.downloads.at(-1).text()).initialSnapshot,snapshot);
});

test('manifest claiming validation is rejected without replacing the current demonstrative result',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(6,2).snapshot();
  ui.deliver('state',snapshot);
  ui.elements.get('compare').onclick();
  ui.deliver('comparison',compare(snapshot,2));
  const previous=ui.elements.get('results').innerHTML;
  const forged={...createComparisonManifest(snapshot,2),validated:true};
  await ui.elements.get('manifest-file').onchange({target:{files:[{text:async()=>JSON.stringify(forged)}]}});
  assert.match(ui.elements.get('notice').textContent,/Manifesto inválido: Manifesto deve preservar/);
  assert.equal(ui.messages.some(message=>message.type==='replayComparison'),false);
  assert.equal(ui.elements.get('compare').disabled,false);
  assert.equal(ui.elements.get('results').innerHTML,previous);
  ui.elements.get('manifest-export').onclick();
  assert.equal(JSON.parse(await ui.downloads.at(-1).text()).validated,false);
});

test('comparison displays signed absolute and relative differences for all four indicators',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(5,2).snapshot();
  ui.deliver('state',snapshot);
  ui.elements.get('compare').onclick();
  const result=compare(snapshot,1),end=result.rows.at(-1);
  Object.assign(end,{baselineWeight:350,scenarioWeight:385,baselineConsumptionKgDM:100,scenarioConsumptionKgDM:110,baselinePastureKgDM:1000,scenarioPastureKgDM:500,baselineCost:0,scenarioCost:100});
  ui.deliver('comparison',result);
  const text=ui.elements.get('results').innerHTML;
  assert.ok(text.includes('+35,00 kg/animal · relativa: +10,00%'));
  assert.ok(text.includes('+10,00 kg MS/lote · relativa: +10,00%'));
  assert.ok(text.includes('-500,00 kg MS · relativa: -50,00%'));
  assert.ok(text.includes('+100,00 R$/lote · relativa: indefinida (base zero)'));
});

test('saved scenario loading blocks actions until its state response, even with an earlier view in flight',async()=>{
  const saved={id:'selected',name:'Salvo',snapshot:new FarmEngine(44,3).snapshot(),selected:1};
  const ui=await openFarm([saved]);
  const previous=new FarmEngine(5,24);
  ui.deliver('state',previous.snapshot());
  // A configuration response may already be in flight before the load request.
  ui.elements.get('weather').onchange({target:{value:'hot'}});
  previous.configure({weather:'hot'});
  ui.elements.get('scenario-select').onchange({target:{value:saved.id}});
  const requests=ui.messages.length;
  for(const id of ['compare','experiment','manifest-open','manifest-import','manifest-export','export']){
    assert.equal(ui.elements.get(id).disabled,true);
    ui.elements.get(id).onclick();
  }
  await ui.elements.get('manifest-file').onchange({target:{files:[{text:async()=>JSON.stringify(createComparisonManifest(previous.snapshot(),1))}]}});
  assert.equal(ui.messages.length,requests);
  assert.equal(ui.downloads.length,0);
  assert.notEqual(ui.elements.get('manifest-file').clicked,true);
  const snapshot=previous.snapshot(),actions={grazing:0,feeding:1,drinking:2,resting:3};
  const ids=new Uint32Array(snapshot.animals.map(animal=>animal.id)),values=new Float64Array(snapshot.animals.length*4),codes=new Uint8Array(snapshot.animals.length);
  snapshot.animals.forEach((animal,index)=>{const offset=index*4;values.set([animal.x,animal.y,animal.weight,animal.initialWeight],offset);codes[index]=actions[animal.action];});
  ui.deliver('view',{hour:snapshot.hour,pastures:snapshot.pastures,cost:snapshot.cost,intake:snapshot.intake,config:snapshot.config,
    events:snapshot.events.slice(0,20),animalIds:ids,animalValues:values,animalActions:codes,viewLayout:createViewLayout(snapshot.animals.length),
    selectedAnimalId:1,selectedHistory:previous.historyFor(snapshot.animals[0])});
  assert.equal(ui.elements.get('compare').disabled,true,'the earlier configure view must not confirm the saved snapshot load');
  ui.elements.get('compare').onclick();
  assert.equal(ui.messages.length,requests);
  ui.deliver('state',saved.snapshot);
  assert.equal(ui.elements.get('compare').disabled,false);
  ui.elements.get('compare').onclick();
  assert.deepEqual(ui.messages.at(-1).snapshot,saved.snapshot);
});

test('initial active scenario loading blocks file actions until the saved state arrives',async()=>{
  const saved={id:'active',name:'Ativo',snapshot:new FarmEngine(44,3).snapshot(),selected:1};
  const ui=await openFarm([saved],saved.id);
  assert.equal(ui.messages[0].type,'load');
  for(const id of ['compare','experiment','manifest-open','manifest-import','manifest-export','export'])assert.equal(ui.elements.get(id).disabled,true);
  ui.elements.get('manifest-open').onclick();
  assert.notEqual(ui.elements.get('manifest-file').clicked,true);
  ui.deliver('state',saved.snapshot);
  assert.equal(ui.elements.get('compare').disabled,false);
  ui.elements.get('compare').onclick();
  assert.deepEqual(ui.messages.at(-1).snapshot,saved.snapshot);
});

for(const requestType of ['compareConfigured','replayConfigured','replayComparison'])test(requestType+' worker errors preserve the last successful CSV and manifest',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(19,3).snapshot();
  ui.deliver('state',snapshot);
  ui.elements.get('compare').onclick();
  const first=ui.messages.at(-1),result=compareConfiguredScenarios(first.snapshot,{referenceConfig:first.referenceConfig,scenarioConfig:first.scenarioConfig,days:first.days});
  ui.deliver('comparison',result);
  ui.elements.get('manifest-export').onclick();
  const previousManifest=await ui.downloads.at(-1).text();
  ui.elements.get('export').onclick();
  const previousCSV=await ui.downloads.at(-1).text();
  const other=new FarmEngine(74,24);
  other.configure({diet:'balanced',weather:'hot'});
  if(requestType==='compareConfigured'){
    ui.deliver('state',other.snapshot());
    ui.elements.get('compare').onclick();
  }else if(requestType==='replayConfigured'){
    const referenceConfig={...other.snapshot().config,weather:'normal'},scenarioConfig={...other.snapshot().config,weather:'hot'};
    const manifest=createConfiguredComparisonManifest(other.snapshot(),{referenceConfig,scenarioConfig,days:7});
    await ui.elements.get('manifest-file').onchange({target:{files:[{text:async()=>JSON.stringify(manifest)}]}});
  }else{
    const manifest=createComparisonManifest(other.snapshot(),7);
    await ui.elements.get('manifest-file').onchange({target:{files:[{text:async()=>JSON.stringify(manifest)}]}});
  }
  assert.equal(ui.messages.at(-1).type,requestType);
  const downloads=ui.downloads.length;
  ui.elements.get('manifest-export').onclick();
  ui.elements.get('export').onclick();
  assert.equal(ui.downloads.length,downloads);
  ui.deliver('error','Comparison failed');
  assert.equal(ui.elements.get('compare').disabled,false);
  assert.match(ui.elements.get('notice').textContent,/Comparison failed/);
  ui.elements.get('manifest-export').onclick();
  assert.equal(await ui.downloads.at(-1).text(),previousManifest);
  ui.elements.get('export').onclick();
  assert.equal(await ui.downloads.at(-1).text(),previousCSV);
  assert.match(ui.elements.get('compareconfig').textContent,/3 animais/);
});

test('baseline preset loads its declared deterministic initial state',async()=>{
  const ui=await openFarm();
  ui.deliver('state',new FarmEngine(2026,24).snapshot());
  ui.elements.get('preset-run').onclick();
  const request=ui.messages.at(-1);
  assert.equal(request.type,'load');
  assert.deepEqual(request.snapshot,new FarmEngine(2026,24).snapshot());
  ui.deliver('state',request.snapshot);
  assert.match(ui.elements.get('preset-description').textContent,/Baseline carregado/);
});

test('housing preset uses the existing comparison flow and unsupported presets stay unavailable',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(2026,24).snapshot();
  ui.deliver('state',snapshot);
  ui.elements.get('preset-select').value='housing-comparison';
  ui.elements.get('preset-select').onchange();
  ui.elements.get('preset-run').onclick();
  const request=ui.messages.at(-1);
  assert.equal(request.type,'compare');
  assert.deepEqual(request.snapshot,createScenarioPresetSnapshot('housing-comparison'));
  assert.equal(request.days,getScenarioPreset('housing-comparison').durationDays);
  const messageCount=ui.messages.length;
  ui.elements.get('preset-select').value='heat';
  ui.elements.get('preset-select').onchange();
  assert.equal(ui.elements.get('preset-run').disabled,true);
  assert.match(ui.elements.get('preset-description').textContent,/Indisponível/);
  assert.equal(ui.messages.length,messageCount);
});
