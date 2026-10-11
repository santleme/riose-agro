import {metrics} from './engine.js';
                                                        
const $=                                   (id       )=>document.getElementById(id)     ;
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
let state                   ,selected=1,running=true,speed=1,pending=false,lastTick=0,comparison    ,requestCompare=false;
const currency=(n       )=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const number=(n       ,digits=1)=>n.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const actionNames={grazing:'Pastando',feeding:'No cocho',drinking:'Bebendo água',resting:'Descansando'};
const thoughts={grazing:'Hora de procurar um pouco de pasto.',feeding:'O cocho está cheio. Vou comer por aqui.',drinking:'Estou com sede. Hora de beber água.',resting:'Vou descansar um pouco antes de voltar.'};
const dietNames={pasture:'Volumoso / pasto',balanced:'Balanceada',concentrate:'Mais concentrado'};
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
  if(running&&!pending&&time-lastTick>1000/speed){worker.postMessage({type:'tick',hours:1});pending=true;lastTick=time;}
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
function configure(patch                ){worker.postMessage({type:'configure',patch});}
$                   ('diet').onchange=e=>configure({diet:(e.target                     ).value                  });
$                   ('weather').onchange=e=>configure({weather:(e.target                     ).value                     });
$                  ('supplement').oninput=e=>$('supplementvalue').textContent=number(Number((e.target                    ).value))+' kg MS/dia';
$                  ('supplement').onchange=e=>configure({supplement:Number((e.target                    ).value)});
$('pasturebtn').onclick=()=>configure({housing:'pasture'});$('barnbtn').onclick=()=>configure({housing:'barn'});
function setRunning(value        ){running=value;$('play').textContent=value?'Ⅱ':'▶';$('play').setAttribute('aria-label',value?'Pausar simulação':'Continuar simulação');lastTick=performance.now();}
$('play').onclick=()=>setRunning(!running);$('day').onclick=()=>{setRunning(false);worker.postMessage({type:'tick',hours:24});};$('reset').onclick=()=>{selected=1;positions.clear();worker.postMessage({type:'reset'});setRunning(false);};
$                   ('speed').onchange=e=>speed=Number((e.target                     ).value);
$('method').onclick=()=>$                   ('methodology').showModal();document.querySelectorAll                   ('[data-close]').forEach(button=>button.onclick=()=>$                   (button.dataset.close ).close());
function beginCompare(){if(!state)return;setRunning(false);requestCompare=true;$('compare').textContent='Calculando…';worker.postMessage({type:'compare',days:30});}
$('compare').onclick=beginCompare;
$('experiment').onclick=()=>{configure({housing:'barn'});setRunning(false);notify('Confinamento aplicado. A comparação muda somente o local do rebanho.');};
function showComparison(data){comparison=data;$('compare').innerHTML='Comparar 30 dias <span>↗</span>';if(!state)return;const c=state.config;$('compareconfig').textContent='Única variável: local do rebanho (pasto × confinamento). Mantidos iguais: '+dietNames[c.diet]+', '+number(c.supplement)+' kg MS de suplemento/animal/dia e '+({normal:'clima ameno',hot:'calor',rain:'chuva'}[c.weather])+'.';const rows=data.rows;const values=rows.flatMap(r=>[r.baselineWeight,r.scenarioWeight]);const low=Math.floor(Math.min(...values)-1),high=Math.ceil(Math.max(...values)+1);const x=day=>44+day/data.days*548,y=weight=>165-(weight-low)/(high-low)*133;let svg='';for(let i=0;i<4;i++){const v=low+(high-low)*i/3;svg+='<line x1="44" x2="592" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#dde5d4"/><text x="2" y="'+(y(v)+3)+'" font-family="monospace" font-size="9" fill="#98a08a">'+number(v,0)+'</text>';}for(const day of [0,Math.round(data.days/3),Math.round(data.days*2/3),data.days])svg+='<text x="'+x(day)+'" y="191" text-anchor="middle" font-family="monospace" font-size="9" fill="#98a08a">Dia '+day+'</text>';for(const [key,color] of [['baselineWeight','#b2b49b'],['scenarioWeight','#4c7942']])svg+='<polyline points="'+rows.map(r=>x(r.day)+','+y(r[key])).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2.5"/>';$('chart').innerHTML=svg;const end=rows.at(-1),delta=end.scenarioWeight-end.baselineWeight;$('results').innerHTML='<div class="result-card"><h3>PESO MÉDIO NO DIA '+data.days+'</h3><strong>'+number(end.scenarioWeight)+' kg</strong><p>Pasto: '+number(end.baselineWeight)+' kg · diferença: '+(delta>=0?'+':'')+number(delta)+' kg/animal</p></div><div class="result-card"><h3>CUSTO DA ALIMENTAÇÃO · '+data.days+' DIAS</h3><strong>'+currency(end.scenarioCost)+'</strong><p>Pasto: '+currency(end.baselineCost)+' · lote inteiro</p></div>';$('comparison').showModal();}
$('export').onclick=()=>{if(!comparison)return;const rows=['dia,peso_referencia_kg,peso_cenario_kg,custo_referencia_brl,custo_cenario_brl',...comparison.rows.map((r    )=>[r.day,r.baselineWeight.toFixed(4),r.scenarioWeight.toFixed(4),r.baselineCost.toFixed(4),r.scenarioCost.toFixed(4)].join(','))];const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='agroville-comparacao-demonstrativa.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
let noticeTimer                              ;function notify(message       ){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,5000);}
worker.onmessage=e=>{if(e.data.type==='state'){state=e.data.state;pending=false;updateUI();}else if(e.data.type==='comparison'){requestCompare=false;showComparison(e.data.data);}else if(e.data.type==='error'){pending=false;requestCompare=false;setRunning(false);$('compare').innerHTML='Comparar 30 dias <span>↗</span>';notify('Erro no motor: '+e.data.message);}};
worker.onerror=()=>{pending=false;requestCompare=false;setRunning(false);notify('Não foi possível iniciar o motor. Abra o aplicativo por um servidor HTTP.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});
requestAnimationFrame(draw);
