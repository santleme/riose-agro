import {spawn} from 'node:child_process';
import {access,mkdir,mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {decodePng,comparePng} from './graphics-screenshot-utils.mjs';

const fixtures = path.resolve('tests/fixtures/graphics-screenshots-v1');
const update = process.argv.includes('--update');
const width = 1280, height = 900;
const channelTolerance = 18, maxChangedRatio = .005;
const cases = [
  {name:'beef', query:'', setup:'await window.__graphicsControl.selectScene("beef");'},
  {name:'dairy', query:'?scene=dairy', setup:'await window.__graphicsControl.selectScene("dairy");'},
  {name:'beef-zone', query:'', setup:'await window.__graphicsControl.selectScene("beef"); window.__graphicsControl.setCameraZoom(.45); const canvas=document.querySelector("#canvas-renderer"),stage=document.querySelector("#stage"),r=stage.getBoundingClientRect(),scene=await fetch("/graphics-poc/scene.json").then(response=>response.json()),zoom=.45,centerX=scene.projection.columns/2,centerY=scene.projection.rows/2,point=(column,row)=>({x:r.left+r.width/2+((column-row)-(centerX-centerY))*scene.projection.cellWidth/2*zoom,y:r.top+r.height/2+((column+row)-(centerX+centerY))*scene.projection.cellHeight/2*zoom}); canvas.setPointerCapture=()=>{}; document.querySelector("#draw-zone").click(); const a=point(8.5,8.5),b=point(11.5,11.5),event=(type,p)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:1,clientX:p.x,clientY:p.y})); event("pointerdown",a); event("pointermove",b); event("pointerup",b); if(!document.querySelector("#scene-status").textContent.includes("Piquete criado"))throw new Error("Zone overlay setup did not create a deterministic paddock.");'},
];

// The application server deliberately does not publish generated dist bundles.
// This ephemeral loopback server serves only the Graphics PoC and its visual schema.
const projectRoot=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const clientFiles=new Set(await readdir(path.join(projectRoot,'src/client')));
const localServer=createServer(async(request,response)=>{try{const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);let file;if(pathname.startsWith('/graphics-poc/')||pathname==='/schemas/visual-scene.schema.json')file=path.resolve(projectRoot,`.${pathname}`);else if(pathname.startsWith('/src/client/')&&!pathname.slice('/src/client/'.length).includes('/')&&clientFiles.has(pathname.slice('/src/client/'.length)))file=path.join(projectRoot,'src/client',pathname.slice('/src/client/'.length));else if(!pathname.slice(1).includes('/')&&clientFiles.has(pathname.slice(1)))file=path.join(projectRoot,'src/client',pathname.slice(1));else{response.writeHead(404).end();return;}if(!file.startsWith(projectRoot+path.sep)){response.writeHead(403).end();return;}const body=await readFile(file),type=({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]??'application/octet-stream';response.writeHead(200,{'content-type':`${type}; charset=utf-8`,'cache-control':'no-store'}).end(body);}catch{response.writeHead(404).end();}});
await new Promise(resolve=>localServer.listen(0,'127.0.0.1',resolve));
const origin=process.env.RIOSE_GRAPHICS_URL??`http://127.0.0.1:${localServer.address().port}/graphics-poc/index.html`;

async function chromePath() {
  const candidates=[process.env.CHROME_BIN,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'];
  try { const cache=path.join(homedir(),'.cache/ms-playwright'); for(const entry of (await readdir(cache)).filter(item=>/^chromium-\d+$/.test(item)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)))) candidates.push(path.join(cache,entry,'chrome-linux64/chrome'),path.join(cache,entry,'chrome-linux/chrome')); } catch {}
  for(const item of candidates.filter(Boolean)){try{await access(item);return item;}catch{}}
  throw new Error('Chromium not found; set CHROME_BIN to a Chromium executable.');
}

class DevTools {
  constructor(url){const endpoint=new URL(url),socket=net.connect(Number(endpoint.port),endpoint.hostname);this.socket=socket;this.buffer=Buffer.alloc(0);this.pending=new Map();this.id=0;this.ready=new Promise((resolve,reject)=>{socket.once('connect',()=>{const key=crypto.randomBytes(16).toString('base64');socket.write(`GET ${endpoint.pathname}${endpoint.search} HTTP/1.1\r\nHost: ${endpoint.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);let response='';const onData=chunk=>{response+=chunk.toString('binary');if(!response.includes('\r\n\r\n'))return;socket.off('data',onData);response.startsWith('HTTP/1.1 101')?resolve():reject(new Error(response));};socket.on('data',onData);});socket.once('error',reject);}).then(()=>socket.on('data',chunk=>this.consume(chunk)));}
  consume(chunk){this.buffer=Buffer.concat([this.buffer,chunk]);while(this.buffer.length>=2){const opcode=this.buffer[0]&15;let length=this.buffer[1]&127,offset=2;if(length===126){if(this.buffer.length<4)return;length=this.buffer.readUInt16BE(2);offset=4;}else if(length===127){if(this.buffer.length<10)return;length=Number(this.buffer.readBigUInt64BE(2));offset=10;}const masked=(this.buffer[1]&128)!==0;if(masked)offset+=4;if(this.buffer.length<offset+length)return;let payload=this.buffer.subarray(offset,offset+length);if(masked){const mask=this.buffer.subarray(offset-4,offset);payload=Buffer.from(payload);for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];}this.buffer=this.buffer.subarray(offset+length);if(opcode===8){this.socket.end();continue;}if(opcode!==1)continue;const message=JSON.parse(payload.toString()),pending=this.pending.get(message.id);if(!pending)continue;this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);}}
  write(payload){const body=Buffer.from(payload);let header;if(body.length<126){header=Buffer.alloc(6);header[0]=0x81;header[1]=0x80|body.length;}else if(body.length<=65535){header=Buffer.alloc(8);header[0]=0x81;header[1]=0x80|126;header.writeUInt16BE(body.length,2);}else{header=Buffer.alloc(14);header[0]=0x81;header[1]=0x80|127;header.writeBigUInt64BE(BigInt(body.length),2);}const mask=crypto.randomBytes(4);mask.copy(header,header.length-4);const masked=Buffer.alloc(body.length);for(let i=0;i<body.length;i++)masked[i]=body[i]^mask[i%4];this.socket.write(Buffer.concat([header,masked]));}
  async send(method,params={}){await this.ready;const id=++this.id,result=new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));this.write(JSON.stringify({id,method,params}));return result;}
  async evaluate(expression){const response=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw new Error(JSON.stringify(response.exceptionDetails));return response.result?.value;}
  close(){this.socket.end();}
}

const chrome=await chromePath(), userData=await mkdtemp(path.join(tmpdir(),'riose-screenshot-'));
if(update)await mkdir(fixtures,{recursive:true});
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader-webgl','--remote-debugging-port=0',`--user-data-dir=${userData}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let browserStderr='';browser.stderr.setEncoding('utf8');browser.stderr.on('data',chunk=>{browserStderr=(browserStderr+chunk).slice(-4000);});
let cdp;
try {
  let active='';for(let i=0;i<600;i++){try{active=await readFile(path.join(userData,'DevToolsActivePort'),'utf8');break;}catch{if(browser.exitCode!==null)throw new Error(`Chromium exited before opening DevTools (code=${browser.exitCode}, signal=${browser.signalCode}): ${browserStderr.trim()}`);await delay(50);}}
  if(!active)throw new Error(`Chromium did not expose a DevTools port within 30 seconds: ${browserStderr.trim()}`);
  const port=Number(active.split('\n')[0]), created=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});if(!created.ok)throw new Error(`Chrome DevTools HTTP ${created.status}`);
  const target=await created.json();cdp=new DevTools(target.webSocketDebuggerUrl);await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setDefaultBackgroundColorOverride',{color:{r:255,g:255,b:255,a:1}});
  const results=[];
  for(const test of cases){
    await cdp.send('Page.navigate',{url:`${origin}${test.query}`});
    for(let i=0;i<240;i++){const ready=await cdp.evaluate('Boolean(window.__graphicsReady)');if(ready)break;const error=await cdp.evaluate('window.__graphicsError');if(error)throw new Error(error);await delay(50);if(i===239)throw new Error(`Graphics PoC did not signal ready: ${await cdp.evaluate('JSON.stringify({url:location.href,ready:document.readyState,status:document.querySelector("#scene-status")?.textContent,body:document.body.innerText.slice(0,160),resources:performance.getEntriesByType("resource").map(r=>({name:r.name.slice(-65),duration:Math.round(r.duration),size:r.transferSize})).filter(r=>r.duration>200).slice(-10)})')}`);}
    await cdp.evaluate(`(async()=>{localStorage.clear(); ${test.setup} document.querySelector('#renderer').value='canvas'; document.querySelector('#renderer').dispatchEvent(new Event('change',{bubbles:true})); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));})()`);
    // Capture only the map canvas. This excludes labels, fonts, and controls; measured capture time is never mixed into FPS.
    const capture=await cdp.evaluate('(()=>{const r=document.querySelector("#canvas-renderer").getBoundingClientRect();return{devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},canvas:{width:r.width,height:r.height},clip:{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}}})()');
    if(capture.devicePixelRatio!==1||capture.viewport.width!==width||capture.viewport.height!==height)throw new Error(`Screenshot viewport drifted: ${JSON.stringify(capture)}`);
    const clip=capture.clip;
    const captureStart=performance.now();
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false,clip});
    const captureMs=Math.round(performance.now()-captureStart);
    const png=Buffer.from(shot.data,'base64'), dimensions=decodePng(png), filename=path.join(fixtures,`${test.name}.png`);
    if(update){await writeFile(filename,png);results.push({name:test.name,status:'updated',capture:{...capture,bitmap:{width:dimensions.width,height:dimensions.height}},captureMs});continue;}
    let baseline;try{baseline=await readFile(filename);}catch{throw new Error(`Missing ${filename}; review the intended visual state, then run with --update to create baselines.`);}
    const diff=comparePng(decodePng(baseline),decodePng(png),{channelTolerance,maxChangedRatio});
    results.push({name:test.name,status:diff.pass?'pass':'fail',capture:{...capture,bitmap:{width:dimensions.width,height:dimensions.height}},changedRatio:diff.changedRatio,maxChannelDelta:diff.maxChannelDelta,captureMs});
  }
  console.log(JSON.stringify({browser:(await cdp.send('Browser.getVersion')).product,viewport:{width,height,deviceScaleFactor:1},seed:20261012,renderer:'Canvas 2D',results},null,2));
  if(results.some(result=>result.status==='fail'))process.exitCode=1;
} finally {if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.close();}if(browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),delay(1000)]);if(browser.exitCode===null)browser.kill('SIGKILL');}await rm(userData,{recursive:true,force:true,maxRetries:5,retryDelay:100});await new Promise(resolve=>localServer.close(resolve));}
