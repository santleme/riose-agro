import {METABOLISM_GAIN_FACTOR,METABOLISM_MAINTENANCE_KG_DM,updateMetabolismJS} from './metabolism-wasm.js';









import {DEFAULT_WEATHER, WEATHER_VALUES, getEnvironmentalStress, getWeatherRules, isWeather} from './environment-model.js';
import {calculateFeeding} from './feeding-model.js';

// All constants are illustrative assumptions, not fitted animal nutrition equations.
export const ASSUMPTIONS = {baseDemandKgDM:8,dailyPastureGrowthKgDM:35,initialPastureKgDM:1800,supplementPrice:1.8,balancedPrice:1.6,concentratePrice:2.1,maintenanceKgDM:METABOLISM_MAINTENANCE_KG_DM,gainFactor:METABOLISM_GAIN_FACTOR};
export const DEFAULT_CONFIG        = {diet:'pasture',housing:'pasture',weather:DEFAULT_WEATHER,supplement:0};
const names=['Aurora','Bento','Cacau','Dália','Estrela','Figo','Gaia','Hugo','Íris','Joca','Kiara','Luna','Milo','Nina','Oliva','Pingo','Quinoa','Rubi','Sol','Teca','Uva','Vento','Wally','Zara'];
const clamp=(v       ,min       ,max       )=>Math.max(min,Math.min(max,v));
const patchBounds = [{x:35,y:45,w:135,h:100},{x:200,y:45,w:135,h:100},{x:35,y:180,w:135,h:100},{x:200,y:180,w:135,h:100}];
const RNG_MULTIPLIER=1664525;
const RNG_INCREMENT=1013904223;
const LOCOMOTION_SEED_SALT=0x9e3779b9;
function deriveLocomotionSeed(seed){return (Math.imul((seed>>>0)^LOCOMOTION_SEED_SALT,RNG_MULTIPLIER)+RNG_INCREMENT)>>>0;}
function advanceRandom(state,key){state[key]=(Math.imul(RNG_MULTIPLIER,state[key])+RNG_INCREMENT)>>>0;return state[key]/4294967296;}
export class FarmEngine {
  state         ;
  constructor(seed=2026,count=24){
    if(!Number.isInteger(count)||count<1||count>10000)throw new Error('Animal count must be 1–10000');
    this.state={hour:6,animals:[],pastures:Array(4).fill(ASSUMPTIONS.initialPastureKgDM),intake:{pastureKgDM:0,barnBaseKgDM:0,supplementKgDM:0,dietExtraKgDM:0},config:{...DEFAULT_CONFIG},cost:0,events:[{hour:6,text:'Fazenda iniciada. Os animais estão no pasto.'}],seed:seed>>>0,initialSeed:seed>>>0,locomotionSeed:deriveLocomotionSeed(seed)};
    for(let i=0;i<count;i++){const weight=330+this.random()*70;const patch=i%4;const b=patchBounds[patch];const x=b.x+10+this.randomLocomotion()*(b.w-20),y=b.y+10+this.randomLocomotion()*(b.h-20);const animal={id:i+1,name:names[i%names.length]+(i>=names.length?' '+(i+1):''),weight,initialWeight:weight,energy:75,thirst:20,action:'grazing',patch,x,y,targetX:x,targetY:y,history:[]};this.state.animals.push(animal);this.recordActivity(animal,'pasture_housing',20,false);}
  }
  random(){return advanceRandom(this.state,'seed');}
  randomLocomotion(){return advanceRandom(this.state,'locomotionSeed');}
  log(text       ,animalId        ){this.state.events.unshift({hour:this.state.hour,text,...(animalId===undefined?{}:{animalId})});this.state.events.length=Math.min(this.state.events.length,100);}
  recordActivity(animal,reason,observedThirst=animal.thirst,announce=true){
    const record={hour:this.state.hour,action:animal.action,reason,observed:{hour:this.state.hour%24,thirst:observedThirst,housing:this.state.config.housing}};
    animal.history??=[];
    if(animal.history.length<40){animal.history.push(record);animal.historyNext=animal.history.length%40;}
    else if(animal.history.length===40){const next=animal.historyNext??0;animal.history[next]=record;animal.historyNext=(next+1)%40;}
    else{animal.history.push(record);animal.history.shift();}
    const activity={grazing:'pastando',feeding:'no cocho',drinking:'bebendo água',resting:'descansando'}[animal.action];
    if(announce)this.log(animal.name+': '+activity+'.',animal.id);
  }
  historyFor(animal){
    const history=animal?.history??[];
    if(history.length<40)return history;
    const next=animal.historyNext??0;
    return next?history.slice(next).concat(history.slice(0,next)):history;
  }
  configure(patch                ){
    const previous=this.state.config;
    const c={...previous,...patch};
    if(!['pasture','balanced','concentrate'].includes(c.diet)||!['pasture','barn'].includes(c.housing)||!isWeather(c.weather)||!Number.isFinite(c.supplement)||c.supplement<0||c.supplement>4)throw new Error('Invalid configuration');
    this.state.config=c;
    if(c.housing!==previous.housing){for(const a of this.state.animals){this.place(a);}this.log(c.housing==='barn'?'Rebanho transferido para o confinamento.':'Rebanho voltou ao pasto.');}
    if(c.diet!==previous.diet)this.log('Dieta alterada: '+({pasture:'volumoso / pasto',balanced:'balanceada',concentrate:'concentrado'}[c.diet])+'.');
    if(c.supplement!==previous.supplement)this.log('Suplementação: '+c.supplement+' kg de MS/animal/dia.');
    if(c.weather!==previous.weather)this.log('Clima alterado: '+getWeatherRules(c.weather).label+'.');
  }
  place(a       ){const b=this.state.config.housing==='barn'?{x:392,y:186,w:132,h:98}:patchBounds[a.patch];a.x=b.x+10+this.randomLocomotion()*(b.w-20);a.y=b.y+10+this.randomLocomotion()*(b.h-20);a.targetX=a.x;a.targetY=a.y;}
  tick(hours=1,metabolismKernel=updateMetabolismJS,includeSnapshot=true,feedingModel=calculateFeeding){
    if(!Number.isInteger(hours)||hours<1||hours>8760)throw new Error('Tick hours must be 1–8760');
    const useBatchKernel=metabolismKernel!==updateMetabolismJS;
    const metabolismInput=useBatchKernel?new Float64Array(this.state.animals.length*4):null;
    const metabolismOutput=useBatchKernel?new Float64Array(this.state.animals.length*2):null;
    for(let step=0;step<hours;step++){
      const s=this.state,c=s.config;s.hour++;
      const time=s.hour%24;const environment=getWeatherRules(c.weather);
      const heat=environment.heatMultiplier;
      for(let p=0;p<4;p++)s.pastures[p]=Math.min(2400,s.pastures[p]+ASSUMPTIONS.dailyPastureGrowthKgDM*environment.pastureGrowthMultiplier/24);
      for(let animalIndex=0;animalIndex<s.animals.length;animalIndex++){
        const a=s.animals[animalIndex];
        const previous=a.action;
        a.thirst=clamp(a.thirst+environment.thirstPerHour,0,100);
        const observedThirst=a.thirst;
        const reason=time<6||time>=21?'rest_window':observedThirst>65?'thirst_threshold':c.housing==='pasture'?'pasture_housing':'barn_housing';
        a.action=reason==='rest_window'?'resting':reason==='thirst_threshold'?'drinking':reason==='pasture_housing'?'grazing':'feeding';
        if(a.action==='drinking')a.thirst=12;
        const feeding=feedingModel({weight:a.weight,housing:c.housing,heatFactor:heat,pastureAvailableKgDM:s.pastures[a.patch],diet:c.diet,supplementKgDMPerDay:c.supplement,assumptions:ASSUMPTIONS});
        if(c.housing==='pasture')s.pastures[a.patch]=feeding.pastureAfterFeedingKgDM;
        else s.cost+=feeding.barnBaseCost;
        s.cost+=feeding.additionalFeedCost;
        s.intake??={pastureKgDM:0,barnBaseKgDM:0,supplementKgDM:0,dietExtraKgDM:0};
        s.intake.pastureKgDM+=feeding.forageKgDM;s.intake.barnBaseKgDM+=feeding.barnBaseFeedKgDM;s.intake.supplementKgDM+=feeding.supplementKgDM;s.intake.dietExtraKgDM+=feeding.dietExtraKgDM;
        const energyIntake=feeding.energyIntakeKgDM;
        if(useBatchKernel){
          const metabolismOffset=animalIndex*4;
          metabolismInput[metabolismOffset]=a.weight;
          metabolismInput[metabolismOffset+1]=a.energy;
          metabolismInput[metabolismOffset+2]=energyIntake;
          metabolismInput[metabolismOffset+3]=a.action==='resting'?1:0;
        }else{
          const gain=(energyIntake-ASSUMPTIONS.maintenanceKgDM*(a.weight/360)/24)*ASSUMPTIONS.gainFactor;
          a.weight=Math.max(200,a.weight+gain);
          a.energy=clamp(a.energy+(a.action==='resting'?5:energyIntake*4-1.5),0,100);
        }
        if(a.action!==previous)this.recordActivity(a,reason,observedThirst);
        const b=c.housing==='barn'?{x:392,y:186,w:132,h:98}:patchBounds[a.patch];
        a.targetX=b.x+10+this.randomLocomotion()*(b.w-20);a.targetY=b.y+10+this.randomLocomotion()*(b.h-20);
        a.x=clamp(a.x+(a.targetX-a.x)*0.15,b.x+8,b.x+b.w-8);a.y=clamp(a.y+(a.targetY-a.y)*0.15,b.y+8,b.y+b.h-8);
      }
      if(useBatchKernel){
        const metabolismResults=metabolismKernel(metabolismInput,s.animals.length,metabolismOutput);
        if(metabolismResults.length!==s.animals.length*2)throw new Error('Metabolism kernel returned an invalid batch length');
        for(let animalIndex=0;animalIndex<s.animals.length;animalIndex++){
          const a=s.animals[animalIndex],offset=animalIndex*2;
          a.weight=metabolismResults[offset];a.energy=metabolismResults[offset+1];
        }
      }
      if(time===6)this.log('Novo dia: peso médio '+this.metrics().weight.toFixed(1)+' kg.');
    }
    return includeSnapshot?this.snapshot():undefined;
  }
  snapshot(){
    const snapshot=structuredClone(this.state);
    for(const animal of snapshot.animals){
      const next=animal.historyNext??0;
      if(animal.history?.length===40&&next)animal.history=animal.history.slice(next).concat(animal.history.slice(0,next));
      delete animal.historyNext;
    }
    return snapshot;
  }
  metrics()         {return metrics(this.state);}
  static from(snapshot         ){const engine=new FarmEngine(1,1);engine.state=structuredClone(snapshot);if(!Number.isInteger(engine.state.initialSeed))engine.state.initialSeed=engine.state.seed>>>0;else engine.state.initialSeed>>>=0;if(!Number.isInteger(engine.state.locomotionSeed))engine.state.locomotionSeed=deriveLocomotionSeed(engine.state.seed);else engine.state.locomotionSeed>>>=0;return engine;}
}
export function metrics(s         )        {const n=s.animals.length,intake=s.intake??{pastureKgDM:0,barnBaseKgDM:0,supplementKgDM:0,dietExtraKgDM:0};return {weight:s.animals.reduce((v,a)=>v+a.weight,0)/n,gain:s.animals.reduce((v,a)=>v+a.weight-a.initialWeight,0)/n,cost:s.cost,pasture:s.pastures.reduce((v,p)=>v+p,0),pastureByPaddock:[...s.pastures],intake:{...intake,totalKgDM:intake.pastureKgDM+intake.barnBaseKgDM+intake.supplementKgDM+intake.dietExtraKgDM},stress:getEnvironmentalStress(s.config.weather,s.config.housing)};}
export function compare(snapshot         ,days=30,metabolismKernel=updateMetabolismJS){
  if(!Number.isInteger(days)||days<1||days>365)throw new Error('Forecast days must be 1–365');
  // Both futures share the exact same state, seed, diet, supplement and weather.
  // Housing is the sole intervention compared in this MVP.
  const baseline=FarmEngine.from(snapshot),scenario=FarmEngine.from(snapshot);
  baseline.configure({housing:'pasture'});
  scenario.configure({housing:'barn'});
  const baseCost=snapshot.cost,startMetrics=metrics(snapshot),baseWeight=startMetrics.weight;
  const rows=[];
  const intakeDelta=current=>({
    pastureKgDM:current.pastureKgDM-startMetrics.intake.pastureKgDM,
    barnBaseKgDM:current.barnBaseKgDM-startMetrics.intake.barnBaseKgDM,
    supplementKgDM:current.supplementKgDM-startMetrics.intake.supplementKgDM,
    dietExtraKgDM:current.dietExtraKgDM-startMetrics.intake.dietExtraKgDM,
    totalKgDM:current.totalKgDM-startMetrics.intake.totalKgDM
  });
  for(let day=0;day<=days;day++){
    if(day){baseline.tick(24,metabolismKernel);scenario.tick(24,metabolismKernel);}
    const b=baseline.metrics(),s=scenario.metrics();
    const baselineIntake=intakeDelta(b.intake),scenarioIntake=intakeDelta(s.intake);
    rows.push({day,baselineWeight:b.weight,scenarioWeight:s.weight,baselineCost:b.cost-baseCost,scenarioCost:s.cost-baseCost,baselineConsumptionKgDM:baselineIntake.totalKgDM,scenarioConsumptionKgDM:scenarioIntake.totalKgDM,baselineIntakeBySourceKgDM:baselineIntake,scenarioIntakeBySourceKgDM:scenarioIntake,baselinePastureKgDM:b.pasture,scenarioPastureKgDM:s.pasture,baselinePastureByPaddock:b.pastureByPaddock,scenarioPastureByPaddock:s.pastureByPaddock});
  }
  return {days,startWeight:baseWeight,initialConfig:{...snapshot.config},herdSize:snapshot.animals.length,initialPastureByPaddock:[...snapshot.pastures],comparisonFactor:'housing',baselineConfig:baseline.state.config,scenarioConfig:scenario.state.config,rows,baseline:baseline.metrics(),scenario:scenario.metrics(),assumptions:{...ASSUMPTIONS},validated:false};
}

const MANIFEST_TYPE='agroville-comparison';
const CONFIG_VALUES={diet:['pasture','balanced','concentrate'],housing:['pasture','barn'],weather:WEATHER_VALUES};
function assertSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=='object'||!Number.isInteger(snapshot.hour)||!Number.isInteger(snapshot.seed)||!Array.isArray(snapshot.animals)||snapshot.animals.length<1||!Array.isArray(snapshot.pastures)||snapshot.pastures.length!==4||!Number.isFinite(snapshot.cost)||!snapshot.config)throw new Error('Snapshot inicial inválido');
  for(const [key,values] of Object.entries(CONFIG_VALUES))if(!values.includes(snapshot.config[key]))throw new Error('Configuração inválida no snapshot: '+key);
  if(!Number.isFinite(snapshot.config.supplement)||snapshot.config.supplement<0||snapshot.config.supplement>4)throw new Error('Suplementação inválida no snapshot');
  if(snapshot.animals.some(animal=>!Number.isFinite(animal.weight)||!Number.isFinite(animal.initialWeight)))throw new Error('Snapshot contém animal inválido');
}
function assertConfig(config){
  if(!config||typeof config!=='object'||Object.keys(config).sort().join(',')!=='diet,housing,supplement,weather')throw new Error('Configuração de cenário inválida');
  for(const [key,values] of Object.entries(CONFIG_VALUES))if(!values.includes(config[key]))throw new Error('Valor inválido na configuração: '+key);
  if(!Number.isFinite(config.supplement)||config.supplement<0||config.supplement>4)throw new Error('Suplementação inválida');
}
export function createComparisonManifest(snapshot,days=30){
  assertSnapshot(snapshot);
  if(!Number.isInteger(days)||days<1||days>365)throw new Error('Período deve ser de 1–365 dias');
  const referenceConfig={...snapshot.config,housing:'pasture'};
  const scenarioConfig={...snapshot.config,housing:'barn'};
  return {type:MANIFEST_TYPE,version:1,seed:Number.isInteger(snapshot.initialSeed)?snapshot.initialSeed:snapshot.seed,initialSnapshot:structuredClone(snapshot),periodDays:days,factor:'housing',scenarios:{reference:referenceConfig,scenario:scenarioConfig},validated:false};
}
export function validateComparisonManifest(manifest){
  if(!manifest||manifest.type!==MANIFEST_TYPE||manifest.version!==1)throw new Error('Tipo ou versão de manifesto não suportado');
  if(manifest.validated!==false)throw new Error('Manifesto deve preservar o estado demonstrativo não validado do motor');
  assertSnapshot(manifest.initialSnapshot);
  const expectedSeed=Number.isInteger(manifest.initialSnapshot.initialSeed)?manifest.initialSnapshot.initialSeed:manifest.initialSnapshot.seed;
  if(!Number.isInteger(manifest.seed)||manifest.seed!==expectedSeed)throw new Error('Semente do manifesto não corresponde ao snapshot inicial');
  if(!Number.isInteger(manifest.periodDays)||manifest.periodDays<1||manifest.periodDays>365)throw new Error('Período do manifesto deve ser de 1–365 dias');
  if(manifest.factor!=='housing')throw new Error('Fator de comparação não suportado: '+manifest.factor);
  const reference=manifest.scenarios?.reference,scenario=manifest.scenarios?.scenario;
  assertConfig(reference);assertConfig(scenario);
  const keys=Object.keys(reference);
  const differences=keys.filter(key=>reference[key]!==scenario[key]);
  if(differences.length!==1||differences[0]!==manifest.factor)throw new Error('Os cenários devem diferir somente no fator declarado ('+manifest.factor+')');
  const snapshotConfig=manifest.initialSnapshot.config;
  const changedBaseline=keys.filter(key=>key!==manifest.factor&&(reference[key]!==snapshotConfig[key]||scenario[key]!==snapshotConfig[key]));
  if(changedBaseline.length)throw new Error('Configurações não relacionadas ao fator devem corresponder ao snapshot inicial');
  if(reference.housing!=='pasture'||scenario.housing!=='barn')throw new Error('Para o fator alojamento, a referência deve ser pasto e o cenário deve ser confinamento');
  return true;
}
export function replayComparisonManifest(manifest,metabolismKernel=updateMetabolismJS){
  validateComparisonManifest(manifest);
  return compare(manifest.initialSnapshot,manifest.periodDays,metabolismKernel);
}
