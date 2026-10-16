import {FarmEngine,FARM_ENGINE_VERSION,ASSUMPTIONS,metrics,validateConfiguredComparisonManifest} from './engine.js';

export const EXPERIMENT_INTENT_VERSION='riose-experiment-intent/v1';
export const SUPPORTED_EXPERIMENT_DAYS=Object.freeze([1,7,15,30,60,90,180,365]);
const MAX_PROMPT_LENGTH=1200;
const configDefaults=Object.freeze({diet:'pasture',housing:'pasture',weather:'normal',supplement:0});
const ACTIONS=Object.freeze(['grazing','feeding','drinking','resting']);
const REASONS=Object.freeze(['pasture_housing','barn_housing','thirst_threshold','rest_window']);
const HOUSING=Object.freeze(['pasture','barn']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const numberFrom=(value)=>Number(value.replace(',','.'));

function matchNumber(text,pattern){const found=text.match(pattern);return found?numberFrom(found[1]):null;}
function supplementPairsFrom(text){
  return [...text.matchAll(/(?:from|de)\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?(?:\s*(?:dm|ms))?\s*(?:to|para|a)\s*(\d+(?:[.,]\d+)?)|(?:compare(?:d)?\s+)?(\d+(?:[.,]\d+)?)\s*(?:kg\s*(?:dm|ms)?\s*)?(?:with|versus|vs\.?)\s*(\d+(?:[.,]\d+)?)|compare(?:d)?\s+(?:(?:supplement(?:ation)?|suplementa(?:ção|cao)|suplemento)\s+)?(\d+(?:[.,]\d+)?)\s*(?:kg\s*(?:dm|ms)?\s*)?(?:and|e|,)\s*(\d+(?:[.,]\d+)?)\s*(?=(?:kg\s*)?(?:dm|ms|dry\s+matter|mat[eé]ria\s+seca)\s*(?:per|por)\s*(?:animal|head|cabeça))/gi)]
    .map(item=>item[1]?[numberFrom(item[1]),numberFrom(item[2])]:item[3]?[numberFrom(item[3]),numberFrom(item[4])]:[numberFrom(item[5]),numberFrom(item[6])]);
}
function assumptionsFor({population,duration,breed,weather,baseline,intervention,provided={}}){
  return [
    {field:'population.count',value:population.count,origin:provided.count?'user prompt':'engine default',kind:provided.count?'detected':'assumption'},
    {field:'population.breed',value:breed,origin:breed?'user prompt':'not specified',kind:breed?'detected':'unavailable'},
    {field:'duration.days',value:duration.days,origin:provided.days?'user prompt':'engine default',kind:provided.days?'detected':'assumption'},
    {field:'weather',value:weather,origin:provided.weather?'user prompt':'engine default',kind:provided.weather?'detected':'assumption'},
    {field:'baseline.supplement',value:baseline.supplement,unit:'kg DM/animal/day',origin:provided.supplement?'user prompt':'engine default'},
    {field:'intervention.supplement',value:intervention.supplement,unit:'kg DM/animal/day',origin:provided.supplement?'user prompt':'needs clarification'}
  ];
}

/** A deliberately narrow parser. It extracts only the fields supported by the demonstrative FarmEngine. */
export function interpretExperimentPrompt(prompt){
  if(typeof prompt!=='string'||!prompt.trim())throw new TypeError('Describe an experiment first.');
  if(prompt.length>MAX_PROMPT_LENGTH)throw new RangeError(`Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
  const text=prompt.toLowerCase();
  const count=matchNumber(text,/(\d+(?:[.,]\d+)?)\s*(?:nelore\s+)?(?:bovinos?|cattle|animals?|cows?|head|animais|cabeças)/i);
  const days=matchNumber(text,/(\d+(?:[.,]\d+)?)\s*(?:days?|dias?)/i);
  const supplements=supplementPairsFrom(text);
  const singleSupplement=matchNumber(text,/(\d+(?:[.,]\d+)?)\s*kg\s*(?:dm|ms)?\s*(?:of\s+)?(?:supplement|suplemento)?\s*(?:per|por)\s*(?:animal|head|cabeça)/i);
  const supplementPair=supplements.at(-1);
  const weather=/\b(hot|heat|calor|quente)\b/.test(text)?'hot':/\b(rain|rainy|chuv|chuva)\b/.test(text)?'rain':'normal';
  const breed=/\bnelore\b/.test(text)?'Nelore':null;
  const unsupportedRequests=[];
  if(/\b(adg|gmd|weight gain|ganho de peso|milk|leite|fertility|fertilidade|emission|emiss[aã]o)\b/.test(text))unsupportedRequests.push('Requested biological outcome is not predicted by this engine.');
  if(/\b(confidence|probability|probabilidade|intervalo preditivo|prediction interval)\b/.test(text))unsupportedRequests.push('The engine does not provide calibrated probabilities or prediction intervals.');
  const missingInputs=[];
  if(supplements.length>1)unsupportedRequests.push('Only one supplement intervention can be compared per run.');
  const resolvedCount=count===null?24:count;
  const resolvedDays=days===null?30:days;
  const baselineSupplement=supplementPair?.[0]??0;
  const interventionSupplement=supplementPair?.[1]??(singleSupplement!==null?singleSupplement:null);
  if(interventionSupplement===null)missingInputs.push('supplement intervention (for example, from 0.5 to 1.5 kg DM per animal per day)');
  if(count!==null&&(!Number.isInteger(count)||count<1||count>10000))unsupportedRequests.push('Population size must be an integer from 1 to 10,000.');
  if(days!==null&&(!Number.isInteger(days)||days<1||days>365))unsupportedRequests.push('Experiment duration must be an integer from 1 to 365 days.');
  if([baselineSupplement,interventionSupplement].some(value=>value!==null&&(!finite(value)||value<0||value>4)))unsupportedRequests.push('Supplement values must be from 0 to 4 kg DM per animal per day.');
  if(interventionSupplement!==null&&baselineSupplement===interventionSupplement)missingInputs.push('a supplement value that differs from the baseline');
  const population={count:resolvedCount,breed};
  const duration={days:resolvedDays};
  const baseline={...configDefaults,supplement:baselineSupplement};
  const intervention={...baseline,supplement:interventionSupplement??baselineSupplement};
  const specification={version:EXPERIMENT_INTENT_VERSION,population,duration,baseline,intervention,target_scope:'herd',requested_outputs:['population_states','mean_weight','pasture_stock','individual_history'],assumptions:[],missing_inputs:missingInputs,unsupported_requests:unsupportedRequests};
  // The narrow parser permits only a single explicit weather condition shared by both arms.
  specification.baseline.weather=weather;specification.intervention.weather=weather;
  specification.assumptions=assumptionsFor({population,duration,breed,weather,baseline,intervention,provided:{count:count!==null,days:days!==null,weather:weather!=='normal'||/\b(normal|normalmente)\b/.test(text),supplement:supplementPair!==undefined||singleSupplement!==null}});
  validateExperimentSpecification(specification);
  return specification;
}

export function validateExperimentSpecification(spec){
  const keys=['version','population','duration','baseline','intervention','target_scope','requested_outputs','assumptions','missing_inputs','unsupported_requests'];
  if(!spec||typeof spec!=='object'||Array.isArray(spec)||Object.keys(spec).sort().join('|')!==keys.sort().join('|'))throw new TypeError('Experiment intent has unknown or missing fields.');
  if(spec.version!==EXPERIMENT_INTENT_VERSION)throw new TypeError('Unsupported experiment intent version.');
  if(Object.keys(spec.population??{}).sort().join('|')!=='breed|count'||Object.keys(spec.duration??{}).join('|')!=='days')throw new TypeError('Population or duration contains unknown or missing fields.');
  if(!Number.isInteger(spec.population?.count)||spec.population.count<1||spec.population.count>10000)throw new RangeError('Population count must be from 1 to 10,000.');
  if(spec.population.breed!==null&&(typeof spec.population.breed!=='string'||spec.population.breed.length>48))throw new TypeError('Breed metadata must be a short string or null.');
  if(!Number.isInteger(spec.duration?.days)||spec.duration.days<1||spec.duration.days>365)throw new RangeError('Experiment duration must be from 1 to 365 days.');
  for(const config of [spec.baseline,spec.intervention]){
    if(Object.keys(config??{}).sort().join('|')!==['diet','housing','weather','supplement'].sort().join('|'))throw new TypeError('Configuration contains unknown or missing fields.');
    if(!config||!['pasture','balanced','concentrate'].includes(config.diet)||!['pasture','barn'].includes(config.housing)||!['normal','hot','rain'].includes(config.weather)||!finite(config.supplement)||config.supplement<0||config.supplement>4)throw new RangeError('Experiment includes a configuration outside the supported engine domain.');
  }
  if(spec.target_scope!=='herd')throw new TypeError('Only herd-level experiment scope is supported.');
  const differences=['diet','housing','supplement','weather'].filter(key=>spec.baseline[key]!==spec.intervention[key]).length;
  if((spec.missing_inputs.length===0&&differences!==1)||(spec.missing_inputs.length>0&&differences>1))throw new RangeError('Comparison arms must differ in at most one supported intervention until required inputs are supplied.');
  const outputs=['population_states','mean_weight','pasture_stock','individual_history','feed_intake','illustrative_cost'];
  if(!Array.isArray(spec.requested_outputs)||spec.requested_outputs.length>6||spec.requested_outputs.some(value=>!outputs.includes(value)))throw new TypeError('Experiment requested_outputs contains an unsupported output.');
  if(!Array.isArray(spec.assumptions)||spec.assumptions.length>16)throw new TypeError('Experiment assumptions must be a bounded list.');
  const assumptionFields=['population.count','population.breed','duration.days','weather','baseline.supplement','intervention.supplement'];
  for(const item of spec.assumptions){
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['field','value','unit','origin','kind'].includes(key))||!assumptionFields.includes(item.field)||!['user prompt','engine default','not specified','needs clarification'].includes(item.origin)||(item.kind!==undefined&&!['detected','assumption','unavailable'].includes(item.kind))||(item.unit!==undefined&&item.unit!==null&&(typeof item.unit!=='string'||item.unit.length>40))||!(item.value===null||typeof item.value==='string'&&item.value.length<=120||typeof item.value==='number'&&Number.isFinite(item.value)))throw new TypeError('Experiment assumption provenance is invalid.');
  }
  for(const field of ['missing_inputs','unsupported_requests'])if(!Array.isArray(spec[field])||spec[field].length>16||spec[field].some(item=>typeof item!=='string'||item.length>240))throw new TypeError(`Experiment ${field} must be a bounded list of short strings.`);
  return true;
}

export function amendmentFromPrompt(spec,prompt){
  validateExperimentSpecification(spec);
  if(typeof prompt!=='string'||prompt.length>400)throw new RangeError('Update must be 400 characters or fewer.');
  const text=prompt.toLowerCase();let next=structuredClone(spec);let changed=false;
  const days=matchNumber(text,/(\d+(?:[.,]\d+)?)\s*(?:days?|dias?)/i);
  const count=matchNumber(text,/(\d+(?:[.,]\d+)?)\s*(?:bovinos?|cattle|animals?|head|animais|cabeças)/i);
  const pair=supplementPairsFrom(text).at(-1);
  const one=matchNumber(text,/(\d+(?:[.,]\d+)?)\s*kg\s*(?:dm|ms)?\s*(?:of\s+)?(?:supplement|suplemento)?\s*(?:per|por)\s*(?:animal|head|cabeça)/i);
  if(days!==null){next.duration.days=days;changed=true;}
  if(count!==null){next.population.count=count;changed=true;}
  if(pair){next.baseline.supplement=pair[0];next.intervention.supplement=pair[1];changed=true;}
  else if(one!==null){next.intervention.supplement=one;changed=true;}
  if(/\b(hot|heat|calor|quente)\b/.test(text)){next.baseline.weather='hot';next.intervention.weather='hot';changed=true;}
  if(/\b(rain|rainy|chuv|chuva)\b/.test(text)){next.baseline.weather='rain';next.intervention.weather='rain';changed=true;}
  if(/\b(normal|temperate|ameno)\b/.test(text)){next.baseline.weather='normal';next.intervention.weather='normal';changed=true;}
  if(/\b(rain|rainy|chuv|chuva)\b/.test(text)){next.baseline.weather='rain';next.intervention.weather='rain';changed=true;}
  if(/\b(normal|temperate|ameno)\b/.test(text)){next.baseline.weather='normal';next.intervention.weather='normal';changed=true;}
  if(!changed)throw new Error('I can update population size, duration, weather, or supplement. Please name one of those values.');
  if(pair||one!==null){
    next.missing_inputs=spec.missing_inputs.filter(item=>!item.toLowerCase().includes('supplement'));
    if(next.baseline.supplement===next.intervention.supplement)next.missing_inputs.push('a supplement value that differs from the baseline');
  }
  next.assumptions=assumptionsFor({...next,population:{...next.population},duration:{...next.duration},breed:next.population.breed,weather:next.baseline.weather,baseline:next.baseline,intervention:next.intervention,provided:{count:count!==null||spec.population.count!==24,days:days!==null||spec.duration.days!==30,weather:next.baseline.weather!=='normal',supplement:pair!==null||one!==null||spec.assumptions.some(item=>item.field==='baseline.supplement'&&item.origin==='user prompt')}});
  validateExperimentSpecification(next);
  return next;
}

const checkpointDays=days=>[0,1,7,15,30,60,90,180,days].filter((day,index,all)=>day<=days&&all.indexOf(day)===index).sort((a,b)=>a-b);
function compactPopulation(snapshot,includeHistory=false){
  return snapshot.animals.map(animal=>({id:animal.id,name:animal.name??`Animal ${animal.id}`,weight:animal.weight,initialWeight:animal.initialWeight,energy:animal.energy,thirst:animal.thirst,action:animal.action,patch:animal.patch,...(includeHistory?{history:animal.history.map(record=>[record.hour,ACTIONS.indexOf(record.action),REASONS.indexOf(record.reason),record.observed.hour,record.observed.thirst,HOUSING.indexOf(record.observed.housing)])}:{})}));
}

/** Expand the compact history tuple only for the animal currently being inspected. */
export function expandActivityHistory(history=[]){
  if(!Array.isArray(history))throw new TypeError('Animal history must be an array.');
  return history.map(record=>{
    if(!Array.isArray(record))return {...record};
    if(record.length!==6||!Number.isFinite(record[0])||!ACTIONS[record[1]]||!REASONS[record[2]]||!Number.isFinite(record[3])||!Number.isFinite(record[4])||!HOUSING[record[5]])throw new TypeError('Compact activity history record is invalid.');
    return {hour:record[0],action:ACTIONS[record[1]],reason:REASONS[record[2]],observed:{hour:record[3],thirst:record[4],housing:HOUSING[record[5]]}};
  });
}

/** Run the real deterministic JS FarmEngine in both arms and retain only named day checkpoints. */
export function runPopulationComparison(snapshot,{days,referenceConfig,scenarioConfig,onProgress}={}){
  if(!Number.isInteger(days)||days<1||days>365)throw new RangeError('Experiment duration must be from 1 to 365 days.');
  const factorKeys=['diet','housing','supplement','weather'];
  const differences=factorKeys.filter(key=>referenceConfig?.[key]!==scenarioConfig?.[key]);
  if(differences.length!==1)throw new Error('Comparison arms must differ in exactly one supported intervention.');
  if(snapshot?.animals?.some(animal=>typeof animal.name!=='string')){
    snapshot=structuredClone(snapshot);
    for(const animal of snapshot.animals)animal.name??=`Animal ${animal.id}`;
  }
  const points=checkpointDays(days);
  const reference=FarmEngine.from(snapshot),scenario=FarmEngine.from(snapshot);
  reference.configure(referenceConfig);scenario.configure(scenarioConfig);
  const timeline=[],rows=[],startMetrics=metrics(snapshot),baseCost=snapshot.cost,pointsSet=new Set(points);
  const intakeDelta=current=>({
    pastureKgDM:current.pastureKgDM-startMetrics.intake.pastureKgDM,
    barnBaseKgDM:current.barnBaseKgDM-startMetrics.intake.barnBaseKgDM,
    supplementKgDM:current.supplementKgDM-startMetrics.intake.supplementKgDM,
    dietExtraKgDM:current.dietExtraKgDM-startMetrics.intake.dietExtraKgDM,
    totalKgDM:current.totalKgDM-startMetrics.intake.totalKgDM
  });
  for(let day=0;day<=days;day++){
    if(day){reference.tick(24);scenario.tick(24);}
    const refState=reference.snapshot(),altState=scenario.snapshot();
    const refMetrics=metrics(refState),altMetrics=metrics(altState);
    const referenceIntake=intakeDelta(refMetrics.intake),scenarioIntake=intakeDelta(altMetrics.intake);
    rows.push({day,referenceWeight:refMetrics.weight,scenarioWeight:altMetrics.weight,
      referenceCost:refMetrics.cost-baseCost,scenarioCost:altMetrics.cost-baseCost,
      referenceConsumptionKgDM:referenceIntake.totalKgDM,scenarioConsumptionKgDM:scenarioIntake.totalKgDM,
      referenceIntakeBySourceKgDM:referenceIntake,scenarioIntakeBySourceKgDM:scenarioIntake,
      referencePastureKgDM:refMetrics.pasture,scenarioPastureKgDM:altMetrics.pasture,
      referencePastureByPaddock:refMetrics.pastureByPaddock,scenarioPastureByPaddock:altMetrics.pastureByPaddock});
    if(pointsSet.has(day))timeline.push({day,reference:compactPopulation(refState,day===days),scenario:compactPopulation(altState,day===days),referencePastureKgDM:refMetrics.pasture,scenarioPastureKgDM:altMetrics.pasture});
    if(onProgress)onProgress({day,days});
  }
  const comparison={engineVersion:FARM_ENGINE_VERSION,days,startWeight:startMetrics.weight,initialConfig:{...snapshot.config},herdSize:snapshot.animals.length,
    initialPastureByPaddock:[...snapshot.pastures],comparisonFactor:differences[0],seed:Number.isInteger(snapshot.initialSeed)?snapshot.initialSeed:snapshot.seed,
    referenceConfig:{...referenceConfig},scenarioConfig:{...scenarioConfig},rows,reference:reference.metrics(),scenario:scenario.metrics(),assumptions:{...ASSUMPTIONS},validated:false};
  return {intentVersion:EXPERIMENT_INTENT_VERSION,observationFormat:'riose-population-observations/v1-compact-history',comparison,timeline,observationGranularity:'daily engine state, retained at days 0, 1, 7, 15, 30, 60, 90, 180 and final day when applicable',individualIntakeAvailable:false};
}

/** Reconstruct one exact deterministic parent arm checkpoint from its persisted start state. */
export function restorePopulationCheckpoint(parentManifest,{checkpointDay,sourceArm}={}){
  validateConfiguredComparisonManifest(parentManifest);
  if(!Number.isInteger(checkpointDay)||checkpointDay<0||checkpointDay>=parentManifest.periodDays)throw new RangeError('A branch must start before the parent experiment’s final day.');
  if(!['reference','scenario'].includes(sourceArm))throw new TypeError('Choose the baseline or intervention path to branch from.');
  const sourceConfig=parentManifest.scenarios[sourceArm],engine=FarmEngine.from(parentManifest.initialSnapshot);
  engine.configure(sourceConfig);
  if(checkpointDay)engine.tick(checkpointDay*24);
  return engine.snapshot();
}

/** Run a new one-factor counterfactual from a checkpoint restored from the parent manifest. */
export function runPopulationBranch(parentManifest,{checkpointDay,sourceArm,branchConfig,onProgress,onCheckpoint}={}){
  const checkpoint=restorePopulationCheckpoint(parentManifest,{checkpointDay,sourceArm});
  onCheckpoint?.(checkpoint);
  const sourceConfig=parentManifest.scenarios[sourceArm],factorKeys=['diet','housing','supplement','weather'];
  const differences=factorKeys.filter(key=>sourceConfig[key]!==branchConfig?.[key]);
  if(differences.length!==1)throw new Error('A branch must change exactly one supported intervention from its selected path.');
  const days=parentManifest.periodDays-checkpointDay;
  const result=runPopulationComparison(checkpoint,{days,referenceConfig:sourceConfig,scenarioConfig:branchConfig,onProgress});
  result.timeline=result.timeline.map(point=>({...point,day:point.day+checkpointDay}));
  result.comparison={...result.comparison,days,parentHorizonDays:parentManifest.periodDays,branchStartDay:checkpointDay,
    rows:result.comparison.rows.map(row=>({...row,day:row.day+checkpointDay}))};
  result.branch={type:'riose-population-branch/v1',checkpointDay,sourceArm,sourceConfig:{...sourceConfig},branchConfig:{...branchConfig},
    horizonDay:parentManifest.periodDays,seed:parentManifest.seed,engineVersion:parentManifest.engineVersion};
  return result;
}
