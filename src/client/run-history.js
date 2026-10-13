import {createComparisonManifest,validateComparisonManifest} from './engine.js';

export const RUN_HISTORY_KEY='agroville-run-history-v1';
export const RUN_HISTORY_VERSION=1;
export const COMPARISON_ENGINE_VERSION='agroville-comparison-v1';
const MAX_RUNS=20;

function sanitizedSnapshot(source){
  const animals=source.animals.map(animal=>({
    id:animal.id,weight:animal.weight,initialWeight:animal.initialWeight,
    energy:animal.energy,thirst:animal.thirst,action:animal.action,patch:animal.patch,
    x:animal.x,y:animal.y,targetX:animal.targetX,targetY:animal.targetY,history:[]
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
    initialSeed:source.initialSeed,locomotionSeed:source.locomotionSeed
  };
}

function cleanError(error){
  let message=String(error?.message??error??'Falha na execução.').split(/[\r\n]/,1)[0].slice(0,180);
  message=message.replace(/(?:bearer\s+)[^\s,;]+/ig,'Bearer [redigido]')
    .replace(/\b(token|secret|password|credential|api[_-]?key)\s*[:=]\s*[^\s,;]+/ig,'$1=[redigido]')
    .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s:]+[\\/])+[^\s:]*/g,'[caminho redigido]');
  return message||'Falha na execução.';
}

function parseRuns(storage){
  let raw;
  try{raw=storage.getItem(RUN_HISTORY_KEY);}catch{throw new Error('O armazenamento local está indisponível.');}
  if(raw===null||raw==='')return [];
  let value;
  try{value=JSON.parse(raw);}catch{throw new Error('O histórico local está corrompido; nenhum registro foi alterado.');}
  if(!value||value.version!==RUN_HISTORY_VERSION||!Array.isArray(value.runs)||value.runs.some(run=>!run||typeof run.id!=='string'||typeof run.timestamp!=='string'||!Number.isFinite(Date.parse(run.timestamp))||!['completed','failed'].includes(run.status))||new Set(value.runs.map(run=>run.id)).size!==value.runs.length)
    throw new Error('O histórico local tem formato inválido; nenhum registro foi alterado.');
  return value.runs;
}

export function listRuns(storage=globalThis.localStorage){
  return [...parseRuns(storage)].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
}

export function getRun(runId,storage=globalThis.localStorage){
  return listRuns(storage).find(run=>run.id===runId)??null;
}

export function createRunRecord({manifest,result,status='completed',error,now=Date.now(),id}){
  if(!manifest||!['completed','failed'].includes(status))throw new Error('Registro de execução inválido.');
  validateComparisonManifest(manifest);
  const snapshot=sanitizedSnapshot(manifest.initialSnapshot);
  const replayManifest=createComparisonManifest(snapshot,manifest.periodDays);
  return {
    id:id??globalThis.crypto?.randomUUID?.()??`run-${now}-${Math.random().toString(36).slice(2)}`,
    timestamp:new Date(now).toISOString(),operation:'comparison',status,
    scenario:{factor:replayManifest.factor,periodDays:replayManifest.periodDays},
    seed:replayManifest.seed,engineVersion:COMPARISON_ENGINE_VERSION,
    manifest:replayManifest,
    ...(status==='completed'?{result}:{error:cleanError(error)}),
    provenance:{source:'local-browser',historyVersion:RUN_HISTORY_VERSION}
  };
}

export function recordRun(run,storage=globalThis.localStorage){
  if(!run||typeof run.id!=='string'||!run.id)throw new Error('Identificador de execução inválido.');
  const runs=parseRuns(storage);
  if(runs.some(item=>item.id===run.id))throw new Error('Este identificador de execução já existe.');
  const next=[run,...runs].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,MAX_RUNS);
  try{storage.setItem(RUN_HISTORY_KEY,JSON.stringify({version:RUN_HISTORY_VERSION,runs:next}));}
  catch{throw new Error('O navegador não conseguiu guardar o histórico. A comparação atual continua disponível.');}
  return run;
}

export function runCompatibility(run){
  if(!run||run.status!=='completed')return {supported:false,reason:'Esta execução não foi concluída e não pode ser reproduzida.'};
  if(run.provenance?.historyVersion!==RUN_HISTORY_VERSION)return {supported:false,reason:'Versão do registro de histórico incompatível com esta instalação.'};
  if(run.engineVersion!==COMPARISON_ENGINE_VERSION)return {supported:false,reason:'Versão do motor incompatível com esta execução.'};
  if(run.manifest?.type!=='agroville-comparison'||run.manifest.version!==1)return {supported:false,reason:'Versão do manifesto não suportada por esta instalação.'};
  try{validateComparisonManifest(run.manifest);return {supported:true,reason:''};}
  catch(error){return {supported:false,reason:error.message};}
}
