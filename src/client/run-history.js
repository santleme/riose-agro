import {
  createComparisonManifest,createConfiguredComparisonManifest,
  validateComparisonManifest,validateConfiguredComparisonManifest
} from './engine.js';
import {createLotComparisonManifest,validateLotComparisonManifest,LOT_COMPARISON_MANIFEST_TYPE} from './lot-comparison.js';
import {validateConditionalSupplementCostResult} from './conditional-supplement-cost.js';

export const RUN_HISTORY_KEY='agroville-run-history-v1';
export const RUN_HISTORY_VERSION=1;
export const COMPARISON_ENGINE_VERSION='agroville-comparison-v1';
export const MAX_RUNS=20;
export const MAX_RUN_HISTORY_BYTES=2*1024*1024;

function serializeRuns(runs){
  return JSON.stringify({version:RUN_HISTORY_VERSION,runs});
}

function serializedBytes(value){
  return new TextEncoder().encode(value).byteLength;
}

function newestFirst(a,b){
  const byTimestamp=Date.parse(b.timestamp)-Date.parse(a.timestamp);
  if(byTimestamp)return byTimestamp;
  return a.id<b.id?-1:a.id>b.id?1:0;
}

function sanitizedSnapshot(source){
  const animals=source.animals.map(animal=>({
    id:animal.id,weight:animal.weight,initialWeight:animal.initialWeight,
    energy:animal.energy,thirst:animal.thirst,action:animal.action,patch:animal.patch,
    history:[]
  }));
  const intake={
    pastureKgDM:source.intake.pastureKgDM,
    barnBaseKgDM:source.intake.barnBaseKgDM,
    supplementKgDM:source.intake.supplementKgDM,
    dietExtraKgDM:source.intake.dietExtraKgDM
  };
  const config={
    diet:source.config.diet,
    housing:source.config.housing,
    weather:source.config.weather,
    supplement:source.config.supplement
  };
  return {
    hour:source.hour,animals,pastures:[...source.pastures],intake,
    config,cost:source.cost,events:[],seed:source.seed,
    initialSeed:source.initialSeed
  };
}

function cleanError(error){
  let message=String(error?.message??error??'Falha na execução.').split(/[\r\n]/,1)[0].slice(0,180);
  message=message.replace(/(?:bearer\s+)[^\s,;]+/ig,'Bearer [redigido]')
    .replace(/\b(token|secret|password|credential|api[_-]?key)\s*[:=]\s*[^\s,;]+/ig,'$1=[redigido]')
    .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s:]+[\\/])+[^\s:]*/g,'[caminho redigido]');
  return message||'Falha na execução.';
}

function cleanExecution(execution){
  if(!execution||typeof execution!=='object'||Array.isArray(execution))return undefined;
  if(!['local-rust','local-js'].includes(execution.backend)||typeof execution.fallbackUsed!=='boolean')return undefined;
  const allowed=['backend','engineImplementation','engineVersion','buildId','modelStatus','runId','inputSha256','fallbackUsed','fallbackReason','availability'];
  return Object.fromEntries(allowed.filter(key=>typeof execution[key]==='string'||typeof execution[key]==='boolean')
    .map(key=>[key,typeof execution[key]==='string'?execution[key].slice(0,160):execution[key]]));
}

function readRaw(storage){
  try{return storage.getItem(RUN_HISTORY_KEY);}catch{throw new Error('O armazenamento local está indisponível.');}
}

function parseRawRuns(raw){
  if(raw===null||raw==='')return [];
  let value;
  try{value=JSON.parse(raw);}catch{throw new Error('O histórico local está corrompido; nenhum registro foi alterado.');}
  if(!value||value.version!==RUN_HISTORY_VERSION||!Array.isArray(value.runs)||value.runs.some(run=>!run||typeof run.id!=='string'||typeof run.timestamp!=='string'||!Number.isFinite(Date.parse(run.timestamp))||!['completed','failed'].includes(run.status))||new Set(value.runs.map(run=>run.id)).size!==value.runs.length)
    throw new Error('O histórico local tem formato inválido; nenhum registro foi alterado.');
  return value.runs;
}

function parseRuns(storage){
  return parseRawRuns(readRaw(storage));
}

export function listRuns(storage=globalThis.localStorage){
  return [...parseRuns(storage)].sort(newestFirst);
}

export function getRun(runId,storage=globalThis.localStorage){
  return listRuns(storage).find(run=>run.id===runId)??null;
}

function validateCostAgainstConfiguredRun(conditionalCost,manifest){
  validateConditionalSupplementCostResult(conditionalCost);
  if(conditionalCost.basis.scope!=='experiment'||conditionalCost.basis.animalCount!==manifest.initialSnapshot.animals.length
      ||conditionalCost.basis.days!==manifest.periodDays||conditionalCost.scenarios.length!==2
      ||conditionalCost.scenarios[0].supplementKgDMPerAnimalPerDay!==manifest.scenarios.reference.supplement
      ||conditionalCost.scenarios[1].supplementKgDMPerAnimalPerDay!==manifest.scenarios.scenario.supplement){
    throw new Error('O cálculo econômico não corresponde aos cenários e ao período registrados.');
  }
}

export function createRunRecord({manifest,result,status='completed',error,execution,engineImplementation,conditionalCost,now=Date.now(),id}){
  if(!manifest||!['completed','failed'].includes(status))throw new Error('Registro de execução inválido.');
  const configured=manifest.type==='riose-configured-comparison';
  const lotConfigured=manifest.type===LOT_COMPARISON_MANIFEST_TYPE;
  if(lotConfigured)validateLotComparisonManifest(manifest);
  else if(configured)validateConfiguredComparisonManifest(manifest);
  else validateComparisonManifest(manifest);
  const snapshot=sanitizedSnapshot(manifest.initialSnapshot);
  const replayManifest=lotConfigured
    ?createLotComparisonManifest(snapshot,{
      patchIndex:manifest.lot.patchIndex,
      domainZoneId:manifest.lot.domainZoneId,
      periodDays:manifest.periodDays,
      alternativeSupplementKgDMPerAnimalPerDay:manifest.scenarios.scenario.supplement
    })
    :configured
    ?createConfiguredComparisonManifest(snapshot,{days:manifest.periodDays,referenceConfig:manifest.scenarios.reference,scenarioConfig:manifest.scenarios.scenario})
    :createComparisonManifest(snapshot,manifest.periodDays);
  const safeExecution=cleanExecution(execution);
  if(conditionalCost)validateCostAgainstConfiguredRun(conditionalCost,replayManifest);
  return {
    id:id??globalThis.crypto?.randomUUID?.()??`run-${now}-${Math.random().toString(36).slice(2)}`,
    timestamp:new Date(now).toISOString(),operation:'comparison',status,
    scenario:{factor:replayManifest.factor,periodDays:replayManifest.periodDays},
    seed:replayManifest.seed,engineVersion:COMPARISON_ENGINE_VERSION,
    manifest:replayManifest,
    ...(status==='completed'?{result}:{error:cleanError(error)}),
    ...(conditionalCost?{conditionalCost}:{}),
    provenance:{source:'local-browser',historyVersion:RUN_HISTORY_VERSION},
    ...(safeExecution?{execution:safeExecution}:{}),
    ...(typeof (engineImplementation??execution?.engineImplementation)==='string'&&(engineImplementation??execution.engineImplementation)?{executor:{engineImplementation:engineImplementation??execution.engineImplementation}}:{})
  };
}

export function updateRunConditionalCost(runId,conditionalCost,storage=globalThis.localStorage){
  const runs=parseRuns(storage),index=runs.findIndex(run=>run.id===runId);
  if(index<0)throw new Error('A execução salva não foi encontrada.');
  const run=runs[index];
  if(conditionalCost)validateCostAgainstConfiguredRun(conditionalCost,run.manifest);
  const updated={...run};
  if(conditionalCost)updated.conditionalCost=conditionalCost;else delete updated.conditionalCost;
  const next=[...runs];next[index]=updated;
  const serialized=serializeRuns(next);
  if(serializedBytes(serialized)>MAX_RUN_HISTORY_BYTES)throw new Error('O cálculo econômico excede o limite local do histórico.');
  try{storage.setItem(RUN_HISTORY_KEY,serialized);}catch{throw new Error('O navegador não conseguiu atualizar o histórico local.');}
  return updated;
}

export function recordRun(run,storage=globalThis.localStorage){
  if(!run||typeof run.id!=='string'||!run.id)throw new Error('Identificador de execução inválido.');
  const runs=parseRuns(storage);
  if(runs.some(item=>item.id===run.id))throw new Error('Este identificador de execução já existe.');
  const candidates=[run,...runs].sort(newestFirst);
  const singleRun=serializeRuns([run]);
  if(serializedBytes(singleRun)>MAX_RUN_HISTORY_BYTES)
    throw new Error('A execução é grande demais para o limite local de 2 MiB. O histórico anterior foi preservado e a comparação atual continua disponível.');

  const next=[];
  for(const candidate of candidates){
    if(next.length===MAX_RUNS)break;
    const proposed=[...next,candidate];
    if(serializedBytes(serializeRuns(proposed))<=MAX_RUN_HISTORY_BYTES)next.push(candidate);
  }
  if(!next.some(item=>item.id===run.id))
    throw new Error('A execução não coube nos limites do histórico. O histórico anterior foi preservado e a comparação atual continua disponível.');

  try{storage.setItem(RUN_HISTORY_KEY,serializeRuns(next));}
  catch{throw new Error('O navegador não conseguiu guardar o histórico. A comparação atual continua disponível.');}
  return run;
}

export function getRunHistoryStats(storage=globalThis.localStorage){
  const raw=readRaw(storage),count=parseRawRuns(raw).length;
  return {count,bytes:raw===null?0:serializedBytes(raw),maxRuns:MAX_RUNS,maxBytes:MAX_RUN_HISTORY_BYTES};
}

export function exportRunHistory(storage=globalThis.localStorage){
  const raw=readRaw(storage);
  return raw===null||raw===''?serializeRuns([]):raw;
}

export function clearRunHistory(storage=globalThis.localStorage){
  try{storage.removeItem(RUN_HISTORY_KEY);}
  catch{throw new Error('O navegador não conseguiu limpar o histórico local.');}
}

export function runCompatibility(run){
  if(!run||run.status!=='completed')return {supported:false,reason:'Esta execução não foi concluída e não pode ser reproduzida.'};
  if(run.provenance?.historyVersion!==RUN_HISTORY_VERSION)return {supported:false,reason:'Versão do registro de histórico incompatível com esta instalação.'};
  if(run.engineVersion!==COMPARISON_ENGINE_VERSION)return {supported:false,reason:'Versão do motor incompatível com esta execução.'};
  if(!(['agroville-comparison','riose-configured-comparison',LOT_COMPARISON_MANIFEST_TYPE].includes(run.manifest?.type))||run.manifest.version!==1)return {supported:false,reason:'Versão do manifesto não suportada por esta instalação.'};
  try{
    if(run.manifest.type===LOT_COMPARISON_MANIFEST_TYPE)validateLotComparisonManifest(run.manifest);
    else if(run.manifest.type==='riose-configured-comparison')validateConfiguredComparisonManifest(run.manifest);
    else validateComparisonManifest(run.manifest);
    if(run.conditionalCost)validateCostAgainstConfiguredRun(run.conditionalCost,run.manifest);
    return {supported:true,reason:''};
  }
  catch(error){return {supported:false,reason:error.message};}
}
