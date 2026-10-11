import {metrics,createComparisonManifest,validateComparisonManifest} from './engine.js';

const $=                                   (id       )=>document.getElementById(id)     ;
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
ctx.imageSmoothingEnabled=false;
const terrain=document.createElement('canvas');terrain.width=576;terrain.height=336;const t=terrain.getContext('2d') ;
function rect(g                         ,x       ,y       ,w       ,h       ,color       ){g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),w,h);}
let terrainSeed=9;function rand(){terrainSeed=(Math.imul(1664525,terrainSeed)+1013904223)>>>0;return terrainSeed/4294967296;}
function tree(x       ,y       ,size=1){rect(t,x-8*size,y+6*size,23*size,8*size,'#48674355');rect(t,x+2*size,y+7*size,4*size,10*size,'#755642');rect(t,x-5*size,y-9*size,16*size,21*size,'#345e3e');rect(t,x-9*size,y-3*size,24*size,10*size,'#3f7147');rect(t,x-2*size,y-13*size,10*size,7*size,'#558149');rect(t,x-5*size,y-6*size,8*size,8*size,'#5e8a4c');rect(t,x+5*size,y+3*size,7*size,6*size,'#2b593a');}
function fence(x       ,y       ,w       ,h       ){rect(t,x,y,w,2,'#d0b785');rect(t,x,y+5,w,1,'#baa26c');rect(t,x,y+h,w,2,'#d0b785');rect(t,x,y+h+5,w,1,'#a88c5c');for(let a=x;a<=x+w;a+=12){rect(t,a,y-2,2,10,'#e0c796');rect(t,a,y+h-2,2,10,'#dac08b');}rect(t,x,y,2,h,'#baa06c');rect(t,x+w,y,2,h,'#b79b64');for(let a=y;a<y+h;a+=12){rect(t,x-1,a,4,3,'#e0c796');rect(t,x+w-1,a,4,3,'#e0c796');}}
function house(x       ,y       ,w       ,h       ,roof       ,wall       ){rect(t,x+4,y+6,w,h,'#52684955');rect(t,x,y,w,h,wall);rect(t,x-3,y-6,w+6,15,roof);rect(t,x,y-12,w,7,roof);rect(t,x+5,y-16,w-10,5,roof);rect(t,x+4,y-6,w-8,2,'#ffffff22');for(let xx=x+5;xx<x+w-5;xx+=10){rect(t,xx,y+16,5,7,'#2b4845');rect(t,xx,y+16,5,1,'#ecdaae');}rect(t,x+w/2-4,y+h-13,9,13,'#6b5948');rect(t,x+w/2-3,y+h-11,6,11,'#403b32');}
function buildTerrain(){
  rect(t,0,0,576,336,'#7ea466');
  for(let y=0;y<336;y+=8)for(let x=0;x<576;x+=8){const n=rand();if(n<.42)rect(t,x,y,8,8,n<.2?'#82a86a':'#7b9f60');if(n>.8){rect(t,x+2,y+5,1,2,'#5e874e');rect(t,x+4,y+4,1,3,'#689251');}}
  // Crossroads and paths connect the four fields with a small farm village.
  rect(t,0,151,576,20,'#c7b88b');rect(t,179,0,13,336,'#c7b88b');rect(t,353,0,17,336,'#c7b88b');rect(t,375,151,12,150,'#c7b88b');rect(t,352,294,224,14,'#c7b88b');
  for(let i=0;i<480;i++){const x=rand()*576,y=151+rand()*20;rect(t,x,y,2,1,'#b6a77d');}for(let i=0;i<160;i++)rect(t,353+rand()*17,rand()*336,1,2,'#b8aa7e');
  const patches=[{x:28,y:38,w:148,h:104},{x:195,y:38,w:147,h:104},{x:28,y:178,w:148,h:105},{x:195,y:178,w:147,h:105}];
  patches.forEach((p,i)=>{rect(t,p.x+3,p.y+2,p.w-4,p.h-3,['#8bb16b','#98b673','#86a764','#91ae6b'][i]);for(let j=0;j<180;j++){const x=p.x+6+rand()*(p.w-12),y=p.y+7+rand()*(p.h-12);rect(t,x,y,1,2,j%3===0?'#cad390':'#769655');if(j%4===0)rect(t,x+2,y-1,1,3,'#6f944f');}fence(p.x,p.y,p.w,p.h);rect(t,p.x+p.w-18,p.y+14,13,7,'#4f7775');rect(t,p.x+p.w-17,p.y+15,11,4,'#8cbfc0');rect(t,p.x+59,p.y+p.h-1,16,2,'#857548');});
  // Water, orchards, houses, barns, feed storage and vegetable beds.
  rect(t,460,44,77,54,'#537e87');rect(t,451,55,95,30,'#537e87');rect(t,457,51,82,40,'#71a7a4');rect(t,465,45,66,52,'#71a7a4');rect(t,470,57,20,2,'#a0c7b1');rect(t,511,78,21,2,'#9dc5b4');rect(t,454,84,8,5,'#acb481');
  house(393,57,44,45,'#a47851','#ebd9aa');rect(t,419,31,5,16,'#856653');rect(t,388,108,54,3,'#c3b389');rect(t,399,115,5,5,'#c08d64');
  house(468,115,44,21,'#7c6660','#d3c2a0');
  // Covered feeding shed: animals occupy the open paddock below its roof.
  rect(t,389,188,140,97,'#bcae82');for(let i=0;i<90;i++)rect(t,395+rand()*128,192+rand()*83,2,1,'#a89d73');fence(389,188,140,97);rect(t,391,188,136,12,'#79684f');rect(t,390,175,138,16,'#a2634d');rect(t,395,168,128,8,'#b97556');for(let x=394;x<525;x+=7)rect(t,x,175,1,14,'#895442');rect(t,398,202,12,65,'#776f55');rect(t,400,204,8,61,'#d6b85e');
  rect(t,545,198,17,51,'#677765');rect(t,542,193,23,6,'#899987');rect(t,545,188,17,6,'#b3bc9d');rect(t,548,197,4,43,'#a0ad92');rect(t,545,239,17,4,'#59685a');
  for(let x=393;x<440;x+=9){rect(t,x,313,7,15,'#806b45');for(let y=314;y<328;y+=5){rect(t,x+1,y,5,2,'#568554');rect(t,x+3,y-1,2,4,'#91a863');}}
  rect(t,473,311,52,16,'#97805a');for(let x=476;x<523;x+=8){rect(t,x,313,4,12,'#aba45e');rect(t,x,313,4,2,'#c8bc7b');}
  for(let i=0;i<10;i++)tree(10+i*57,18,0.7);[ [16,82],[18,129],[15,216],[15,268],[23,315],[66,309],[120,317],[164,313],[225,313],[286,315],[330,318],[379,26],[439,20],[551,34],[555,107],[540,137],[564,277] ].forEach(([x,y])=>tree(x,y,.8));
  // Tractor and farm worker.
  rect(t,354,215,16,8,'#396e55');rect(t,354,212,8,5,'#518666');rect(t,358,212,4,4,'#b9cabc');rect(t,352,221,6,5,'#384237');rect(t,365,221,5,4,'#384237');rect(t,354,222,2,2,'#989b77');rect(t,366,222,2,2,'#989b77');
  rect(t,366,148,4,4,'#d9b889');rect(t,365,152,6,6,'#7d8274');rect(t,365,148,6,2,'#c5a46c');rect(t,365,158,2,4,'#4b5143');rect(t,369,158,2,4,'#4b5143');
  t.font='7px monospace';t.fillStyle='#405d35';patches.forEach((p,i)=>t.fillText('PIQUETE '+String.fromCharCode(65+i),p.x+8,p.y+14));t.fillStyle='#ece1c3';t.fillText('CONFINAMENTO',414,183);
}
buildTerrain();
let zoom=1,panX=0,panY=0,drag                                                           =null;
const positions=new Map                            ();
function drawCow(a       ,x       ,y       ,time       ){
  const sel=a.id===selected;const resting=a.action==='resting';const dx=resting?0:Math.sin(time*.003+a.id)*.5;
  x=Math.round(x);y=Math.round(y+dx);rect(ctx,x-6,y+4,15,3,'#40583a55');
  if(sel){ctx.strokeStyle='#f4e4a1';ctx.lineWidth=1;ctx.strokeRect(x-9,y-8,21,19);}
  rect(ctx,x-5,y-3,11,7,a.id%4===0?'#a68460':'#e9e3d0');rect(ctx,x-4,y-2,4,3,'#38483a');rect(ctx,x+2,y+1,4,3,'#38483a');
  rect(ctx,x+5,y-4,5,5,a.id%4===0?'#806343':'#e9e3d0');rect(ctx,x+8,y-3,1,1,'#2a392d');rect(ctx,x+5,y-5,1,2,'#c7b586');rect(ctx,x+9,y-5,1,2,'#c7b586');rect(ctx,x-7,y-3,2,1,'#38483a');
  if(!resting){rect(ctx,x-4,y+4,2,3,'#43503d');rect(ctx,x+3,y+4,2,3,'#43503d');}
  if(a.action==='drinking')rect(ctx,x+9,y+2,2,2,'#83c4cb');
  if(sel){ctx.fillStyle='#f5f3dd';ctx.fillRect(x-18,y-18,39,9);ctx.fillStyle='#3d5635';ctx.font='6px monospace';ctx.fillText(a.name,x-15,y-12);}
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
function resultDifference(base,alternative,unit,digits=1){
  if(!Number.isFinite(base)||!Number.isFinite(alternative))return 'Diferença alternativa − base: indisponível · relativa: indisponível.';
  const delta=alternative-base,relative=base===0?'indefinida (base zero)':(delta/base*100);
  const absolute=(delta>=0?'+':'')+number(delta,digits)+' '+unit;
  const relativeText=typeof relative==='number'?(relative>=0?'+':'')+number(relative,2)+'%':relative;
  return 'Diferença alternativa − base: '+absolute+' · relativa: '+relativeText+'.';
}
function renderDetailedResults(data){
  const end=data.rows.at(-1),herd=data.herdSize??1;
  $('results').innerHTML=`
    <div class="result-card"><h3>PESO MÉDIO · DIA ${data.days}</h3><strong>${number(end.scenarioWeight)} kg/animal</strong><p>Base · pasto: ${number(end.baselineWeight)} kg/animal.</p><p>${resultDifference(end.baselineWeight,end.scenarioWeight,'kg/animal',2)}</p></div>
    <div class="result-card"><h3>CONSUMO ESTIMADO DE MS · ${data.days} DIAS</h3><strong>${number(end.scenarioConsumptionKgDM,0)} kg MS/lote</strong><p>Base: ${number(end.baselineConsumptionKgDM,0)} kg MS/lote · alternativa: ${number(end.scenarioConsumptionKgDM,0)} kg MS/lote.</p><p>${resultDifference(end.baselineConsumptionKgDM,end.scenarioConsumptionKgDM,'kg MS/lote',2)}</p><p>Por animal: base ${number(end.baselineConsumptionKgDM/herd,1)} · alternativa ${number(end.scenarioConsumptionKgDM/herd,1)} kg MS/animal.</p></div>
    <div class="result-card"><h3>ESTOQUE DE FORRAGEM · DIA ${data.days}</h3><strong>${number(end.scenarioPastureKgDM,0)} kg MS</strong><p>Base · pasto: ${number(end.baselinePastureKgDM,0)} kg MS · alternativa · confinamento: ${number(end.scenarioPastureKgDM,0)} kg MS.</p><p>${resultDifference(end.baselinePastureKgDM,end.scenarioPastureKgDM,'kg MS',2)}</p></div>
    <div class="result-card"><h3>CUSTO DA ALIMENTAÇÃO · ${data.days} DIAS</h3><strong>${currency(end.scenarioCost)}</strong><p>Base · pasto: ${currency(end.baselineCost)} · alternativa · confinamento: ${currency(end.scenarioCost)} · R$/lote.</p><p>${resultDifference(end.baselineCost,end.scenarioCost,'R$/lote',2)}</p></div>`;
  const sources=[
    ['Forragem retirada dos piquetes','pastureKgDM'],
    ['Alimento-base assumido no confinamento','barnBaseKgDM'],
    ['Suplemento configurado','supplementKgDM'],
    ['Adicional fixo da dieta','dietExtraKgDM']
  ];
  const intakeRows=sources.map(([label,key])=>`<tr><th scope="row">${label}</th><td>${number(end.baselineIntakeBySourceKgDM[key],1)}</td><td>${number(end.scenarioIntakeBySourceKgDM[key],1)}</td></tr>`).join('');
  $('intake-summary').innerHTML=`<section><h3>COMPOSIÇÃO DO CONSUMO ESTIMADO · KG MS NO LOTE · ${data.days} DIAS</h3><table class="pasture-table"><thead><tr><th scope="col">Componente do motor</th><th scope="col">Base · pasto</th><th scope="col">Alternativa · confinamento</th></tr></thead><tbody>${intakeRows}</tbody></table></section>`;
  const paddockRows=data.initialPastureByPaddock.map((initial,index)=>`<tr><th scope="row">Piquete ${String.fromCharCode(65+index)}</th><td>${number(initial,0)}</td><td>${number(end.baselinePastureByPaddock[index],0)}</td><td>${number(end.scenarioPastureByPaddock[index],0)}</td></tr>`).join('');
  $('pasture-summary').innerHTML=`<section><h3>ESTOQUE DE FORRAGEM POR PIQUETE · KG MS</h3><table class="pasture-table"><thead><tr><th scope="col">Piquete</th><th scope="col">Início</th><th scope="col">Base · pasto · dia ${data.days}</th><th scope="col">Alternativa · confinamento · dia ${data.days}</th></tr></thead><tbody>${paddockRows}</tbody></table><p>Estoque calculado por crescimento assumido e retirada de forragem pelo motor; sem área, medição ou categoria real de condição do pasto.</p></section>`;
}
function showComparison(data){
  comparison=data;comparisonSnapshot=pendingComparison.snapshot;comparisonManifest=pendingComparison.manifest;pendingComparison=null;compareBusy(false);
  const c=data.initialConfig;if(!c)return;
  $('compareconfig').textContent='Única variável: local do rebanho (base · pasto → alternativa · confinamento). Horizonte: '+data.days+' dias desde o snapshot. Permanecem iguais: '+data.herdSize+' animais, mesmo snapshot e semente, '+dietNames[c.diet]+', '+number(c.supplement)+' kg MS de suplemento/animal/dia e '+({normal:'clima ameno',hot:'calor',rain:'chuva'}[c.weather])+'.;
  const rows=data.rows,values=rows.flatMap(r=>[r.baselineWeight,r.scenarioWeight]),low=Math.floor(Math.min(...values)-1),high=Math.ceil(Math.max(...values)+1);
  const x=day=>44+day/data.days*548,y=weight=>165-(weight-low)/(high-low)*133;
  let svg='';
  for(let i=0;i<4;i++){const v=low+(high-low)*i/3;svg+='<line x1="44" x2="592" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#dde5d4"/><text x="2" y="'+(y(v)+3)+'" font-family="monospace" font-size="9" fill="#98a08a">'+number(v,0)+'</text>';}
  for(const day of [0,Math.round(data.days/3),Math.round(data.days*2/3),data.days])svg+='<text x="'+x(day)+'" y="191" text-anchor="middle" font-family="monospace" font-size="9" fill="#98a08a">Dia '+day+'</text>';
  for(const [key,color] of [['baselineWeight','#b2b49b'],['scenarioWeight','#4c7942']])svg+='<polyline points="'+rows.map(r=>x(r.day)+','+y(r[key])).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2.5"/>';
  $('chart').setAttribute('aria-label','Evolução de peso médio em '+data.days+' dias');$('chart').innerHTML=svg;renderDetailedResults(data);$('comparison').showModal();
}
$('export').onclick=()=>{if(!comparison)return;const paddocks=comparison.initialPastureByPaddock.length;const headers=['dia','peso_ref_kg','peso_confinamento_kg','consumo_ref_lote_kgMS','consumo_confinamento_lote_kgMS','consumo_ref_kgMS_animal','consumo_confinamento_kgMS_animal','estoque_ref_total_kgMS','estoque_confinamento_total_kgMS','custo_ref_brl','custo_confinamento_brl'];for(let i=0;i<paddocks;i++)headers.push('piquete_'+String.fromCharCode(65+i)+'_inicio_kgMS','piquete_'+String.fromCharCode(65+i)+'_pasto_final_kgMS','piquete_'+String.fromCharCode(65+i)+'_confinamento_final_kgMS');const herd=comparison.herdSize??1;const rows=[headers.join(','),...comparison.rows.map(r=>[r.day,r.baselineWeight.toFixed(4),r.scenarioWeight.toFixed(4),r.baselineConsumptionKgDM.toFixed(4),r.scenarioConsumptionKgDM.toFixed(4),(r.baselineConsumptionKgDM/herd).toFixed(4),(r.scenarioConsumptionKgDM/herd).toFixed(4),r.baselinePastureKgDM.toFixed(4),r.scenarioPastureKgDM.toFixed(4),r.baselineCost.toFixed(4),r.scenarioCost.toFixed(4),...r.baselinePastureByPaddock.flatMap((value,i)=>[comparison.initialPastureByPaddock[i].toFixed(2),value.toFixed(2),r.scenarioPastureByPaddock[i].toFixed(2)])].join(','))];const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='agroville-comparacao-demonstrativa.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
let noticeTimer                              ;function notify(message       ){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,5000);}
$('manifest-export').onclick=()=>{if(!comparisonManifest){notify('Faça ou importe uma comparação antes de exportar o manifesto.');return;}downloadFile('agroville-manifesto-demonstrativo.json',JSON.stringify(comparisonManifest,null,2),'application/json;charset=utf-8');};
$('manifest-import').onclick=$('manifest-open').onclick=()=>{if(!requestCompare&&!loadingScenario)$('manifest-file').click();};
$('manifest-file').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file||requestCompare||loadingScenario)return;try{const manifest=JSON.parse(await file.text());validateComparisonManifest(manifest);setRunning(false);pendingComparison={snapshot:structuredClone(manifest.initialSnapshot),manifest};compareBusy(true);notify('Manifesto validado. Reproduzindo a comparação salva…');worker.postMessage({type:'replayComparison',manifest});}catch(error){pendingComparison=null;compareBusy(false);notify('Manifesto inválido: '+error.message);}};
function downloadFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
worker.onmessage=e=>{if(e.data.type==='state'){const request=stateRequests.shift();state=e.data.state;pending=false;if(request==='load'){loadingScenario=false;compareBusy(requestCompare);}updateUI();}else if(e.data.type==='comparison'){showComparison(e.data.data);}else if(e.data.type==='error'){const request=stateRequests.shift();pending=false;if(request==='load')loadingScenario=false;pendingComparison=null;compareBusy(false);setRunning(false);notify('Erro no motor: '+e.data.message);}};
worker.onerror=()=>{pending=false;loadingScenario=false;pendingComparison=null;compareBusy(false);setRunning(false);notify('Não foi possível iniciar o motor. Abra o aplicativo por um servidor HTTP.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});
window.addEventListener('pagehide',saveScenarioData);
renderScenarios();if(activeScenario()){selected=activeScenario().selected??1;loadingScenario=true;compareBusy(false);requestState({type:'load',snapshot:activeScenario().snapshot});}else requestState({type:'snapshot'});
requestAnimationFrame(draw);
