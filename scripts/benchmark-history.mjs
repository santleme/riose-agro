import {FarmEngine} from '../src/client/engine.js';
import {benchmarkReport,measurement,summarizeSamples} from './benchmark-report.mjs';

class ShiftHistoryEngine extends FarmEngine{
  recordActivity(animal,reason,observedThirst=animal.thirst,announce=true){
    const record={hour:this.state.hour,action:animal.action,reason,observed:{hour:this.state.hour%24,thirst:observedThirst,housing:this.state.config.housing}};
    animal.history??=[];animal.history.push(record);if(animal.history.length>40)animal.history.shift();
    if(announce){const activity={grazing:'pastando',feeding:'no cocho',drinking:'bebendo água',resting:'descansando'}[animal.action];this.log(animal.name+': '+activity+'.',animal.id);}
  }
}

const repetitions=Number(process.env.BENCH_REPETITIONS??5),hours=720;
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(const count of [1000,10000]){
  const results=new Map([[ShiftHistoryEngine,{tick:[],snapshot:[]}],[FarmEngine,{tick:[],snapshot:[]}]]),finalStates=new Map();
  for(const Engine of [ShiftHistoryEngine,FarmEngine]){const warmup=new Engine(20261012,count);warmup.tick(hours,undefined,false);}
  for(let run=0;run<repetitions;run++){
    const order=run%2?[FarmEngine,ShiftHistoryEngine]:[ShiftHistoryEngine,FarmEngine];
    for(const Engine of order){
      const engine=new Engine(20261012,count),started=performance.now();engine.tick(hours,undefined,false);
      const result=results.get(Engine);result.tick.push(performance.now()-started);
      const snapshotStarted=performance.now(),snapshot=engine.snapshot();result.snapshot.push(performance.now()-snapshotStarted);finalStates.set(Engine,snapshot);
    }
  }
  const shifted=results.get(ShiftHistoryEngine),ringed=results.get(FarmEngine),shiftedState=finalStates.get(ShiftHistoryEngine),ringedState=finalStates.get(FarmEngine);
  const historyEntries=ringedState.animals.reduce((sum,animal)=>sum+animal.history.length,0);
  const results={animals:count,hours,repetitions,historyEntries,shift:{tickMedianMs:median(shifted.tick),snapshotMedianMs:median(shifted.snapshot)},ring:{tickMedianMs:median(ringed.tick),snapshotMedianMs:median(ringed.snapshot)},snapshotsIdentical:JSON.stringify(shiftedState)===JSON.stringify(ringedState)};
  const phases={
    engine:{status:'measured',measurements:[
      measurement('engine','tick720h','ms',summarizeSamples(shifted.tick),{population:count,implementation:'shift-history'}),
      measurement('engine','tick720h','ms',summarizeSamples(ringed.tick),{population:count,implementation:'ring-history'}),
    ]},
    snapshot:{status:'measured',measurements:[
      measurement('snapshot','final-state','ms',summarizeSamples(shifted.snapshot),{population:count,implementation:'shift-history'}),
      measurement('snapshot','final-state','ms',summarizeSamples(ringed.snapshot),{population:count,implementation:'ring-history'}),
    ]},
  };
  console.log(JSON.stringify(benchmarkReport({name:'history-ring-comparison',workload:{seed:20261012,populations:[{animals:count,scope:'FarmEngine',limit:'FarmEngine maximum 10000'}],hours},configuration:{warmupRuns:1,repetitions},phases,results})));
}
