import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {FarmEngine,metrics,compare,createComparisonManifest,validateComparisonManifest,replayComparisonManifest} from '../engine.js';

// Execute the UI handlers against a small DOM/worker harness, without browser dependencies.
async function openFarm(saved=[],activeId=null){
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const elements=new Map(),messages=[],downloads=[],storage=new Map([['agroville-scenarios-v1',JSON.stringify(saved)],['agroville-active-scenario-v1',activeId]]);
  const drawing=new Proxy({}, {get:()=>()=>{}});
  function element(){return {value:'',textContent:'',innerHTML:'',disabled:false,dataset:{},classList:{toggle(){}},addEventListener(){},setAttribute(key,value){this[key]=value;},replaceChildren(){},add(){},getContext:()=>drawing,showModal(){this.open=true;},close(){this.open=false;},click(){this.clicked=true;}};}
  for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
  let worker,fetches=0;
  const context=vm.createContext({
    metrics,createComparisonManifest,validateComparisonManifest,structuredClone,Blob,
    Worker:class {constructor(){worker=this;}postMessage(message){messages.push(structuredClone(message));}},
    document:{getElementById:id=>elements.get(id),createElement:()=>element(),querySelectorAll:()=>[],addEventListener(){}},
    window:{addEventListener(){}},location:{search:''},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    Option:class {},performance:{now:()=>0},requestAnimationFrame(){},setTimeout(){return 1;},clearTimeout(){},
    URL:{createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},
    fetch(){fetches++;throw new Error('comparison must not invoke the LLM');},
    prompt:()=>null,confirm:()=>true
  });
  const source=(await readFile(new URL('../app.js',import.meta.url),'utf8'))
    .replace(/^import .*;\r?\n/,'')
    .replace("new Worker(new URL('./worker.js',import.meta.url),{type:'module'})",'new Worker()');
  vm.runInContext(source,context,{filename:'app.js'});
  const deliver=(type,value)=>worker.onmessage({data:{type,...(type==='state'?{state:value}:type==='error'?{message:value}:{data:value})}});
  return {elements,messages,downloads,storage,deliver,fetches:()=>fetches};
}

test('map comparison freezes one snapshot, changes housing only, and never applies the alternative',async()=>{
  const ui=await openFarm(),farm=new FarmEngine(89,5);
  farm.configure({diet:'balanced',supplement:1.5,weather:'rain',housing:'barn'});
  farm.tick(24);
  const snapshot=farm.snapshot();
  ui.deliver('state',snapshot);
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
