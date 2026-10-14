import {execFileSync, spawn} from 'node:child_process';
import {access, mkdtemp, readdir, readFile, rm, stat} from 'node:fs/promises';
import {arch, cpus, homedir, release, tmpdir, type} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';
import {waitForDevToolsActivePort} from './browser-startup.mjs';

async function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  try {
    const cache = path.join(homedir(), '.cache/ms-playwright');
    for (const entry of (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))) {
      candidates.push(path.join(cache, entry, 'chrome-linux64/chrome'), path.join(cache, entry, 'chrome-linux/chrome'));
    }
  } catch {}
  for (const candidate of candidates.filter(Boolean)) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error('Chromium was not found. Set CHROME_BIN to a local Chromium or Chrome executable.');
}

class Cdp {
  constructor(wsUrl) {
    const endpoint = new URL(wsUrl);
    const client = net.connect(Number(endpoint.port), endpoint.hostname);
    this.socket = client;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.nextId = 0;
    this.ready = new Promise((resolve, reject) => {
      client.once('connect', () => {
        const key = crypto.randomBytes(16).toString('base64');
        client.write(`GET ${endpoint.pathname}${endpoint.search} HTTP/1.1\r\nHost: ${endpoint.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
        let response = '';
        const onData = chunk => {
          response += chunk.toString('binary');
          if (!response.includes('\r\n\r\n')) return;
          client.off('data', onData);
          if (!response.startsWith('HTTP/1.1 101')) reject(new Error(response));
          else resolve();
        };
        client.on('data', onData);
      });
      client.once('error', reject);
    }).then(() => client.on('data', chunk => this.consume(chunk)));
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const opcode = this.buffer[0] & 15;
      let length = this.buffer[1] & 127;
      let offset = 2;
      if (length === 126) { if (this.buffer.length < 4) return; length = this.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (this.buffer.length < 10) return; length = Number(this.buffer.readBigUInt64BE(2)); offset = 10; }
      const masked = (this.buffer[1] & 128) !== 0;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;
      let payload = this.buffer.subarray(offset, offset + length);
      if (masked) {
        const mask = this.buffer.subarray(offset - 4, offset);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      }
      this.buffer = this.buffer.subarray(offset + length);
      if (opcode === 8) { this.socket.end(); continue; }
      if (opcode === 9) { this.writeFrame(10, payload); continue; }
      if (opcode !== 1) continue;
      const message = JSON.parse(payload.toString());
      if (!message.id) continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message ?? JSON.stringify(message.error))) : pending.resolve(message.result);
    }
  }

  writeFrame(opcode, payload) {
    const body = Buffer.from(payload);
    let header;
    if (body.length < 126) { header = Buffer.alloc(6); header[0] = 0x80 | opcode; header[1] = 0x80 | body.length; }
    else if (body.length <= 65535) { header = Buffer.alloc(8); header[0] = 0x80 | opcode; header[1] = 0x80 | 126; header.writeUInt16BE(body.length, 2); }
    else { header = Buffer.alloc(14); header[0] = 0x80 | opcode; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(body.length), 2); }
    const mask = crypto.randomBytes(4);
    mask.copy(header, header.length - 4);
    const masked = Buffer.alloc(body.length);
    for (let i = 0; i < body.length; i++) masked[i] = body[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, masked]));
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.nextId;
    const response = new Promise((resolve, reject) => this.pending.set(id, {resolve, reject}));
    this.writeFrame(1, JSON.stringify({id, method, params}));
    return response;
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    if (response.result?.value === undefined) throw new Error(`CDP evaluation returned no by-value result: ${JSON.stringify(response.result)}`);
    return response.result.value;
  }

  close() { this.socket.end(); }
}

const origin = process.env.RIOSE_URL ?? 'http://127.0.0.1:8000/';
const repetitions = Number(process.env.NATIVE_WASM_REPETITIONS ?? 15);
const warmups = Number(process.env.NATIVE_WASM_WARMUPS ?? 3);
const fingerprintPaths = [
  'package.json',
  'package-lock.json',
  'Cargo.lock',
  'crates/riose-core/Cargo.toml',
  'crates/riose-core/src/br_corte.rs',
  'crates/riose-core/src/contract.rs',
  'crates/riose-core/src/environment.rs',
  'crates/riose-core/src/feeding.rs',
  'crates/riose-core/src/lib.rs',
  'crates/riose-core/src/runtime.rs',
  'crates/riose-core/src/simulation.rs',
  'crates/riose-core/src/snapshot.rs',
  'crates/riose-core/src/state.rs',
  'crates/riose-core/src/wasm_scenario.rs',
  'src/client/engine.js',
  'src/client/metabolism-wasm.js',
  'src/client/native-scenario-wasm.js',
  'src/client/native-scenario-wasm-bench-worker.js',
  'scripts/build-wasm-scenario.sh',
  'scripts/benchmark-native-wasm-browser.mjs',
  'scripts/browser-startup.mjs',
  'scripts/benchmark-report.mjs',
  'docs/architecture/benchmark-report.schema.json',
  'tests/scenario-goldens/baseline-pasture.json',
  'tests/scenario-goldens/housing-comparison.json',
  'wasm/riose_core.wasm',
  'wasm/riose_scenario_core.wasm',
];
if (!Number.isInteger(repetitions) || repetitions < 3 || !Number.isInteger(warmups) || warmups < 1) {
  throw new Error('NATIVE_WASM_REPETITIONS must be >= 3 and NATIVE_WASM_WARMUPS must be >= 1');
}

const chrome = await findChrome();
const sourceHashes = Object.fromEntries(await Promise.all(fingerprintPaths.map(async relativePath => {
  const contents = await readFile(new URL(`../${relativePath}`, import.meta.url));
  return [relativePath, crypto.createHash('sha256').update(contents).digest('hex')];
})));
const sourceTreeDigest = crypto.createHash('sha256')
  .update(Object.entries(sourceHashes).map(([file, digest]) => `${file}:${digest}\n`).join(''))
  .digest('hex');
const userData = await mkdtemp(path.join(tmpdir(), 'riose-native-wasm-bench-'));
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${userData}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
let browserExit = null;
let browserStderr = '';
browser.once('exit', (code, signal) => { browserExit = {code, signal}; });
browser.stderr.setEncoding('utf8');
browser.stderr.on('data', chunk => { browserStderr = (browserStderr + chunk).slice(-4000); });
let cdp;

const requestSource = `
const deepEqual=(a,b)=>{if(a===b)return true;if(typeof a!==typeof b||a===null||b===null)return false;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>deepEqual(v,b[i]));if(typeof a==='object'){const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&deepEqual(a[k],b[k]));}return false;};
let workerId=0;
function createWorker(backend,wasmUrl){const worker=new Worker('/src/client/native-scenario-wasm-bench-worker.js',{type:'module'});const pending=new Map();worker.onmessage=event=>{const entry=pending.get(event.data.id);if(entry){pending.delete(event.data.id);entry.resolve(event.data);}};const call=message=>new Promise((resolve,reject)=>{const id=++workerId;pending.set(id,{resolve,reject});worker.postMessage({...message,id});});return {worker,call,backend,wasmUrl};}
async function startWorker(backend,wasmUrl){const started=performance.now(),client=createWorker(backend,wasmUrl);const response=await client.call({action:'init',backend,wasmUrl});return {...client,startup:{...response.startup,workerToReadyMs:performance.now()-started}};}
async function run(client,backend,request){const started=performance.now(),response=await client.call({action:'run',backend,request});return {...response,roundTripMs:performance.now()-started};}
const baselineGolden=await fetch('/tests/scenario-goldens/baseline-pasture.json').then(r=>r.json());
const housingGolden=await fetch('/tests/scenario-goldens/housing-comparison.json').then(r=>r.json());
const goldenBaselineRequest={type:'baseline',version:1,seed:baselineGolden.seed,animalCount:baselineGolden.animalCount,configuration:baselineGolden.configuration,hours:baselineGolden.horizon.value};
const goldenHousingRequest={type:'housing-comparison',version:1,snapshot:housingGolden.replayManifest.baseline,days:housingGolden.horizon.value};
const wasmCold=await startWorker('wasm');
const javaScriptCold=await startWorker('javascript');
if(wasmCold.startup.status!=='ready')throw new Error('Full-core WASM worker did not initialize: '+JSON.stringify(wasmCold.startup));
const wasmGoldenBaseline=await run(wasmCold,'wasm',goldenBaselineRequest);
const jsGoldenBaseline=await run(javaScriptCold,'javascript',goldenBaselineRequest);
const wasmGoldenHousing=await run(wasmCold,'wasm',goldenHousingRequest);
const jsGoldenHousing=await run(javaScriptCold,'javascript',goldenHousingRequest);
const goldenParity={baselineWasmToGolden:deepEqual(wasmGoldenBaseline.result, {type:'baseline',snapshot:baselineGolden.output.state,metrics:baselineGolden.output.metrics}),baselineJsToGolden:deepEqual(jsGoldenBaseline.result,{type:'baseline',snapshot:baselineGolden.output.state,metrics:baselineGolden.output.metrics}),housingWasmToGolden:deepEqual(wasmGoldenHousing.result,{type:'housing-comparison',comparison:housingGolden.output}),housingJsToGolden:deepEqual(jsGoldenHousing.result,{type:'housing-comparison',comparison:housingGolden.output}),baselineWasmToJs:deepEqual(wasmGoldenBaseline.result,jsGoldenBaseline.result),housingWasmToJs:deepEqual(wasmGoldenHousing.result,jsGoldenHousing.result)};
if(Object.values(goldenParity).some(value=>!value))throw new Error('A3/B3 browser parity failed: '+JSON.stringify(goldenParity));

async function warmStartupBatch(backend){const started=performance.now();for(let workerIndex=0;workerIndex<10;workerIndex++){const client=await startWorker(backend);client.worker.terminate();}return (performance.now()-started)/10;}
const wasmWarmStartup=[],jsWarmStartup=[];
for(let i=0;i<3;i++){wasmWarmStartup.push(await warmStartupBatch('wasm'));jsWarmStartup.push(await warmStartupBatch('javascript'));}
const wasmRuns=[],jsRuns=[],bridgeRuns=[],memoryRuns=[];
for(const count of [100,1000,10000]){
  const request={type:'baseline',version:1,seed:20261012,animalCount:count,configuration:{diet:'pasture',housing:'pasture',weather:'normal',supplement:0},hours:24};
  for(let i=0;i<${warmups};i++){const [w,j]=await Promise.all([run(wasmCold,'wasm',request),run(javaScriptCold,'javascript',request)]);if(!deepEqual(w.result,j.result))throw new Error('Full-core parity failed at '+count+' animals during warmup '+i);}
  for(let repetition=0;repetition<${repetitions};repetition++){
    const order=repetition%2===0?['wasm','javascript']:['javascript','wasm'];
    for(const backend of order){const client=backend==='wasm'?wasmCold:javaScriptCold;const result=await run(client,backend,request);if(!result.ok)throw new Error(backend+' scenario failed at '+count+' animals: '+result.error);if(backend==='wasm'){wasmRuns.push({count,elapsedMs:result.elapsedMs,roundTripMs:result.roundTripMs});bridgeRuns.push({count,...result.bridgeTimings});memoryRuns.push({count,memoryBytes:result.wasmMemoryBytes});}else jsRuns.push({count,elapsedMs:result.elapsedMs,roundTripMs:result.roundTripMs});}
  }
}

const missingWasm=await startWorker('wasm','/wasm/riose_scenario_core_missing.wasm');
const fallback=await run(missingWasm,'wasm',goldenBaselineRequest);
const fallbackVerified=fallback.ok&&fallback.backend==='javascript'&&fallback.fallback?.used===true&&deepEqual(fallback.result,jsGoldenBaseline.result);
const invalidWasm=await startWorker('wasm','data:application/wasm;base64,AAAAAA==');
const invalidFallback=await run(invalidWasm,'wasm',goldenBaselineRequest);
const invalidFallbackVerified=invalidFallback.ok&&invalidFallback.backend==='javascript'&&invalidFallback.fallback?.used===true&&deepEqual(invalidFallback.result,jsGoldenBaseline.result);
if(!fallbackVerified||!invalidFallbackVerified)throw new Error('Unavailable/invalid-WASM JavaScript fallback failed');
const result={browser:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency??null,deviceMemoryGiB:navigator.deviceMemory??null,devicePixelRatio,screen:{width:screen.width,height:screen.height}},goldenParity,wasmColdStartup:wasmCold.startup,jsColdStartup:javaScriptCold.startup,wasmWarmStartup,jsWarmStartup,wasmRuns,jsRuns,bridgeRuns,memoryRuns,fallback:{verified:fallbackVerified&&invalidFallbackVerified,missing:{verified:fallbackVerified,reason:fallback.fallback.reason},invalid:{verified:invalidFallbackVerified,reason:invalidFallback.fallback.reason}}};
wasmCold.worker.terminate();javaScriptCold.worker.terminate();missingWasm.worker.terminate();invalidWasm.worker.terminate();
return result;
`;

try {
  const active = await waitForDevToolsActivePort({filePath: path.join(userData, 'DevToolsActivePort'), getExit: () => browserExit, getStderr: () => browserStderr});
  const port = Number(active.split('\n')[0]);
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, {method: 'PUT'});
  if (!response.ok) throw new Error(`Chrome DevTools HTTP ${response.status}`);
  const target = await response.json();
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');
  const browserVersion = await cdp.send('Browser.getVersion');
  const ready = await fetch(origin);
  if (!ready.ok) throw new Error(`Benchmark origin returned HTTP ${ready.status}: ${origin}`);
  await cdp.send('Page.navigate', {url: origin});
  await delay(1000);
  await cdp.send('HeapProfiler.collectGarbage');
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(item => ['JSHeapUsedSize', 'JSHeapTotalSize'].includes(item.name)).map(item => [item.name, item.value]));
  const browserResult = await cdp.evaluate(`(async()=>{${requestSource}})()`);
  browserResult.browser.browserProduct = browserVersion.product;
  browserResult.browser.browserRevision = browserVersion.revision;
  await cdp.send('HeapProfiler.collectGarbage');
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(item => ['JSHeapUsedSize', 'JSHeapTotalSize'].includes(item.name)).map(item => [item.name, item.value]));

  const byCount = (rows, count, field) => rows.filter(row => row.count === count).map(row => row[field]);
  const summary = values => summarizeSamples(values);
  const populations = [100, 1000, 10000].map(animals => ({animals, scope: 'full-core browser scenario and Worker', limit: 'FarmEngine supported maximum 10000'}));
  const phases = {
    engine: {status: 'measured', measurements: [100, 1000, 10000].flatMap(animals => {
      const wasmRows = browserResult.bridgeRuns.filter(row => row.count === animals);
      const jsRows = browserResult.jsRuns.filter(row => row.count === animals);
      return [
        measurement('engine', 'nativeScenarioExecution', 'ms', summary(wasmRows.map(row => row.nativeScenarioEngineMs)), {population: {animals, scope: 'full-core scenario engine'}, implementation: 'full-core-wasm', observations: wasmRows.map(row => row.nativeScenarioEngineMs), source: 'riose_scenario_run_json timing around run_native_scenario after request JSON parse'}),
        measurement('engine', 'farmEngineBaseline24h', 'ms', summary(jsRows.map(row => row.elapsedMs)), {population: {animals, scope: 'full-core scenario engine'}, implementation: 'javascript', observations: jsRows.map(row => row.elapsedMs), source: 'benchmark Worker timing around FarmEngine setup, tick, snapshot, and metrics'}),
      ];
    })},
    startup: {status: 'measured', measurements: [
      measurement('startup', 'workerAndWasmColdStartup', 'ms', summary([browserResult.wasmColdStartup.workerToReadyMs]), {implementation: 'full-core-wasm', memory: {wasmLinearBytes: browserResult.wasmColdStartup.memoryBytes}, observations: [browserResult.wasmColdStartup.workerToReadyMs]}),
      measurement('startup', 'workerAndJsColdStartup', 'ms', summary([browserResult.jsColdStartup.workerToReadyMs]), {implementation: 'javascript', observations: [browserResult.jsColdStartup.workerToReadyMs]}),
      measurement('startup', 'workerAndWasmWarmStartup', 'ms', summary(browserResult.wasmWarmStartup), {implementation: 'full-core-wasm', observations: browserResult.wasmWarmStartup}),
      measurement('startup', 'workerAndJsWarmStartup', 'ms', summary(browserResult.jsWarmStartup), {implementation: 'javascript', observations: browserResult.jsWarmStartup}),
    ]},
    coldStartup: {status: 'measured', measurements: [
      measurement('coldStartup', 'workerAndWasmColdStartup', 'ms', summary([browserResult.wasmColdStartup.workerToReadyMs]), {implementation: 'full-core-wasm', observations: [browserResult.wasmColdStartup.workerToReadyMs]}),
      measurement('coldStartup', 'workerAndJsColdStartup', 'ms', summary([browserResult.jsColdStartup.workerToReadyMs]), {implementation: 'javascript', observations: [browserResult.jsColdStartup.workerToReadyMs]}),
    ]},
    warmStartup: {status: 'measured', measurements: [
      measurement('warmStartup', 'workerAndWasmWarmStartup', 'ms', summary(browserResult.wasmWarmStartup), {implementation: 'full-core-wasm', observations: browserResult.wasmWarmStartup}),
      measurement('warmStartup', 'workerAndJsWarmStartup', 'ms', summary(browserResult.jsWarmStartup), {implementation: 'javascript', observations: browserResult.jsWarmStartup}),
    ]},
    fullScenario: {status: 'measured', measurements: [100, 1000, 10000].flatMap(animals => [
      measurement('fullScenario', 'baseline24h', 'ms', summary(byCount(browserResult.wasmRuns, animals, 'elapsedMs')), {population: {animals, scope: 'FarmEngine scenario'}, implementation: 'full-core-wasm', observations: byCount(browserResult.wasmRuns, animals, 'elapsedMs')}),
      measurement('fullScenario', 'baseline24h', 'ms', summary(byCount(browserResult.jsRuns, animals, 'elapsedMs')), {population: {animals, scope: 'FarmEngine scenario'}, implementation: 'javascript', observations: byCount(browserResult.jsRuns, animals, 'elapsedMs')}),
    ])},
    worker: {status: 'measured', measurements: [100, 1000, 10000].flatMap(animals => [
      measurement('worker', 'scenarioRequestRoundTrip', 'ms', summary(byCount(browserResult.wasmRuns, animals, 'roundTripMs')), {population: {animals, scope: 'full-core scenario Worker'}, implementation: 'full-core-wasm', observations: byCount(browserResult.wasmRuns, animals, 'roundTripMs')}),
      measurement('worker', 'scenarioRequestRoundTrip', 'ms', summary(byCount(browserResult.jsRuns, animals, 'roundTripMs')), {population: {animals, scope: 'full-core scenario Worker'}, implementation: 'javascript', observations: byCount(browserResult.jsRuns, animals, 'roundTripMs')}),
    ])},
    bridgeMarshaling: {status: 'measured', measurements: [100, 1000, 10000].flatMap(animals => {
      const rows = browserResult.bridgeRuns.filter(row => row.count === animals);
      return ['requestJsonEncodeMs', 'inputAllocateMs', 'inputCopyMs', 'requestJsonParseMs', 'resultJsonSerializeMs', 'outputCopyMs', 'responseJsonDecodeMs', 'coreAndJsonAbiMs'].map(field => measurement('bridgeMarshaling', field, 'ms', summary(rows.map(row => row[field])), {population: {animals, scope: 'full-core scenario request'}, implementation: 'full-core-wasm', observations: rows.map(row => row[field]), detail: field === 'requestJsonParseMs' ? 'measured inside riose_scenario_run_json before native scenario execution' : field === 'resultJsonSerializeMs' ? 'measured inside riose_scenario_run_json after native scenario execution' : field === 'coreAndJsonAbiMs' ? 'total Rust ABI call including request parsing, native execution, result serialization, and response envelope' : undefined}));
    })},
    memory: {status: 'measured', measurements: [100, 1000, 10000].map(animals => {
      const rows = browserResult.memoryRuns.filter(row => row.count === animals);
      return measurement('memory', 'wasmLinearMemoryBytesAfterScenario', 'bytes', summary(rows.map(row => row.memoryBytes)), {population: {animals, scope: 'full-core scenario'}, implementation: 'full-core-wasm', memoryType: 'wasm-memory', observations: rows.map(row => row.memoryBytes), source: 'WebAssembly.Memory.buffer.byteLength after the scenario response has been copied'});
    }).concat(measurement('memory', 'pageJsHeapAfterGarbageCollection', 'bytes', summary([after.JSHeapUsedSize]), {population: {animals: 10000, scope: 'browser benchmark page'}, implementation: 'combined-browser-page', memoryType: 'js-heap', observations: [after.JSHeapUsedSize], deltaBytes: after.JSHeapUsedSize - before.JSHeapUsedSize, source: 'Chrome Performance.getMetrics after forced page garbage collection; excludes dedicated Worker heap attribution'}))},
    ui: {status: 'not-measured', measurements: []},
  };
  const parityFailed = Object.values(browserResult.goldenParity).some(value => !value);
  const wasmTimes = browserResult.wasmRuns.map(row => row.elapsedMs);
  const jsTimes = browserResult.jsRuns.map(row => row.elapsedMs);
  const wasmMedian = summary(wasmTimes).median;
  const jsMedian = summary(jsTimes).median;
  const endToEndGo = [100, 1000, 10000].every(animals => {
    const wasm = summary(byCount(browserResult.wasmRuns, animals, 'roundTripMs')).median;
    const js = summary(byCount(browserResult.jsRuns, animals, 'roundTripMs')).median;
    return wasm < js;
  });
  const result = benchmarkReport({
    name: 'native-core-browser-wasm',
    runtime: {browser: 'Chromium', browserVersion: browserResult.browser.browserProduct, browserRevision: browserResult.browser.browserRevision, browserUserAgent: browserResult.browser.userAgent, node: process.version, rust: execFileSync('rustc', ['--version'], {encoding: 'utf8'}).trim()},
    hardware: {os: `${type()} ${release()}`, architecture: arch(), cpu: cpus()[0]?.model ?? null, gpuMemoryBytes: null, browserDevice: {hardwareConcurrency: browserResult.browser.hardwareConcurrency, deviceMemoryGiB: browserResult.browser.deviceMemoryGiB, devicePixelRatio: browserResult.browser.devicePixelRatio, screen: browserResult.browser.screen}},
    workload: {seed: 20261012, populations, scenario: 'baseline pasture; 24-hour horizon', fixtureChecks: 'baseline-pasture (A3) and housing-comparison (B3), exact JSON parity'},
    configuration: {warmupRuns: warmups, repetitions, startupWarmSamples: browserResult.wasmWarmStartup.length, workersPerWarmStartupSample: 10, browserCacheState: 'same isolated Chromium profile; warm samples divide batches of ten Worker startups after the initial cold WASM compile'},
    limits: {farmEngineMaxAnimals: 10000, rendererMaxAnimals: 10000, numericKernelMaxAnimalsMeasured: 100000},
    phases,
    timingBoundaries: [
      {phase: 'startup', timed: ['Worker construction through ready message; WASM fetch and compile are included for WASM.'], notTimed: ['Browser process launch and initial page navigation.']},
      {phase: 'coldStartup', timed: ['First dedicated Worker startup and first WASM fetch/compile in an isolated browser profile.'], notTimed: ['Chrome process startup.']},
      {phase: 'warmStartup', timed: ['New Worker startup after the first WASM module has been fetched and compiled by Chromium.'], notTimed: ['A guaranteed HTTP cache hit across devices/browsers.']},
      {phase: 'engine', timed: ['JavaScript FarmEngine setup, 24-hour tick, snapshot, and metrics; Rust run_native_scenario after request JSON parsing.'], notTimed: ['Worker scheduling/transport, WASM request parsing and result serialization, and page rendering.']},
      {phase: 'fullScenario', timed: ['Worker-side 24-hour baseline including JS engine work or WASM JSON ABI parse, native scenario, result serialization, response copy, and JSON decode.'], notTimed: ['Page rendering and Chrome process launch.']},
      {phase: 'worker', timed: ['Page request through Worker response including structured-clone transfer and scheduling.'], notTimed: ['UI rendering; the study uses a dedicated benchmark Worker.']},
      {phase: 'bridgeMarshaling', timed: ['WASM request JSON encode, input allocation/copy, Rust request JSON parse, result JSON serialization, output copy, response JSON decode, and total ABI call.'], notTimed: ['UI rendering; response-envelope assembly is included in the total ABI call but not timed as a separate subphase.']},
      {phase: 'memory', timed: ['WASM linear memory high-water size after each completed scenario and page JS heap after forced GC.'], notTimed: ['Worker JS heap attribution, process RSS, GPU memory, and transient peak allocation.']},
    ],
    results: {browser: browserResult.browser, goldenParity: browserResult.goldenParity, fallback: browserResult.fallback, warmupRuns: warmups, repetitions, decision: parityFailed ? 'NO-GO: scenario parity failed' : endToEndGo ? 'GO candidate: WASM was faster end-to-end for each tested population; requires independent repeat before adoption' : 'NO-GO for product adoption: no repeatable end-to-end benefit across all tested populations', aggregateMedianMs: {wasm: wasmMedian, javascript: jsMedian}, medianEndToEndBenefitAtEveryPopulation: endToEndGo, sourceArtifactBytes: (await stat(new URL('../wasm/riose_scenario_core.wasm', import.meta.url))).size, sourceFingerprint: {algorithm: 'sha256', treeDigest: sourceTreeDigest, files: sourceHashes}},
    limitations: [
      'One Linux x86_64 host and one Chromium build are measured per report; combined evidence across multiple Chromium releases still uses one browser engine and does not generalize to other devices.',
      'The JavaScript engine and Rust WASM core execute in separate dedicated module Workers with equivalent requests and exact output parity; no product UI is rendered.',
      'Worker JS heap and process RSS are not attributed. WASM linear memory is reported separately and is not GPU memory.',
      'The baseline workload is a 24-hour demonstrative pasture scenario; it is not scientific model validation or evidence for model accuracy.',
      'A single cold startup and three warm startups describe this host run; repeatability across hosts remains for review.',
    ],
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  cdp?.close();
  if (browser.exitCode === null) {
    browser.kill('SIGTERM');
    await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(1000)]);
    if (browser.exitCode === null) browser.kill('SIGKILL');
  }
  await rm(userData, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}
