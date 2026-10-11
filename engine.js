                                                          
                                         
                                                
                                                                    
                                                                                                                                                                                          
                                                                                      
                                                                  
                                                                                                                                
                                                                                              
// All constants are illustrative assumptions, not fitted animal nutrition equations.
export const ASSUMPTIONS = {baseDemandKgDM:8,dailyPastureGrowthKgDM:35,initialPastureKgDM:1800,supplementPrice:1.8,balancedPrice:1.6,concentratePrice:2.1,maintenanceKgDM:5.3,gainFactor:0.22};
export const DEFAULT_CONFIG        = {diet:'pasture',housing:'pasture',weather:'normal',supplement:0};
const names=['Aurora','Bento','Cacau','Dália','Estrela','Figo','Gaia','Hugo','Íris','Joca','Kiara','Luna','Milo','Nina','Oliva','Pingo','Quinoa','Rubi','Sol','Teca','Uva','Vento','Wally','Zara'];
const clamp=(v       ,min       ,max       )=>Math.max(min,Math.min(max,v));
const patchBounds = [{x:35,y:45,w:135,h:100},{x:200,y:45,w:135,h:100},{x:35,y:180,w:135,h:100},{x:200,y:180,w:135,h:100}];
export class FarmEngine {
  state         ;
  constructor(seed=2026,count=24){
    if(!Number.isInteger(count)||count<1||count>10000)throw new Error('Animal count must be 1–10000');
    this.state={hour:6,animals:[],pastures:Array(4).fill(ASSUMPTIONS.initialPastureKgDM),config:{...DEFAULT_CONFIG},cost:0,events:[{hour:6,text:'Fazenda iniciada. Os animais estão no pasto.'}],seed:seed>>>0};
    for(let i=0;i<count;i++){const weight=330+this.random()*70;const patch=i%4;const b=patchBounds[patch];const x=b.x+10+this.random()*(b.w-20),y=b.y+10+this.random()*(b.h-20);const animal={id:i+1,name:names[i%names.length]+(i>=names.length?' '+(i+1):''),weight,initialWeight:weight,energy:75,thirst:20,action:'grazing',patch,x,y,targetX:x,targetY:y,history:[]};this.state.animals.push(animal);this.recordActivity(animal,'pasture_housing',20,false);}
  }
  random(){this.state.seed=(Math.imul(1664525,this.state.seed)+1013904223)>>>0;return this.state.seed/4294967296;}
  log(text       ,animalId        ){this.state.events.unshift({hour:this.state.hour,text,...(animalId===undefined?{}:{animalId})});this.state.events.length=Math.min(this.state.events.length,100);}
  recordActivity(animal,reason,observedThirst=animal.thirst,announce=true){
    const record={hour:this.state.hour,action:animal.action,reason,observed:{hour:this.state.hour%24,thirst:observedThirst,housing:this.state.config.housing}};
    animal.history??=[];animal.history.push(record);if(animal.history.length>40)animal.history.shift();
    const activity={grazing:'pastando',feeding:'no cocho',drinking:'bebendo água',resting:'descansando'}[animal.action];
    if(announce)this.log(animal.name+': '+activity+'.',animal.id);
  }
  configure(patch                ){
    const previous=this.state.config;
    const c={...previous,...patch};
    if(!['pasture','balanced','concentrate'].includes(c.diet)||!['pasture','barn'].includes(c.housing)||!['normal','hot','rain'].includes(c.weather)||!Number.isFinite(c.supplement)||c.supplement<0||c.supplement>4)throw new Error('Invalid configuration');
    this.state.config=c;
    if(c.housing!==previous.housing){for(const a of this.state.animals){this.place(a);}this.log(c.housing==='barn'?'Rebanho transferido para o confinamento.':'Rebanho voltou ao pasto.');}
    if(c.diet!==previous.diet)this.log('Dieta alterada: '+({pasture:'volumoso / pasto',balanced:'balanceada',concentrate:'concentrado'}[c.diet])+'.');
    if(c.supplement!==previous.supplement)this.log('Suplementação: '+c.supplement+' kg de MS/animal/dia.');
    if(c.weather!==previous.weather)this.log('Clima alterado: '+({normal:'ameno',hot:'calor',rain:'chuva'}[c.weather])+'.');
  }
  place(a       ){const b=this.state.config.housing==='barn'?{x:392,y:186,w:132,h:98}:patchBounds[a.patch];a.x=b.x+10+this.random()*(b.w-20);a.y=b.y+10+this.random()*(b.h-20);a.targetX=a.x;a.targetY=a.y;}
  tick(hours=1){
    if(!Number.isInteger(hours)||hours<1||hours>8760)throw new Error('Tick hours must be 1–8760');
    for(let step=0;step<hours;step++){
      const s=this.state,c=s.config;s.hour++;
      const time=s.hour%24;const heat=c.weather==='hot'?0.8:1;
      for(let p=0;p<4;p++)s.pastures[p]=Math.min(2400,s.pastures[p]+ASSUMPTIONS.dailyPastureGrowthKgDM*(c.weather==='rain'?1.3:c.weather==='hot'?0.65:1)/24);
      for(const a of s.animals){
        const previous=a.action;
        a.thirst=clamp(a.thirst+(c.weather==='hot'?9:5),0,100);
        const observedThirst=a.thirst;
        const reason=time<6||time>=21?'rest_window':observedThirst>65?'thirst_threshold':c.housing==='pasture'?'pasture_housing':'barn_housing';
        a.action=reason==='rest_window'?'resting':reason==='thirst_threshold'?'drinking':reason==='pasture_housing'?'grazing':'feeding';
        if(a.action==='drinking')a.thirst=12;
        const demand=ASSUMPTIONS.baseDemandKgDM*(a.weight/360)*heat/24;
        let forage=demand;
        if(c.housing==='pasture'){forage=Math.min(demand,s.pastures[a.patch]);s.pastures[a.patch]-=forage;}
        else s.cost+=demand*0.65;
        const supplement=c.supplement/24;
        const dietExtra=c.diet==='pasture'?0:c.diet==='balanced'?1.8/24:3.2/24;
        s.cost+=supplement*ASSUMPTIONS.supplementPrice+dietExtra*(c.diet==='balanced'?ASSUMPTIONS.balancedPrice:ASSUMPTIONS.concentratePrice);
        const energyIntake=forage+supplement*1.2+dietExtra*1.35;
        const gain=(energyIntake-ASSUMPTIONS.maintenanceKgDM*(a.weight/360)/24)*ASSUMPTIONS.gainFactor;
        a.weight=Math.max(200,a.weight+gain);
        a.energy=clamp(a.energy+(a.action==='resting'?5:energyIntake*4-1.5),0,100);
        if(a.action!==previous)this.recordActivity(a,reason,observedThirst);
        const b=c.housing==='barn'?{x:392,y:186,w:132,h:98}:patchBounds[a.patch];
        a.targetX=b.x+10+this.random()*(b.w-20);a.targetY=b.y+10+this.random()*(b.h-20);
        a.x=clamp(a.x+(a.targetX-a.x)*0.15,b.x+8,b.x+b.w-8);a.y=clamp(a.y+(a.targetY-a.y)*0.15,b.y+8,b.y+b.h-8);
      }
      if(time===6)this.log('Novo dia: peso médio '+this.metrics().weight.toFixed(1)+' kg.');
    }
    return this.snapshot();
  }
  snapshot()          {return structuredClone(this.state);}
  metrics()         {return metrics(this.state);}
  static from(snapshot         ){const engine=new FarmEngine(1,1);engine.state=structuredClone(snapshot);return engine;}
}
export function metrics(s         )        {const n=s.animals.length;return {weight:s.animals.reduce((v,a)=>v+a.weight,0)/n,gain:s.animals.reduce((v,a)=>v+a.weight-a.initialWeight,0)/n,cost:s.cost,pasture:s.pastures.reduce((v,p)=>v+p,0),stress:s.config.weather==='hot'?28:s.config.housing==='barn'?12:5};}
export function compare(snapshot         ,days=30){
  if(!Number.isInteger(days)||days<1||days>365)throw new Error('Forecast days must be 1–365');
  // Both futures share the exact same state, seed, diet, supplement and weather.
  // Housing is the sole intervention compared in this MVP.
  const baseline=FarmEngine.from(snapshot),scenario=FarmEngine.from(snapshot);
  baseline.configure({housing:'pasture'});
  scenario.configure({housing:'barn'});
  const baseCost=snapshot.cost,baseWeight=metrics(snapshot).weight;
  const rows=[];
  for(let day=0;day<=days;day++){if(day){baseline.tick(24);scenario.tick(24);}const b=baseline.metrics(),s=scenario.metrics();rows.push({day,baselineWeight:b.weight,scenarioWeight:s.weight,baselineCost:b.cost-baseCost,scenarioCost:s.cost-baseCost});}
  return {days,startWeight:baseWeight,comparisonFactor:'housing',baselineConfig:baseline.state.config,scenarioConfig:scenario.state.config,rows,baseline:baseline.metrics(),scenario:scenario.metrics(),assumptions:{...ASSUMPTIONS},validated:false};
}
