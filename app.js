import {metrics,createComparisonManifest,validateComparisonManifest} from './engine.js';

const $=                                   (id       )=>document.getElementById(id)     ;
if(new URLSearchParams(location.search).has('scenePreview'))document.body.classList.add('scene-preview');
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
let state                   ,selected=1,running=true,speed=1,pending=false,lastTick=0,comparison    ,requestCompare=false,comparisonSnapshot,comparisonManifest,pendingComparison,loadingScenario=false;
const stateRequests=[];
function requestState(message){stateRequests.push(message.type);worker.postMessage(message);}
function compareBusy(value){requestCompare=value;for(const id of ['compare','experiment','manifest-import','manifest-open','manifest-export','export'])$(id).disabled=value||loadingScenario;$('scenario-select').disabled=value||loadingScenario;$('compare').textContent=loadingScenario?'Carregando cenário…':value?'Calculando…':'Comparar 30 dias ↗';}
const currency=(n       )=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const number=(n       ,digits=1)=>n.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const actionNames={grazing:'Pastando',feeding:'No cocho',drinking:'Bebendo água',resting:'Descansando'};
const thoughts={grazing:'Hora de procurar um pouco de pasto.',feeding:'O cocho está cheio. Vou comer por aqui.',drinking:'Estou com sede. Hora de beber água.',resting:'Vou descansar um pouco antes de voltar.'};
const dietNames={pasture:'Volumoso / pasto',balanced:'Balanceada',concentrate:'Mais concentrado'};
const scenarioNames={pasture:'Pasto',balanced:'Balanceada',concentrate:'Concentrado',normal:'Ameno',hot:'Calor',rain:'Chuvoso',barn:'Confinamento'};
const scenarioStorageKey='agroville-scenarios-v1',scenarioActiveKey='agroville-active-scenario-v1';
let scenarios=[],activeScenarioId=null,storageWarningShown=false;
try{const saved=JSON.parse(localStorage.getItem(scenarioStorageKey)??'[]');if(Array.isArray(saved))scenarios=saved.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&item.snapshot?.animals&&item.snapshot?.config);}catch{}
try{activeScenarioId=localStorage.getItem(scenarioActiveKey);}catch{}
if(!scenarios.some(item=>item.id===activeScenarioId))activeScenarioId=null;
function activeScenario(){return scenarios.find(item=>item.id===activeScenarioId);}
function saveScenarioData(){try{localStorage.setItem(scenarioStorageKey,JSON.stringify(scenarios));localStorage.setItem(scenarioActiveKey,activeScenarioId??'');return true;}catch{if(!storageWarningShown){notify('O navegador não conseguiu guardar os cenários. Remova cenários antigos ou libere espaço.');storageWarningShown=true;}return false;}}
function renderScenarios(){const select=$('scenario-select'),active=activeScenario();select.replaceChildren(new Option('Fazenda atual · não salva',''));for(const scenario of scenarios){const config=scenario.snapshot.config;select.add(new Option(scenario.name+' · D'+(Math.floor(scenario.snapshot.hour/24)+1)+' · '+scenarioNames[config.housing]+' · '+scenarioNames[config.diet],scenario.id));}select.value=activeScenarioId??'';$('scenario-rename').disabled=!active;$('scenario-delete').disabled=!active;$('event-scope').textContent=active?active.name.toLocaleUpperCase('pt-BR'):'AO VIVO';if(active){const snapshot=active.snapshot,c=snapshot.config;$('scenario-status').textContent='D'+String(Math.floor(snapshot.hour/24)+1).padStart(2,'0')+' · '+scenarioNames[c.housing]+' · dieta '+scenarioNames[c.diet]+' · '+number(c.supplement)+' kg MS/animal/dia · '+scenarioNames[c.weather]+' · '+snapshot.events.length+' eventos';}else $('scenario-status').textContent='Cenário atual ainda não salvo.';}
const cowSvg='<svg viewBox="0 0 18 14" aria-hidden="true"><path fill="#45613e" d="M3 3h10v7H3zM12 2h4v6h-4zM3 9h2v4H3zM10 9h2v4h-2zM1 4h2v4H1z"/><path fill="#edf1e1" d="M4 3h5v3H4zM8 7h5v3H8zM13 2h2v3h-2z"/><path fill="#293b23" d="M15 4h1v1h-1z"/></svg>';
const canvas=$                   ('map'),ctx=canvas.getContext('2d') ;
ctx.imageSmoothingEnabled=true;
const terrain=document.createElement('canvas');terrain.width=576;terrain.height=336;const t=terrain.getContext('2d') ;
function rect(g                         ,x       ,y       ,w       ,h       ,color       ){g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),w,h);}
let terrainSeed=9;function rand(){terrainSeed=(Math.imul(1664525,terrainSeed)+1013904223)>>>0;return terrainSeed/4294967296;}
const assetFrames={},assetAtlases={};let assetReady=false,terrainVisualKey='',worldScenarioId='demo-premium',worldScenarioData=null;
function drawAssetOn(g,id,x,y,w,h,anchor='center',rotation=0){const frame=assetFrames[id],atlas=frame&&assetAtlases[frame.atlas];if(!assetReady||!frame||!atlas)return;g.save();g.translate(x,y);g.rotate(rotation);g.drawImage(atlas,frame.x,frame.y,frame.w,frame.h,-w/2,anchor==='bottom'?-h:-h/2,w,h);g.restore();}
function drawSprite(id,x,y,w,h,anchor='center',rotation=0){drawAssetOn(t,id,x,y,w,h,anchor,rotation);}
function fence(x,y,w,h){for(let a=x+18;a<x+w-16;a+=38){drawSprite('fence-straight',a,y,42,31,'center');drawSprite('fence-straight',a,y+h,42,31,'center');}for(let a=y+18;a<y+h-12;a+=34){drawSprite('fence-straight',x,a,38,28,'center',Math.PI/2);drawSprite('fence-straight',x+w,a,38,28,'center',Math.PI/2);}}
const patches=[{x:28,y:38,w:148,h:104},{x:195,y:38,w:147,h:104},{x:28,y:178,w:148,h:105},{x:195,y:178,w:147,h:105}];
function buildTerrain(seed=9){
  if(!assetReady){rect(t,0,0,576,336,'#718d5d');return;}
  const nextKey=[seed,state?.config?.weather??'normal',state?.config?.housing??'pasture',worldScenarioId].join(':');if(nextKey===terrainVisualKey)return;terrainVisualKey=nextKey;terrainSeed=(Number(seed)||9)>>>0;
  rect(t,0,0,576,336,'#718d5d');
  // Ground uses illustrated isometric tile sprites; seed controls their variants.
  for(let row=-1;row<8;row++)for(let col=-1;col<9;col++){
    const weather=state?.config?.weather??'normal',wet=worldScenarioId==='wet-season'||weather==='rain',dry=worldScenarioId==='dry-season'||weather==='hot';const variant=wet?(rand()<.34?'soil-damp':rand()<.48?'grass-light':'grass-mid'):dry?(rand()<.28?'soil-dry':rand()<.44?'grass-light':'grass-mid'):(rand()<.07?'soil-dry':rand()<.07?'soil-damp':rand()<.44?'grass-light':'grass-mid');
    drawSprite(variant,col*100-row*50,row*34,104,70,'center');
  }
  // Road and field layouts remain generated in world coordinates while the art comes from sprites.
  for(let x=-20;x<600;x+=88)drawSprite('road-straight',x,162,95,52,'center');
  for(let y=2;y<350;y+=84)drawSprite('road-straight',361,y,61,93,'center',Math.PI/2);
  const cattle=worldScenarioId!=='crop-farm',crop=['crop-farm','mixed','demo-premium'].includes(worldScenarioId);
  patches.forEach((p,i)=>{const cropField=crop&&(worldScenarioId==='crop-farm'||worldScenarioId==='mixed'&&i<2||worldScenarioId==='demo-premium'&&i===1);if(!cropField){fence(p.x,p.y,p.w,p.h);drawSprite('gate',p.x+p.w-17,p.y+14,37,28,'center');if(cattle)drawSprite('water-trough',p.x+p.w-18,p.y+34,24,22,'bottom');}});
  const cropTiles=worldScenarioId==='crop-farm'?patches.map((p,i)=>[p,i%2?'field-maize-growing':'field-soybean-mature']):worldScenarioId==='mixed'?patches.slice(0,2).map((p,i)=>[p,i?'field-maize-growing':'field-soybean-growing']):worldScenarioId==='demo-premium'?[[patches[1],'field-soybean-mature']]:[];
  cropTiles.forEach(([p,id])=>drawSprite(id,p.x+p.w/2,p.y+p.h/2,p.w+12,p.h+7,'center'));
  if(worldScenarioId!=='dry-season')drawSprite('pond',498,73,worldScenarioId==='wet-season'?102:88,worldScenarioId==='wet-season'?70:61,'center');
  drawSprite('farmhouse',413,99,75,65,'bottom');drawSprite('farmhouse',489,137,65,53,'bottom');
  drawSprite('shed',460,240,128,91,'bottom');if(crop)drawSprite('silo',553,241,42,77,'bottom');if(cattle)drawSprite('corral-wood-standard-imagegen-v1',453,259,93,74,'bottom');
  const trees=[[33,29,.56],[92,26,.62],[149,23,.55],[380,27,.56],[442,24,.62],[548,29,.57],[15,100,.55],[16,242,.61],[556,108,.55],[544,289,.58],[65,315,.5],[153,314,.5],[313,317,.5],[566,277,.52],[349,112,.48],[350,247,.5]];
  trees.filter((_,i)=>worldScenarioId!=='dry-season'||i%3===0).filter((_,i)=>worldScenarioId!=='crop-farm'||i%2===0).forEach(([x,y,s],i)=>drawSprite(i%4===0?'fruit-tree':i%5===0?'shrub':'shade-tree',x,y,66*s,79*s,'bottom'));
  if(crop)drawSprite('tractor',361,226,49,39,'bottom');if(worldScenarioId==='crop-farm'||worldScenarioId==='mixed')drawSprite('pickup',398,235,42,34,'bottom');
  if(cattle){drawSprite('feed-trough',417,262,54,29,'bottom');drawSprite('nelore-adult',365,223,47,44,'bottom');}
  t.font='7px monospace';t.fillStyle='#405d35';patches.forEach((p,i)=>{const cropField=cropTiles.some(([field])=>field===p);t.fillText((cropField?'TALHÃO ':'PIQUETE ')+String.fromCharCode(65+i),p.x+8,p.y+14);});if(cattle){t.fillStyle='#ece1c3';t.fillText('CONFINAMENTO',414,183);}
}
fetch('/assets/manifest.json').then(response=>{if(!response.ok)throw new Error('manifest');return response.json();}).then(manifest=>{
  let loaded=0,failed=false;const atlases=Object.entries(manifest.atlases);
  for(const [id,definition] of atlases){const atlas=new Image();assetAtlases[id]=atlas;atlas.onload=()=>{loaded++;if(loaded===atlases.length&&!failed){for(const asset of manifest.assets)assetFrames[asset.id]=asset.frame;assetReady=true;buildTerrain();}};atlas.onerror=()=>{failed=true;buildTerrain();};atlas.src=definition.image;}
}).catch(()=>buildTerrain());
const worldScenarioSelect=$('world-scenario');
worldScenarioSelect.addEventListener('change',()=>{worldScenarioId=worldScenarioSelect.value;const scenario=worldScenarioData?.scenarios.find(item=>item.id===worldScenarioId);if(scenario)$('world-title').textContent=scenario.name;terrainVisualKey='';buildTerrain(state?.initialSeed??state?.seed??9);});
fetch('/assets/scenarios.json').then(response=>{if(!response.ok)throw new Error('scenarios');return response.json();}).then(data=>{worldScenarioData=data;worldScenarioSelect.replaceChildren(...data.scenarios.map(scenario=>new Option(scenario.name,scenario.id)));worldScenarioSelect.value=worldScenarioId;const scenario=data.scenarios.find(item=>item.id===worldScenarioId);if(scenario)$('world-title').textContent=scenario.name;terrainVisualKey='';buildTerrain(state?.initialSeed??state?.seed??9);}).catch(()=>{});
let zoom=1,panX=0,panY=0,drag                                                           =null;
const positions=new Map                            ();
function drawCow(a       ,x       ,y       ,time       ){
  const sel=a.id===selected;const resting=a.action==='resting';const dx=resting?0:Math.sin(time*.003+a.id)*.5;
  x=Math.round(x);y=Math.round(y+dx);
  drawAssetOn(ctx,a.id%4===0?'cow-beef':'cow-dairy',x,y+4,29,27,'bottom');
  if(sel){ctx.strokeStyle='#f4e4a1';ctx.lineWidth=1;ctx.strokeRect(x-17,y-22,34,28);ctx.fillStyle='#f5f3dd';ctx.fillRect(x-18,y-33,39,9);ctx.fillStyle='#3d5635';ctx.font='6px monospace';ctx.fillText(a.name,x-15,y-27);}
}
function draw(time       ){
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#6b905b';ctx.fillRect(0,0,576,336);ctx.save();ctx.translate(panX,panY);ctx.scale(zoom,zoom);ctx.drawImage(terrain,0,0);
  if(state){
    for(let i=0;i<4;i++){const x=i%2===0?28:195,y=i<2?38:178;const fraction=state.pastures[i]/2400;rect(ctx,x+8,y+23,30,2,'#5c7748');rect(ctx,x+8,y+23,Math.round(30*fraction),2,'#dde6a0');}
    const animals=[...state.animals].sort((a,b)=>a.y-b.y);
    for(const a of animals){let pos=positions.get(a.id);if(!pos||Math.hypot(pos.x-a.x,pos.y-a.y)>180){pos={x:a.x,y:a.y};positions.set(a.id,pos);}pos.x+=(a.x-pos.x)*.07;pos.y+=(a.y-pos.y)*.07;drawCow(a,pos.x,pos.y,time);}
    if(state.config.weather==='rain'){ctx.strokeStyle='#c0d6c355';ctx.lineWidth=1;for(let i=0;i<60;i++){const x=(i*77+(time*.045))%576,y=(i*59+time*.095)%336;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2,y+5);ctx.stroke();}}
    if(state.config.weather==='hot'){rect(ctx,0,0,576,336,'#efb65715');}
    const hour=state.hour%24;if(hour>=20||hour<6)rect(ctx,0,0,576,336,'#183c4c70');
  }
  ctx.restore();
  if(running&&!pending&&!loadingScenario&&time-lastTick>1000/speed){requestState({type:'tick',hours:1});pending=true;lastTick=time;}
  requestAnimationFrame(draw);
}
function setZoom(value       ){const next=Math.max(1,Math.min(3,value));panX=288-(288-panX)*next/zoom;panY=168-(168-panY)*next/zoom;zoom=next;limitPan();}
function limitPan(){panX=Math.max(576-576*zoom,Math.min(0,panX));panY=Math.max(336-336*zoom,Math.min(0,panY));}
function mapPoint(e                        ){const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)*576/b.width,y:(e.clientY-b.top)*336/b.height};}
canvas.addEventListener('pointerdown',e=>{const p=mapPoint(e);drag={...p,px:panX,py:panY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=mapPoint(e);if(Math.hypot(p.x-drag.x,p.y-drag.y)>3)drag.moved=true;panX=drag.px+p.x-drag.x;panY=drag.py+p.y-drag.y;limitPan();});
canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved&&state){const p=mapPoint(e),x=(p.x-panX)/zoom,y=(p.y-panY)/zoom;const nearest=state.animals.map(a=>({a,d:Math.hypot((positions.get(a.id)?.x??a.x)-x,(positions.get(a.id)?.y??a.y)-y)})).sort((a,b)=>a.d-b.d)[0];if(nearest&&nearest.d<15){selected=nearest.a.id;updateUI();}}drag=null;});
canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom+(e.deltaY<0?.15:-.15));},{passive:false});
canvas.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(zoom+.25);}if(e.key==='-'){e.preventDefault();setZoom(zoom-.25);}if(e.key==='ArrowLeft'){e.preventDefault();panX+=12;}if(e.key==='ArrowRight'){e.preventDefault();panX-=12;}if(e.key==='ArrowUp'){e.preventDefault();panY+=12;}if(e.key==='ArrowDown'){e.preventDefault();panY-=12;}limitPan();});
$('zoomin').onclick=()=>setZoom(zoom+.25);$('zoomout').onclick=()=>setZoom(zoom-.25);$('home').onclick=()=>{zoom=1;panX=0;panY=0;};
function listAnimals(){if(!state)return;const query=$                  ('search').value.toLocaleLowerCase();$('animals').innerHTML=state.animals.filter(a=>a.name.toLocaleLowerCase().includes(query)||String(a.id).includes(query)).map(a=>'<button class="animal-row '+(a.id===selected?'selected':'')+'" data-animal="'+a.id+'" aria-pressed="'+(a.id===selected)+'"><span class="animal-avatar">'+cowSvg+'</span><span><strong>'+a.name+'</strong><small>'+actionNames[a.action]+'</small></span><span class="animal-id">'+String(a.id).padStart(3,'0')+'</span></button>').join('');}
$('animals').onclick=e=>{const btn=(e.target               ).closest                   ('[data-animal]');if(btn){selected=Number(btn.dataset.animal);updateUI();}};
$('search').oninput=()=>listAnimals();
const reasonNames={rest_window:'horário de descanso (21:00–05:59)',thirst_threshold:'sede simulada acima de 65/100',pasture_housing:'alojamento configurado como pasto',barn_housing:'alojamento configurado como confinamento'};
function renderAnimalHistory(animal){const records=(animal.history??[]).slice(-6).reverse();$('animal-history').innerHTML=records.map(record=>{const hour=String(record.hour%24).padStart(2,'0');const day=String(Math.floor(record.hour/24)+1).padStart(2,'0');const observed=record.observed;return '<article class="memory-record"><strong>D'+day+' · '+hour+':00 — '+actionNames[record.action]+'</strong><span>Regra: '+(reasonNames[record.reason]??record.reason)+'.</span><small>Estado observado pelo motor: sede '+number(observed.thirst,0)+'/100 · alojamento '+(observed.housing==='barn'?'confinamento':'pasto')+'.</small></article>';}).join('')||'<p class="memory-empty">Sem transições registradas para este animal.</p>';}
function updateUI(){if(!state)return;const m=metrics(state),a=state.animals.find(a=>a.id===selected)??state.animals[0];$('clock').textContent='Dia '+String(Math.floor(state.hour/24)+1).padStart(2,'0')+' · '+String(state.hour%24).padStart(2,'0')+':00';$('count').textContent=String(state.animals.length);$('weight').textContent=number(m.weight)+' kg';$('gain').textContent=(m.gain>=0?'+':'')+number(m.gain,2)+' kg/animal desde o início';$('pasture').textContent=number(m.pasture,0);$('cost').textContent=currency(m.cost);$('animalname').innerHTML=a.name+' <span>#'+String(a.id).padStart(3,'0')+'</span>';$('animalweight').textContent=number(a.weight)+' kg';$('activity').textContent=actionNames[a.action];$('thought').textContent='“'+thoughts[a.action]+'”';renderAnimalHistory(a);$                   ('diet').value=state.config.diet;$                   ('weather').value=state.config.weather;$                  ('supplement').value=String(state.config.supplement);$('supplementvalue').textContent=number(state.config.supplement)+' kg MS/dia';for(const [id,condition] of [['pasturebtn',state.config.housing==='pasture'],['barnbtn',state.config.housing==='barn']]                      ){$(id).classList.toggle('active',condition);$(id).setAttribute('aria-pressed',String(condition));}listAnimals();$('events').innerHTML=state.events.slice(0,20).map(event=>'<div class="event"><time>D'+String(Math.floor(event.hour/24)+1).padStart(2,'0')+' '+String(event.hour%24).padStart(2,'0')+':00</time><span>'+event.text+'</span></div>').join('');}
function configure(patch                ){if(!loadingScenario)requestState({type:'configure',patch});}
$                   ('diet').onchange=e=>configure({diet:(e.target                     ).value                  });
$                   ('weather').onchange=e=>configure({weather:(e.target                     ).value                     });
$                  ('supplement').oninput=e=>$('supplementvalue').textContent=number(Number((e.target                    ).value))+' kg MS/dia';
$                  ('supplement').onchange=e=>configure({supplement:Number((e.target                    ).value)});
$('pasturebtn').onclick=()=>configure({housing:'pasture'});$('barnbtn').onclick=()=>configure({housing:'barn'});
function setRunning(value        ){running=value;$('play').textContent=value?'Ⅱ':'▶';$('play').setAttribute('aria-label',value?'Pausar simulação':'Continuar simulação');lastTick=performance.now();}
$('play').onclick=()=>setRunning(!running);$('day').onclick=()=>{if(loadingScenario)return;setRunning(false);requestState({type:'tick',hours:24});};$('reset').onclick=()=>{if(loadingScenario)return;selected=1;positions.clear();requestState({type:'reset'});setRunning(false);};
$('scenario-save').onclick=()=>{if(!state)return;const name=prompt('Nome do cenário:','Meu cenário');if(name===null)return;const cleanName=name.trim().slice(0,60);if(!cleanName){notify('Digite um nome para salvar o cenário.');return;}const previousActiveScenarioId=activeScenarioId;const id=globalThis.crypto?.randomUUID?.()??'scenario-'+Date.now()+'-'+Math.random().toString(36).slice(2);const scenario={id,name:cleanName,snapshot:structuredClone(state),selected};scenarios.push(scenario);activeScenarioId=scenario.id;if(!saveScenarioData()){scenarios.pop();activeScenarioId=previousActiveScenarioId;renderScenarios();return;}renderScenarios();notify('Cenário “'+cleanName+'” salvo.');};
$('scenario-select').onchange=e=>{if(loadingScenario||requestCompare)return;const nextId=e.target.value,previousActiveScenarioId=activeScenarioId;if(nextId&&!scenarios.some(item=>item.id===nextId))return;activeScenarioId=nextId||null;if(!saveScenarioData()){activeScenarioId=previousActiveScenarioId;renderScenarios();return;}if(!nextId){renderScenarios();return;}const scenario=scenarios.find(item=>item.id===nextId);selected=scenario.selected??1;setRunning(false);pending=false;positions.clear();renderScenarios();loadingScenario=true;compareBusy(requestCompare);requestState({type:'load',snapshot:scenario.snapshot});};
$('scenario-rename').onclick=()=>{const scenario=activeScenario();if(!scenario)return;const name=prompt('Novo nome do cenário:',scenario.name);if(name===null)return;const cleanName=name.trim().slice(0,60);if(!cleanName){notify('O nome do cenário não pode ficar vazio.');return;}const previousName=scenario.name;scenario.name=cleanName;if(!saveScenarioData()){scenario.name=previousName;renderScenarios();return;}renderScenarios();notify('Cenário renomeado.');};
$('scenario-delete').onclick=()=>{const scenario=activeScenario();if(!scenario)return;if(!confirm('Remover o cenário “'+scenario.name+'”?'))return;const previousScenarios=scenarios,previousActiveScenarioId=activeScenarioId;scenarios=scenarios.filter(item=>item.id!==scenario.id);activeScenarioId=null;if(!saveScenarioData()){scenarios=previousScenarios;activeScenarioId=previousActiveScenarioId;renderScenarios();return;}renderScenarios();notify('Cenário removido.');};
$                   ('speed').onchange=e=>speed=Number((e.target                     ).value);
$('method').onclick=()=>$                   ('methodology').showModal();document.querySelectorAll                   ('[data-close]').forEach(button=>button.onclick=()=>$                   (button.dataset.close ).close());
function localExplanation(input){const place=input.config.housing==='barn'?'confinamento':'pasto';return `O cenário está em ${place}, no dia ${Math.floor(input.hour/24)+1}, com peso médio estimado de ${number(input.metrics.weight)} kg e custo acumulado de ${currency(input.metrics.cost)}. Esses valores vêm das regras demonstrativas do motor; não são medições nem recomendações.`;}
$('explain').onclick=async()=>{if(!state)return;const button=$('explain'),input={hour:state.hour,config:{...state.config},metrics:metrics(state)};button.disabled=true;$('explanation').textContent=localExplanation(input);$('explanation-label').textContent='Explicação determinística · não medido';try{const response=await fetch('/api/explain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw new Error('explanation_unavailable');const result=await response.json();if(typeof result.text!=='string'||typeof result.label!=='string')throw new Error('invalid_explanation');$('explanation').textContent=result.text;$('explanation-label').textContent=result.label;}catch{$('explanation-label').textContent='Explicação determinística · não medido';}finally{button.disabled=false;}};
function beginCompare(){if(!state||requestCompare||loadingScenario)return;setRunning(false);const snapshot=structuredClone(state),manifest=createComparisonManifest(snapshot,30);pendingComparison={snapshot,manifest};compareBusy(true);worker.postMessage({type:'compare',days:30,snapshot});}
$('compare').onclick=beginCompare;
$('experiment').onclick=beginCompare;
function comparisonNumber(value,digits=1){return Number.isFinite(value)?number(value,digits):'Indisponível';}
function comparisonCurrency(value){return Number.isFinite(value)?currency(value):'Indisponível';}
function comparisonCalculation(values,calculate){return values.every(Number.isFinite)?calculate(...values):undefined;}
function comparisonPerAnimal(value){const count=comparisonSnapshot?.animals?.length;return Number.isInteger(count)&&count>0?comparisonCalculation([value],total=>total/count):undefined;}
function comparisonRows(data){return Array.isArray(data?.rows)?data.rows.filter(row=>row&&typeof row==='object'):[];}
function comparisonFinalRow(data){return comparisonRows(data).find(row=>Number.isFinite(data.days)&&row.day===data.days)??{};}
function comparisonArray(value){return Array.isArray(value)?value:[];}
function comparisonPasturesAvailable(){const values=comparisonSnapshot?.pastures;return Array.isArray(values)&&values.length===4&&Array.from(values).every(Number.isFinite);}
function comparisonData(data){return comparisonPasturesAvailable()?data:{...data,startWeight:undefined,initialPastureByPaddock:[],rows:comparisonRows(data).map(row=>({day:row.day}))};}
const intakeKeys=['pastureKgDM','barnBaseKgDM','supplementKgDM','dietExtraKgDM'];
function comparisonIntake(row,side,key){return Number.isFinite(comparisonSnapshot?.intake?.[key])?row?.[side+'IntakeBySourceKgDM']?.[key]:undefined;}
function comparisonConsumption(row,side){return intakeKeys.every(key=>Number.isFinite(comparisonSnapshot?.intake?.[key]))?row?.[side+'ConsumptionKgDM']:undefined;}
function comparisonEvidence(rule,period){return '<p class="metric-evidence"><b>Derivado · demonstrativo · não validado</b> Período: '+period+'. Regra: '+rule+' Fonte: <a href="/engine.js" target="_blank" rel="noopener">engine.js · compare / metrics / tick</a>.</p>';}
function resultDifference(base,alternative,unit,digits=1){
  const delta=comparisonCalculation([base,alternative],(b,a)=>a-b);
  if(!Number.isFinite(delta))return 'Diferença alternativa − base: Indisponível · relativa: Indisponível.';
  const percent=comparisonCalculation([delta,base],(d,b)=>d/b*100),relative=base===0?'indefinida (base zero)':Number.isFinite(percent)?(percent>=0?'+':'')+comparisonNumber(percent,2)+'%':'Indisponível';
  return 'Diferença alternativa − base: '+(delta>=0?'+':'')+comparisonNumber(delta,digits)+' '+unit+' · relativa: '+relative+'.';
}
function renderDetailedResults(data){
  data=comparisonData(data);
  const end=comparisonFinalRow(data),days=comparisonNumber(data.days,0),period='intervalo de 0 a '+days+' dias desde o snapshot';
  const baseConsumption=comparisonConsumption(end,'baseline'),scenarioConsumption=comparisonConsumption(end,'scenario');
  const cards=[
    ['PESO MÉDIO · DIA '+days,comparisonNumber(end.scenarioWeight)+' kg/animal','Base · pasto: '+comparisonNumber(end.baselineWeight)+' kg/animal.',end.baselineWeight,end.scenarioWeight,'kg/animal','Soma dos pesos simulados dividida pelo número de animais.','dia '+days+' desde o snapshot'],
    ['CONSUMO ESTIMADO DE MS · '+days+' DIAS',comparisonNumber(scenarioConsumption,0)+' kg MS/lote','Alternativa: '+comparisonNumber(comparisonPerAnimal(scenarioConsumption))+' kg MS/animal · Base: '+comparisonNumber(baseConsumption,0)+' kg MS/lote ('+comparisonNumber(comparisonPerAnimal(baseConsumption))+' kg MS/animal).',baseConsumption,scenarioConsumption,'kg MS/lote','Soma dos quatro componentes do consumo, menos o registro inicial; por animal, dividir pelo rebanho do snapshot.',period],
    ['ESTOQUE DE FORRAGEM · DIA '+days,comparisonNumber(end.scenarioPastureKgDM,0)+' kg MS','Base · pasto: '+comparisonNumber(end.baselinePastureKgDM,0)+' kg MS · estoque simulado nos 4 piquetes.',end.baselinePastureKgDM,end.scenarioPastureKgDM,'kg MS','Soma dos estoques dos piquetes após crescimento assumido e retirada simulada.','dia '+days+' desde o snapshot'],
    ['CUSTO DA ALIMENTAÇÃO · '+days+' DIAS',comparisonCurrency(end.scenarioCost),'Base · pasto: '+comparisonCurrency(end.baselineCost)+' · R$/lote.',end.baselineCost,end.scenarioCost,'R$/lote','Custo acumulado do alimento-base no confinamento, suplemento e adicional da dieta, menos o custo inicial.',period]
  ];
  $('results').innerHTML=cards.map(([title,value,base,b,s,unit,rule,when])=>'<div class="result-card"><h3>'+title+'</h3><strong>'+value+'</strong><p>Alternativa · confinamento. '+base+'</p><p>'+resultDifference(b,s,unit,2)+'</p>'+comparisonEvidence(rule,when)+'</div>').join('');
  const sources=[
    ['Forragem retirada dos piquetes','pastureKgDM','Mínimo entre demanda e estoque disponível por hora.'],
    ['Alimento-base assumido no confinamento','barnBaseKgDM','Demanda assumida integralmente fornecida por hora.'],
    ['Suplemento configurado','supplementKgDM','Suplemento configurado dividido por 24 por animal/hora.'],
    ['Adicional fixo da dieta','dietExtraKgDM','0, 1,8 ou 3,2 kg MS/animal/dia conforme a dieta.']
  ];
  const intakeRows=sources.map(([label,key,rule])=>'<tr><th scope="row">'+label+'<small class="row-derivation">'+rule+' Acumulado menos início.</small></th><td>'+comparisonNumber(comparisonIntake(end,'baseline',key))+'</td><td>'+comparisonNumber(comparisonIntake(end,'scenario',key))+'</td></tr>').join('');
  $('intake-summary').innerHTML='<section><h3>COMPOSIÇÃO DO CONSUMO ESTIMADO · KG MS/LOTE · '+days+' DIAS</h3><table class="pasture-table"><thead><tr><th scope="col">Componente do motor</th><th scope="col">Pasto</th><th scope="col">Confinamento</th></tr></thead><tbody>'+intakeRows+'</tbody></table>'+comparisonEvidence('Cada linha é a diferença do componente entre o fim e o início; unidade kg MS/lote.',period)+'</section>';
  const initial=comparisonArray(data.initialPastureByPaddock),base=comparisonArray(end.baselinePastureByPaddock),alternative=comparisonArray(end.scenarioPastureByPaddock);
  const paddockRows=Array.from({length:4},(_,index)=>'<tr><th scope="row">Piquete '+String.fromCharCode(65+index)+'</th><td>'+comparisonNumber(initial[index],0)+'</td><td>'+comparisonNumber(base[index],0)+'</td><td>'+comparisonNumber(alternative[index],0)+'</td></tr>').join('');
  $('pasture-summary').innerHTML='<section><h3>ESTOQUE DE FORRAGEM POR PIQUETE · KG MS/PIQUETE</h3><table class="pasture-table"><thead><tr><th scope="col">Piquete</th><th scope="col">Início · dia 0</th><th scope="col">Pasto · dia '+days+'</th><th scope="col">Confinamento · dia '+days+'</th></tr></thead><tbody>'+paddockRows+'</tbody></table>'+comparisonEvidence('Início: estoque declarado no snapshot simulado. Final: crescimento assumido menos retirada; unidade kg MS/piquete.','snapshot inicial e dia '+days+' do intervalo')+'<p>Sem área, medição de biomassa ou categoria real de condição do pasto.</p></section>';
  renderComparisonContext(data);
}
function renderComparisonContext(data){
  const rows=comparisonRows(data),end=comparisonFinalRow(data),missing=[];
  if(!comparisonPasturesAvailable())missing.push('Estoque inicial do snapshot incompleto ou inválido: trajetórias de peso, consumo, estoque e custo indisponíveis; a coerção numérica do motor não fornece evidência para esses resultados.');
  if(!rows.length)missing.push('Série diária ausente.');
  else if(!Number.isInteger(data.days)||rows.length!==data.days+1||rows.some((row,index)=>row.day!==index))missing.push('Série diária incompleta ou fora de ordem; resultados finais exigem a linha do último dia.');
  if(intakeKeys.some(key=>!Number.isFinite(comparisonSnapshot?.intake?.[key])))missing.push('Registro inicial de consumo incompleto: consumo acumulado indisponível; o zero de compatibilidade do motor não é tratado como medição.');
  if(['baselineWeight','scenarioWeight','baselinePastureKgDM','scenarioPastureKgDM','baselineCost','scenarioCost'].some(key=>!Number.isFinite(end[key]))||['baseline','scenario'].some(side=>!Number.isFinite(comparisonConsumption(end,side))||intakeKeys.some(key=>!Number.isFinite(comparisonIntake(end,side,key)))))missing.push('Há métricas finais ausentes ou inválidas.');
  if([data.initialPastureByPaddock,end.baselinePastureByPaddock,end.scenarioPastureByPaddock].some(values=>!Array.isArray(values)||values.length!==4||Array.from(values).some(value=>!Number.isFinite(value))))missing.push('Estoque por piquete incompleto ou inválido.');
  if(rows.some(row=>!Number.isFinite(row.day)||!Number.isFinite(row.baselineWeight)||!Number.isFinite(row.scenarioWeight)))missing.push('A série de peso tem lacunas; o gráfico interrompe a linha nesses pontos.');
  $('comparison-coverage').innerHTML='<h3>Observações reais · nenhuma conectada</h3><p>Este resultado cobre somente o rebanho simulado do snapshot. Não há dados de fazenda, área/biomassa medida, fonte empírica ou população real aprovada. A proveniência de um snapshot de fazenda depende da issue #12; a população/caso, da #1; a calibração e validação independente, da #6. O explorador de bezerras/novilhas citado nas issues é separado e não está disponível neste checkout.</p><h3>Cobertura da simulação</h3><p>'+(missing.length?missing.join(' '):'Campos finais e série diária disponíveis no resultado do motor; isso não indica cobertura empírica.')+' Ausência, valor inválido ou não finito aparece como “Indisponível”; zero finito é exibido como zero.</p>';
  const a=data.assumptions??{},c=data.baselineConfig??{},hypotheses=[
    ['Demanda-base',a.baseDemandKgDM,'kg MS/animal/dia, ajustada por peso/360 e calor × 0,8'],
    ['Manutenção',a.maintenanceKgDM,'kg MS/animal/dia, ajustada por peso/360'],
    ['Fator de ganho',a.gainFactor,'kg de peso por kg equivalente de MS acima da manutenção'],
    ['Crescimento por piquete',a.dailyPastureGrowthKgDM,'kg MS/piquete/dia; chuva × 1,3, calor × 0,65; teto 2.400 kg MS/piquete'],
    ['Preço do suplemento',a.supplementPrice,'R$/kg MS'],
    ['Preço do adicional balanceado',a.balancedPrice,'R$/kg MS'],
    ['Preço do adicional concentrado',a.concentratePrice,'R$/kg MS'],
    ['Suplemento efetivamente usado',c.supplement,'kg MS/animal/dia nos dois cenários']
  ];
  $('comparison-assumptions').innerHTML='<h3>Hipóteses usadas · demonstrativas · não validadas</h3><p>Única intervenção: alojamento. Mesmo snapshot, sementes, dieta, suplemento e clima. Não há calibração nem intervalo de confiança sustentado por dados.</p><ul>'+hypotheses.map(([label,value,unit])=>'<li>'+label+': '+comparisonNumber(value,2)+' '+unit+'.</li>').join('')+'</ul><p>Outras regras fixas do motor: alimento-base no confinamento a 0,65 R$/kg MS; adicionais da dieta de 0 / 1,8 / 3,2 kg MS/animal/dia; suplemento × 1,2 e adicional × 1,35 no equivalente energético; piso de peso 200 kg/animal. Essas constantes são hipóteses, não preços pesquisados ou equações ajustadas. O estoque inicial vem do snapshot usado na comparação.</p><p>Fonte das hipóteses e cálculos: <a href="/engine.js" target="_blank" rel="noopener">engine.js · ASSUMPTIONS / tick / compare</a>. Reprodução: <a href="/worker.js" target="_blank" rel="noopener">worker.js · replayComparison</a>. Diferenças: alternativa − base; percentual: diferença / base × 100, indefinido quando a base é zero.</p>';
}
function showComparison(data){
  comparisonSnapshot=pendingComparison?.snapshot??comparisonSnapshot;comparisonManifest=pendingComparison?.manifest??comparisonManifest;pendingComparison=null;
  data=comparisonData(data);
  comparison=data;compareBusy(false);
  const c=data.baselineConfig??{},snapshot=comparisonSnapshot??{},days=comparisonNumber(data.days,0),initial=comparisonArray(data.initialPastureByPaddock),initialTotal=initial.length===4?comparisonCalculation(initial,(...values)=>values.reduce((sum,value)=>sum+value,0)):undefined;
  const start=Number.isFinite(snapshot.hour)?'dia '+(Math.floor(snapshot.hour/24)+1)+' às '+String(snapshot.hour%24).padStart(2,'0')+':00':'horário indisponível';
  $('compareconfig').textContent='Derivado · demonstrativo · não validado. Única intervenção: local do rebanho. Base: pasto; alternativa: confinamento. Horizonte: '+days+' dias a partir de '+start+'. Snapshot simulado da comparação: '+comparisonNumber(snapshot.animals?.length,0)+' animais, peso inicial '+comparisonNumber(data.startWeight)+' kg/animal (média dos pesos no snapshot), forragem inicial '+comparisonNumber(initialTotal,0)+' kg MS (soma dos piquetes no snapshot) e mesmas sementes. Configuração efetivamente usada: '+(dietNames[c.diet]??'dieta indisponível')+', '+comparisonNumber(c.supplement)+' kg MS de suplemento/animal/dia e '+({normal:'clima ameno',hot:'calor',rain:'chuva'}[c.weather]??'clima indisponível')+'.';
  $('chart').setAttribute('aria-label','Evolução demonstrativa de peso médio em kg/animal durante '+days+' dias; derivada, não validada');
  $('chart-note').innerHTML=comparisonEvidence('Cada ponto é a média dos pesos simulados em kg/animal; pesos e estoques iniciais acima vêm do snapshot simulado.','dia 0 até dia '+days+' desde o snapshot');
  const rows=comparisonRows(data),values=rows.flatMap(r=>[r.baselineWeight,r.scenarioWeight]).filter(Number.isFinite),low=Math.floor(Math.min(...values)-1),high=Math.ceil(Math.max(...values)+1);
  if(!values.length||!Number.isFinite(data.days)||data.days<=0||!Number.isFinite(high-low)||high<=low){$('chart').innerHTML='<text x="44" y="80">Peso: Indisponível</text>';renderDetailedResults(data);$('comparison').showModal();return;}
  const x=day=>44+day/data.days*548,y=weight=>165-(weight-low)/(high-low)*133;
  let svg='';
  for(let i=0;i<4;i++){const v=low+(high-low)*i/3;svg+='<line x1="44" x2="592" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#dde5d4"/><text x="2" y="'+(y(v)+3)+'" font-family="monospace" font-size="9" fill="#98a08a">'+number(v,0)+'</text>';}
  for(const day of [0,Math.round(data.days/3),Math.round(data.days*2/3),data.days])svg+='<text x="'+x(day)+'" y="191" text-anchor="middle" font-family="monospace" font-size="9" fill="#98a08a">Dia '+day+'</text>';
  for(const [key,color] of [['baselineWeight','#b2b49b'],['scenarioWeight','#4c7942']]){let points=[],previousDay;const flush=()=>{if(points.length)svg+='<polyline points="'+points.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2.5"/>';points=[];};for(const row of rows){if(Number.isFinite(row.day)&&Number.isFinite(row[key])&&Number.isFinite(x(row.day))&&Number.isFinite(y(row[key]))){if(previousDay!==undefined&&row.day!==previousDay+1)flush();points.push(x(row.day)+','+y(row[key]));previousDay=row.day;}else{flush();previousDay=undefined;}}flush();}
  $('chart').innerHTML=svg;renderDetailedResults(data);$('comparison').showModal();
}
function comparisonCSV(data){
  data=comparisonData(data);
  const initial=comparisonArray(data.initialPastureByPaddock),cell=(value,digits=4)=>Number.isFinite(value)?value.toFixed(digits):'Indisponível';
  const headers=['dia','peso_ref_kg','peso_confinamento_kg','consumo_ref_lote_kgMS','consumo_confinamento_lote_kgMS','consumo_ref_kgMS_animal','consumo_confinamento_kgMS_animal','estoque_ref_total_kgMS','estoque_confinamento_total_kgMS','custo_ref_brl','custo_confinamento_brl'];
  for(let i=0;i<4;i++)headers.push('piquete_'+String.fromCharCode(65+i)+'_inicio_kgMS','piquete_'+String.fromCharCode(65+i)+'_pasto_final_kgMS','piquete_'+String.fromCharCode(65+i)+'_confinamento_final_kgMS');
  return [headers.join(','),...comparisonRows(data).map(row=>{const base=comparisonConsumption(row,'baseline'),alternative=comparisonConsumption(row,'scenario');return [cell(row.day,0),...[row.baselineWeight,row.scenarioWeight,base,alternative,comparisonPerAnimal(base),comparisonPerAnimal(alternative),row.baselinePastureKgDM,row.scenarioPastureKgDM,row.baselineCost,row.scenarioCost].map(value=>cell(value)),...Array.from({length:4},(_,i)=>[initial[i],row.baselinePastureByPaddock?.[i],row.scenarioPastureByPaddock?.[i]].map(value=>cell(value,2))).flat()].join(',');})].join('\n');
}
$('export').onclick=()=>{if(comparison&&!requestCompare&&!loadingScenario)downloadFile('agroville-comparacao-demonstrativa.csv',comparisonCSV(comparison),'text/csv;charset=utf-8');};

let noticeTimer                              ;function notify(message       ){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,5000);}
$('manifest-export').onclick=()=>{if(requestCompare||loadingScenario)return;if(!comparisonManifest){notify('Faça ou importe uma comparação antes de exportar o manifesto.');return;}downloadFile('agroville-manifesto-demonstrativo.json',JSON.stringify(comparisonManifest,null,2),'application/json;charset=utf-8');};
$('manifest-import').onclick=$('manifest-open').onclick=()=>{if(!requestCompare&&!loadingScenario)$('manifest-file').click();};
$('manifest-file').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file||requestCompare||loadingScenario)return;compareBusy(true);try{const manifest=JSON.parse(await file.text());validateComparisonManifest(manifest);setRunning(false);pendingComparison={snapshot:structuredClone(manifest.initialSnapshot),manifest};notify('Manifesto validado. Reproduzindo a comparação salva…');worker.postMessage({type:'replayComparison',manifest});}catch(error){pendingComparison=null;compareBusy(false);notify('Manifesto inválido: '+error.message);}};
function downloadFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
worker.onmessage=e=>{if(e.data.type==='state'){const request=stateRequests.shift();state=e.data.state;pending=false;if(request==='load'){loadingScenario=false;compareBusy(requestCompare);}buildTerrain(state.initialSeed??state.seed);updateUI();}else if(e.data.type==='comparison'){showComparison(e.data.data);}else if(e.data.type==='error'){const request=stateRequests.shift();pending=false;if(request==='load')loadingScenario=false;pendingComparison=null;compareBusy(false);setRunning(false);notify('Erro no motor: '+e.data.message);}};
worker.onerror=()=>{pending=false;loadingScenario=false;pendingComparison=null;compareBusy(false);setRunning(false);notify('Não foi possível iniciar o motor. Abra o aplicativo por um servidor HTTP.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});
window.addEventListener('pagehide',saveScenarioData);
renderScenarios();if(activeScenario()){selected=activeScenario().selected??1;loadingScenario=true;compareBusy(false);requestState({type:'load',snapshot:activeScenario().snapshot});}else requestState({type:'snapshot'});
requestAnimationFrame(draw);
