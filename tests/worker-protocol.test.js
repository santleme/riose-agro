import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeWorkerCommand,normalizeWorkerResponse,WORKER_PROTOCOL_VERSION,WorkerProtocolError} from '../src/client/worker-protocol.js';
import {FarmEngine} from '../src/client/engine.js';
import {createScenarioSetManifest} from '../src/client/scenario-set.js';

const protocolError=(run,code)=>assert.throws(run,error=>error instanceof WorkerProtocolError&&error.code===code);
function protocolSnapshot(){return {hour:6,animals:[{id:1,name:'Aurora',action:'grazing',patch:0,weight:330,initialWeight:330,energy:75,thirst:20}],pastures:[1,2,3,4],intake:{pastureKgDM:10,barnBaseKgDM:0,supplementKgDM:2,dietExtraKgDM:1},config:{diet:'pasture',housing:'pasture',weather:'normal',supplement:0},cost:0,events:[],seed:17,initialSeed:17};}

test('Worker command decoder validates versioned scientific commands',()=>{
  assert.deepEqual(decodeWorkerCommand({protocolVersion:1,type:'tick',hours:24}).command,{protocolVersion:1,type:'tick',hours:24});
  assert.deepEqual(decodeWorkerCommand({type:'snapshot'}).command,{protocolVersion:1,type:'snapshot'});
  protocolError(()=>decodeWorkerCommand({type:'tick',hours:1.5}),'INVALID_COMMAND_PAYLOAD');
  protocolError(()=>decodeWorkerCommand({protocolVersion:2,type:'snapshot'}),'UNSUPPORTED_PROTOCOL_VERSION');
  protocolError(()=>decodeWorkerCommand({type:'select',animalId:1}),'UNKNOWN_COMMAND');
});

test('Worker command decoder accepts a versioned scenario-set replay and rejects malformed manifests',()=>{
  const snapshot=new FarmEngine(2026,2).snapshot(),shared={...snapshot.config};
  const manifest=createScenarioSetManifest({snapshot,durationDays:1,scenarioId:'worker-set',scenarios:[
    {id:'baseline',label:'Baseline',role:'baseline',config:{...shared,supplement:.5}},
    {id:'low',label:'Low',role:'intervention',config:{...shared,supplement:1}},
    {id:'high',label:'High',role:'intervention',config:{...shared,supplement:1.5}},
  ]});
  assert.deepEqual(decodeWorkerCommand({protocolVersion:1,type:'replayScenarioSet',manifest}).command,{protocolVersion:1,type:'replayScenarioSet',manifest});
  protocolError(()=>decodeWorkerCommand({type:'replayScenarioSet',manifest:{type:'old-set',version:1}}),'INVALID_COMMAND_PAYLOAD');
  protocolError(()=>normalizeWorkerResponse({protocolVersion:1,type:'progress',day:0,days:1,scenarioId:'arm-1',scenarioIndex:1,engineImplementation:'javascript-scenario-set'}),'INVALID_RESPONSE');
});

test('load accepts scientific snapshots and legacy snapshots with visual fields',()=>{
  const snapshot=protocolSnapshot();
  assert.equal(decodeWorkerCommand({type:'load',snapshot}).command.type,'load');
  const legacy=structuredClone(snapshot);legacy.locomotionSeed=99;Object.assign(legacy.animals[0],{x:10,y:20,targetX:11,targetY:21});
  assert.equal(decodeWorkerCommand({type:'load',snapshot:legacy}).command.type,'load');
});

test('load rejects malformed intake ledgers',()=>{
  for(const key of ['pastureKgDM','barnBaseKgDM','supplementKgDM','dietExtraKgDM']){
    const snapshot=protocolSnapshot();delete snapshot.intake[key];
    protocolError(()=>decodeWorkerCommand({type:'load',snapshot}),'INVALID_COMMAND_PAYLOAD');
  }
});

test('Worker state responses contain scientific state without view buffers',()=>{
  const state=protocolSnapshot();
  const response=normalizeWorkerResponse({protocolVersion:1,type:'state',state,engineImplementation:'javascript'});
  assert.equal(response.state.animals[0].weight,330);
  assert.equal(Object.hasOwn(response.state.animals[0],'x'),false);
  protocolError(()=>normalizeWorkerResponse({protocolVersion:1,type:'view',engineImplementation:'js'}),'INVALID_RESPONSE');
});

test('module Worker emits versioned snapshots and deterministic errors',async t=>{
  const originalSelf=globalThis.self;t.after(()=>{globalThis.self=originalSelf;});
  const worker={messages:[],postMessage(message){this.messages.push(message);}};globalThis.self=worker;
  await import(`../src/client/worker.js?protocol-test=${Math.random()}`);
  await worker.onmessage({data:{protocolVersion:1,type:'reset',seed:917,count:3}});
  const reset=worker.messages.at(-1);assert.equal(reset.protocolVersion,WORKER_PROTOCOL_VERSION);assert.equal(reset.type,'state');assert.equal(reset.state.animals.length,3);
  assert.equal(Object.hasOwn(reset.state,'locomotionSeed'),false);assert.equal(Object.hasOwn(reset.state.animals[0],'x'),false);
  const snapshot=reset.state,shared={...snapshot.config};
  const manifest=createScenarioSetManifest({snapshot,durationDays:1,scenarioId:'worker-integration',scenarios:[
    {id:'baseline',label:'Baseline',role:'baseline',config:{...shared,supplement:.5}},
    {id:'lower',label:'Lower',role:'intervention',config:{...shared,supplement:1}},
    {id:'higher',label:'Higher',role:'intervention',config:{...shared,supplement:1.5}},
  ]});
  const scenarioStart=worker.messages.length;
  await worker.onmessage({data:{protocolVersion:1,type:'replayScenarioSet',manifest}});
  const scenarioMessages=worker.messages.slice(scenarioStart);
  assert.equal(scenarioMessages.at(-1).type,'scenarioSet');
  assert.equal(normalizeWorkerResponse(scenarioMessages.at(-1)).data.scenarios.length,2);
  assert.equal(scenarioMessages.filter(message=>message.type==='progress').length,4);
  assert.ok(scenarioMessages.filter(message=>message.type==='progress').every(message=>normalizeWorkerResponse(message).scenarioCount===2));
  await worker.onmessage({data:{type:'tick',hours:1}});assert.equal(worker.messages.at(-1).type,'state');
  await worker.onmessage({data:{protocolVersion:9,type:'tick',hours:1}});assert.equal(worker.messages.at(-1).error.code,'UNSUPPORTED_PROTOCOL_VERSION');
  await worker.onmessage({data:{protocolVersion:1,type:'futureCommand'}});assert.equal(worker.messages.at(-1).error.code,'UNKNOWN_COMMAND');
});
