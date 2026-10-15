import {execFileSync} from 'node:child_process';
import {access, readdir, readFile, stat} from 'node:fs/promises';
import {arch, cpus, homedir, release, type} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium, firefox} from 'playwright';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';

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

const origin = process.env.RIOSE_URL ?? 'http://127.0.0.1:8000/';
const browserArgument = process.argv.find(argument => argument.startsWith('--browser='))?.slice('--browser='.length);
const browserEngine = browserArgument ?? process.env.NATIVE_WASM_BROWSER ?? 'chromium';
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
  'src/client/product-app.js',
  'src/client/worker.js',
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
if (!['chromium', 'firefox'].includes(browserEngine)) throw new Error('NATIVE_WASM_BROWSER must be chromium or firefox');

const browserType = browserEngine === 'firefox' ? firefox : chromium;
const browserOptions = browserEngine === 'firefox'
  ? {headless: true}
  : {headless: true, executablePath: await findChrome(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']};
const sourceHashes = Object.fromEntries(await Promise.all(fingerprintPaths.map(async relativePath => {
  const contents = await readFile(new URL(`../${relativePath}`, import.meta.url));
  return [relativePath, crypto.createHash('sha256').update(contents).digest('hex')];
})));
const sourceTreeDigest = crypto.createHash('sha256')
  .update(Object.entries(sourceHashes).map(([file, digest]) => `${file}:${digest}\n`).join(''))
  .digest('hex');
const browser = await browserType.launch(browserOptions);
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
const appUrl = new URL('/home.html', origin);

const baselineGolden = JSON.parse(await readFile(new URL('../tests/scenario-goldens/baseline-pasture.json', import.meta.url), 'utf8'));
const housingGolden = JSON.parse(await readFile(new URL('../tests/scenario-goldens/housing-comparison.json', import.meta.url), 'utf8'));

const requestSource = `
const deepEqual=(a,b)=>{if(a===b)return true;if(typeof a!==typeof b||a===null||b===null)return false;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>deepEqual(v,b[i]));if(typeof a==='object'){const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&deepEqual(a[k],b[k]));}return false;};
const scientificOnly=value=>{if(Array.isArray(value))return value.map(scientificOnly);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([key])=>!['locomotionSeed','locomotionRngState','x','y','targetX','targetY'].includes(key)).map(([key,item])=>[key,scientificOnly(item)]));};
let workerId=0;
function createWorker(backend,wasmUrl){const worker=new Worker('/src/client/native-scenario-wasm-bench-worker.js',{type:'module'});const pending=new Map();worker.onmessage=event=>{const entry=pending.get(event.data.id);if(entry){pending.delete(event.data.id);entry.resolve(event.data);}};const call=message=>new Promise((resolve,reject)=>{const id=++workerId;pending.set(id,{resolve,reject});worker.postMessage({...message,id});});return {worker,call,backend,wasmUrl};}
async function startWorker(backend,wasmUrl){const started=performance.now(),client=createWorker(backend,wasmUrl);const response=await client.call({action:'init',backend,wasmUrl});return {...client,startup:{...response.startup,workerToReadyMs:performance.now()-started}};}
async function run(client,backend,request){const started=performance.now(),response=await client.call({action:'run',backend,request});return {...response,roundTripMs:performance.now()-started};}
const baselineGolden=${JSON.stringify(baselineGolden)};
const housingGolden=${JSON.stringify(housingGolden)};
const goldenBaselineRequest={type:'baseline',version:1,seed:baselineGolden.seed,animalCount:baselineGolden.animalCount,configuration:baselineGolden.configuration,hours:baselineGolden.horizon.value};
const goldenHousingRequest={type:'housing-comparison',version:1,snapshot:housingGolden.replayManifest.baseline,days:housingGolden.horizon.value};
const wasmCold=await startWorker('wasm');
const javaScriptCold=await startWorker('javascript');
if(wasmCold.startup.status!=='ready')throw new Error('Full-core WASM worker did not initialize: '+JSON.stringify(wasmCold.startup));
const wasmGoldenBaseline=await run(wasmCold,'wasm',goldenBaselineRequest);
const jsGoldenBaseline=await run(javaScriptCold,'javascript',goldenBaselineRequest);
const wasmGoldenHousing=await run(wasmCold,'wasm',goldenHousingRequest);
const jsGoldenHousing=await run(javaScriptCold,'javascript',goldenHousingRequest);
const goldenParity={baselineWasmToGolden:deepEqual(scientificOnly(wasmGoldenBaseline.result),scientificOnly({type:'baseline',snapshot:baselineGolden.output.state,metrics:baselineGolden.output.metrics})),baselineJsToGolden:deepEqual(scientificOnly(jsGoldenBaseline.result),scientificOnly({type:'baseline',snapshot:baselineGolden.output.state,metrics:baselineGolden.output.metrics})),housingWasmToGolden:deepEqual(wasmGoldenHousing.result,{type:'housing-comparison',comparison:housingGolden.output}),housingJsToGolden:deepEqual(jsGoldenHousing.result,{type:'housing-comparison',comparison:housingGolden.output}),baselineWasmToJs:deepEqual(scientificOnly(wasmGoldenBaseline.result),scientificOnly(jsGoldenBaseline.result)),housingWasmToJs:deepEqual(wasmGoldenHousing.result,jsGoldenHousing.result)};
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
    for(const backend of order){const client=backend==='wasm'?wasmCold:javaScriptCold;const result=await run(client,backend,request);if(!result.ok)throw new Error(backend+' scenario failed at '+count+' animals: '+result.error);if(backend==='wasm'){wasmRuns.push({count,elapsedMs:result.elapsedMs,roundTripMs:result.roundTripMs});bridgeRuns.push({count,...result.bridgeTimings});memoryRuns.push({count,memoryBytes:result.wasmMemoryBytes});}else{jsRuns.push({count,elapsedMs:result.elapsedMs,roundTripMs:result.roundTripMs});}}
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
  const ready = await fetch(appUrl);
  if (!ready.ok) throw new Error(`Benchmark origin returned HTTP ${ready.status}: ${appUrl}`);
  await page.goto(appUrl.toString(), {waitUntil: 'load'});

  const browserResult = await page.evaluate(`(async()=>{${requestSource}})()`);
  browserResult.browser.browserProduct = `${browserEngine === 'chromium' ? 'Chromium' : 'Firefox'} ${browser.version()}`;
  browserResult.browser.browserRevision = `Playwright ${process.env.npm_package_devDependencies_playwright ?? '1.57.0'}`;

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
    })},
    ui: {status: 'not-measured', measurements: []},
    uiEndToEnd: {status: 'not-measured', measurements: []},
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
    runtime: {browser: browserEngine, browserVersion: browserResult.browser.browserProduct, browserRevision: browserResult.browser.browserRevision, browserUserAgent: browserResult.browser.userAgent, node: process.version, rust: execFileSync('rustc', ['--version'], {encoding: 'utf8'}).trim()},
    hardware: {os: `${type()} ${release()}`, architecture: arch(), cpu: cpus()[0]?.model ?? null, gpuMemoryBytes: null, browserDevice: {hardwareConcurrency: browserResult.browser.hardwareConcurrency, deviceMemoryGiB: browserResult.browser.deviceMemoryGiB, devicePixelRatio: browserResult.browser.devicePixelRatio, screen: browserResult.browser.screen}},
    workload: {seed: 20261012, populations, scenario: 'baseline pasture; 24-hour horizon', fixtureChecks: 'baseline-pasture (A3) and housing-comparison (B3), exact JSON parity'},
    configuration: {warmupRuns: warmups, repetitions, startupWarmSamples: browserResult.wasmWarmStartup.length, workersPerWarmStartupSample: 10, browserCacheState: `isolated ${browserEngine} profile; warm samples divide batches of ten Worker startups after the initial cold WASM compile`},
    limits: {farmEngineMaxAnimals: 10000, numericKernelMaxAnimalsMeasured: 100000},
    phases,
    timingBoundaries: [
      {phase: 'startup', timed: ['Worker construction through ready message; WASM fetch and compile are included for WASM.'], notTimed: ['Browser process launch and initial page navigation.']},
      {phase: 'coldStartup', timed: ['First dedicated Worker startup and first WASM fetch/compile in an isolated browser profile.'], notTimed: ['Browser process startup.']},
      {phase: 'warmStartup', timed: ['New Worker startup after the first WASM module has been fetched and compiled by the selected browser.'], notTimed: ['A guaranteed HTTP cache hit across devices/browsers.']},
      {phase: 'engine', timed: ['JavaScript FarmEngine setup, 24-hour tick, snapshot, and metrics; Rust run_native_scenario after request JSON parsing.'], notTimed: ['Worker scheduling/transport, WASM request parsing and result serialization, and page rendering.']},
      {phase: 'fullScenario', timed: ['Worker-side 24-hour baseline including JS engine work or WASM JSON ABI parse, native scenario, result serialization, response copy, and JSON decode.'], notTimed: ['Page rendering and browser process launch.']},
      {phase: 'worker', timed: ['Page request through Worker response including structured-clone transfer and scheduling.'], notTimed: ['UI rendering; the study uses a dedicated benchmark Worker.']},
      {phase: 'bridgeMarshaling', timed: ['WASM request JSON encode, input allocation/copy, Rust request JSON parse, result JSON serialization, output copy, response JSON decode, and total ABI call.'], notTimed: ['UI rendering; response-envelope assembly is included in the total ABI call but not timed as a separate subphase.']},
      {phase: 'memory', timed: ['WASM linear memory high-water size after each completed scenario.'], notTimed: ['Worker JS heap attribution, page heap, process RSS, GPU memory, and transient peak allocation.']},
    ],
    results: {browser: browserResult.browser, goldenParity: browserResult.goldenParity, fallback: browserResult.fallback, warmupRuns: warmups, repetitions, decision: parityFailed ? 'NO-GO: scenario parity failed' : endToEndGo ? 'WASM compute and Worker path faster at each population in this run; repeat before adoption' : 'No consistent WASM compute and Worker advantage across all tested populations', aggregateMedianMs: {wasm: wasmMedian, javascript: jsMedian}, medianEndToEndBenefitAtEveryPopulation: endToEndGo, sourceArtifactBytes: (await stat(new URL('../wasm/riose_scenario_core.wasm', import.meta.url))).size, sourceFingerprint: {algorithm: 'sha256', treeDigest: sourceTreeDigest, files: sourceHashes}},
    limitations: [
      `One Linux x86_64 host and one ${browserEngine} build are measured per report; evidence from other browser releases or devices is not implied.`,
      'The JavaScript engine and Rust WASM core execute in separate dedicated module Workers with equivalent requests and exact output parity. This benchmark measures compute, Worker transport, startup, bridge costs, and WASM memory only; it does not measure product presentation.',
      'Worker JS heap and process RSS are not attributed. WASM linear memory is reported separately and is not GPU memory.',
      'The baseline workload is a 24-hour demonstrative pasture scenario; it is not scientific model validation or evidence for model accuracy.',
      'A single cold startup and three warm startups describe this host run; repeatability across hosts remains for review.',
    ],
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
