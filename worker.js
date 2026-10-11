import {FarmEngine,compare} from './engine.js';
                                        
let engine=new FarmEngine();
const scope=self                                                                                      ;
scope.onmessage=(event)=>{try{
  const m=event.data;
  if(m.type==='reset')engine=new FarmEngine(m.seed??2026,m.count??24);
  else if(m.type==='configure')engine.configure(m.patch                   );
  else if(m.type==='tick')engine.tick(m.hours??1);
  else if(m.type==='compare'){scope.postMessage({type:'comparison',data:compare(engine.snapshot(),m.days??30)});return;}
  scope.postMessage({type:'state',state:engine.snapshot()});
}catch(error){scope.postMessage({type:'error',message:String(error)});}};
scope.postMessage({type:'state',state:engine.snapshot()});
