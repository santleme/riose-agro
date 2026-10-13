import {spawn} from 'node:child_process';
import {access,mkdtemp,readdir,rm} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {benchmarkReport,measurement,summarizeSamples} from './benchmark-report.mjs';
import {waitForDevToolsActivePort} from './browser-startup.mjs';

async function findChrome(){
  const candidates=[process.env.CHROME_BIN,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'];
  try{const cache=path.join(homedir(),'.cache/ms-playwright');for(const entry of (await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)))){for(const binary of ['chrome-linux64/chrome','chrome-linux/chrome'])candidates.push(path.join(cache,entry,binary));}}catch{}
  for(const candidate of candidates.filter(Boolean)){try{await access(candidate);return candidate;}catch{}}
  throw new Error('Chromium was not found. Set CHROME_BIN to a local Chromium or Chrome executable.');
}
const chrome=await findChrome();
const origin=process.env.RIOSE_URL??'http://127.0.0.1:8000/';
const repetitions=Number(process.env.BENCH_REPETITIONS??15);
const userData=await mkdtemp(path.join(tmpdir(),'riose-browser-bench-'));
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${userData}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let browserExit=null;
let browserStderr='';
browser.once('exit',(code,signal)=>{browserExit={code,signal};});
browser.stderr.setEncoding('utf8');
browser.stderr.on('data',chunk=>{browserStderr=(browserStderr+chunk).slice(-4000);});
let socket;
let cdp;

class Cdp {
  constructor(wsUrl){
    const endpoint=new URL(wsUrl),port=Number(endpoint.port),client=net.connect(port,endpoint.hostname);
    this.socket=client;this.buffer=Buffer.alloc(0);this.pending=new Map();this.nextId=0;
    this.ready=new Promise((resolve,reject)=>{
      client.once('connect',()=>{
        const key=crypto.randomBytes(16).toString('base64');
        client.write(`GET ${endpoint.pathname}${endpoint.search} HTTP/1.1\r\nHost: ${endpoint.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
        let response='';const onData=chunk=>{response+=chunk.toString('binary');if(response.includes('\r\n\r\n')){client.off('data',onData);if(!response.startsWith('HTTP/1.1 101'))reject(new Error(response));else resolve();}};
        client.on('data',onData);
      });
      client.once('error',reject);
    }).then(()=>{client.on('data',chunk=>this.consume(chunk));});
  }
  consume(chunk){
    this.buffer=Buffer.concat([this.buffer,chunk]);
    while(this.buffer.length>=2){
      const opcode=this.buffer[0]&15;let length=this.buffer[1]&127,offset=2;
      if(length===126){if(this.buffer.length<4)return;length=this.buffer.readUInt16BE(2);offset=4;}
      else if(length===127){if(this.buffer.length<10)return;length=Number(this.buffer.readBigUInt64BE(2));offset=10;}
      const masked=(this.buffer[1]&128)!==0;if(masked)offset+=4;if(this.buffer.length<offset+length)return;
      let payload=this.buffer.subarray(offset,offset+length);if(masked){const mask=this.buffer.subarray(offset-4,offset);payload=Buffer.from(payload);for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];}
      this.buffer=this.buffer.subarray(offset+length);
      if(opcode===8){this.socket.end();continue;}
      if(opcode===9){this.writeFrame(10,payload);continue;}
      if(opcode!==1)continue;
      const message=JSON.parse(payload.toString());if(!message.id)continue;
      const pending=this.pending.get(message.id);if(!pending)continue;this.pending.delete(message.id);
      message.error?pending.reject(new Error(message.error.message??JSON.stringify(message.error))):pending.resolve(message.result);
    }
  }
  writeFrame(opcode,payload){
    const body=Buffer.from(payload);let header;
    if(body.length<126){header=Buffer.alloc(6);header[0]=0x80|opcode;header[1]=0x80|body.length;}
    else if(body.length<=65535){header=Buffer.alloc(8);header[0]=0x80|opcode;header[1]=0x80|126;header.writeUInt16BE(body.length,2);}
    else{header=Buffer.alloc(14);header[0]=0x80|opcode;header[1]=0x80|127;header.writeBigUInt64BE(BigInt(body.length),2);}
    const mask=crypto.randomBytes(4);mask.copy(header,header.length-4);const masked=Buffer.alloc(body.length);for(let i=0;i<body.length;i++)masked[i]=body[i]^mask[i%4];this.socket.write(Buffer.concat([header,masked]));
  }
  async send(method,params={}){await this.ready;const id=++this.nextId;const response=new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));this.writeFrame(1,JSON.stringify({id,method,params}));return response;}
  async evaluate(expression){const result=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result?.value;}
  close(){this.socket.end();}
}

const pageExpression=`(()=>{const NativeWorker=window.Worker;window.__benchWaiters=[];window.Worker=class extends NativeWorker{constructor(...args){super(...args);if(String(args[0]).includes('worker.js')){window.__farmWorker=this;this.addEventListener('message',event=>{const waiter=window.__benchWaiters.shift();if(waiter)waiter({at:performance.now(),data:event.data});});}}};})();`;
const cdpRequest=async(url,method='GET')=>{const response=await fetch(url,{method});if(!response.ok)throw new Error(`Chrome DevTools HTTP ${response.status}`);return response.json();};
const metrics=async cdp=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(metric=>['JSHeapUsedSize','JSHeapTotalSize','TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','Nodes','Documents','Frames'].includes(metric.name)).map(metric=>[metric.name,metric.value]));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return {sampleCount:sorted.length,medianMs:median(sorted),p95Ms:p95(sorted),spreadMs:{min:sorted[0],max:sorted.at(-1),range:sorted.at(-1)-sorted[0]},observationsMs:values};};

try{
  const active=await waitForDevToolsActivePort({
    filePath:path.join(userData,'DevToolsActivePort'),
    getExit:()=>browserExit,
    getStderr:()=>browserStderr,
  });
  const port=Number(active.split('\n')[0]);
  const target=await cdpRequest(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`,'PUT');
  cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Profiler.enable');await cdp.send('Performance.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:pageExpression});
  await cdp.send('Page.navigate',{url:origin});
  await delay(1200);
  const setup=await cdp.evaluate(`new Promise(resolve=>{const check=()=>window.__farmWorker?resolve(true):setTimeout(check,20);check()})`);
  await cdp.evaluate(`document.querySelector('#play').click()`);
  await cdp.evaluate(`window.__benchPost=message=>new Promise(resolve=>{const start=performance.now();window.__benchWaiters.push(response=>resolve({...response,elapsed:response.at-start}));window.__farmWorker.postMessage(message)});window.__benchFrames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
  const worker=[];
  for(const count of [100,1000,10000]){
    await cdp.evaluate(`window.__benchPost({type:'reset',seed:20261012,count:${count}})`);
    await cdp.evaluate('window.__benchFrames()');
    const before=await metrics(cdp);
    const elapsed=[];let implementation='unknown';
    for(let run=0;run<repetitions;run++){
      const result=await cdp.evaluate(`window.__benchPost({type:'tick',hours:24}).then(async response=>{await window.__benchFrames();return {elapsed:response.elapsed,engine:response.data.engineImplementation}})`);
      elapsed.push(result.elapsed);implementation=result.engine;
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const after=await metrics(cdp);
    worker.push({animals:count,implementation,roundTrip24h:summary(elapsed),heapUsedBytes:after.JSHeapUsedSize,heapDeltaBytes:after.JSHeapUsedSize-before.JSHeapUsedSize,domNodes:after.Nodes,domNodeDelta:after.Nodes-before.Nodes,scriptDurationDeltaMs:(after.ScriptDuration-before.ScriptDuration)*1000,scriptDurationPerTickMs:(after.ScriptDuration-before.ScriptDuration)*1000/repetitions,layoutDeltaMs:(after.LayoutDuration-before.LayoutDuration)*1000,layoutPerTickMs:(after.LayoutDuration-before.LayoutDuration)*1000/repetitions,recalcStyleDeltaMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000});
  }
  await cdp.evaluate(`window.__benchPost({type:'reset',seed:20261012,count:10000})`);
  await cdp.evaluate('window.__benchFrames()');
  const profileStartMetrics=await metrics(cdp);
  await cdp.send('Profiler.start');
  const profileTick=await cdp.evaluate(`window.__benchPost({type:'tick',hours:24}).then(async response=>{await window.__benchFrames();return response.data.engineImplementation})`);
  await delay(500);
  const profile=await cdp.send('Profiler.stop');const profileMetrics=await metrics(cdp);
  const functionSamples=new Map();
  for(const node of profile.profile.nodes){const name=node.callFrame.functionName||'(anonymous)';if(!node.callFrame.url.includes('/app.js'))continue;functionSamples.set(name,(functionSamples.get(name)??0)+(node.hitCount??0));}
  const sampledFunctions=[...functionSamples].map(([functionName,samples])=>({functionName,samples})).sort((a,b)=>b.samples-a.samples).slice(0,20);
  const profileMetricsDelta=Object.fromEntries(['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration'].map(key=>[key,(profileMetrics[key]-profileStartMetrics[key])*1000]));

  await cdp.evaluate(`(async()=>{const {FarmEngine}=await import('/src/client/engine.js');const {updateMetabolismJS}=await import('/src/client/metabolism-wasm.js');new FarmEngine(20261012,10000).tick(1,updateMetabolismJS,false);window.__profileSimulation=includeSnapshot=>new FarmEngine(20261012,10000).tick(24,updateMetabolismJS,includeSnapshot);})()`);
  const profileEngine=async includeSnapshot=>{
    await cdp.send('Profiler.start');await cdp.evaluate(`window.__profileSimulation(${includeSnapshot})`);
    const cpu=await cdp.send('Profiler.stop'),samples=new Map();
    for(const node of cpu.profile.nodes){const name=node.callFrame.functionName||'(anonymous)';if(!node.callFrame.url.includes('/src/client/engine.js'))continue;samples.set(name,(samples.get(name)??0)+(node.hitCount??0));}
    return {samples:cpu.profile.samples.length,topFunctions:[...samples].map(([functionName,hits])=>({functionName,samples:hits})).sort((a,b)=>b.samples-a.samples).slice(0,20)};
  };
  const simulationProfile={withSnapshot:await profileEngine(true),withoutSnapshot:await profileEngine(false)};

  const kernel=await cdp.evaluate(`(async()=>{const {FarmEngine}=await import('/src/client/engine.js');const {loadWasmMetabolism,updateMetabolismJS}=await import('/src/client/metabolism-wasm.js');const wasm=await loadWasmMetabolism();const out=[];const reps=${repetitions};const stats=a=>{const sorted=[...a].sort((x,y)=>x-y);return {sampleCount:a.length,medianMs:sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2,p95Ms:sorted[Math.ceil(a.length*.95)-1],spreadMs:{min:sorted[0],max:sorted.at(-1),range:sorted.at(-1)-sorted[0]}}};for(const count of [100,1000,10000,100000]){const input=new Float64Array(count*4),output=new Float64Array(count*2),callsPerSample=Math.max(1,Math.ceil(50000/count));for(let i=0;i<count;i++){input[i*4]=330+(i%70);input[i*4+1]=75;input[i*4+2]=0.4;input[i*4+3]=0;}const row={animals:count,callsPerSample};for(const [name,fn] of [['javascript',updateMetabolismJS],['wasm',wasm]]){for(let i=0;i<50;i++)fn(input,count,output);const times=[];for(let i=0;i<reps;i++){const t=performance.now();for(let call=0;call<callsPerSample;call++)fn(input,count,output);times.push((performance.now()-t)/callsPerSample);}row[name]=stats(times);}out.push(row);}const simulation=[];for(const count of [100,1000,10000]){const row={animals:count};for(const [name,fn] of [['javascript',updateMetabolismJS],['wasm',wasm]]){for(const includeSnapshot of [true,false]){const key=includeSnapshot?name:name+'NoSnapshot';for(let i=0;i<3;i++)new FarmEngine(20261012,count).tick(24,fn,includeSnapshot);const times=[];for(let i=0;i<reps;i++){const engine=new FarmEngine(20261012,count);const t=performance.now();engine.tick(24,fn,includeSnapshot);times.push(performance.now()-t);}row[key]=stats(times);}}simulation.push(row);}const linearMemory=wasm.memoryBytes();wasm.dispose();return {simulation,kernel:out,wasmLinearMemoryBytes:linearMemory};})()`);
  const persistence=await cdp.evaluate(`(async()=>{const {FarmEngine}=await import('/src/client/engine.js');const engine=new FarmEngine(20261012,10000);engine.tick(24,undefined,false);const json=JSON.stringify(engine.snapshot()),rawBytes=new TextEncoder().encode(json),compressed=await new Response(new Blob([rawBytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();const compressedBytes=new Uint8Array(compressed);let binary='';for(let offset=0;offset<compressedBytes.length;offset+=32768)binary+=String.fromCharCode(...compressedBytes.subarray(offset,offset+32768));const encoded=btoa(binary);let rawAccepted=true;try{localStorage.setItem('__riose_raw',json);}catch{rawAccepted=false;}localStorage.clear();let compressedCopies=0;for(let copies=1;copies<=10;copies++){try{localStorage.setItem('__riose_gzip',JSON.stringify(Array(copies).fill({encoding:'gzip+base64',data:encoded})));compressedCopies=copies;}catch{break;}}localStorage.clear();return {jsonBytes:rawBytes.byteLength,gzipBytes:compressed.byteLength,gzipBase64Bytes:Math.ceil(compressed.byteLength/3)*4,rawSnapshotFitsLocalStorage:rawAccepted,gzipSnapshotCopiesFitLocalStorage:compressedCopies,storageQuotaBytes:await navigator.storage.estimate().then(x=>x.quota)};})()`);
  const limitations=['Function sampling profiles the same page module called by the Worker, on the browser main thread; the worker round-trip includes Worker execution, transfer, UI queue delay, and the reply.','Layout and style deltas are whole-page Performance API observations over each workload; the animated canvas contributes.','Kernel and FarmEngine results run in Chromium main-thread JavaScript/WASM and exclude UI rendering. Browser timing resolution and scheduler noise limit small-batch claims.'];
  const phases={
    engine:{status:'measured',measurements:kernel.simulation.flatMap(row=>
      ['javascript','wasm','javascriptNoSnapshot','wasmNoSnapshot'].map(implementation=>
        measurement('engine','tick24h','ms',row[implementation],{population:row.animals,scope:'FarmEngine',implementation})))
      .concat(kernel.kernel.flatMap(row=>
        ['javascript','wasm'].map(implementation=>
          measurement('engine','metabolismBatch','ms',row[implementation],{population:row.animals,scope:'numeric-kernel',implementation,limit:row.animals===100000?'numeric-kernel-only':null}))))},
    worker:{status:'measured',measurements:worker.map(row=>measurement('worker','roundTrip24h','ms',row.roundTrip24h,{population:row.animals,implementation:row.implementation,median:row.roundTrip24h.medianMs,spread:{p95:row.roundTrip24h.p95Ms},memory:{jsHeapUsedBytes:row.heapUsedBytes,jsHeapDeltaBytes:row.heapDeltaBytes}}))},
    ui:{status:'measured',measurements:worker.map(row=>measurement('ui','scriptDurationPerTick','ms',{median:row.scriptDurationPerTickMs,spread:null},{population:row.animals,domNodes:row.domNodes,observations:[row.scriptDurationPerTickMs]}))},
    layout:{status:'measured',measurements:worker.map(row=>measurement('layout','layoutPerTick','ms',{median:row.layoutPerTickMs,spread:null},{population:row.animals,observations:[row.layoutPerTickMs]}))},
    serialization:{status:'measured',measurements:[measurement('serialization','snapshot-json','bytes',{median:persistence.jsonBytes,spread:null},{population:10000,gzipBytes:persistence.gzipBytes,gzipBase64Bytes:persistence.gzipBase64Bytes,observations:[persistence.jsonBytes]})]},
    memory:{status:'measured',measurements:worker.map(row=>measurement('memory','jsHeapUsedAfterGc','bytes',summarizeSamples([row.heapUsedBytes]),{population:row.animals,implementation:row.implementation,observations:[row.heapUsedBytes],source:'Chrome Performance.getMetrics JSHeapUsedSize after HeapProfiler.collectGarbage'}))},
  };
  const output=benchmarkReport({
    name:'browser-worker',runtime:{browser:browser.product,browserRevision:browser.revision,userAgent:browser.userAgent},
    workload:{seed:20261012,populations:[...worker.map(row=>({animals:row.animals,scope:'FarmEngine and Worker',limit:'FarmEngine maximum 10000'})),{animals:100000,scope:'numeric-kernel-only',limit:'isolated numeric kernel; not FarmEngine or renderer'}]},
    configuration:{warmupRuns:{worker:1,kernel:50,simulation:3},repetitions},phases,
    timingBoundaries:[
      {phase:'engine',timed:['FarmEngine 24-hour tick, with/without snapshot, and isolated JS/WASM numeric kernel calls.'],notTimed:['FarmEngine construction and UI rendering.']},
      {phase:'worker',timed:['Worker tick request/reply round-trip including queueing, execution, transfer and response.'],notTimed:['Separate standalone engine profile and browser startup.']},
      {phase:'ui',timed:['Whole-page script-duration delta across the measured Worker workload.'],notTimed:['Isolated allocation attribution to one UI function.']},
      {phase:'layout',timed:['Whole-page layout-duration delta across the measured Worker workload.'],notTimed:['GPU rendering time.']},
      {phase:'serialization',timed:['JSON byte counting and browser gzip snapshot encoding.'],notTimed:['Browser storage quota measurement.']},
      {phase:'memory',timed:['Chrome JS heap after forced garbage collection.'],notTimed:['Process RSS, retained object attribution, WASM linear memory and GPU allocation.']},
    ],
    results:{browser:{product:'Chromium',url:origin},worker,profile:{implementation:profileTick,sampledAppFunctions:sampledFunctions,metricsDelta:profileMetricsDelta,heapUsedBytes:profileMetrics.JSHeapUsedSize,domNodes:profileMetrics.Nodes},simulationProfile,browserEngine:kernel,persistence},limitations,
  });
  console.log(JSON.stringify(output,null,2));
}finally{
  if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.close();}
  if(browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),delay(1000)]);if(browser.exitCode===null)browser.kill('SIGKILL');}
  await rm(userData,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
