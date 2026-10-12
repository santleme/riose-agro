import {ASSUMPTIONS,DEFAULT_CONFIG,FarmEngine,compare} from './engine.js';

export const SCENARIO_PRESET_CATALOG_VERSION = 1;

const defaultInitialState = Object.freeze({seed:2026,animalCount:24,hour:6,config:Object.freeze({...DEFAULT_CONFIG}),pastureKgDMPerPaddock:ASSUMPTIONS.initialPastureKgDM});
const fixedFactors = Object.freeze(['rebanho e pesos iniciais gerados pela mesma semente','dieta','suplementação','clima','estoque inicial de forragem por piquete','horizonte de 30 dias']);

export const SCENARIO_PRESETS = Object.freeze([
  Object.freeze({
    id:'baseline',version:1,name:'Baseline',description:'Reinicia a fazenda demonstrativa no estado inicial reproduzível do motor.',status:'supported',
    initialState:defaultInitialState,intervention:{type:'none'},durationDays:30,seed:2026,constants:fixedFactors,execution:'reset'
  }),
  Object.freeze({
    id:'housing-comparison',version:1,name:'Pasto × confinamento · 30 dias',description:'Compara o pasto de referência ao confinamento usando a comparação já disponível no motor.',status:'supported',
    initialState:defaultInitialState,intervention:{factor:'housing',reference:'pasture',scenario:'barn'},durationDays:30,seed:2026,constants:fixedFactors,execution:'comparison'
  }),
  Object.freeze({
    id:'heat',version:1,name:'Calor',description:'Indisponível: o motor não oferece um efeito de calor executável neste preset.',status:'unsupported',
    initialState:null,intervention:{factor:'weather',value:'hot'},durationDays:null,seed:null,constants:[],execution:null,unavailableReason:'Indisponível: o efeito de calor ainda não está implementado como preset suportado.'
  }),
  Object.freeze({
    id:'reduced-feed',version:1,name:'Redução de alimento',description:'Indisponível: o motor não oferece redução de alimento como intervenção isolada.',status:'unsupported',
    initialState:null,intervention:{factor:'feed-availability',value:'reduced'},durationDays:null,seed:null,constants:[],execution:null,unavailableReason:'Indisponível: redução de alimento não tem suporte isolado no motor atual.'
  }),
  Object.freeze({
    id:'limited-trough-access',version:1,name:'Acesso limitado ao cocho',description:'Indisponível: o motor não modela acesso individual ou limitado ao cocho.',status:'unsupported',
    initialState:null,intervention:{factor:'trough-access',value:'limited'},durationDays:null,seed:null,constants:[],execution:null,unavailableReason:'Indisponível: acesso ao cocho não é representado no motor atual.'
  })
]);

export function validateScenarioPresetCatalog(catalog=SCENARIO_PRESETS){
  if(!Array.isArray(catalog)||catalog.length===0)throw new Error('Catálogo de cenários inválido');
  const ids=new Set();
  for(const preset of catalog){
    if(!preset||typeof preset.id!=='string'||!preset.id||ids.has(preset.id))throw new Error('ID de preset ausente ou duplicado');
    ids.add(preset.id);
    if(!Number.isInteger(preset.version)||preset.version<1||typeof preset.name!=='string'||typeof preset.description!=='string')throw new Error('Metadados de preset inválidos: '+preset.id);
    if(!['supported','unsupported'].includes(preset.status)||!Object.hasOwn(preset,'initialState')||!Object.hasOwn(preset,'intervention')||!Object.hasOwn(preset,'durationDays')||!Object.hasOwn(preset,'seed')||!Array.isArray(preset.constants))throw new Error('Contrato de preset incompleto: '+preset.id);
    if(preset.status==='supported'&&(!preset.initialState||!Number.isInteger(preset.seed)||!Number.isInteger(preset.durationDays)||preset.durationDays<1||!Array.isArray(preset.constants)||!preset.constants.length))throw new Error('Preset suportado incompleto: '+preset.id);
    if(preset.status==='unsupported'&&(preset.execution!==null||typeof preset.unavailableReason!=='string'||!preset.unavailableReason))throw new Error('Preset indisponível sem motivo explícito: '+preset.id);
  }
  return true;
}

export function getScenarioPreset(id,catalog=SCENARIO_PRESETS){
  validateScenarioPresetCatalog(catalog);
  const preset=catalog.find(item=>item.id===id);
  if(!preset)throw new Error('Preset não encontrado: '+id);
  return preset;
}

export function createScenarioPresetSnapshot(id,catalog=SCENARIO_PRESETS){
  const preset=getScenarioPreset(id,catalog);
  if(preset.status!=='supported')throw new Error(preset.unavailableReason);
  if(preset.execution!=='reset'&&preset.execution!=='comparison')throw new Error('Tipo de execução não suportado: '+preset.execution);
  const engine=new FarmEngine(preset.seed,preset.initialState.animalCount);
  return engine.snapshot();
}

export function runScenarioPreset(id,catalog=SCENARIO_PRESETS){
  const preset=getScenarioPreset(id,catalog);
  if(preset.status!=='supported')throw new Error(preset.unavailableReason);
  const snapshot=createScenarioPresetSnapshot(id,catalog);
  if(preset.execution==='reset')return {type:'reset',presetId:preset.id,snapshot};
  if(preset.execution==='comparison')return {type:'comparison',presetId:preset.id,result:compare(snapshot,preset.durationDays),snapshot};
  throw new Error('Tipo de execução não suportado: '+preset.execution);
}

validateScenarioPresetCatalog();
