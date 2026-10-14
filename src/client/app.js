import {metrics,createComparisonManifest,validateComparisonManifest,createConfiguredComparisonManifest,validateConfiguredComparisonManifest} from './engine.js';
import {SCENARIO_PRESETS,getScenarioPreset,createScenarioPresetSnapshot} from './scenario-presets.js';
import {renderSimulationReport} from './simulation-report.js';
import {createRunRecord,recordRun,listRuns,getRun,runCompatibility,getRunHistoryStats,exportRunHistory,clearRunHistory,MAX_RUNS,MAX_RUN_HISTORY_BYTES} from './run-history.js';
import {simulateNelorePastureScenario,analyzePastureDmiSensitivity,BR_CORTE_PASTURE_DMI} from '../../scientific/br_corte_pasture_dmi.js';
import {encodeScenarioSnapshot,decodeScenarioSnapshot} from './scenario-storage.js';
import {resolveLotSelection,formatLotArea,resolveDemoLot,isolateDemoLotSnapshot,createDemoLotContext,validateDemoLotContext,createDemoLotManifestEnvelope,validateDemoLotManifestEnvelope,DEMO_LOT_MODEL} from './lot-selection.js';
import {assessLotSimulationReadiness} from './lot-simulation-readiness.js';
import {validateFarmSnapshot} from './snapshot-validator.js';
import {calculateLotMetrics,findPaddockField} from './lot-metrics.js';
import {calculateThi,THI_SOURCE} from './thermal-index.js';
import {initialEnvironmentState,updateEnvironmentInput,environmentDiffRows} from './environment-inputs.js';
import {normalizeWorkerResponse,WORKER_PROTOCOL_VERSION} from './worker-protocol.js';
import {combineLegacySnapshot,createAnimalViewStateDTO,separateLegacySnapshot} from './animal-view-state.js';

const $=                                   (id       )=>document.getElementById(id)     ;
if(new URLSearchParams(location.search).has('scenePreview'))document.body.classList.add('scene-preview');
const wasmSelected=/(?:^|[?&])engine=wasm(?:&|$)/.test(location.search);
const workerUrl=new URL('./worker.js',import.meta.url);
if(wasmSelected)workerUrl.searchParams.set('engine','wasm');
const worker=new Worker(workerUrl,{type:'module'});
let state,viewState,snapshotViewState,selected=1,running=true,speed=1,pending=false,lastTick=0,comparison,requestCompare=false,comparisonSnapshot,comparisonManifest,comparisonLotContext=null,comparisonEnvironmentState=null,pendingComparison,loadingScenario=false,scientificResult=null,scientificPreviewActive=false,pendingSnapshotAction=null;
const stateRequests=[];
function postWorkerMessage(message){worker.postMessage({...message,protocolVersion:WORKER_PROTOCOL_VERSION});}
function requestState(message){stateRequests.push(message.type);postWorkerMessage(message);}
function compareBusy(value){requestCompare=value;for(const id of ['compare','experiment','manifest-import','manifest-open','manifest-export','export','report-export','comparison-factor','comparison-reference','comparison-scenario','lot-demo-intervention'])if($(id))$(id).disabled=value||loadingScenario;const lotCompare=$('lot-compare');if(lotCompare)lotCompare.disabled=true;$('demo-lot-compare').disabled=value||loadingScenario||!state||!selectedPaddockDomainZone;$('run-history-replay').disabled=value||loadingScenario||!$('run-history-select').value;$('scenario-select').disabled=value||loadingScenario;$('preset-select').disabled=value||loadingScenario;$('preset-run').disabled=value||loadingScenario||getScenarioPreset($('preset-select').value).status==='unsupported';$('compare').textContent=loadingScenario?'Carregando cenário…':value?'Calculando…':'Comparar 30 dias ↗';if(!value){updateComparisonRunButton();renderLotSelection();}}
const currency=(n       )=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const number=(n       ,digits=1)=>n.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const actionNames={grazing:'Pastando',feeding:'No cocho',drinking:'Bebendo água',resting:'Descansando'};
const thoughts={grazing:'Hora de procurar um pouco de pasto.',feeding:'O cocho está cheio. Vou comer por aqui.',drinking:'Estou com sede. Hora de beber água.',resting:'Vou descansar um pouco antes de voltar.'};
const dietNames={pasture:'Volumoso / pasto',balanced:'Balanceada',concentrate:'Mais concentrado'};
const scenarioNames={pasture:'Pasto',balanced:'Balanceada',concentrate:'Concentrado',normal:'Ameno',hot:'Calor',rain:'Chuvoso',barn:'Confinamento'};
const scenarioStorageKey='agroville-scenarios-v1',scenarioActiveKey='agroville-active-scenario-v1';
let scenarios=[],activeScenarioId=null,storageWarningShown=false;
function scenarioSummary(snapshot){return {hour:snapshot.hour,config:{...snapshot.config},eventCount:snapshot.events?.length??0};}
const farmSnapshotStorageKey='agroville-farm-snapshot-v1',farmSelectionStorageKey='agroville-farm-selection-v1';
let farmSnapshot=null,selectedPaddockDomainZone=null,selectedLotId=null,selectedDemoLotId=null,environmentState=null;
try{const saved=localStorage.getItem(farmSnapshotStorageKey);if(saved)farmSnapshot=JSON.parse(saved);}catch{}
try{environmentState=initialEnvironmentState(farmSnapshot,JSON.parse(localStorage.getItem('agroville-environment-scenario-v1')??'null'));}catch{environmentState=initialEnvironmentState(farmSnapshot);}
try{const saved=JSON.parse(localStorage.getItem(farmSelectionStorageKey)??'null');selectedPaddockDomainZone=saved?.domainZoneId??null;selectedLotId=saved?.lotId??null;selectedDemoLotId=saved?.demoLotId??(selectedPaddockDomainZone?`demo-paddock-${Number(selectedPaddockDomainZone.replace('paddock-',''))}`:null);}catch{}
try{const saved=JSON.parse(localStorage.getItem(scenarioStorageKey)??'[]');if(Array.isArray(saved))scenarios=saved.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&(item.snapshotData||item.snapshot?.animals&&item.snapshot?.config)).map(item=>item.summary?item:{...item,summary:scenarioSummary(item.snapshot)});else if(saved?.type==='agroville-scenarios-gzip-v1'&&Array.isArray(saved.scenarios))scenarios=saved.scenarios.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&item.snapshotData&&item.summary?.config);}catch{}
try{activeScenarioId=localStorage.getItem(scenarioActiveKey);}catch{}
if(!scenarios.some(item=>item.id===activeScenarioId))activeScenarioId=null;
function activeScenario(){return scenarios.find(item=>item.id===activeScenarioId);}
function saveScenarioData(){try{const stored={type:'agroville-scenarios-gzip-v1',scenarios:scenarios.map(({id,name,selected,summary,snapshotData,snapshot,selectedPaddockDomainZone,selectedLotId,selectedDemoLotId,environmentState})=>({id,name,selected,summary,snapshotData,selectedPaddockDomainZone,selectedLotId,selectedDemoLotId,environmentState,...(snapshotData?{}:snapshot?{snapshot}:{})}))};localStorage.setItem(scenarioStorageKey,JSON.stringify(stored));localStorage.setItem(scenarioActiveKey,activeScenarioId??'');return true;}catch{if(!storageWarningShown){notify('O navegador não conseguiu guardar os cenários. Remova cenários antigos ou libere espaço.');storageWarningShown=true;}return false;}}
function persistEnvironmentState(){try{localStorage.setItem('agroville-environment-scenario-v1',JSON.stringify(environmentState));const scenario=activeScenario();if(scenario){scenario.environmentState=structuredClone(environmentState);saveScenarioData();}}catch{}}
function persistFarmSelection(){try{localStorage.setItem(farmSelectionStorageKey,JSON.stringify({domainZoneId:selectedPaddockDomainZone,lotId:selectedLotId,demoLotId:selectedDemoLotId}));const scenario=activeScenario();if(scenario){scenario.selectedPaddockDomainZone=selectedPaddockDomainZone;scenario.selectedLotId=selectedLotId;scenario.selectedDemoLotId=selectedDemoLotId;saveScenarioData();}}catch{}}
function renderScenarios(){const select=$('scenario-select'),active=activeScenario();select.replaceChildren(new Option('Fazenda atual · não salva',''));for(const scenario of scenarios){const {config,hour}=scenario.summary;select.add(new Option(scenario.name+' · D'+(Math.floor(hour/24)+1)+' · '+scenarioNames[config.housing]+' · '+scenarioNames[config.diet],scenario.id));}select.value=activeScenarioId??'';$('scenario-rename').disabled=!active;$('scenario-delete').disabled=!active;$('event-scope').textContent=active?active.name.toLocaleUpperCase('pt-BR'):'AO VIVO';if(active){const {config:c,hour,eventCount}=active.summary;$('scenario-status').textContent='D'+String(Math.floor(hour/24)+1).padStart(2,'0')+' · '+scenarioNames[c.housing]+' · dieta '+scenarioNames[c.diet]+' · '+number(c.supplement)+' kg MS/animal/dia · '+scenarioNames[c.weather]+' · '+eventCount+' eventos';}else $('scenario-status').textContent='Cenário atual ainda não salvo.';}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function renderEnvironmentInputs(){
  const temperature=$('environment-temperature'),humidity=$('environment-humidity');
  if(!temperature||!humidity)return;
  if(!environmentState)environmentState=initialEnvironmentState(farmSnapshot);
  temperature.value=environmentState.current.temperatureC??'';humidity.value=environmentState.current.relativeHumidityPct??'';
  const sourceText=key=>{const original=environmentState.baseline[key],current=environmentState.currentSource[key];if(current==='reported'&&String(original?.value??'')!==String(environmentState.current[key]))return 'Informado neste cenário · valor original: '+(original?.value==null?'não informado':original.value);if(original?.status==='invalid-unit')return 'Unidade do snapshot incompatível';if(original?.status==='invalid-value')return 'Valor inválido no snapshot';if(original?.value==null)return 'Não informado no snapshot';return (original.status==='observed'?'Observado':original.status==='derived'?'Derivado':original.status==='hypothesis'?'Hipótese':'Informado')+' · '+(original.source??'origem não registrada');};
  $('temperature-source').textContent=sourceText('temperatureC');$('humidity-source').textContent=sourceText('relativeHumidityPct');
  const thi=calculateThi(environmentState.current.temperatureC,environmentState.current.relativeHumidityPct);
  $('environment-thi').textContent=thi.available?'THI '+number(thi.value,1)+' · índice sem unidade':'THI indisponível · '+thi.reason;
}
function renderLotSelection(){
  const host=$('lot-selection-details'),status=$('lot-selection-status'),compareButton=$('lot-compare');
  if(!host||!status||!compareButton)return;
  host.replaceChildren?.();host.innerHTML='';compareButton.disabled=true;
  const demoStatus=$('demo-lot-status'),demoButton=$('demo-lot-compare');
  const demoPatch=selectedPaddockDomainZone?Number(selectedPaddockDomainZone.replace('paddock-',''))-1:-1;
  const resolvedDemoLot=state?resolveDemoLot(currentLegacySnapshot(),demoPatch):null;
  const demoLot=resolvedDemoLot?.lotId===selectedDemoLotId?resolvedDemoLot:null;
  if(demoStatus)demoStatus.textContent=!selectedPaddockDomainZone
    ?'Selecione um piquete no mapa para carregar o lote da fazenda demonstrativa.'
    :demoLot?`${demoLot.lotId} · ${demoLot.animalIds.length} animal(is) simulados · ${DEMO_LOT_MODEL.id} v${DEMO_LOT_MODEL.version} · não validado`
      :'O piquete selecionado não tem animais no snapshot demonstrativo atual.';
  if(demoButton)demoButton.disabled=!demoLot||requestCompare||loadingScenario;
  if(!farmSnapshot){status.textContent='Conecte um snapshot para consultar dados observados. Eles não são necessários para o lote demonstrativo.';return;}
  if(!selectedPaddockDomainZone){status.textContent='Snapshot observado conectado · selecione um piquete no mapa.';return;}
  const selection=resolveLotSelection(farmSnapshot,selectedPaddockDomainZone);
  if(!selection){status.textContent='Este piquete ainda não tem vínculo espacial com um piquete do snapshot.';return;}
  const lots=selection.lots;status.textContent=selection.paddock.name?.value?`${selection.paddock.name.value} · ${lots.length} lote(s) vinculado(s)`:`Piquete ${selection.paddock.id} · ${lots.length} lote(s) vinculado(s)`;
  if(!lots.length){host.innerHTML='<p class="lot-empty">Nenhum lote deste snapshot está ligado a este piquete.</p>';return;}
  if(!lots.some(item=>item.lot.id===selectedLotId))selectedLotId=lots[0].lot.id;
  const picked=lots.find(item=>item.lot.id===selectedLotId);
  const readiness=assessLotSimulationReadiness(farmSnapshot,picked.lot);
  compareButton.disabled=true;
  compareButton.textContent=readiness.status==='eligible'?'Comparar este lote ↗':'Comparação do lote bloqueada';
  const area=formatLotArea(picked.area),trough=findPaddockField(picked.fields,selection.paddock.id,['trough_length_m','trough_length','feed_trough_length_m']),lotMetrics=calculateLotMetrics({animalCount:picked.lot.animalIds.length,area:picked.area,troughLength:trough}),metricText=value=>value.available?number(value.value,2)+' '+value.unit:'Indisponível',metricReason=value=>value.available?'Calculado com campos conhecidos':value.reason,choices=lots.length>1?'<label class="lot-choice-label">Lote<select id="lot-choice">'+lots.map(item=>'<option value="'+escapeHtml(item.lot.id)+'" '+(item.lot.id===picked.lot.id?'selected':'')+'>'+escapeHtml(item.lot.id)+' · '+item.lot.animalIds.length+' animais</option>').join('')+'</select></label>':'';
  const fields=picked.fields.length?picked.fields.map(field=>'<li><span>'+escapeHtml(field.path.split('.').slice(-1)[0].replaceAll('_',' '))+'</span><strong>'+escapeHtml(field.status==='missing'||field.value==null?'Ausente':String(field.value)+' '+(field.unit??''))+' · '+escapeHtml(field.status)+'</strong></li>').join(''):'<li><span>Campos disponíveis</span><strong>Nenhum registro associado</strong></li>';
  const entityIds=picked.lot.animalIds.slice(0,12).map(id=>'<li>'+escapeHtml(id)+'</li>').join('')+(picked.lot.animalIds.length>12?'<li>+'+(picked.lot.animalIds.length-12)+' IDs preservados no snapshot</li>':'');
  host.innerHTML=choices+'<div class="lot-facts"><div><span>ANIMAIS</span><strong>'+picked.lot.animalIds.length+'</strong><small>entidades reais · '+escapeHtml(picked.lot.id)+'</small></div><div><span>ÁREA</span><strong>'+escapeHtml(area.value)+'</strong><small>'+escapeHtml(area.detail)+'</small></div><div><span>CAMPOS</span><strong>'+picked.fields.length+'</strong><small>provenientes do snapshot</small></div></div><div class="lot-derived-metrics"><div><span>DENSIDADE</span><strong>'+metricText(lotMetrics.animalsPerHectare)+'</strong><small>'+escapeHtml(lotMetrics.animalsPerHectare.available?'animais ÷ área em hectares':metricReason(lotMetrics.animalsPerHectare))+'</small></div><div><span>ÁREA / ANIMAL</span><strong>'+metricText(lotMetrics.areaPerAnimalM2)+'</strong><small>'+escapeHtml(lotMetrics.areaPerAnimalM2.available?'área convertida para m² ÷ animais':metricReason(lotMetrics.areaPerAnimalM2))+' · '+metricText(lotMetrics.areaPerAnimalHa)+'</small></div><div><span>COCHO / ANIMAL</span><strong>'+metricText(lotMetrics.troughMetersPerAnimal)+'</strong><small>'+escapeHtml(lotMetrics.troughMetersPerAnimal.available?'comprimento de cocho ÷ animais do lote':metricReason(lotMetrics.troughMetersPerAnimal))+' · '+metricText(lotMetrics.troughCentimetersPerAnimal)+'</small></div></div><p class="lot-readiness" role="status"><strong>Comparação executável indisponível.</strong> '+readiness.blockers.map(blocker=>escapeHtml(blocker.message)).join(' ')+'</p><details class="lot-fields"><summary>Campos disponíveis</summary><ul>'+fields+'</ul></details><details class="lot-fields"><summary>Animais do lote · '+picked.lot.animalIds.length+' IDs</summary><ul>'+entityIds+'</ul></details><small class="lot-entity-note">IDs de entidades preservados no snapshot; a miniatura da fazenda não cria nem remove animais.</small>';
  const choice=$('lot-choice');if(choice)choice.onchange=event=>{selectedLotId=event.target.value;persistFarmSelection();renderLotSelection();};
}
function selectPaddock(index){selectedPaddockDomainZone='paddock-'+(index+1);selectedDemoLotId=`demo-paddock-${index+1}`;const selection=resolveLotSelection(farmSnapshot,selectedPaddockDomainZone);selectedLotId=selection?.lots.some(item=>item.lot.id===selectedLotId)?selectedLotId:selection?.lots[0]?.lot.id??null;persistFarmSelection();renderLotSelection();}
function connectFarmSnapshot(snapshot){const required=['schemaVersion','snapshotId','snapshotKind','createdDate','caseDefinition','sourceCatalog','farm','population','lots','animals','paddocks','operations','history','observations','simulationEligibility','manifestReference'],missing=required.filter(key=>!Object.hasOwn(snapshot??{},key));if(missing.length)throw new Error('Campos obrigatórios ausentes: '+missing.join(', ')+'.');if(snapshot.schemaVersion!=='0.1.0'||!Array.isArray(snapshot.lots)||!Array.isArray(snapshot.animals)||!Array.isArray(snapshot.paddocks)||!Array.isArray(snapshot.observations))throw new Error('O arquivo não segue o contrato de snapshot da fazenda v0.1.0.');const validation=validateFarmSnapshot(snapshot);if(!validation.semanticValid)throw new Error(validation.errors?.slice(0,2).join(' ')||'Snapshot semanticamente inválido.');farmSnapshot=snapshot;environmentState=initialEnvironmentState(snapshot);persistEnvironmentState();renderEnvironmentInputs();try{localStorage.setItem(farmSnapshotStorageKey,JSON.stringify(snapshot));}catch{notify('Snapshot conectado nesta sessão; o navegador não conseguiu persistir o arquivo.');}selectedPaddockDomainZone=null;selectedLotId=null;selectedDemoLotId=null;persistFarmSelection();renderLotSelection();notify('Snapshot '+snapshot.snapshotId+' conectado. Selecione um piquete para localizar lotes vinculados.');}
const cowSvg='<svg viewBox="0 0 18 14" aria-hidden="true"><path fill="#45613e" d="M3 3h10v7H3zM12 2h4v6h-4zM3 9h2v4H3zM10 9h2v4h-2zM1 4h2v4H1z"/><path fill="#edf1e1" d="M4 3h5v3H4zM8 7h5v3H8zM13 2h2v3h-2z"/><path fill="#293b23" d="M15 4h1v1h-1z"/></svg>';
const canvas=$                   ('map'),ctx=canvas.getContext('2d') ;
ctx.imageSmoothingEnabled=true;
const terrain=document.createElement('canvas');terrain.width=576;terrain.height=336;const t=terrain.getContext('2d') ;
const animalSprites=new Map();
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
if(worldScenarioSelect)worldScenarioSelect.addEventListener('change',()=>{worldScenarioId=worldScenarioSelect.value;const scenario=worldScenarioData?.scenarios.find(item=>item.id===worldScenarioId);if(scenario&&$('world-title'))$('world-title').textContent=scenario.name;terrainVisualKey='';buildTerrain(state?.initialSeed??state?.seed??9);});
fetch('/assets/scenarios.json').then(response=>{if(!response.ok)throw new Error('scenarios');return response.json();}).then(data=>{worldScenarioData=data;if(worldScenarioSelect){worldScenarioSelect.replaceChildren(...data.scenarios.map(scenario=>new Option(scenario.name,scenario.id)));worldScenarioSelect.value=worldScenarioId;}const scenario=data.scenarios.find(item=>item.id===worldScenarioId);if(scenario&&$('world-title'))$('world-title').textContent=scenario.name;terrainVisualKey='';buildTerrain(state?.initialSeed??state?.seed??9);}).catch(()=>{});
let zoom=1,panX=0,panY=0,drag                                                           =null;
const positions=new Map                            ();
let animalDrawOrder=[],animalDrawOrderDirty=true;
let lastMapDraw=-Infinity;
function drawCow(a       ,x       ,y       ,time       ){
  const sel=a.id===selected;const resting=a.action==='resting';const dx=resting?0:Math.sin(time*.003+a.id)*.5;
  x=Math.round(x);y=Math.round(y+dx);
  drawAssetOn(ctx,a.id%4===0?'cow-beef':'cow-dairy',x,y+4,29,27,'bottom');
  if(sel){ctx.strokeStyle='#f4e4a1';ctx.lineWidth=1;ctx.strokeRect(x-17,y-22,34,28);ctx.fillStyle='#f5f3dd';ctx.fillRect(x-18,y-33,39,9);ctx.fillStyle='#3d5635';ctx.font='6px monospace';ctx.fillText(a.name,x-15,y-27);}
}
function draw(time       ){
  if(state?.animals.length>=1000&&time-lastMapDraw<1000/30){requestAnimationFrame(draw);return;}
  lastMapDraw=time;
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#6b905b';ctx.fillRect(0,0,576,336);ctx.save();ctx.translate(panX,panY);ctx.scale(zoom,zoom);ctx.drawImage(terrain,0,0);
  if(state){
    for(let i=0;i<4;i++){const x=i%2===0?28:195,y=i<2?38:178;const fraction=state.pastures[i]/(scientificResult?Math.max(1,scientificResult.assumptions.initialPastureKgDMByPaddock[i]):2400);rect(ctx,x+8,y+23,30,2,'#5c7748');rect(ctx,x+8,y+23,Math.round(30*fraction),2,'#dde6a0');}
    if(animalDrawOrderDirty){animalDrawOrder=(viewState?.animals??[]).slice().sort((a,b)=>a.y-b.y);animalDrawOrderDirty=false;}
    const margin=22,left=-panX/zoom-margin,right=(576-panX)/zoom+margin,top=-panY/zoom-margin,bottom=(336-panY)/zoom+margin;
    for(const a of animalDrawOrder){if(a.x<left||a.x>right||a.y<top||a.y>bottom)continue;let pos=positions.get(a.id);if(!pos||Math.hypot(pos.x-a.x,pos.y-a.y)>180){pos={x:a.x,y:a.y};positions.set(a.id,pos);}pos.x+=(a.x-pos.x)*.07;pos.y+=(a.y-pos.y)*.07;drawCow(a,pos.x,pos.y,time);}
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
canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved&&state){const p=mapPoint(e),x=(p.x-panX)/zoom,y=(p.y-panY)/zoom,margin=22,left=-panX/zoom-margin,right=(576-panX)/zoom+margin,top=-panY/zoom-margin,bottom=(336-panY)/zoom+margin;const nearest=(viewState?.animals??[]).filter(a=>a.x>=left&&a.x<=right&&a.y>=top&&a.y<=bottom).map(a=>({a,d:Math.hypot((positions.get(a.id)?.x??a.x)-x,(positions.get(a.id)?.y??a.y)-y)})).sort((a,b)=>a.d-b.d)[0];if(nearest&&nearest.d<15){selected=nearest.a.id;updateUI();requestState({type:'select',animalId:selected});}else{const paddockIndex=patches.findIndex(patch=>x>=patch.x&&x<=patch.x+patch.w&&y>=patch.y&&y<=patch.y+patch.h);if(paddockIndex>=0)selectPaddock(paddockIndex);}}drag=null;});
canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom+(e.deltaY<0?.15:-.15));},{passive:false});
canvas.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(zoom+.25);}if(e.key==='-'){e.preventDefault();setZoom(zoom-.25);}if(e.key==='ArrowLeft'){e.preventDefault();panX+=12;}if(e.key==='ArrowRight'){e.preventDefault();panX-=12;}if(e.key==='ArrowUp'){e.preventDefault();panY+=12;}if(e.key==='ArrowDown'){e.preventDefault();panY-=12;}limitPan();});
$('zoomin').onclick=()=>setZoom(zoom+.25);$('zoomout').onclick=()=>setZoom(zoom-.25);$('home').onclick=()=>{zoom=1;panX=0;panY=0;};
renderLotSelection();renderEnvironmentInputs();
$('environment-temperature')?.addEventListener('change',event=>{try{environmentState=updateEnvironmentInput(environmentState,'temperatureC',event.target.value);persistEnvironmentState();renderEnvironmentInputs();}catch(error){notify(error.message);renderEnvironmentInputs();}});
$('environment-humidity')?.addEventListener('change',event=>{try{environmentState=updateEnvironmentInput(environmentState,'relativeHumidityPct',event.target.value);persistEnvironmentState();renderEnvironmentInputs();}catch(error){notify(error.message);renderEnvironmentInputs();}});
$('snapshot-connect-file')?.addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{connectFarmSnapshot(JSON.parse(await file.text()));}catch(error){notify('Snapshot não conectado: '+error.message);}});
$('lot-compare')?.addEventListener('click',()=>beginCompare());
$('demo-lot-compare')?.addEventListener('click',()=>beginDemoLotCompare());
$('lot-demo-intervention')?.addEventListener('change',()=>renderLotSelection());
$('lot-selection-details')?.addEventListener('click',event=>{const button=event.target.closest?.('[data-lot-id]');if(button){selectedLotId=button.dataset.lotId;persistFarmSelection();renderLotSelection();}});
const animalRowHeight=48,animalListOverscan=3;
function listAnimals(){if(!state)return;const list=$('animals'),query=$('search').value.toLocaleLowerCase(),animals=query?state.animals.filter(a=>a.name.toLocaleLowerCase().includes(query)||String(a.id).includes(query)):state.animals,first=Math.min(animals.length,Math.max(0,Math.floor(list.scrollTop/animalRowHeight)-animalListOverscan)),last=Math.min(animals.length,Math.ceil((list.scrollTop+(list.clientHeight||400))/animalRowHeight)+animalListOverscan),rows=animals.slice(first,last).map((a,index)=>'<button class="animal-row '+(a.id===selected?'selected':'')+'" data-animal="'+a.id+'" aria-pressed="'+(a.id===selected)+'" aria-setsize="'+animals.length+'" aria-posinset="'+(first+index+1)+'"><span class="animal-avatar">'+cowSvg+'</span><span><strong>'+a.name+'</strong><small>'+actionNames[a.action]+'</small></span><span class="animal-id">'+String(a.id).padStart(3,'0')+'</span></button>').join('');list.innerHTML='<div aria-hidden="true" style="height:'+(first*animalRowHeight)+'px;flex:none"></div>'+rows+'<div aria-hidden="true" style="height:'+((animals.length-last)*animalRowHeight)+'px;flex:none"></div>';}
$('animals').onclick=e=>{const btn=(e.target               ).closest                   ('[data-animal]');if(btn){selected=Number(btn.dataset.animal);updateUI();requestState({type:'select',animalId:selected});}};
$('search').oninput=()=>{$('animals').scrollTop=0;listAnimals();};$('animals').onscroll=()=>listAnimals();
const reasonNames={rest_window:'horário de descanso (21:00–05:59)',thirst_threshold:'sede simulada acima de 65/100',pasture_housing:'alojamento configurado como pasto',barn_housing:'alojamento configurado como confinamento'};
function renderAnimalHistory(animal){const records=(animal.history??[]).slice(-6).reverse();$('animal-history').innerHTML=records.map(record=>{const hour=String(record.hour%24).padStart(2,'0');const day=String(Math.floor(record.hour/24)+1).padStart(2,'0');const observed=record.observed;return '<article class="memory-record"><strong>D'+day+' · '+hour+':00 — '+actionNames[record.action]+'</strong><span>Regra: '+(reasonNames[record.reason]??record.reason)+'.</span><small>Estado observado pelo motor: sede '+number(observed.thirst,0)+'/100 · alojamento '+(observed.housing==='barn'?'confinamento':'pasto')+'.</small></article>';}).join('')||'<p class="memory-empty">Sem transições registradas para este animal.</p>';}
function applyWorkerView(view){if(!state||state.animals.length!==view.viewLayout.animalCount){requestState({type:'snapshot'});return;}const animalsById=new Map(state.animals.map(animal=>[animal.id,animal]));if(view.animalIds.some(id=>!animalsById.has(id))||animalsById.size!==view.animalIds.length){requestState({type:'snapshot'});return;}state.hour=view.hour;state.pastures=view.pastures;state.cost=view.cost;state.intake=view.intake;state.config=view.config;state.events=view.events;const actions=['grazing','feeding','drinking','resting'];viewState={animals:Array.from(view.animalIds,(id,index)=>{const animal=animalsById.get(id),offset=index*4;animal.weight=view.animalValues[offset+2];animal.initialWeight=view.animalValues[offset+3];animal.action=actions[view.animalActions[index]];return {id,name:animal.name,action:animal.action,x:view.animalValues[offset],y:view.animalValues[offset+1]};})};if(view.selectedAnimalId===selected){const animal=animalsById.get(selected);if(animal)animal.history=view.selectedHistory;}animalDrawOrderDirty=true;}
function currentLegacySnapshot(){return combineLegacySnapshot(state,snapshotViewState);}
async function saveScenarioSnapshot(name){const previousActiveScenarioId=activeScenarioId,id=globalThis.crypto?.randomUUID?.()??'scenario-'+Date.now()+'-'+Math.random().toString(36).slice(2);try{const snapshot=currentLegacySnapshot(),scenario={id,name,selected,summary:scenarioSummary(snapshot),snapshotData:await encodeScenarioSnapshot(snapshot),selectedPaddockDomainZone,selectedLotId,selectedDemoLotId,environmentState:structuredClone(environmentState)};scenarios.push(scenario);activeScenarioId=id;if(!saveScenarioData()){scenarios.pop();activeScenarioId=previousActiveScenarioId;renderScenarios();return;}renderScenarios();notify('Cenário “'+name+'” salvo.');}catch{activeScenarioId=previousActiveScenarioId;notify('Não foi possível compactar e guardar o cenário neste navegador.');}}
function completeSnapshotAction(){const action=pendingSnapshotAction;pendingSnapshotAction=null;if(!action)return;if(action.type==='save')saveScenarioSnapshot(action.name);else if(action.type==='compare'||action.type==='compare-lot'){try{const fullSnapshot=currentLegacySnapshot();let snapshot,selection,manifest,lotContext;if(action.type==='compare'){snapshot=fullSnapshot;selection=selectedConfiguredComparison(snapshot);}else{const patchIndex=Number(selectedPaddockDomainZone?.replace('paddock-',''))-1,demoLot=resolveDemoLot(fullSnapshot,patchIndex);if(!demoLot||demoLot.lotId!==selectedDemoLotId)throw new Error('Selecione um piquete com animais no cenário demonstrativo.');snapshot=isolateDemoLotSnapshot(fullSnapshot,demoLot);selection=selectedLotIntervention(snapshot,action.factor);lotContext=createDemoLotContext(demoLot,selection.factor,selection.referenceConfig,selection.scenarioConfig);validateDemoLotContext(lotContext,snapshot,selection.factor,selection.referenceConfig,selection.scenarioConfig);}$('demo-lot-compare').disabled=true;manifest=createConfiguredComparisonManifest(snapshot,selection);pendingComparison={snapshot,manifest,selection,lotContext,environmentState:structuredClone(environmentState)};postWorkerMessage({type:'compareConfigured',snapshot,days:selection.days,referenceConfig:selection.referenceConfig,scenarioConfig:selection.scenarioConfig});}catch(error){compareBusy(false);notify('Não foi possível preparar a comparação: '+error.message);}}}
function updateUI(){if(!state)return;const m=metrics(state),a=state.animals.find(a=>a.id===selected)??state.animals[0];$('clock').textContent='Dia '+String(Math.floor(state.hour/24)+1).padStart(2,'0')+' · '+String(state.hour%24).padStart(2,'0')+':00';$('count').textContent=String(state.animals.length);$('weight').textContent=number(m.weight)+' kg';$('gain').textContent=(m.gain>=0?'+':'')+number(m.gain,2)+' kg/animal desde o início';$('pasture').textContent=number(m.pasture,0);$('cost').textContent=currency(m.cost);$('animalname').innerHTML=a.name+' <span>#'+String(a.id).padStart(3,'0')+'</span>';$('animalweight').textContent=number(a.weight)+' kg';$('activity').textContent=actionNames[a.action];$('thought').textContent='“'+thoughts[a.action]+'”';renderAnimalHistory(a);$                   ('diet').value=state.config.diet;$                   ('weather').value=state.config.weather;$                  ('supplement').value=String(state.config.supplement);$('supplementvalue').textContent=number(state.config.supplement)+' kg MS/dia';for(const [id,condition] of [['pasturebtn',state.config.housing==='pasture'],['barnbtn',state.config.housing==='barn']]                      ){$(id).classList.toggle('active',condition);$(id).setAttribute('aria-pressed',String(condition));}listAnimals();$('events').innerHTML=state.events.slice(0,20).map(event=>'<div class="event"><time>D'+String(Math.floor(event.hour/24)+1).padStart(2,'0')+' '+String(event.hour%24).padStart(2,'0')+':00</time><span>'+event.text+'</span></div>').join('');renderConfiguredComparisonControls(state.config);}
function renderScientificSensitivity(){const host=$('scientific-result'),sensitivity=analyzePastureDmiSensitivity({bodyWeightKg:Number($('science-weight').value),adgKgPerDay:Number($('science-adg').value),supplementKgDMPerDay:Number($('science-supplement').value)}),rows=sensitivity.effects.map(effect=>'<tr><th>'+effect.label+'</th><td>'+number(effect.testedInputRange[0],2)+'–'+number(effect.testedInputRange[1],2)+'</td><td>'+number(effect.deltaFromBaselineKgDMPerDay[0],2)+'–'+number(effect.deltaFromBaselineKgDMPerDay[1],2)+' kg MS/dia</td></tr>').join('');host.insertAdjacentHTML('beforeend','<h4>Sensibilidade local da equação</h4><table><thead><tr><th>Entrada variada isoladamente</th><th>Faixa testada</th><th>Variação de CMS vs. base</th></tr></thead><tbody>'+rows+'</tbody></table><small>Variações determinísticas (±10 kg de peso, ±0,1 kg/d de GMD informado, ±0,5 kg MS/d de suplemento), limitadas ao domínio de validação. Não são intervalos de previsão nem calibração empírica do Riose.</small>');}
function renderScientificPanel(){let panel=document.getElementById('scientific-active-panel');if(!scientificResult){panel?.remove();return;}if(!panel){panel=document.createElement('section');panel.id='scientific-active-panel';panel.className='scientific-active-panel';document.querySelector('.metrics').after(panel);}const final=scientificResult.final,perHead=final.totalDmiKgDM/scientificResult.animalCount;panel.innerHTML='<strong>BR-CORTE 2023 · Eq. 2.6 · cenário '+scientificResult.days+' dias</strong><div>CMS total condicional: '+number(perHead,2)+' kg MS/cabeça/dia no último dia · forragem retirada: '+number(final.forageConsumedKgDM,0)+' kg MS no lote/dia · estoque final: '+number(final.pastureKgDMByPaddock.reduce((sum,value)=>sum+value,0),0)+' kg MS.</div><small>GMD assumido: '+number(scientificResult.assumptions.assumedAdgKgPerDay,2)+' kg/dia; '+(final.forageShortfallKgDM>0?'há déficit de forragem no último dia. ':'sem déficit de forragem no último dia. ')+'Água por piquete: '+scientificResult.assumptions.waterAvailableByPaddock.map((available,index)=>String.fromCharCode(65+index)+': '+(available?'disponível':'indisponível')).join(' · ')+'.</small><a href="'+BR_CORTE_PASTURE_DMI.source+'" target="_blank" rel="noopener">Fonte e equação ↗</a>';$('map').setAttribute('aria-label','Mapa da fazenda com resultado científico BR-CORTE. '+scientificResult.animalCount+' animais, dia '+scientificResult.days+'.');document.querySelector('.map-location').textContent='BR-CORTE / '+scientificResult.animalCount+' NELORE';}
function configure(patch                ){if(!loadingScenario&&!scientificPreviewActive)requestState({type:'configure',patch});}
$('comparison-factor').onchange=()=>renderConfiguredComparisonControls(state?.config,true);
$('comparison-reference').onchange=$('comparison-scenario').onchange=()=>updateComparisonRunButton();
function comparisonFactorName(factor){return {housing:'alojamento',diet:'dieta',weather:'clima',supplement:'suplemento'}[factor]??'configuração';}
function comparisonValueName(factor,value){if(value===undefined||value===null)return 'Não informado';if(factor==='supplement'&&Number.isFinite(Number(value)))return number(Number(value),1);return ({housing:{pasture:'pasto',barn:'confinamento'},diet:{pasture:'volumoso / pasto',balanced:'balanceada',concentrate:'mais concentrado'},weather:{normal:'ameno',hot:'calor',rain:'chuvoso'}}[factor]??{})[value]??String(value);}
function configuredComparisonValues(factor){return {housing:['pasture','barn'],diet:['pasture','balanced','concentrate'],weather:['normal','hot','rain'],supplement:Array.from({length:9},(_,index)=>index*0.5)}[factor]??[];}
function renderConfiguredComparisonControls(config,reset=false){
  if(!config)return;
  const factor=$('comparison-factor').value||'housing',reference=$('comparison-reference'),alternative=$('comparison-scenario'),values=configuredComparisonValues(factor),unit=factor==='supplement'?'kg MS/animal/dia':'';$('comparison-factor').value=factor;
  const previousReference=reference.value,previousAlternative=alternative.value;
  const selectMarkup=values.map(value=>'<option value="'+value+'">'+(factor==='supplement'?number(value,1)+' kg MS/animal/dia':comparisonValueName(factor,value))+'</option>').join('');
  reference.innerHTML=selectMarkup;alternative.innerHTML=selectMarkup;
  let referenceValue=reset||!values.some(value=>String(value)===previousReference)?String(factor==='housing'?'pasture':config[factor]):previousReference;
  let alternativeValue=reset||!values.some(value=>String(value)===previousAlternative)?String(factor==='housing'?'barn':values.find(value=>String(value)!==referenceValue)):previousAlternative;
  if(referenceValue===alternativeValue)alternativeValue=String(values.find(value=>String(value)!==referenceValue));
  reference.value=referenceValue;alternative.value=alternativeValue;
  $('comparison-reference-unit').textContent=unit;$('comparison-scenario-unit').textContent=unit;
  updateComparisonRunButton();
}
function updateComparisonRunButton(){const valid=$('comparison-reference').value!==''&&$('comparison-scenario').value!==''&&$('comparison-reference').value!==$('comparison-scenario').value;for(const id of ['compare','experiment'])if($(id))$(id).disabled=requestCompare||loadingScenario||!valid;}
function selectedConfiguredComparison(snapshot){
  const factor=$('comparison-factor').value,values=configuredComparisonValues(factor),rawReference=$('comparison-reference').value,rawScenario=$('comparison-scenario').value;
  if(!values.some(value=>String(value)===rawReference)||!values.some(value=>String(value)===rawScenario)||rawReference===rawScenario)throw new Error('Escolha dois valores diferentes para o fator comparado.');
  const parse=value=>factor==='supplement'?Number(value):value,referenceConfig={...snapshot.config},scenarioConfig={...snapshot.config};
  referenceConfig[factor]=parse(rawReference);scenarioConfig[factor]=parse(rawScenario);
  return {factor,referenceConfig,scenarioConfig,days:30};
}
function selectedLotIntervention(snapshot,factor){
  const referenceConfig={...snapshot.config},scenarioConfig={...snapshot.config};
  const alternatives={housing:{pasture:'barn',barn:'pasture'},diet:{pasture:'balanced',balanced:'concentrate',concentrate:'pasture'},weather:{normal:'hot',hot:'rain',rain:'normal'}};
  if(factor==='supplement')scenarioConfig.supplement=snapshot.config.supplement<=3.5?snapshot.config.supplement+0.5:snapshot.config.supplement-0.5;
  else if(alternatives[factor])scenarioConfig[factor]=alternatives[factor][snapshot.config[factor]];
  else throw new Error('Intervenção não registrada para o lote demonstrativo.');
  return {factor,referenceConfig,scenarioConfig,days:30};
}
$                   ('diet').onchange=e=>configure({diet:(e.target                     ).value                  });
$                   ('weather').onchange=e=>configure({weather:(e.target                     ).value                     });
$                  ('supplement').oninput=e=>$('supplementvalue').textContent=number(Number((e.target                    ).value))+' kg MS/dia';
$                  ('supplement').onchange=e=>configure({supplement:Number((e.target                    ).value)});
$('pasturebtn').onclick=()=>configure({housing:'pasture'});$('barnbtn').onclick=()=>configure({housing:'barn'});
function setRunning(value        ){running=value;$('play').textContent=value?'Ⅱ':'▶';$('play').setAttribute('aria-label',value?'Pausar simulação':'Continuar simulação');lastTick=performance.now();}
$('play').onclick=()=>{if(scientificPreviewActive)return;setRunning(!running);};$('day').onclick=()=>{if(loadingScenario||scientificPreviewActive)return;setRunning(false);requestState({type:'tick',hours:24});};$('reset').onclick=()=>{if(loadingScenario)return;scientificPreviewActive=false;scientificResult=null;renderScientificPanel();$('play').disabled=false;$('day').disabled=false;document.querySelector('.map-location').textContent='HORIZONTE / 24 ANIMAIS';selected=1;positions.clear();requestState({type:'reset'});setRunning(false);};
$('scientific-open').onclick=()=>{$('scientific-result').replaceChildren();if(!$('science-paddock-inputs').children.length)$('science-paddock-inputs').innerHTML=Array.from({length:4},(_,i)=>'<label>Piquete '+String.fromCharCode(65+i)+'<input type="number" min="0" step="100" value="16000" data-science-stock="'+i+'"><span><input type="checkbox" checked data-science-water="'+i+'"> Água disponível</span></label>').join('');$('scientific-simulation').showModal();};
$('scientific-close').onclick=()=>$('scientific-simulation').close();
$('scientific-form').onsubmit=event=>{event.preventDefault();try{const stocks=Array.from(document.querySelectorAll('[data-science-stock]'),input=>Number(input.value));const water=Array.from(document.querySelectorAll('[data-science-water]'),input=>input.checked);scientificResult=simulateNelorePastureScenario({seed:2026,animalCount:100,initialWeightKg:Number($('science-weight').value),assumedAdgKgPerDay:Number($('science-adg').value),supplementKgDMPerAnimalPerDay:Number($('science-supplement').value),days:Number($('science-days').value),initialPastureKgDMByPaddock:stocks,waterAvailableByPaddock:water});scientificResult.assumptions.initialPastureKgDMByPaddock=stocks;scientificResult.assumptions.waterAvailableByPaddock=water;const final=scientificResult.final,totals=scientificResult.rows.slice(1).reduce((sum,row)=>({dmi:sum.dmi+row.totalDmiKgDM,supplement:sum.supplement+row.supplementKgDM,forage:sum.forage+row.forageConsumedKgDM}),{dmi:0,supplement:0,forage:0});const paddockCenters=[{x:84,y:89},{x:260,y:89},{x:84,y:229},{x:260,y:229}],withinPaddock={};const animals=scientificResult.animals.map(animal=>{const center=paddockCenters[animal.paddock],slot=withinPaddock[animal.paddock]??0;withinPaddock[animal.paddock]=slot+1;const x=center.x+((slot%7)-3)*11,y=center.y+(Math.floor(slot/7)-1.5)*11;return {id:animal.id,name:animal.name,weight:animal.weightKg,initialWeight:animal.initialWeightKg,energy:75,thirst:20,action:'grazing',patch:animal.paddock,x,y,targetX:x,targetY:y,history:[]};});const snapshot={hour:6+(scientificResult.days-1)*24,animals,pastures:[...final.pastureKgDMByPaddock],intake:{pastureKgDM:totals.forage,barnBaseKgDM:0,supplementKgDM:totals.supplement,dietExtraKgDM:0},config:{diet:'pasture',housing:'pasture',weather:'normal',supplement:Number($('science-supplement').value)},cost:0,events:[{hour:6+(scientificResult.days-1)*24,text:'Resultado final do cenário BR-CORTE 2023 · GMD assumido, sem previsão independente de ganho.'}],seed:scientificResult.seed,initialSeed:scientificResult.seed,locomotionSeed:scientificResult.seed};scientificPreviewActive=true;selected=1;positions.clear();setRunning(false);$('play').disabled=true;$('day').disabled=true;requestState({type:'load',snapshot});const perHead=final.totalDmiKgDM/100;$('scientific-result').innerHTML='<h3>Resultado do dia '+scientificResult.days+'</h3><p>Peso médio sob GMD assumido: <strong>'+number(final.meanWeightKg,1)+' kg</strong>. CMS total Eq. 2.6: <strong>'+number(perHead,2)+' kg MS/cabeça/dia</strong> no último dia. Forragem consumida no período: <strong>'+number(totals.forage,0)+' kg MS</strong>.</p><p>Consumo acumulado calculado: '+number(totals.dmi,0)+' kg MS total e '+number(totals.supplement,0)+' kg MS de suplemento. Déficit de forragem no último dia: '+number(final.forageShortfallKgDM,1)+' kg MS.</p><small>O peso é a trajetória do ADG informado. Resultados de 100 animais identificados; água e estoque inicial são entradas/configurações, sem modelo hídrico ou de recuperação do pasto.</small>';$('scientific-simulation').close();renderScientificPanel();}catch(error){$('scientific-result').textContent='Não foi possível executar: '+error.message;}};
$('scientific-form').addEventListener('submit',()=>queueMicrotask(()=>{try{if(scientificResult)renderScientificSensitivity();}catch{}}));
$('scenario-save').onclick=()=>{if(!state||pendingSnapshotAction)return;const name=prompt('Nome do cenário:','Meu cenário');if(name===null)return;const cleanName=name.trim().slice(0,60);if(!cleanName){notify('Digite um nome para salvar o cenário.');return;}pendingSnapshotAction={type:'save',name:cleanName};requestState({type:'snapshot'});};
$('snapshot-connect-open')?.addEventListener('click',()=> $('snapshot-connect-file')?.click());
$('scenario-select').onchange=e=>{if(loadingScenario||requestCompare)return;const nextId=e.target.value,previousActiveScenarioId=activeScenarioId;if(nextId&&!scenarios.some(item=>item.id===nextId))return;activeScenarioId=nextId||null;if(!saveScenarioData()){activeScenarioId=previousActiveScenarioId;renderScenarios();return;}if(!nextId){renderScenarios();return;}const scenario=scenarios.find(item=>item.id===nextId);selected=scenario.selected??1;selectedPaddockDomainZone=scenario.selectedPaddockDomainZone??null;selectedLotId=scenario.selectedLotId??null;selectedDemoLotId=scenario.selectedDemoLotId??(selectedPaddockDomainZone?`demo-paddock-${Number(selectedPaddockDomainZone.replace('paddock-',''))}`:null);if(scenario.environmentState)environmentState=initialEnvironmentState(farmSnapshot,scenario.environmentState);persistEnvironmentState();persistFarmSelection();renderEnvironmentInputs();renderLotSelection();setRunning(false);pending=false;positions.clear();renderScenarios();loadScenario(scenario);};
$('scenario-rename').onclick=()=>{const scenario=activeScenario();if(!scenario)return;const name=prompt('Novo nome do cenário:',scenario.name);if(name===null)return;const cleanName=name.trim().slice(0,60);if(!cleanName){notify('O nome do cenário não pode ficar vazio.');return;}const previousName=scenario.name;scenario.name=cleanName;if(!saveScenarioData()){scenario.name=previousName;renderScenarios();return;}renderScenarios();notify('Cenário renomeado.');};
$('scenario-delete').onclick=()=>{const scenario=activeScenario();if(!scenario)return;if(!confirm('Remover o cenário “'+scenario.name+'”?'))return;const previousScenarios=scenarios,previousActiveScenarioId=activeScenarioId;scenarios=scenarios.filter(item=>item.id!==scenario.id);activeScenarioId=null;if(!saveScenarioData()){scenarios=previousScenarios;activeScenarioId=previousActiveScenarioId;renderScenarios();return;}renderScenarios();notify('Cenário removido.');};
$                   ('speed').onchange=e=>speed=Number((e.target                     ).value);
$('method').onclick=()=>$                   ('methodology').showModal();document.querySelectorAll                   ('[data-close]').forEach(button=>button.onclick=()=>$                   (button.dataset.close ).close());
function localExplanation(input){const place=input.config.housing==='barn'?'confinamento':'pasto';return `O cenário está em ${place}, no dia ${Math.floor(input.hour/24)+1}, com peso médio estimado de ${number(input.metrics.weight)} kg e custo acumulado de ${currency(input.metrics.cost)}. Esses valores vêm das regras demonstrativas do motor; não são medições nem recomendações.`;}
$('explain').onclick=async()=>{if(!state)return;const button=$('explain'),input={hour:state.hour,config:{...state.config},metrics:metrics(state)};button.disabled=true;$('explanation').textContent=localExplanation(input);$('explanation-label').textContent='Explicação determinística · não medido';try{const response=await fetch('/api/explain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw new Error('explanation_unavailable');const result=await response.json();if(typeof result.text!=='string'||typeof result.label!=='string')throw new Error('invalid_explanation');$('explanation').textContent=result.text;$('explanation-label').textContent=result.label;}catch{$('explanation-label').textContent='Explicação determinística · não medido';}finally{button.disabled=false;}};
async function loadScenario(scenario){loadingScenario=true;compareBusy(requestCompare);try{const snapshot=scenario.snapshot??await decodeScenarioSnapshot(scenario.snapshotData);requestState({type:'load',snapshot,selectedAnimalId:selected});}catch{loadingScenario=false;compareBusy(requestCompare);notify('Não foi possível abrir este cenário salvo.');}}
function beginCompare(){if(!state||requestCompare||loadingScenario||pendingSnapshotAction)return;setRunning(false);pendingSnapshotAction={type:'compare'};compareBusy(true);requestState({type:'snapshot'});}
function beginDemoLotCompare(){if(!state||!selectedPaddockDomainZone||requestCompare||loadingScenario||pendingSnapshotAction)return;setRunning(false);pendingSnapshotAction={type:'compare-lot',factor:$('lot-demo-intervention').value};compareBusy(true);requestState({type:'snapshot'});}
$('compare').onclick=beginCompare;
$('experiment').onclick=beginCompare;
function renderScenarioVariables(){
  const variables=$('comparison-variables'),thermal=$('comparison-thermal');
  if(!variables||!thermal)return;
  const factor=comparison?.comparisonFactor??'housing',reference=comparison?.referenceConfig??comparison?.baselineConfig??comparisonSnapshot?.config??{},alternative=comparison?.scenarioConfig??reference;
  const config=reference,diet=dietNames[config.diet]??'Não informado';
  const rows=environmentDiffRows(comparisonEnvironmentState,{dietLabel:diet},'Não informado');
  for(const key of ['housing','diet','weather','supplement']){
    const changed=key===factor,label=comparisonFactorName(key),unit=key==='supplement'?' kg MS/animal/dia':'';
    rows.push({name:label,baseline:comparisonValueName(key,reference[key])+unit,scenario:comparisonValueName(key,alternative[key])+unit,changed});
  }
  const animals=comparisonSnapshot?.animals??[],shownAnimals=animals.slice(0,12);
  const animalRows=shownAnimals.map(animal=>'<tr><th>'+escapeHtml(animal.id)+'</th><td>'+comparisonNumber(animal.initialWeight)+' kg</td><td>'+((Number.isInteger(animal.patch)&&animal.patch>=0&&animal.patch<4)?'Piquete '+String.fromCharCode(65+animal.patch):'Não informado')+'</td></tr>').join('');
  const identityDetails=animals.length?'<details class="comparison-identities"><summary>Identidade no snapshot executado · '+comparisonNumber(animals.length,0)+' animais</summary><p>IDs e pesos abaixo são entradas do estado simulado; a lista completa, a semente e as duas configurações ficam no manifesto salvo. Os sprites da fazenda são apenas representativos e não identificam indivíduos.</p><table class="pasture-table"><thead><tr><th>ID no snapshot</th><th>Peso inicial</th><th>Posição do motor</th></tr></thead><tbody>'+animalRows+'</tbody></table>'+(animals.length>shownAnimals.length?'<small>Exibindo '+shownAnimals.length+' de '+animals.length+' IDs; o manifesto contém todos.</small>':'')+'</details>':'<p>O snapshot da execução não contém identidades animais disponíveis.</p>';
  variables.innerHTML='<h3>Variáveis do comparador</h3><table class="pasture-table"><thead><tr><th>Variável</th><th>Referência</th><th>Alternativa</th><th>Estado</th></tr></thead><tbody>'+rows.map(row=>'<tr><th>'+escapeHtml(row.name)+'</th><td>'+escapeHtml(row.baseline)+'</td><td>'+escapeHtml(row.scenario)+'</td><td>'+(row.changed?'Alterada':'Mantida')+'</td></tr>').join('')+'</tbody></table><p>Fator alterado: '+escapeHtml(comparisonFactorName(factor))+'. Temperatura e umidade alimentam somente o THI descritivo; o THI não altera consumo ou ganho no motor.</p>'+identityDetails;
  const baseT=comparisonEnvironmentState?.baseline?.temperatureC?.value,baseRh=comparisonEnvironmentState?.baseline?.relativeHumidityPct?.value,scenarioT=comparisonEnvironmentState?.current?.temperatureC,scenarioRh=comparisonEnvironmentState?.current?.relativeHumidityPct,baseThi=calculateThi(baseT,baseRh),scenarioThi=calculateThi(scenarioT,scenarioRh),value=result=>result.available?number(result.value,1)+' (sem unidade)':'Não informado · '+result.reason;
  thermal.innerHTML='<h3>Indicador ambiental · THI</h3><p>Original: '+escapeHtml(value(baseThi))+' · Cenário: '+escapeHtml(value(scenarioThi))+'.</p><p>Fórmula: '+escapeHtml(scenarioThi.formula??'0,8 × T + (UR/100) × (T − 14,4) + 46,4')+'. T em °C; UR em %. Somente índice ambiental, sem conversão em estresse fisiológico ou resposta produtiva.</p><small>Fonte: <a href="'+THI_SOURCE.doi+'" target="_blank" rel="noopener">'+escapeHtml(THI_SOURCE.authors+', '+THI_SOURCE.title)+'</a>. O índice não inclui vento nem radiação solar.</small>';
}
function renderPresetCatalog(){
  const select=$('preset-select');
  select.replaceChildren(...SCENARIO_PRESETS.map(preset=>{const option=document.createElement('option');option.value=preset.id;option.textContent=preset.status==='unsupported'?preset.name+' · indisponível':preset.name;return option;}));
  select.value='baseline';
  updatePresetDescription();
}
function updatePresetDescription(){
  const preset=getScenarioPreset($('preset-select').value);
  $('preset-description').textContent=preset.status==='unsupported'?preset.unavailableReason:preset.description+' Semente '+preset.seed+' · '+preset.durationDays+' dias.';
  $('preset-run').textContent=preset.execution==='reset'?'Carregar baseline':'Executar preset · '+preset.durationDays+' dias';
  $('preset-run').disabled=preset.status==='unsupported'||requestCompare||loadingScenario;
}
$('preset-select').onchange=updatePresetDescription;
$('preset-run').onclick=()=>{
  const preset=getScenarioPreset($('preset-select').value);
  if(preset.status==='unsupported'){$('preset-description').textContent=preset.unavailableReason;return;}
  const snapshot=createScenarioPresetSnapshot(preset.id);
  if(preset.execution==='reset'){
    setRunning(false);pending=false;pendingSnapshotAction=null;scientificPreviewActive=false;scientificResult=null;renderScientificPanel();$('play').disabled=false;$('day').disabled=false;
    selected=1;positions.clear();activeScenarioId=null;saveScenarioData();renderScenarios();loadingScenario=true;compareBusy(false);requestState({type:'load',snapshot});
    $('preset-description').textContent='Baseline carregado · semente '+preset.seed+' · '+snapshot.animals.length+' animais.';
    return;
  }
  if(!state||requestCompare||loadingScenario||pendingSnapshotAction)return;
  setRunning(false);const manifest=createComparisonManifest(snapshot,preset.durationDays);pendingComparison={snapshot,manifest,lotContext:null,environmentState:structuredClone(environmentState)};compareBusy(true);postWorkerMessage({type:'compare',days:preset.durationDays,snapshot});
};
renderPresetCatalog();
function comparisonNumber(value,digits=1){return Number.isFinite(value)?number(value,digits):'Indisponível';}
function comparisonCurrency(value){return Number.isFinite(value)?currency(value):'Indisponível';}
function comparisonCalculation(values,calculate){return values.every(Number.isFinite)?calculate(...values):undefined;}
function comparisonPerAnimal(value){const count=comparisonSnapshot?.animals?.length;return Number.isInteger(count)&&count>0?comparisonCalculation([value],total=>total/count):undefined;}
function comparisonRows(data){return Array.isArray(data?.rows)?data.rows.filter(row=>row&&typeof row==='object'):[];}
function comparisonFinalRow(data){return comparisonRows(data).find(row=>Number.isFinite(data.days)&&row.day===data.days)??{};}
function normalizeConfiguredComparison(data){if(!data?.referenceConfig||!Array.isArray(data.rows))return data;return {...data,baselineConfig:data.referenceConfig,scenarioConfig:data.scenarioConfig,rows:data.rows.map(row=>({...row,baselineWeight:row.referenceWeight,baselineCost:row.referenceCost,baselineConsumptionKgDM:row.referenceConsumptionKgDM,baselineIntakeBySourceKgDM:row.referenceIntakeBySourceKgDM,baselinePastureKgDM:row.referencePastureKgDM,baselinePastureByPaddock:row.referencePastureByPaddock}))};}
function comparisonArray(value){return Array.isArray(value)?value:[];}
function comparisonPasturesAvailable(){const values=comparisonSnapshot?.pastures;return Array.isArray(values)&&values.length===4&&Array.from(values).every(Number.isFinite);}
function comparisonData(data){return comparisonPasturesAvailable()?data:{...data,startWeight:undefined,initialPastureByPaddock:[],rows:comparisonRows(data).map(row=>({day:row.day}))};}
const intakeKeys=['pastureKgDM','barnBaseKgDM','supplementKgDM','dietExtraKgDM'];
function comparisonIntake(row,side,key){return Number.isFinite(comparisonSnapshot?.intake?.[key])?row?.[side+'IntakeBySourceKgDM']?.[key]:undefined;}
function comparisonConsumption(row,side){return intakeKeys.every(key=>Number.isFinite(comparisonSnapshot?.intake?.[key]))?row?.[side+'ConsumptionKgDM']:undefined;}
function comparisonEvidence(rule,period){return '<p class="metric-evidence"><b>Derivado · demonstrativo · não validado</b> Período: '+period+'. Regra: '+rule+' Fonte: <a href="/src/client/engine.js" target="_blank" rel="noopener">engine.js · compare / metrics / tick</a>.</p>';}
function resultDifference(base,alternative,unit,digits=1){
  const delta=comparisonCalculation([base,alternative],(b,a)=>a-b);
  if(!Number.isFinite(delta))return 'Diferença alternativa − base: Indisponível · relativa: Indisponível.';
  const percent=comparisonCalculation([delta,base],(d,b)=>d/b*100),relative=base===0?'indefinida (base zero)':Number.isFinite(percent)?(percent>=0?'+':'')+comparisonNumber(percent,2)+'%':'Indisponível';
  return 'Diferença alternativa − base: '+(delta>=0?'+':'')+comparisonNumber(delta,digits)+' '+unit+' · relativa: '+relative+'.';
}
function renderDetailedResults(data){
  data=comparisonData(data);
  const end=comparisonFinalRow(data),days=comparisonNumber(data.days,0),period='intervalo de 0 a '+days+' dias desde o snapshot',factor=data.comparisonFactor??'housing',referenceLabel=comparisonValueName(factor,data.baselineConfig?.[factor])+(factor==='supplement'?' kg MS/animal/dia':''),scenarioLabel=comparisonValueName(factor,data.scenarioConfig?.[factor])+(factor==='supplement'?' kg MS/animal/dia':'');
  const baseConsumption=comparisonConsumption(end,'baseline'),scenarioConsumption=comparisonConsumption(end,'scenario');
  const cards=[
    ['PESO MÉDIO · DIA '+days,comparisonNumber(end.scenarioWeight)+' kg/animal, '+scenarioLabel,'Referência · '+referenceLabel+': '+comparisonNumber(end.baselineWeight)+' kg/animal.',end.baselineWeight,end.scenarioWeight,'kg/animal','Soma dos pesos simulados dividida pelo número de animais.','dia '+days+' desde o snapshot'],
    ['CONSUMO ESTIMADO DE MS · '+days+' DIAS',comparisonNumber(scenarioConsumption,0)+' kg MS/lote','Alternativa · '+scenarioLabel+': '+comparisonNumber(comparisonPerAnimal(scenarioConsumption))+' kg MS/animal · Referência · '+referenceLabel+': '+comparisonNumber(baseConsumption,0)+' kg MS/lote ('+comparisonNumber(comparisonPerAnimal(baseConsumption))+' kg MS/animal).',baseConsumption,scenarioConsumption,'kg MS/lote','Soma dos quatro componentes do consumo, menos o registro inicial; por animal, dividir pelo rebanho do snapshot.',period],
    ['ESTOQUE DE FORRAGEM · DIA '+days,comparisonNumber(end.scenarioPastureKgDM,0)+' kg MS','Referência · '+referenceLabel+': '+comparisonNumber(end.baselinePastureKgDM,0)+' kg MS · estoque simulado nos 4 piquetes.',end.baselinePastureKgDM,end.scenarioPastureKgDM,'kg MS','Soma dos estoques dos piquetes após crescimento assumido e retirada simulada.','dia '+days+' desde o snapshot'],
    ['CUSTO DA ALIMENTAÇÃO · '+days+' DIAS',comparisonCurrency(end.scenarioCost),'Referência · '+referenceLabel+': '+comparisonCurrency(end.baselineCost)+' · R$/lote.',end.baselineCost,end.scenarioCost,'R$/lote','Custo acumulado segundo as regras fixas do motor, menos o custo inicial.',period]
  ];
  $('results').innerHTML=cards.map(([title,value,base,b,s,unit,rule,when])=>'<div class="result-card"><h3>'+title+'</h3><strong>'+value+'</strong><p>'+base+'</p><p>'+resultDifference(b,s,unit,2)+'</p>'+comparisonEvidence(rule,when)+'</div>').join('');
  const sources=[
    ['Forragem retirada dos piquetes','pastureKgDM','Mínimo entre demanda e estoque disponível por hora.'],
    ['Alimento-base assumido no confinamento','barnBaseKgDM','Demanda assumida integralmente fornecida por hora.'],
    ['Suplemento configurado','supplementKgDM','Suplemento configurado dividido por 24 por animal/hora.'],
    ['Adicional fixo da dieta','dietExtraKgDM','0, 1,8 ou 3,2 kg MS/animal/dia conforme a dieta.']
  ];
  const intakeRows=sources.map(([label,key,rule])=>'<tr><th scope="row">'+label+'<small class="row-derivation">'+rule+' Acumulado menos início.</small></th><td>'+comparisonNumber(comparisonIntake(end,'baseline',key))+'</td><td>'+comparisonNumber(comparisonIntake(end,'scenario',key))+'</td></tr>').join('');
  $('intake-summary').innerHTML='<section><h3>COMPOSIÇÃO DO CONSUMO ESTIMADO · KG MS/LOTE · '+days+' DIAS</h3><table class="pasture-table"><thead><tr><th scope="col">Componente do motor</th><th scope="col">Referência · '+referenceLabel+'</th><th scope="col">Alternativa · '+scenarioLabel+'</th></tr></thead><tbody>'+intakeRows+'</tbody></table>'+comparisonEvidence('Cada linha é a diferença do componente entre o fim e o início; unidade kg MS/lote.',period)+'</section>';
  const initial=comparisonArray(data.initialPastureByPaddock),base=comparisonArray(end.baselinePastureByPaddock),alternative=comparisonArray(end.scenarioPastureByPaddock);
  const paddockRows=Array.from({length:4},(_,index)=>'<tr><th scope="row">Piquete '+String.fromCharCode(65+index)+'</th><td>'+comparisonNumber(initial[index],0)+'</td><td>'+comparisonNumber(base[index],0)+'</td><td>'+comparisonNumber(alternative[index],0)+'</td></tr>').join('');
  $('pasture-summary').innerHTML='<section><h3>ESTOQUE DE FORRAGEM POR PIQUETE · KG MS/PIQUETE</h3><table class="pasture-table"><thead><tr><th scope="col">Piquete</th><th scope="col">Início · dia 0</th><th scope="col">Referência · '+referenceLabel+' · dia '+days+'</th><th scope="col">Alternativa · '+scenarioLabel+' · dia '+days+'</th></tr></thead><tbody>'+paddockRows+'</tbody></table>'+comparisonEvidence('Início: estoque declarado no snapshot simulado. Final: crescimento assumido menos retirada; unidade kg MS/piquete.','snapshot inicial e dia '+days+' do intervalo')+'<p>Sem área, medição de biomassa ou categoria real de condição do pasto.</p></section>';
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
  const factor=data.comparisonFactor??'housing',referenceLabel=comparisonValueName(factor,c[factor]),scenarioLabel=comparisonValueName(factor,data.scenarioConfig?.[factor]);
  $('comparison-assumptions').innerHTML='<h3>Hipóteses usadas · Sem calibração suficiente · demonstrativas e não validadas</h3><p>Fator configurado: '+comparisonFactorName(factor)+'. Referência: '+referenceLabel+'; alternativa: '+scenarioLabel+(factor==='supplement'?' kg MS/animal/dia':'')+'. Mesmo snapshot e mesma semente; as outras configurações permanecem iguais. Quando o fator é alojamento, os cenários mantêm a mesma demanda-base de matéria seca. Não há calibração nem intervalo de confiança; as diferenças não são uma resposta biológica medida e não demonstram efeito causal ou previsão individual.</p><ul>'+hypotheses.map(([label,value,unit])=>'<li>'+label+': '+comparisonNumber(value,2)+' '+unit+'.</li>').join('')+'</ul><p>Regras fixas do motor incluem alimento-base assumido no confinamento a 0,65 R$/kg MS; adicionais da dieta de 0 / 1,8 / 3,2 kg MS/animal/dia; suplemento × 1,2 e adicional × 1,35 no equivalente energético; piso de peso 200 kg/animal. Essas constantes são hipóteses, não preços pesquisados ou equações ajustadas. O estoque inicial vem do snapshot usado na comparação.</p><p>Diagnósticos públicos de ADG ajudam a auditar componentes do motor, mas não validam a simulação completa: <a href="/docs/evidence/engine-adg-usda-cper-ltgi-check.json" target="_blank" rel="noopener">holdout temporal CPER LTGI</a>, <a href="/docs/evidence/engine-adg-usda-cgrec-transport-check.json" target="_blank" rel="noopener">transporte externo CGREC</a> e <a href="/docs/evidence/engine-adg-zenodo-cows-check.json" target="_blank" rel="noopener">checagem sem ajuste nas vacas adultas do Zenodo</a>. Neste último conjunto, a discrepância média absoluta foi 1,208 kg/vaca/dia sob as condições padrão do motor; as datas individuais e entradas de manejo não estão alinhadas. Cobertura alta em um único ano não é calibração transferível.</p><p>Fonte das hipóteses e cálculos: <a href="/src/client/engine.js" target="_blank" rel="noopener">engine.js · ASSUMPTIONS / tick / compare</a>. Reprodução: <a href="/src/client/worker.js" target="_blank" rel="noopener">worker.js · replayComparison</a>. Diferenças: alternativa − referência; percentual: diferença / referência × 100, indefinido quando a referência é zero.</p>';
}
function showComparison(data){
  const completed=pendingComparison;comparisonSnapshot=completed?.snapshot??comparisonSnapshot;comparisonManifest=completed?.manifest??comparisonManifest;comparisonLotContext=completed?.lotContext??null;comparisonEnvironmentState=completed?(completed.environmentState??null):environmentState;
  if(completed)persistRun(completed.manifest,data,'completed',undefined,completed.execution);
  const lotContext=$('lot-comparison-context'),context=completed?.lotContext;if(lotContext){lotContext.hidden=!context;lotContext.innerHTML=context?'<strong>'+escapeHtml(context.lotId)+'</strong> · intervenção demonstrativa de '+escapeHtml(comparisonFactorName(context.intervention.factor))+': '+escapeHtml(comparisonValueName(context.intervention.factor,context.intervention.referenceValue))+' → '+escapeHtml(comparisonValueName(context.intervention.factor,context.intervention.scenarioValue))+' · '+escapeHtml(context.animalIds.length)+' animal(is) · modelo '+escapeHtml(context.model.id)+' v'+escapeHtml(context.model.version)+' · '+escapeHtml(context.model.status)+'. Dados observados não utilizados.':'';}
  pendingComparison=null;
  data=normalizeConfiguredComparison(data);data=comparisonData(data);
  comparison=data;compareBusy(false);
  if(completed?.manifest?.type==='riose-configured-comparison'){const manifest=completed.manifest;$('comparison-factor').value=manifest.factor;renderConfiguredComparisonControls(manifest.initialSnapshot.config,true);$('comparison-reference').value=String(manifest.scenarios.reference[manifest.factor]);$('comparison-scenario').value=String(manifest.scenarios.scenario[manifest.factor]);updateComparisonRunButton();}
  renderScenarioVariables();
  const c=data.baselineConfig??{},snapshot=comparisonSnapshot??{},days=comparisonNumber(data.days,0),initial=comparisonArray(data.initialPastureByPaddock),initialTotal=initial.length===4?comparisonCalculation(initial,(...values)=>values.reduce((sum,value)=>sum+value,0)):undefined;
  const start=Number.isFinite(snapshot.hour)?'dia '+(Math.floor(snapshot.hour/24)+1)+' às '+String(snapshot.hour%24).padStart(2,'0')+':00':'horário indisponível';
  const factor=data.comparisonFactor??'housing',s=data.scenarioConfig??{},factorLabel=comparisonFactorName(factor),referenceText=comparisonValueName(factor,c[factor]),scenarioText=comparisonValueName(factor,s[factor]);
  const executorLabel=completed?.execution?.backend==='local-rust'?'Rust local · '+(completed.execution.buildId??completed.execution.engineVersion):completed?.execution?.fallbackUsed?'JavaScript local · fallback do Rust':'JavaScript/WASM local';
  $('compareconfig').textContent='Derivado · demonstrativo · não validado · motor '+(data.engineVersion??'versão não informada')+'. Executor: '+executorLabel+'. Semente: '+(Number.isInteger(data.seed)?data.seed:'não informada')+'. Único fator configurado diferente: '+factorLabel+'. Referência: '+referenceText+(factor==='supplement'?' kg MS/animal/dia':'')+'; alternativa: '+scenarioText+(factor==='supplement'?' kg MS/animal/dia':'')+'. Horizonte: '+days+' dias a partir de '+start+'. Mesmo snapshot simulado: '+comparisonNumber(snapshot.animals?.length,0)+' animais, peso inicial '+comparisonNumber(data.startWeight)+' kg/animal (média no snapshot) e forragem inicial '+comparisonNumber(initialTotal,0)+' kg MS (soma dos piquetes). Configurações iguais fora do fator: '+(dietNames[c.diet]??'dieta indisponível')+', '+comparisonNumber(c.supplement)+' kg MS de suplemento/animal/dia, '+comparisonValueName('housing',c.housing)+' e '+comparisonValueName('weather',c.weather)+'.';
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
  const headers=['dia','fator_comparado','valor_referencia','valor_alternativa','peso_ref_kg','peso_alternativa_kg','consumo_ref_lote_kgMS','consumo_alternativa_lote_kgMS','consumo_ref_kgMS_animal','consumo_alternativa_kgMS_animal','estoque_ref_total_kgMS','estoque_alternativa_total_kgMS','custo_ref_brl','custo_alternativa_brl'];
  for(let i=0;i<4;i++)headers.push('piquete_'+String.fromCharCode(65+i)+'_inicio_kgMS','piquete_'+String.fromCharCode(65+i)+'_ref_final_kgMS','piquete_'+String.fromCharCode(65+i)+'_alternativa_final_kgMS');
  // Keep the non-calibrated status attached when CSV data leaves the UI context.
  headers.push('status_modelo','intervalo_probabilistico');
  const factor=data.comparisonFactor??'housing',reference=data.referenceConfig??data.baselineConfig??{},scenario=data.scenarioConfig??{};
  return [headers.join(','),...comparisonRows(data).map(row=>{const base=comparisonConsumption(row,'baseline'),alternative=comparisonConsumption(row,'scenario');return [cell(row.day,0),comparisonFactorName(factor),String(reference[factor]),String(scenario[factor]),...[row.baselineWeight,row.scenarioWeight,base,alternative,comparisonPerAnimal(base),comparisonPerAnimal(alternative),row.baselinePastureKgDM,row.scenarioPastureKgDM,row.baselineCost,row.scenarioCost].map(value=>cell(value)),...Array.from({length:4},(_,i)=>[initial[i],row.baselinePastureByPaddock?.[i],row.scenarioPastureByPaddock?.[i]].map(value=>cell(value,2))).flat(),'demonstrativo_nao_validado','nao_disponivel_sem_calibracao'].join(',');})].join('\n');
}
$('export').onclick=()=>{if(comparison&&!requestCompare&&!loadingScenario)downloadFile('agroville-comparacao-demonstrativa.csv',comparisonCSV(comparison),'text/csv;charset=utf-8');};
$('report-export').onclick=()=>{if(!comparison||requestCompare||loadingScenario)return;try{downloadFile('agroville-relatorio-demonstrativo.md',renderSimulationReport(comparison,comparisonManifest,{lotContext:comparisonLotContext}),'text/markdown;charset=utf-8');}catch(error){notify('Não foi possível gerar o relatório: '+error.message);}};

let noticeTimer                              ;function notify(message       ){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,5000);}
function renderRunHistory(){
  const select=$('run-history-select'),selected=select.value;select.replaceChildren(new Option('Execuções salvas',''));
  try{
    const runs=listRuns(localStorage),stats=getRunHistoryStats(localStorage);
    for(const run of runs){const compatibility=runCompatibility(run),label=run.status==='failed'?'falhou':compatibility.supported?'concluída':'incompatível';select.add(new Option(new Date(run.timestamp).toLocaleString('pt-BR')+' · '+label+' · '+run.id,run.id));}
    select.value=runs.some(run=>run.id===selected)?selected:(runs[0]?.id??'');
    $('run-history-status').textContent=`${runs.length}/${MAX_RUNS} execução(ões) · ${formatRunHistoryBytes(stats.bytes)} de ${formatRunHistoryBytes(MAX_RUN_HISTORY_BYTES)} do limite local.`;
  }catch(error){select.value='';$('run-history-status').textContent=error.message;}
  $('run-history-replay').disabled=!select.value||requestCompare||loadingScenario;
}
function persistRun(manifest,result,status,error,execution){
  try{const before=listRuns(localStorage),run=createRunRecord({manifest,result,status,error,execution});if(pendingComparison?.lotContext)run.lotContext=structuredClone(pendingComparison.lotContext);if(pendingComparison?.environmentState)run.environmentState=structuredClone(pendingComparison.environmentState);recordRun(run,localStorage);const afterIds=new Set(listRuns(localStorage).map(item=>item.id)),removed=before.filter(item=>!afterIds.has(item.id)).length;renderRunHistory();if(removed)$('run-history-status').textContent+=` ${removed} registro(s) mais antigo(s) foram removidos para respeitar os limites; exporte o histórico antes de uma nova execução para manter uma cópia.`;}
  catch(storageError){$('run-history-status').textContent=storageError.message;notify(storageError.message);}
}
function failPendingRun(message){if(pendingComparison)persistRun(pendingComparison.manifest,undefined,'failed',message);pendingComparison=null;}
function replaySavedRun(){
  let run;
  try{run=getRun($('run-history-select').value,localStorage);}catch(error){notify(error.message);return;}
  if(!run){notify('Selecione uma execução salva.');return;}
  const compatibility=runCompatibility(run);
  if(!compatibility.supported){notify(compatibility.reason);return;}
  if(run.lotContext)try{validateDemoLotContext(run.lotContext,run.manifest.initialSnapshot,run.manifest.factor,run.manifest.scenarios.reference,run.manifest.scenarios.scenario);}catch(error){notify(error.message);return;}
  setRunning(false);pendingComparison={snapshot:structuredClone(run.manifest.initialSnapshot),manifest:run.manifest,lotContext:run.lotContext??null,environmentState:run.environmentState?structuredClone(run.environmentState):null};compareBusy(true);
  notify('Reproduzindo a execução salva com o manifesto original…');postWorkerMessage({type:run.manifest.type==='riose-configured-comparison'?'replayConfigured':'replayComparison',manifest:run.manifest});
}
$('run-history-select').onchange=()=>renderRunHistory();
$('run-history-replay').onclick=replaySavedRun;
$('run-history-export').onclick=()=>{try{downloadFile('agroville-historico-execucoes.json',exportRunHistory(localStorage),'application/json;charset=utf-8');notify('Cópia do histórico local exportada.');}catch(error){notify('Não foi possível exportar o histórico: '+error.message);}};
$('run-history-clear').onclick=()=>{if(!confirm('Limpar todas as execuções salvas neste navegador? Exporte o histórico antes se quiser guardar uma cópia.'))return;try{clearRunHistory(localStorage);renderRunHistory();notify('Histórico local removido.');}catch(error){notify(error.message);}};
$('manifest-export').onclick=()=>{if(requestCompare||loadingScenario)return;if(!comparisonManifest){notify('Faça ou importe uma comparação antes de exportar o manifesto.');return;}const manifest=comparisonLotContext?createDemoLotManifestEnvelope(comparisonManifest,comparisonLotContext):comparisonManifest;downloadFile('agroville-manifesto-demonstrativo.json',JSON.stringify(manifest,null,2),'application/json;charset=utf-8');};
$('manifest-import').onclick=$('manifest-open').onclick=()=>{if(!requestCompare&&!loadingScenario)$('manifest-file').click();};
$('manifest-file').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file||requestCompare||loadingScenario)return;compareBusy(true);try{const parsed=JSON.parse(await file.text()),envelope=parsed.type==='riose-demo-lot-comparison-envelope'?parsed:null;if(envelope)validateDemoLotManifestEnvelope(envelope);const manifest=envelope?envelope.manifest:parsed,configured=manifest.type==='riose-configured-comparison';if(configured)validateConfiguredComparisonManifest(manifest);else validateComparisonManifest(manifest);setRunning(false);pendingComparison={snapshot:structuredClone(manifest.initialSnapshot),manifest,lotContext:envelope?.lotContext??null,environmentState:null};notify('Manifesto validado. Reproduzindo a comparação salva…');postWorkerMessage({type:configured?'replayConfigured':'replayComparison',manifest});}catch(error){pendingComparison=null;compareBusy(false);notify('Manifesto inválido: '+error.message);}};
function downloadFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function formatRunHistoryBytes(bytes){if(bytes<1024)return `${bytes} B`;const unit=bytes<1024*1024?1024:1024*1024,label=unit===1024?'KiB':'MiB';return `${(bytes/unit).toLocaleString('pt-BR',{maximumFractionDigits:1})} ${label}`;}
$('run-history-select').addEventListener('focus',()=>renderRunHistory());
function rejectWorkerResponse(message){failPendingRun(message);stateRequests.length=0;pending=false;loadingScenario=false;pendingSnapshotAction=null;pendingComparison=null;compareBusy(false);setRunning(false);notify('Resposta inválida do motor: '+message);}
function reportUnexpectedWorkerResponse(message){notify('Resposta inválida do motor: '+message);}
worker.onmessage=e=>{
  let response;
  try{response=normalizeWorkerResponse(e.data);}catch(error){rejectWorkerResponse(error.message);return;}
  if(response.type==='state'){
    if(!['reset','load','snapshot'].includes(stateRequests[0])){reportUnexpectedWorkerResponse(`Unexpected state response for request "${stateRequests[0]??'none'}".`);return;}
    const request=stateRequests.shift(),separated=separateLegacySnapshot(response.state);state=separated.state;snapshotViewState=separated.viewState;viewState=createAnimalViewStateDTO(state.animals,snapshotViewState);animalDrawOrderDirty=true;pending=false;
    $('engine-status').textContent=response.engineImplementation==='riose-core-wasm/0.1.0'?'MOTOR LOCAL · RUST/WASM':'MOTOR LOCAL · JAVASCRIPT';
    if(request==='load'){loadingScenario=false;compareBusy(requestCompare);}
    buildTerrain(state.initialSeed??state.seed);updateUI();renderLotSelection();if(request==='snapshot')completeSnapshotAction();
  }else if(response.type==='view'){
    if(!['configure','select','tick'].includes(stateRequests[0])){reportUnexpectedWorkerResponse(`Unexpected view response for request "${stateRequests[0]??'none'}".`);return;}
    stateRequests.shift();pending=false;applyWorkerView(response);
    $('engine-status').textContent=response.engineImplementation==='riose-core-wasm/0.1.0'?'MOTOR LOCAL · RUST/WASM':'MOTOR LOCAL · JAVASCRIPT';updateUI();
  }else if(response.type==='comparison'){
    if(!pendingComparison){reportUnexpectedWorkerResponse('Unexpected comparison response with no pending comparison.');return;}
    pendingComparison.execution=response.execution;
    showComparison(response.data);
  }
  else if(response.type==='error'){
    const failedCommand=response.error.command;
    let request;
    if(['compare','replayComparison','compareConfigured','replayConfigured'].includes(failedCommand)){
      if(!pendingComparison){reportUnexpectedWorkerResponse(`Unexpected error response for request "${failedCommand}".`);return;}
    }else if(failedCommand){
      if(stateRequests[0]!==failedCommand){reportUnexpectedWorkerResponse(`Unexpected error response for request "${failedCommand}".`);return;}
      request=stateRequests.shift();
    }else if(stateRequests.length)request=stateRequests.shift();
    else if(!pendingComparison){reportUnexpectedWorkerResponse('Unexpected Worker error response.');return;}
    pending=false;if(request==='load')loadingScenario=false;pendingSnapshotAction=null;failPendingRun(response.error.message);
    pendingComparison=null;compareBusy(false);setRunning(false);notify('Erro no motor: '+response.error.message);
  }
};
worker.onerror=()=>{pending=false;loadingScenario=false;pendingComparison=null;failPendingRun('Não foi possível iniciar o motor.');compareBusy(false);setRunning(false);notify('Não foi possível iniciar o motor. Abra o aplicativo por um servidor HTTP.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});
window.addEventListener('pagehide',saveScenarioData);
renderScenarios();renderRunHistory();if(activeScenario())loadScenario(activeScenario());else requestState({type:'snapshot'});
for(const scenario of scenarios){if(scenario.snapshot&&!scenario.snapshotData){encodeScenarioSnapshot(scenario.snapshot).then(snapshotData=>{scenario.snapshotData=snapshotData;delete scenario.snapshot;saveScenarioData();}).catch(()=>{});}}
requestAnimationFrame(draw);
