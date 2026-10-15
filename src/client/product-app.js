import {metrics,createComparisonManifest,validateComparisonManifest} from './engine.js';
import {simulateNelorePastureScenario,analyzePastureDmiSensitivity,BR_CORTE_PASTURE_DMI} from '../../scientific/br_corte_pasture_dmi.js';
import {drawProductFarm,productFarmEntityAt,productFarmHoverEntityAt,projectFarm,PRODUCT_SCENE_SIZE} from './product-scene.js';
import {displayToScenePoint,PRODUCT_BLOCKOUT} from './product-spatial.js';
import {combineLegacySnapshot,createAnimalViewStateDTO,separateLegacySnapshot} from './animal-view-state.js';

const $=                                   (id       )=>document.getElementById(id)     ;
const manifestoMotionPreference=typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false,addEventListener(){}};
const productExperience=typeof document!=='undefined'&&Boolean(document.body?.classList?.contains('product-body'));
const sceneWidth=productExperience?PRODUCT_SCENE_SIZE.width:576,sceneHeight=productExperience?PRODUCT_SCENE_SIZE.height:336;
const worker=new Worker(new URL('./worker.js?product=1',import.meta.url),{type:'module'});
let state,viewState,snapshotViewState,selected=1,running=!(productExperience&&manifestoMotionPreference.matches),speed=1,pending=false,lastTick=0,comparison    ,requestCompare=false,comparisonSnapshot,comparisonManifest,pendingComparison,loadingScenario=false,scientificResult=null,scientificPreviewActive=false;
const stateRequests=[];
let productWorldRenderer=null;
let productZoom=1;
function requestState(message){stateRequests.push(message.type);worker.postMessage(message);}
function compareBusy(value){requestCompare=value;for(const id of ['compare','experiment','manifest-import','manifest-open','manifest-export','export'])$(id).disabled=value||loadingScenario;$('scenario-select').disabled=value||loadingScenario;$('compare').textContent=productExperience?(loadingScenario?'Loading world…':value?'Comparing…':'Compare 30 days'):(loadingScenario?'Carregando cenário…':value?'Calculando…':'Comparar 30 dias ↗');}
const currency=(n       )=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const number=(n       ,digits=1)=>n.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const actionNames=productExperience?{grazing:'Grazing',feeding:'At the feeder',drinking:'Drinking water',resting:'Resting'}:{grazing:'Pastando',feeding:'No cocho',drinking:'Bebendo água',resting:'Descansando'};
const thoughts=productExperience?{grazing:'Moving through the pasture.',feeding:'At the feeder.',drinking:'At a water source.',resting:'Resting before moving again.'}:{grazing:'Hora de procurar um pouco de pasto.',feeding:'O cocho está cheio. Vou comer por aqui.',drinking:'Estou com sede. Hora de beber água.',resting:'Vou descansar um pouco antes de voltar.'};
const dietNames=productExperience?{pasture:'Pasture',balanced:'Balanced',concentrate:'Higher concentrate'}:{pasture:'Volumoso / pasto',balanced:'Balanceada',concentrate:'Mais concentrado'};
const scenarioNames=productExperience?{pasture:'Pasture',balanced:'Balanced',concentrate:'Concentrate',normal:'Mild',hot:'Hot',rain:'Rain',barn:'Confinement'}:{pasture:'Pasto',balanced:'Balanceada',concentrate:'Concentrado',normal:'Ameno',hot:'Calor',rain:'Chuvoso',barn:'Confinamento'};
const scenarioStorageKey='agroville-scenarios-v1',scenarioActiveKey='agroville-active-scenario-v1';
let scenarios=[],activeScenarioId=null,storageWarningShown=false;
try{const saved=JSON.parse(localStorage.getItem(scenarioStorageKey)??'[]');if(Array.isArray(saved))scenarios=saved.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&item.snapshot?.animals&&item.snapshot?.config);}catch{}
try{activeScenarioId=localStorage.getItem(scenarioActiveKey);}catch{}
if(!scenarios.some(item=>item.id===activeScenarioId))activeScenarioId=null;
function activeScenario(){return scenarios.find(item=>item.id===activeScenarioId);}
function saveScenarioData(){try{localStorage.setItem(scenarioStorageKey,JSON.stringify(scenarios));localStorage.setItem(scenarioActiveKey,activeScenarioId??'');return true;}catch{if(!storageWarningShown){notify('O navegador não conseguiu guardar os cenários. Remova cenários antigos ou libere espaço.');storageWarningShown=true;}return false;}}
function renderScenarios(){const select=$('scenario-select'),active=activeScenario();select.replaceChildren(new Option(productExperience?'Current world · not saved':'Fazenda atual · não salva',''));for(const scenario of scenarios){const config=scenario.snapshot.config;select.add(new Option(scenario.name+' · D'+(Math.floor(scenario.snapshot.hour/24)+1)+' · '+scenarioNames[config.housing]+' · '+scenarioNames[config.diet],scenario.id));}select.value=activeScenarioId??'';$('scenario-rename').disabled=!active;$('scenario-delete').disabled=!active;$('event-scope').textContent=active?active.name.toLocaleUpperCase('en-US'):(productExperience?'LIVE':'AO VIVO');if(active){const snapshot=active.snapshot,c=snapshot.config;$('scenario-status').textContent=productExperience?'Day '+String(Math.floor(snapshot.hour/24)+1).padStart(2,'0')+' · '+scenarioNames[c.housing]+' · '+scenarioNames[c.diet]+' · '+number(c.supplement)+' kg DM/day · '+scenarioNames[c.weather]+' · '+snapshot.events.length+' events':'D'+String(Math.floor(snapshot.hour/24)+1).padStart(2,'0')+' · '+scenarioNames[c.housing]+' · dieta '+scenarioNames[c.diet]+' · '+number(c.supplement)+' kg MS/animal/dia · '+scenarioNames[c.weather]+' · '+snapshot.events.length+' eventos';}else $('scenario-status').textContent=productExperience?'Current world · unsaved':'Cenário atual ainda não salvo.';}
const cowSvg='<svg viewBox="0 0 18 14" aria-hidden="true"><path fill="#45613e" d="M3 3h10v7H3zM12 2h4v6h-4zM3 9h2v4H3zM10 9h2v4h-2zM1 4h2v4H1z"/><path fill="#edf1e1" d="M4 3h5v3H4zM8 7h5v3H8zM13 2h2v3h-2z"/><path fill="#293b23" d="M15 4h1v1h-1z"/></svg>';
const canvas=$                   ('map'),ctx=canvas.getContext('2d') ;
// Keep the logical scene coordinates, but rasterize at display DPR so
// the browser never has to enlarge a low-resolution bitmap of the whole farm.
ctx.imageSmoothingEnabled=true;
ctx.imageSmoothingQuality='high';
let canvasScaleX=1,canvasScaleY=1;
function resizeProductCanvas(){
  const bounds=canvas.getBoundingClientRect();
  const scale=window.devicePixelRatio||1;
  if(!bounds.width||!bounds.height)return;
  const width=Math.round(bounds.width*scale),height=Math.round(bounds.height*scale);
  if(canvas.width===width&&canvas.height===height&&canvasScaleX===width/sceneWidth&&canvasScaleY===height/sceneHeight)return;
  canvas.width=width;canvas.height=height;canvasScaleX=width/sceneWidth;canvasScaleY=height/sceneHeight;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
}
new ResizeObserver(resizeProductCanvas).observe(canvas);
window.addEventListener('resize',resizeProductCanvas,{passive:true});
resizeProductCanvas();
const terrain=document.createElement('canvas');terrain.width=576;terrain.height=336;const t=terrain.getContext('2d') ;
t.imageSmoothingEnabled=true;t.imageSmoothingQuality='high';
function rect(g                         ,x       ,y       ,w       ,h       ,color       ){g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),w,h);}
let terrainSeed=9;function rand(){terrainSeed=(Math.imul(1664525,terrainSeed)+1013904223)>>>0;return terrainSeed/4294967296;}
const assetFrames={},assetAtlases={};
function drawAssetOn(g,id,x,y,w,h,anchor='center',rotation=0){const frame=assetFrames[id],atlas=frame&&assetAtlases[frame.atlas];if(!atlas?.complete||!atlas.naturalWidth)return;const ax=typeof anchor==='object'?anchor.x:.5,ay=typeof anchor==='object'?anchor.y:anchor==='bottom'?1:.5;g.save();g.translate(x,y);g.rotate(rotation);g.drawImage(atlas,frame.x,frame.y,frame.w,frame.h,-w*ax,-h*ay,w,h);g.restore();}
function loadProductAssets(){fetch('/assets/manifest.json').then(response=>{if(!response.ok)throw new Error('manifest');return response.json();}).then(manifest=>{
  for(const asset of manifest.assets)assetFrames[asset.id]=asset.frame;
  const atlases=Object.entries(manifest.atlases).filter(([id])=>id==='livestock-approved');let loaded=0;
  window.productAssetManifest=manifest;
  for(const [id,definition] of atlases){const atlas=new Image();assetAtlases[id]=atlas;atlas.onload=()=>{loaded++;if(loaded===atlases.length)buildTerrain();};atlas.onerror=()=>{assetFrames[id]=null;};atlas.src=definition.image;}
}).catch(()=>{});}
function tree(x       ,y       ,size=1){rect(t,x-8*size,y+6*size,23*size,8*size,'#48674355');rect(t,x+2*size,y+7*size,4*size,10*size,'#755642');rect(t,x-5*size,y-9*size,16*size,21*size,'#345e3e');rect(t,x-9*size,y-3*size,24*size,10*size,'#3f7147');rect(t,x-2*size,y-13*size,10*size,7*size,'#558149');rect(t,x-5*size,y-6*size,8*size,8*size,'#5e8a4c');rect(t,x+5*size,y+3*size,7*size,6*size,'#2b593a');}
function fence(x       ,y       ,w       ,h       ){rect(t,x,y,w,2,'#d0b785');rect(t,x,y+5,w,1,'#baa26c');rect(t,x,y+h,w,2,'#d0b785');rect(t,x,y+h+5,w,1,'#a88c5c');for(let a=x;a<=x+w;a+=12){rect(t,a,y-2,2,10,'#e0c796');rect(t,a,y+h-2,2,10,'#dac08b');}rect(t,x,y,2,h,'#baa06c');rect(t,x+w,y,2,h,'#b79b64');for(let a=y;a<y+h;a+=12){rect(t,x-1,a,4,3,'#e0c796');rect(t,x+w-1,a,4,3,'#e0c796');}}
function house(x       ,y       ,w       ,h       ,roof       ,wall       ){rect(t,x+4,y+6,w,h,'#52684955');rect(t,x,y,w,h,wall);rect(t,x-3,y-6,w+6,15,roof);rect(t,x,y-12,w,7,roof);rect(t,x+5,y-16,w-10,5,roof);rect(t,x+4,y-6,w-8,2,'#ffffff22');for(let xx=x+5;xx<x+w-5;xx+=10){rect(t,xx,y+16,5,7,'#2b4845');rect(t,xx,y+16,5,1,'#ecdaae');}rect(t,x+w/2-4,y+h-13,9,13,'#6b5948');rect(t,x+w/2-3,y+h-11,6,11,'#403b32');}
function buildTerrain(){
  if(productExperience){rect(t,0,0,576,336,'#71905d');return;}
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
  if(!productExperience){t.font='7px monospace';t.fillStyle='#405d35';patches.forEach((p,i)=>t.fillText('PIQUETE '+String.fromCharCode(65+i),p.x+8,p.y+14));t.fillStyle='#ece1c3';t.fillText('CONFINAMENTO',414,183);}
}
buildTerrain();
if(productExperience)loadProductAssets();
let zoom=1,panX=0,panY=0,drag=null,activeSceneEntity=null,hoverSceneEntity=null,hoverAnimalId=null;
const positions=new Map();
const visualAnimalPositions=new Map();
function renderAnimals(){if(!state||!viewState)return[];const positionsById=new Map(viewState.animals.map(animal=>[animal.id,animal]));return state.animals.map(animal=>({...animal,...positionsById.get(animal.id)}));}
function currentLegacySnapshot(){return combineLegacySnapshot(state,snapshotViewState);}
function prepareProductAnimals(time){
  return renderAnimals().map(animal=>{
    let point=positions.get(animal.id);
    if(!point||point.patch!==animal.patch||Math.hypot(point.x-animal.x,point.y-animal.y)>180){point={x:animal.x,y:animal.y,patch:animal.patch};positions.set(animal.id,point);}
    const movementFactor=manifestoMotionPreference.matches?1:.07;
    point.x+=(animal.x-point.x)*movementFactor;point.y+=(animal.y-point.y)*movementFactor;
    visualAnimalPositions.set(animal.id,projectFarm(point.x,point.y,animal.patch,state.config.housing));
    return {...animal,x:point.x,y:point.y};
  });
}
function drawProductScene(time){
  const animals=prepareProductAnimals(time).map(animal=>({animal,x:animal.x,y:animal.y}));
  drawProductFarm(ctx,{time,animals,housing:state?.config.housing??'pasture',drawAnimal:drawProductCow,onAnimalPosition:(animal,point)=>visualAnimalPositions.set(animal.id,point),selectedEntityId:activeSceneEntity?.id??null,hoverEntityId:hoverSceneEntity?.id??null});
}

function drawCow(a       ,x       ,y       ,time       ){
  const sel=a.id===selected;const resting=a.action==='resting';const dx=resting?0:Math.sin(time*.003+a.id)*.5;
  x=Math.round(x);y=Math.round(y+dx);rect(ctx,x-6,y+4,15,3,'#40583a55');
  if(sel){ctx.strokeStyle='#f4e4a1';ctx.lineWidth=1;ctx.strokeRect(x-9,y-8,21,19);}
  rect(ctx,x-5,y-3,11,7,a.id%4===0?'#a68460':'#e9e3d0');rect(ctx,x-4,y-2,4,3,'#38483a');rect(ctx,x+2,y+1,4,3,'#38483a');
  rect(ctx,x+5,y-4,5,5,a.id%4===0?'#806343':'#e9e3d0');rect(ctx,x+8,y-3,1,1,'#2a392d');rect(ctx,x+5,y-5,1,2,'#c7b586');rect(ctx,x+9,y-5,1,2,'#c7b586');rect(ctx,x-7,y-3,2,1,'#38483a');
  if(!resting){rect(ctx,x-4,y+4,2,3,'#43503d');rect(ctx,x+3,y+4,2,3,'#43503d');}
  if(a.action==='drinking')rect(ctx,x+9,y+2,2,2,'#83c4cb');
  if(sel&&!productExperience){ctx.fillStyle='#f5f3dd';ctx.fillRect(x-18,y-18,39,9);ctx.fillStyle='#3d5635';ctx.font='6px monospace';ctx.fillText(a.name,x-15,y-12);}
}
function drawProductCow(a,x,y,time,scale=1){
  if(productExperience){
    const bob=a.action==='resting'?0:Math.sin(time*.003+a.id)*1.1;
    const width=(a.action==='resting'?21:23)*scale,height=(a.action==='resting'?16:18)*scale;
    if(a.id===selected||a.id===hoverAnimalId){ctx.save();ctx.beginPath();ctx.ellipse(x,y+3*scale,12*scale,3.8*scale,0,0,Math.PI*2);ctx.strokeStyle=a.id===selected?'#e4d394':'rgba(250,244,212,.94)';ctx.lineWidth=a.id===selected?1.5:1.1;ctx.stroke();ctx.restore();}
    drawAssetOn(ctx,'nelore-adult',x,y+bob,width,height,'bottom');
    if(a.action==='drinking'){ctx.fillStyle='#78aaa6';ctx.beginPath();ctx.arc(x+11,y-17+bob,2.3,0,Math.PI*2);ctx.fill();}
    if(a.action==='feeding'){ctx.fillStyle='#d0a955';ctx.fillRect(x-1,y-23+bob,9,2);}
    return;
  }
  x=Math.round(x);y=Math.round(y+(a.action==='resting'?0:Math.sin(time*.003+a.id)*.35));
  const walking=a.action!=='resting',step=walking?Math.sin(time*.012+a.id)*1.2:0;
  rect(ctx,x-9,y+8,20,2,'#30362b35');
  if(productExperience&&a.id===selected){ctx.strokeStyle='#e4d394';ctx.lineWidth=1.2;ctx.strokeRect(x-15,y-10,31,23);}
  // A compact, left-facing pixel silhouette keeps the live herd legible over the isometric farm.
  rect(ctx,x-7,y-5,15,9,'#34382f');rect(ctx,x-10,y-6,6,8,'#34382f');rect(ctx,x-13,y-4,5,5,'#34382f');
  rect(ctx,x-6,y-4,13,7,'#f1ead9');rect(ctx,x-9,y-5,4,6,'#f1ead9');rect(ctx,x-12,y-3,4,3,'#dbc9aa');
  rect(ctx,x-5,y-4,4,3,a.id%3===0?'#8a6548':'#4b4b40');rect(ctx,x+2,y-1,4,3,a.id%3===0?'#8a6548':'#4b4b40');
  rect(ctx,x-10,y-7,2,2,'#e4d2ad');rect(ctx,x-8,y-7,2,1,'#34382f');rect(ctx,x-10,y-1,1,1,'#282c27');
  if(productExperience){rect(ctx,x-8,y-2,2,3,'#e6c64d');rect(ctx,x-8,y-2,1,1,'#403c2c');}
  rect(ctx,x-5,y+3,3,5+Math.max(0,Math.round(step)),'#3f4038');rect(ctx,x+3,y+3,3,5+Math.max(0,Math.round(-step)),'#3f4038');
  if(walking){rect(ctx,x-5,y+7,3,1,'#e2dbc7');rect(ctx,x+3,y+7,3,1,'#e2dbc7');}
  rect(ctx,x+7,y-5,1,4,'#34382f');rect(ctx,x+8,y-6,1,2,'#34382f');
}
function draw(time       ){
  if(productExperience&&productWorldRenderer){
    const animals=prepareProductAnimals(time);
    productWorldRenderer.update({animals,housing:state?.config.housing??'pasture',hour:state?.hour??6,pastures:state?.pastures??[],selectedAnimalId:selected,selectedEntityId:activeSceneEntity?.id??null,hoverAnimalId,hoverEntityId:hoverSceneEntity?.id??null,weather:state?.config.weather??'normal'});
    if(running&&!pending&&!loadingScenario&&time-lastTick>1000/speed){requestState({type:'tick',hours:1});pending=true;lastTick=time;}
    requestAnimationFrame(draw);
    return;
  }
  ctx.setTransform(canvasScaleX,0,0,canvasScaleY,0,0);ctx.clearRect(0,0,sceneWidth,sceneHeight);ctx.fillStyle=productExperience?'#f7f7f4':'#6b905b';ctx.fillRect(0,0,sceneWidth,sceneHeight);ctx.save();ctx.translate(panX,panY);ctx.scale(zoom,zoom);
  if(productExperience){
    drawProductScene(time);
  }else ctx.drawImage(terrain,0,0);
  if(state){
    if(!productExperience)for(let i=0;i<4;i++){const x=i%2===0?28:195,y=i<2?38:178;const fraction=state.pastures[i]/(scientificResult?Math.max(1,scientificResult.assumptions.initialPastureKgDMByPaddock[i]):2400);rect(ctx,x+8,y+23,30,2,'#5c7748');rect(ctx,x+8,y+23,Math.round(30*fraction),2,'#dde6a0');}
    const animals=renderAnimals().sort((a,b)=>productExperience?(a.x+a.y)-(b.x+b.y):a.y-b.y);
    for(const a of animals){if(productExperience)continue;let pos=positions.get(a.id);if(!pos||Math.hypot(pos.x-a.x,pos.y-a.y)>180){pos={x:a.x,y:a.y};positions.set(a.id,pos);}pos.x+=(a.x-pos.x)*.07;pos.y+=(a.y-pos.y)*.07;drawCow(a,pos.x,pos.y,time);}
    if(state.config.weather==='rain'){ctx.strokeStyle='#c0d6c355';ctx.lineWidth=1;for(let i=0;i<60;i++){const x=(i*77+(time*.045))%sceneWidth,y=(i*59+time*.095)%sceneHeight;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2,y+5);ctx.stroke();}}
    if(state.config.weather==='hot'){rect(ctx,0,0,sceneWidth,sceneHeight,'#efb65715');}
    const hour=state.hour%24;if(hour>=20||hour<6)rect(ctx,0,0,sceneWidth,sceneHeight,'#183c4c70');
  }
  ctx.restore();
  const miniCanvas=$('agent-mini-map');
  if(miniCanvas&&state){
    const mini=miniCanvas.getContext('2d');
    mini.imageSmoothingEnabled=false;
    mini.clearRect(0,0,miniCanvas.width,miniCanvas.height);
    mini.drawImage(canvas,0,0,miniCanvas.width,miniCanvas.height);
    const agent=state.animals.find(item=>item.id===selected);
    const point=agent?positions.get(agent.id):null;
    if(point){
      const projected=productExperience?(visualAnimalPositions.get(agent.id)??projectFarm(point.x,point.y,agent.patch,state.config.housing)):point;
      const mx=(projected.x*zoom+panX)/sceneWidth*miniCanvas.width,my=(projected.y*zoom+panY)/sceneHeight*miniCanvas.height;
      mini.beginPath();mini.arc(mx,my,4,0,Math.PI*2);mini.fillStyle='#f6e9ad';mini.fill();
      mini.beginPath();mini.arc(mx,my,2,0,Math.PI*2);mini.fillStyle='#26352b';mini.fill();
    }
  }
  if(running&&!pending&&!loadingScenario&&time-lastTick>1000/speed){requestState({type:'tick',hours:1});pending=true;lastTick=time;}
  requestAnimationFrame(draw);
}
function setZoom(value       ){if(productExperience&&productWorldRenderer){productZoom=Math.max(1,Math.min(3,value));productWorldRenderer.setZoom(productZoom);return;}const next=Math.max(1,Math.min(3,value));panX=sceneWidth/2-(sceneWidth/2-panX)*next/zoom;panY=sceneHeight/2-(sceneHeight/2-panY)*next/zoom;zoom=next;limitPan();}
function limitPan(){panX=Math.max(sceneWidth-sceneWidth*zoom,Math.min(0,panX));panY=Math.max(sceneHeight-sceneHeight*zoom,Math.min(0,panY));}
function mapPoint(e                        ){const b=canvas.getBoundingClientRect();return displayToScenePoint(e.clientX,e.clientY,b,{width:sceneWidth,height:sceneHeight});}
canvas.addEventListener('pointerdown',e=>{const p=mapPoint(e);drag={...p,px:panX,py:panY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag){if(productExperience){const p=mapPoint(e),x=(p.x-panX)/zoom,y=(p.y-panY)/zoom;const animalHit=renderAnimals().map(animal=>{const point=visualAnimalPositions.get(animal.id)??projectFarm((positions.get(animal.id)??animal).x,(positions.get(animal.id)??animal).y,animal.patch,state.config.housing);return {animal,distance:Math.hypot(point.x-x,point.y-y)};}).sort((a,b)=>a.distance-b.distance)[0];hoverAnimalId=animalHit&&animalHit.distance<18?animalHit.animal.id:null;hoverSceneEntity=hoverAnimalId?null:productFarmHoverEntityAt(x,y);canvas.style.cursor=hoverAnimalId||hoverSceneEntity?'pointer':'grab';}return;}const p=mapPoint(e);if(Math.hypot(p.x-drag.x,p.y-drag.y)>3)drag.moved=true;panX=drag.px+p.x-drag.x;panY=drag.py+p.y-drag.y;limitPan();});
canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved&&state){const p=mapPoint(e),x=(p.x-panX)/zoom,y=(p.y-panY)/zoom;const nearest=renderAnimals().map(a=>{const model=positions.get(a.id)??a,q=productExperience?(visualAnimalPositions.get(a.id)??projectFarm(model.x,model.y,a.patch,state.config.housing)):model;return {a,d:Math.hypot(q.x-x,q.y-y)};}).sort((a,b)=>a.d-b.d)[0];if(nearest&&nearest.d<(productExperience?18:15)){selected=nearest.a.id;activeSceneEntity=null;updateUI();if(productExperience)document.dispatchEvent(new CustomEvent('riose:agent-selected',{detail:{animal:nearest.a}}));}else if(productExperience){const entity=productFarmEntityAt(x,y);if(entity){activeSceneEntity=entity;document.dispatchEvent(new CustomEvent('riose:entity-selected',{detail:{entity,pastures:state.pastures,config:state.config}}));}}}drag=null;});
canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom+(e.deltaY<0?.15:-.15));},{passive:false});
canvas.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(zoom+.25);}if(e.key==='-'){e.preventDefault();setZoom(zoom-.25);}if(e.key==='ArrowLeft'){e.preventDefault();panX+=12;}if(e.key==='ArrowRight'){e.preventDefault();panX-=12;}if(e.key==='ArrowUp'){e.preventDefault();panY+=12;}if(e.key==='ArrowDown'){e.preventDefault();panY-=12;}limitPan();});
$('zoomin').onclick=()=>setZoom(productExperience&&productWorldRenderer?productWorldRenderer.getZoom()+.25:productExperience?productZoom+.25:zoom+.25);$('zoomout').onclick=()=>setZoom(productExperience&&productWorldRenderer?productWorldRenderer.getZoom()-.25:productExperience?productZoom-.25:zoom-.25);$('home').onclick=()=>{if(productExperience&&productWorldRenderer){productZoom=1;productWorldRenderer.resetCamera();return;}zoom=1;panX=0;panY=0;};
function listAnimals(){if(!state)return;const query=$                  ('search').value.toLocaleLowerCase();$('animals').innerHTML=state.animals.filter(a=>a.name.toLocaleLowerCase().includes(query)||String(a.id).includes(query)).map(a=>'<button class="animal-row '+(a.id===selected?'selected':'')+'" data-animal="'+a.id+'" aria-pressed="'+(a.id===selected)+'"><span class="animal-avatar">'+cowSvg+'</span><span><strong>'+a.name+'</strong><small>'+actionNames[a.action]+'</small></span><span class="animal-id">'+String(a.id).padStart(3,'0')+'</span></button>').join('');}
$('animals').onclick=e=>{const btn=(e.target               ).closest                   ('[data-animal]');if(btn){selected=Number(btn.dataset.animal);updateUI();}};
$('search').oninput=()=>listAnimals();
const reasonNames={rest_window:'horário de descanso (21:00–05:59)',thirst_threshold:'sede simulada acima de 65/100',pasture_housing:'alojamento configurado como pasto',barn_housing:'alojamento configurado como confinamento'};
function renderAnimalHistory(animal){const records=(animal.history??[]).slice(-6).reverse();$('animal-history').innerHTML=records.map(record=>{const hour=String(record.hour%24).padStart(2,'0');const day=String(Math.floor(record.hour/24)+1).padStart(2,'0');const observed=record.observed;if(productExperience)return '<article class="memory-record"><strong>Day '+day+' · '+hour+':00 — '+actionNames[record.action]+'</strong><span>Rule: '+(record.reason==='rest_window'?'rest schedule':record.reason==='thirst_threshold'?'simulated thirst threshold':record.reason==='barn_housing'?'confinement configured':'pasture configured')+'.</span><small>Model state: thirst '+number(observed.thirst,0)+'/100 · '+(observed.housing==='barn'?'confinement':'pasture')+'.</small></article>';return '<article class="memory-record"><strong>D'+day+' · '+hour+':00 — '+actionNames[record.action]+'</strong><span>Regra: '+(reasonNames[record.reason]??record.reason)+'.</span><small>Estado observado pelo motor: sede '+number(observed.thirst,0)+'/100 · alojamento '+(observed.housing==='barn'?'confinamento':'pasto')+'.</small></article>';}).join('')||(productExperience?'<p class="memory-empty">No recent state changes for this animal.</p>':'<p class="memory-empty">Sem transições registradas para este animal.</p>');}
function updateUI(){if(!state)return;const m=metrics(state),a=state.animals.find(a=>a.id===selected)??state.animals[0];$('clock').textContent=(productExperience?'Day ':'Dia ')+String(Math.floor(state.hour/24)+1).padStart(2,'0')+' · '+String(state.hour%24).padStart(2,'0')+':00';$('count').textContent=String(state.animals.length);$('weight').textContent=number(m.weight)+' kg';$('gain').textContent=(m.gain>=0?'+':'')+number(m.gain,2)+(productExperience?' kg/animal since start':' kg/animal desde o início');$('pasture').textContent=number(m.pasture,0);$('cost').textContent=currency(m.cost);$('animalname').innerHTML=a.name+' <span>#'+String(a.id).padStart(3,'0')+'</span>';$('animalweight').textContent=number(a.weight)+' kg';if(productExperience)document.querySelector('.map-location').textContent='HORIZONTE / '+state.animals.length+' ANIMALS';$('activity').textContent=actionNames[a.action];$('thought').textContent='“'+thoughts[a.action]+'”';renderAnimalHistory(a);if(productExperience){const energy=$('energy-meter'),thirst=$('thirst-meter');if(energy)energy.style.width=Math.max(0,Math.min(100,a.energy))+'%';if(thirst)thirst.style.width=Math.max(0,Math.min(100,a.thirst))+'%';}$                   ('diet').value=state.config.diet;$                   ('weather').value=state.config.weather;$                  ('supplement').value=String(state.config.supplement);$('supplementvalue').textContent=number(state.config.supplement)+(productExperience?' kg DM/day':' kg MS/dia');for(const [id,condition] of [['pasturebtn',state.config.housing==='pasture'],['barnbtn',state.config.housing==='barn']]                      ){$(id).classList.toggle('active',condition);$(id).setAttribute('aria-pressed',String(condition));}listAnimals();$('events').innerHTML=state.events.slice(0,20).map(event=>{let text=event.text;if(productExperience){text=text.replace('Fazenda iniciada. Os animais estão no pasto.','Farm initialized. Animals begin in pasture.').replace('no cocho.','at the feeder.').replace('Bebendo água.','drinking water.').replace('está pastando.','is grazing.').replace('está descansando.','is resting.');}return '<div class="event"><time>'+(productExperience?'Day ':'D')+String(Math.floor(event.hour/24)+1).padStart(2,'0')+' '+String(event.hour%24).padStart(2,'0')+':00</time><span>'+text+'</span></div>';}).join('');if(productExperience)document.dispatchEvent(new CustomEvent('riose:world-state',{detail:{hour:state.hour,animal:a,config:state.config,metrics:m,pastures:state.pastures}}));}
function renderScientificSensitivity(){const host=$('scientific-result'),sensitivity=analyzePastureDmiSensitivity({bodyWeightKg:Number($('science-weight').value),adgKgPerDay:Number($('science-adg').value),supplementKgDMPerDay:Number($('science-supplement').value)}),rows=sensitivity.effects.map(effect=>'<tr><th>'+effect.label+'</th><td>'+number(effect.testedInputRange[0],2)+'–'+number(effect.testedInputRange[1],2)+'</td><td>'+number(effect.deltaFromBaselineKgDMPerDay[0],2)+'–'+number(effect.deltaFromBaselineKgDMPerDay[1],2)+' kg MS/dia</td></tr>').join('');host.insertAdjacentHTML('beforeend','<h4>Sensibilidade local da equação</h4><table><thead><tr><th>Entrada variada isoladamente</th><th>Faixa testada</th><th>Variação de CMS vs. base</th></tr></thead><tbody>'+rows+'</tbody></table><small>Variações determinísticas (±10 kg de peso, ±0,1 kg/d de GMD informado, ±0,5 kg MS/d de suplemento), limitadas ao domínio de validação. Não são intervalos de previsão nem calibração empírica do Riose.</small>');}
function renderScientificPanel(){let panel=document.getElementById('scientific-active-panel');if(!scientificResult){panel?.remove();return;}if(!panel){panel=document.createElement('section');panel.id='scientific-active-panel';panel.className='scientific-active-panel';document.querySelector('.metrics').after(panel);}const final=scientificResult.final,perHead=final.totalDmiKgDM/scientificResult.animalCount;panel.innerHTML='<strong>BR-CORTE 2023 · Eq. 2.6 · cenário '+scientificResult.days+' dias</strong><div>CMS total condicional: '+number(perHead,2)+' kg MS/cabeça/dia no último dia · forragem retirada: '+number(final.forageConsumedKgDM,0)+' kg MS no lote/dia · estoque final: '+number(final.pastureKgDMByPaddock.reduce((sum,value)=>sum+value,0),0)+' kg MS.</div><small>GMD assumido: '+number(scientificResult.assumptions.assumedAdgKgPerDay,2)+' kg/dia; '+(final.forageShortfallKgDM>0?'há déficit de forragem no último dia. ':'sem déficit de forragem no último dia. ')+'Água por piquete: '+scientificResult.assumptions.waterAvailableByPaddock.map((available,index)=>String.fromCharCode(65+index)+': '+(available?'disponível':'indisponível')).join(' · ')+'.</small><a href="'+BR_CORTE_PASTURE_DMI.source+'" target="_blank" rel="noopener">Fonte e equação ↗</a>';$('map').setAttribute('aria-label','Mapa da fazenda com resultado científico BR-CORTE. '+scientificResult.animalCount+' animais, dia '+scientificResult.days+'.');document.querySelector('.map-location').textContent='BR-CORTE / '+scientificResult.animalCount+' NELORE';}
function configure(patch                ){if(!loadingScenario&&!scientificPreviewActive)requestState({type:'configure',patch});}
$                   ('diet').onchange=e=>configure({diet:(e.target                     ).value                  });
$                   ('weather').onchange=e=>configure({weather:(e.target                     ).value                     });
$                  ('supplement').oninput=e=>$('supplementvalue').textContent=number(Number((e.target                    ).value))+' kg MS/dia';
$                  ('supplement').onchange=e=>configure({supplement:Number((e.target                    ).value)});
$('pasturebtn').onclick=()=>configure({housing:'pasture'});$('barnbtn').onclick=()=>configure({housing:'barn'});
function setRunning(value        ){running=value;if(productExperience)$('play').dataset.running=String(value);else $('play').textContent=value?'Ⅱ':'▶';$('play').setAttribute('aria-label',productExperience?(value?'Pause simulation':'Continue simulation'):(value?'Pausar simulação':'Continuar simulação'));lastTick=performance.now();}
if(productExperience&&manifestoMotionPreference.matches)setRunning(false);manifestoMotionPreference.addEventListener?.('change',event=>{if(productExperience)setRunning(!event.matches);});$('play').onclick=()=>{if(scientificPreviewActive)return;setRunning(!running);};$('day').onclick=()=>{if(loadingScenario||scientificPreviewActive)return;setRunning(false);requestState({type:'tick',hours:24});};$('reset').onclick=()=>{if(loadingScenario)return;scientificPreviewActive=false;scientificResult=null;renderScientificPanel();$('play').disabled=false;$('day').disabled=false;document.querySelector('.map-location').textContent='HORIZONTE / 24 ANIMAIS';selected=1;positions.clear();requestState({type:'reset'});setRunning(false);};
document.addEventListener('riose:seek-day',(event)=>{if(!productExperience||!state||pending||loadingScenario||scientificPreviewActive)return;const targetHour=6+(Math.max(1,Math.min(30,Number(event.detail?.day)||1))-1)*24;const hours=targetHour-state.hour;if(hours>0){setRunning(false);requestState({type:'tick',hours});pending=true;}});
document.addEventListener('riose:timeline-horizon',()=>{if(productExperience)setRunning(false);});
$('scientific-open').onclick=()=>{$('scientific-result').replaceChildren();if(!$('science-paddock-inputs').children.length)$('science-paddock-inputs').innerHTML=Array.from({length:4},(_,i)=>'<label>Piquete '+String.fromCharCode(65+i)+'<input type="number" min="0" step="100" value="16000" data-science-stock="'+i+'"><span><input type="checkbox" checked data-science-water="'+i+'"> Água disponível</span></label>').join('');$('scientific-simulation').showModal();};
$('scientific-close').onclick=()=>$('scientific-simulation').close();
$('scientific-form').onsubmit=event=>{event.preventDefault();try{const stocks=Array.from(document.querySelectorAll('[data-science-stock]'),input=>Number(input.value));const water=Array.from(document.querySelectorAll('[data-science-water]'),input=>input.checked);scientificResult=simulateNelorePastureScenario({seed:2026,animalCount:100,initialWeightKg:Number($('science-weight').value),assumedAdgKgPerDay:Number($('science-adg').value),supplementKgDMPerAnimalPerDay:Number($('science-supplement').value),days:Number($('science-days').value),initialPastureKgDMByPaddock:stocks,waterAvailableByPaddock:water});scientificResult.assumptions.initialPastureKgDMByPaddock=stocks;scientificResult.assumptions.waterAvailableByPaddock=water;const final=scientificResult.final,totals=scientificResult.rows.slice(1).reduce((sum,row)=>({dmi:sum.dmi+row.totalDmiKgDM,supplement:sum.supplement+row.supplementKgDM,forage:sum.forage+row.forageConsumedKgDM}),{dmi:0,supplement:0,forage:0});const paddockCenters=[{x:84,y:89},{x:260,y:89},{x:84,y:229},{x:260,y:229}],withinPaddock={};const animals=scientificResult.animals.map(animal=>{const center=paddockCenters[animal.paddock],slot=withinPaddock[animal.paddock]??0;withinPaddock[animal.paddock]=slot+1;const x=center.x+((slot%7)-3)*11,y=center.y+(Math.floor(slot/7)-1.5)*11;return {id:animal.id,name:animal.name,weight:animal.weightKg,initialWeight:animal.initialWeightKg,energy:75,thirst:20,action:'grazing',patch:animal.paddock,x,y,targetX:x,targetY:y,history:[]};});const snapshot={hour:6+(scientificResult.days-1)*24,animals,pastures:[...final.pastureKgDMByPaddock],intake:{pastureKgDM:totals.forage,barnBaseKgDM:0,supplementKgDM:totals.supplement,dietExtraKgDM:0},config:{diet:'pasture',housing:'pasture',weather:'normal',supplement:Number($('science-supplement').value)},cost:0,events:[{hour:6+(scientificResult.days-1)*24,text:'Resultado final do cenário BR-CORTE 2023 · GMD assumido, sem previsão independente de ganho.'}],seed:scientificResult.seed,initialSeed:scientificResult.seed,locomotionSeed:scientificResult.seed};scientificPreviewActive=true;selected=1;positions.clear();setRunning(false);$('play').disabled=true;$('day').disabled=true;requestState({type:'load',snapshot});const perHead=final.totalDmiKgDM/100;$('scientific-result').innerHTML='<h3>Resultado do dia '+scientificResult.days+'</h3><p>Peso médio sob GMD assumido: <strong>'+number(final.meanWeightKg,1)+' kg</strong>. CMS total Eq. 2.6: <strong>'+number(perHead,2)+' kg MS/cabeça/dia</strong> no último dia. Forragem consumida no período: <strong>'+number(totals.forage,0)+' kg MS</strong>.</p><p>Consumo acumulado calculado: '+number(totals.dmi,0)+' kg MS total e '+number(totals.supplement,0)+' kg MS de suplemento. Déficit de forragem no último dia: '+number(final.forageShortfallKgDM,1)+' kg MS.</p><small>O peso é a trajetória do ADG informado. Resultados de 100 animais identificados; água e estoque inicial são entradas/configurações, sem modelo hídrico ou de recuperação do pasto.</small>';$('scientific-simulation').close();renderScientificPanel();}catch(error){$('scientific-result').textContent='Não foi possível executar: '+error.message;}};
$('scientific-form').addEventListener('submit',()=>queueMicrotask(()=>{try{if(scientificResult)renderScientificSensitivity();}catch{}}));
$('scenario-save').onclick=()=>{if(!state)return;const name=prompt('Nome do cenário:','Meu cenário');if(name===null)return;const cleanName=name.trim().slice(0,60);if(!cleanName){notify('Digite um nome para salvar o cenário.');return;}const previousActiveScenarioId=activeScenarioId;const id=globalThis.crypto?.randomUUID?.()??'scenario-'+Date.now()+'-'+Math.random().toString(36).slice(2);const scenario={id,name:cleanName,snapshot:currentLegacySnapshot(),selected};scenarios.push(scenario);activeScenarioId=scenario.id;if(!saveScenarioData()){scenarios.pop();activeScenarioId=previousActiveScenarioId;renderScenarios();return;}renderScenarios();notify('Cenário “'+cleanName+'” salvo.');};
$('scenario-select').onchange=e=>{if(loadingScenario||requestCompare)return;const nextId=e.target.value,previousActiveScenarioId=activeScenarioId;if(nextId&&!scenarios.some(item=>item.id===nextId))return;activeScenarioId=nextId||null;if(!saveScenarioData()){activeScenarioId=previousActiveScenarioId;renderScenarios();return;}if(!nextId){renderScenarios();return;}const scenario=scenarios.find(item=>item.id===nextId);selected=scenario.selected??1;setRunning(false);pending=false;positions.clear();renderScenarios();loadingScenario=true;compareBusy(requestCompare);requestState({type:'load',snapshot:scenario.snapshot});};
$('scenario-rename').onclick=()=>{const scenario=activeScenario();if(!scenario)return;const name=prompt('Novo nome do cenário:',scenario.name);if(name===null)return;const cleanName=name.trim().slice(0,60);if(!cleanName){notify('O nome do cenário não pode ficar vazio.');return;}const previousName=scenario.name;scenario.name=cleanName;if(!saveScenarioData()){scenario.name=previousName;renderScenarios();return;}renderScenarios();notify('Cenário renomeado.');};
$('scenario-delete').onclick=()=>{const scenario=activeScenario();if(!scenario)return;if(!confirm('Remover o cenário “'+scenario.name+'”?'))return;const previousScenarios=scenarios,previousActiveScenarioId=activeScenarioId;scenarios=scenarios.filter(item=>item.id!==scenario.id);activeScenarioId=null;if(!saveScenarioData()){scenarios=previousScenarios;activeScenarioId=previousActiveScenarioId;renderScenarios();return;}renderScenarios();notify('Cenário removido.');};
$                   ('speed').onchange=e=>speed=Number((e.target                     ).value);
$('method').onclick=()=>$                   ('methodology').showModal();document.querySelectorAll                   ('[data-close]').forEach(button=>button.onclick=()=>$                   (button.dataset.close ).close());
function localExplanation(input){const place=input.config.housing==='barn'?'confinamento':'pasto';return `O cenário está em ${place}, no dia ${Math.floor(input.hour/24)+1}, com peso médio estimado de ${number(input.metrics.weight)} kg e custo acumulado de ${currency(input.metrics.cost)}. Esses valores vêm das regras demonstrativas do motor; não são medições nem recomendações.`;}
$('explain').onclick=async()=>{if(!state)return;const button=$('explain'),input={hour:state.hour,config:{...state.config},metrics:metrics(state)};button.disabled=true;$('explanation').textContent=localExplanation(input);$('explanation-label').textContent='Explicação determinística · não medido';try{const response=await fetch('/api/explain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw new Error('explanation_unavailable');const result=await response.json();if(typeof result.text!=='string'||typeof result.label!=='string')throw new Error('invalid_explanation');$('explanation').textContent=result.text;$('explanation-label').textContent=result.label;}catch{$('explanation-label').textContent='Explicação determinística · não medido';}finally{button.disabled=false;}};
function beginCompare(){if(!state||requestCompare||loadingScenario)return;setRunning(false);const snapshot=currentLegacySnapshot(),manifest=createComparisonManifest(snapshot,30);pendingComparison={snapshot,manifest};compareBusy(true);worker.postMessage({type:'compare',days:30,snapshot});}
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
  $('comparison-coverage').innerHTML='<h3>Observações reais · nenhuma conectada</h3><p>Este resultado cobre somente o rebanho simulado do snapshot. Não há dados de fazenda, área/biomassa medida, fonte empírica ou população real aprovada. A proveniência de um snapshot de fazenda depende da issue #12; a população/caso, da #1; a calibração e validação independente, da #6. O ensaio publicado de bezerras tem um explorador separado e não está conectado a esta comparação; pertence a outra população.</p><h3>Cobertura da simulação</h3><p>'+(missing.length?missing.join(' '):'Campos finais e série diária disponíveis no resultado do motor; isso não indica cobertura empírica.')+' Ausência, valor inválido ou não finito aparece como “Indisponível”; zero finito é exibido como zero.</p>';
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
  $('comparison-assumptions').innerHTML='<h3>Hipóteses usadas · Sem calibração suficiente · demonstrativas e não validadas</h3><p>Única intervenção: alojamento. Mesmo snapshot, sementes, dieta, suplemento e clima. Não há calibração nem intervalo de confiança sustentado por dados.</p><ul>'+hypotheses.map(([label,value,unit])=>'<li>'+label+': '+comparisonNumber(value,2)+' '+unit+'.</li>').join('')+'</ul><p>No código atual, o alimento-base fornece a mesma demanda de matéria seca e recebe o mesmo fator de ganho nos dois alojamentos. Com estoque suficiente, mudar de alojamento não altera o ganho simulado; altera a fonte de alimento contabilizada, o custo e o estoque de pasto. Se o estoque limitar a demanda no pasto, os ganhos podem divergir. Isso descreve a regra do motor, não uma resposta biológica medida.</p><p>Outras regras fixas do motor: alimento-base no confinamento a 0,65 R$/kg MS; adicionais da dieta de 0 / 1,8 / 3,2 kg MS/animal/dia; suplemento × 1,2 e adicional × 1,35 no equivalente energético; piso de peso 200 kg/animal. Essas constantes são hipóteses, não preços pesquisados ou equações ajustadas. O estoque inicial vem do snapshot usado na comparação.</p><p>Diagnósticos públicos de ADG ajudam a auditar componentes do motor, mas não validam a simulação completa: <a href="/docs/evidence/engine-adg-usda-cper-ltgi-check.json" target="_blank" rel="noopener">holdout temporal CPER LTGI</a>, <a href="/docs/evidence/engine-adg-usda-cgrec-transport-check.json" target="_blank" rel="noopener">transporte externo CGREC</a> e <a href="/docs/evidence/engine-adg-zenodo-cows-check.json" target="_blank" rel="noopener">checagem sem ajuste nas vacas adultas do Zenodo</a>. Neste último conjunto, a discrepância média absoluta foi 1,208 kg/vaca/dia sob as condições padrão do motor; as datas individuais e entradas de manejo não estão alinhadas. Cobertura alta em um único ano não é calibração transferível.</p><p>Fonte das hipóteses e cálculos: <a href="/engine.js" target="_blank" rel="noopener">engine.js · ASSUMPTIONS / tick / compare</a>. Reprodução: <a href="/worker.js" target="_blank" rel="noopener">worker.js · replayComparison</a>. Diferenças: alternativa − base; percentual: diferença / base × 100, indefinido quando a base é zero.</p>';
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
  // Keep the non-calibrated status attached when CSV data leaves the UI context.
  headers.push('status_modelo','intervalo_probabilistico');
  return [headers.join(','),...comparisonRows(data).map(row=>{const base=comparisonConsumption(row,'baseline'),alternative=comparisonConsumption(row,'scenario');return [cell(row.day,0),...[row.baselineWeight,row.scenarioWeight,base,alternative,comparisonPerAnimal(base),comparisonPerAnimal(alternative),row.baselinePastureKgDM,row.scenarioPastureKgDM,row.baselineCost,row.scenarioCost].map(value=>cell(value)),...Array.from({length:4},(_,i)=>[initial[i],row.baselinePastureByPaddock?.[i],row.scenarioPastureByPaddock?.[i]].map(value=>cell(value,2))).flat(),'demonstrativo_nao_validado','nao_disponivel_sem_calibracao'].join(',');})].join('\n');
}
$('export').onclick=()=>{if(comparison&&!requestCompare&&!loadingScenario)downloadFile('agroville-comparacao-demonstrativa.csv',comparisonCSV(comparison),'text/csv;charset=utf-8');};

let noticeTimer                              ;function notify(message       ){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,5000);}
$('manifest-export').onclick=()=>{if(requestCompare||loadingScenario)return;if(!comparisonManifest){notify('Faça ou importe uma comparação antes de exportar o manifesto.');return;}downloadFile('agroville-manifesto-demonstrativo.json',JSON.stringify(comparisonManifest,null,2),'application/json;charset=utf-8');};
$('manifest-import').onclick=$('manifest-open').onclick=()=>{if(!requestCompare&&!loadingScenario)$('manifest-file').click();};
$('manifest-file').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file||requestCompare||loadingScenario)return;compareBusy(true);try{const manifest=JSON.parse(await file.text());validateComparisonManifest(manifest);setRunning(false);pendingComparison={snapshot:structuredClone(manifest.initialSnapshot),manifest};notify('Manifesto validado. Reproduzindo a comparação salva…');worker.postMessage({type:'replayComparison',manifest});}catch(error){pendingComparison=null;compareBusy(false);notify('Manifesto inválido: '+error.message);}};
function downloadFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
worker.onmessage=e=>{if(e.data.type==='state'){const request=stateRequests.shift(),separated=separateLegacySnapshot(e.data.state);state=separated.state;snapshotViewState=separated.viewState;viewState=createAnimalViewStateDTO(state.animals,snapshotViewState);pending=false;if(request==='load'){loadingScenario=false;compareBusy(requestCompare);}updateUI();}else if(e.data.type==='comparison'){showComparison(e.data.data);}else if(e.data.type==='error'){const request=stateRequests.shift();pending=false;if(request==='load')loadingScenario=false;pendingComparison=null;compareBusy(false);setRunning(false);notify('Erro no motor: '+e.data.message);}};
worker.onerror=()=>{pending=false;loadingScenario=false;pendingComparison=null;compareBusy(false);setRunning(false);notify('Não foi possível iniciar o motor. Abra o aplicativo por um servidor HTTP.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});
window.addEventListener('pagehide',saveScenarioData);
async function initializeProductWorldRenderer(){
  const host=canvas.parentElement;
  try{
    const {createProductWorldRenderer}=await import('./product-world-renderer.bundle.js');
    productWorldRenderer=await createProductWorldRenderer({host,scene:PRODUCT_BLOCKOUT,onAnimalSelect:animal=>{selected=animal.id;activeSceneEntity=null;updateUI();document.dispatchEvent(new CustomEvent('riose:agent-selected',{detail:{animal}}));},onEntitySelect:(entity,world)=>{activeSceneEntity=entity;hoverSceneEntity=null;document.dispatchEvent(new CustomEvent('riose:entity-selected',{detail:{entity,pastures:state?.pastures??world.pastures,config:state?.config??world.config}}));}});
    host.dataset.renderer='pixi';host.setAttribute('aria-busy','false');canvas.tabIndex=-1;
  }catch(error){host.dataset.renderer='canvas';host.setAttribute('aria-busy','false');console.warn('Pixi farm renderer unavailable; keeping the Canvas fallback.',error);}
}
renderScenarios();if(activeScenario()){selected=activeScenario().selected??1;loadingScenario=true;compareBusy(false);requestState({type:'load',snapshot:activeScenario().snapshot});}else requestState({type:'snapshot'});
requestAnimationFrame(draw);
if(productExperience)initializeProductWorldRenderer();
