import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {FarmEngine,metrics,compare,createComparisonManifest,validateComparisonManifest,replayComparisonManifest} from '../src/client/engine.js';
import {SCENARIO_PRESETS,getScenarioPreset,createScenarioPresetSnapshot} from '../src/client/scenario-presets.js';
import {simulateNelorePastureScenario,analyzePastureDmiSensitivity,BR_CORTE_PASTURE_DMI} from '../scientific/br_corte_pasture_dmi.js';
import {createRunRecord,recordRun,listRuns,getRun,runCompatibility,getRunHistoryStats,exportRunHistory,clearRunHistory,MAX_RUNS,MAX_RUN_HISTORY_BYTES,RUN_HISTORY_KEY} from '../src/client/run-history.js';
import {encodeScenarioSnapshot,decodeScenarioSnapshot} from '../src/client/scenario-storage.js';
import {resolveLotSelection,formatLotArea} from '../src/client/lot-selection.js';
import {validateFarmSnapshot} from '../src/client/snapshot-validator.js';
import {calculateLotMetrics,findPaddockField} from '../src/client/lot-metrics.js';
import {calculateThi,THI_SOURCE} from '../src/client/thermal-index.js';
import {initialEnvironmentState,updateEnvironmentInput,environmentDiffRows} from '../src/client/environment-inputs.js';
import {combineLegacySnapshot,createAnimalViewStateDTO,separateLegacySnapshot} from '../src/client/animal-view-state.js';

// Execute the UI handlers against a small DOM/worker harness, without browser dependencies.
async function openFarm(saved=[],activeId=null,promptValue=null,seedStorage=[],confirmValue=true){
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const elements=new Map(),messages=[],downloads=[],storage=new Map([['agroville-scenarios-v1',JSON.stringify(saved)],['agroville-active-scenario-v1',activeId],...seedStorage]);
  let scheduledFrame,mapDrawCalls=0;const drawing=new Proxy({}, {get:(_,key)=>key==='drawImage'?()=>mapDrawCalls++:()=>{}});
  function element(){return {value:'',textContent:'',innerHTML:'',disabled:false,dataset:{},files:[],scrollTop:0,clientHeight:400,classList:{toggle(){}},addEventListener(name,handler){this['on'+name]=handler;},setAttribute(key,value){this[key]=value;},replaceChildren(){},add(){},getContext:()=>drawing,getBoundingClientRect(){return {left:0,top:0,width:576,height:336};},setPointerCapture(){},showModal(){this.open=true;},close(){this.open=false;},click(){this.clicked=true;}};}
  for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
  let worker,fetches=0,lastState=null;
  const context=vm.createContext({
    metrics,createComparisonManifest,validateComparisonManifest,simulateNelorePastureScenario,analyzePastureDmiSensitivity,BR_CORTE_PASTURE_DMI,SCENARIO_PRESETS,getScenarioPreset,createScenarioPresetSnapshot,createRunRecord,recordRun,listRuns,getRun,runCompatibility,getRunHistoryStats,exportRunHistory,clearRunHistory,MAX_RUNS,MAX_RUN_HISTORY_BYTES,encodeScenarioSnapshot,decodeScenarioSnapshot,resolveLotSelection,formatLotArea,validateFarmSnapshot,calculateLotMetrics,findPaddockField,calculateThi,THI_SOURCE,initialEnvironmentState,updateEnvironmentInput,environmentDiffRows,combineLegacySnapshot,createAnimalViewStateDTO,separateLegacySnapshot,structuredClone,Blob,
    Worker:class {constructor(){worker=this;}postMessage(message){if(message.type==='snapshot'){if(lastState&&worker.onmessage)worker.onmessage({data:{type:'state',state:structuredClone(lastState),engineImplementation:'javascript-fallback'}});return;}messages.push(structuredClone(message));}},
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
  const deliver=(type,value,engineImplementation='javascript-fallback')=>{if(type==='state')lastState=structuredClone(value);worker.onmessage({data:{type,...(type==='state'?{state:value,engineImplementation}:type==='error'?{message:value}:type==='view'?value:{data:value})}});};
  return {elements,messages,downloads,storage,deliver,fetches:()=>fetches,renderMap(time=1000){mapDrawCalls=0;scheduledFrame(time);return mapDrawCalls;}};
}

test('map comparison freezes one snapshot, changes housing only, and never applies the alternative',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(89,5);
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
  assert.equal(request.type,'compare');
  assert.deepEqual(request.snapshot,snapshot);
  assert.equal(request.days,30);
  assert.equal(ui.elements.get('play')['aria-label'],'Continuar simulação');
  const otherFarm=new FarmEngine(12,24);
  otherFarm.configure({weather:'hot'});
  ui.deliver('state',otherFarm.snapshot());
  const result=compare(request.snapshot,request.days);
  ui.deliver('comparison',result);
  assert.match(ui.elements.get('compareconfig').textContent,/5 animais.*Balanceada.*1,5.*chuva/);
  assert.equal(ui.elements.get('comparison').open,true);
  assert.match(ui.elements.get('results').innerHTML,/Diferença alternativa − base:/);
  assert.match(ui.elements.get('results').innerHTML,/relativa:/);
  assert.match(ui.elements.get('comparison-assumptions').innerHTML,/Sem calibração suficiente/);
  assert.equal(result.validated,false);
  assert.deepEqual(farm.snapshot(),snapshot);
  assert.equal(ui.messages.some(message=>message.type==='configure'),false);
  assert.equal(ui.fetches(),0);
});

test('connected snapshot selection persists real lot IDs through the existing comparison and return to farm',async()=>{
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
  assert.equal(ui.elements.get('lot-compare').disabled,false);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/eartag-242/);
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/Não informada/);
  assert.deepEqual(JSON.parse(ui.storage.get('agroville-farm-selection-v1')),{domainZoneId:'paddock-1',lotId:farmSnapshot.lots[0].id});
  ui.elements.get('lot-compare').onclick();
  assert.equal(ui.messages.at(-1).type,'compare');
  assert.deepEqual(ui.messages.at(-1).snapshot,snapshot,'existing comparator receives its frozen simulator snapshot unchanged');
  ui.deliver('comparison',compare(snapshot,30));
  assert.match(ui.elements.get('lot-comparison-context').textContent,/Lote real associado/);
  const association=JSON.parse(ui.storage.get('agroville-last-lot-comparison-v1'));
  assert.deepEqual(association.context.animalIds,['eartag-242']);
  ui.elements.get('comparison').close();
  assert.equal(JSON.parse(ui.storage.get('agroville-farm-selection-v1')).lotId,farmSnapshot.lots[0].id,'closing results returns to the same farm and lot');
  assert.match(ui.elements.get('lot-selection-details').innerHTML,/eartag-242/);
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
  ui.elements.get('lot-compare').onclick();assert.deepEqual(ui.messages.at(-1).snapshot,simulatorSnapshot);
  ui.deliver('comparison',compare(simulatorSnapshot,30));
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
  const request=ui.messages.at(-1),result=compare(request.snapshot,request.days);
  ui.deliver('comparison',result);
  const saved=listRuns({getItem:key=>ui.storage.get(key)??null});
  assert.equal(saved.length,1);
  assert.equal(saved[0].status,'completed');
  ui.elements.get('run-history-select').value=saved[0].id;
  ui.elements.get('run-history-replay').onclick();
  assert.equal(ui.messages.at(-1).type,'replayComparison');
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

test('map hit testing selects animals through the separated view state',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(104,4),snapshot=farm.snapshot();
  ui.deliver('state',snapshot);
  const animal=snapshot.animals[0],map=ui.elements.get('map'),event={clientX:animal.x,clientY:animal.y,pointerId:1};

  map.onpointerdown(event);
  map.onpointerup(event);

  assert.ok(ui.messages.some(message=>message.type==='select'&&message.animalId===animal.id));
});

test('worker view reordering joins positions and selection by stable animal ID',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(104,3).snapshot();
  ui.deliver('state',snapshot);
  ui.elements.get('animals').onclick({target:{closest:()=>({dataset:{animal:'2'}})}});
  ui.deliver('view',{
    animalIds:[3,2,1],animalValues:[330,230,503,603,320,220,502,602,310,210,501,601],animalActions:[0,1,2],
    animalViewState:{animals:[
      {id:3,name:'Animal 3',action:'grazing',x:330,y:230},
      {id:2,name:'Animal 2',action:'feeding',x:320,y:220},
      {id:1,name:'Animal 1',action:'drinking',x:310,y:210}
    ]},hour:snapshot.hour,pastures:snapshot.pastures,cost:snapshot.cost,intake:snapshot.intake,config:snapshot.config,events:snapshot.events
  });

  assert.match(ui.elements.get('animalname').innerHTML,/#002/);
  assert.equal(ui.elements.get('animalweight').textContent,'502,0 kg');
  assert.equal(ui.elements.get('activity').textContent,'No cocho');

  const map=ui.elements.get('map'),event={clientX:320,clientY:220,pointerId:2};
  map.onpointerdown(event);
  map.onpointerup(event);

  assert.equal(ui.messages.at(-1).type,'select');
  assert.equal(ui.messages.at(-1).animalId,2);
});

test('compressed scenario snapshots round-trip and load from the versioned storage format',async()=>{
  const farm=new FarmEngine(823,1000);farm.tick(24);const snapshot=farm.snapshot();
  const snapshotData=await encodeScenarioSnapshot(snapshot);
  assert.deepEqual(await decodeScenarioSnapshot(snapshotData),snapshot);
  assert.ok(snapshotData.length*4/3<JSON.stringify(snapshot).length*.6,'gzip should substantially reduce this repeated state');
  const saved={type:'agroville-scenarios-gzip-v1',scenarios:[{id:'packed',name:'Compactado',selected:1,summary:{hour:snapshot.hour,config:snapshot.config,eventCount:snapshot.events.length},snapshotData}]};
  const ui=await openFarm(saved,'packed');await new Promise(resolve=>setTimeout(resolve,50));
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
  assert.match(ui.elements.get('compareconfig').textContent,/Horizonte: 7 dias.*3 animais.*Volumoso \/ pasto.*chuva/);
  assert.match(ui.elements.get('chart')['aria-label'],/kg\/animal durante 7 dias/);
  const consumption=(result.rows.at(-1).scenarioConsumptionKgDM/3).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
  assert.ok(ui.elements.get('results').innerHTML.includes(consumption+' kg MS/animal'));
  assert.match(ui.elements.get('results').innerHTML,/relativa: indefinida \(base zero\)/);
  assert.doesNotMatch(ui.elements.get('results').innerHTML,/NaN|Infinity/);
  ui.elements.get('export').onclick();
  const csv=await ui.downloads.at(-1).text(),lines=csv.split('\n');
  const header=lines[0].split(','),last=lines.at(-1).split(',');
  assert.equal(Number(last[header.indexOf('consumo_confinamento_kgMS_animal')]),Number((result.rows.at(-1).scenarioConsumptionKgDM/3).toFixed(4)));
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
  assert.equal(request.type,'compare');
  assert.deepEqual(request.snapshot,saved.snapshot);
  ui.deliver('comparison',compare(request.snapshot,request.days));
  ui.elements.get('manifest-export').onclick();
  const manifest=JSON.parse(await ui.downloads.at(-1).text());
  assert.deepEqual(manifest.initialSnapshot,saved.snapshot);
  assert.deepEqual(replayComparisonManifest(manifest),compare(saved.snapshot,30));
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

test('saved scenario loading blocks comparison and file actions until its own state response',async()=>{
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
  ui.deliver('state',previous.snapshot());
  assert.equal(ui.elements.get('compare').disabled,true,'an older state response must not confirm the saved snapshot load');
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

for(const requestType of ['compare','replayComparison'])test(requestType+' worker errors preserve the last successful CSV and manifest',async()=>{
  const ui=await openFarm(),snapshot=new FarmEngine(19,3).snapshot();
  ui.deliver('state',snapshot);
  ui.elements.get('compare').onclick();
  const result=compare(snapshot,30);
  ui.deliver('comparison',result);
  ui.elements.get('manifest-export').onclick();
  const previousManifest=await ui.downloads.at(-1).text();
  ui.elements.get('export').onclick();
  const previousCSV=await ui.downloads.at(-1).text();
  const other=new FarmEngine(74,24);
  other.configure({diet:'balanced',weather:'hot'});
  if(requestType==='compare'){
    ui.deliver('state',other.snapshot());
    ui.elements.get('compare').onclick();
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
