import {spawn} from 'node:child_process';
import {access,mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {arch,cpus,homedir,platform,release,tmpdir,totalmem} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {benchmarkReport,measurement,summarizeSamples} from './benchmark-report.mjs';

const origin = process.env.RIOSE_GRAPHICS_URL ?? 'http://127.0.0.1:8000/graphics-poc/index.html';
const counts = (process.env.BENCH_HERDS ?? '1000,10000').split(',').map(Number);
const durationMs = Number(process.env.BENCH_DURATION_MS ?? 2500), warmupMs = Number(process.env.BENCH_WARMUP_MS ?? 700);
const cameraZoom = Number(process.env.BENCH_CAMERA_ZOOM ?? 2);
const repeats = Number(process.env.BENCH_REPEATS ?? 5);
const graphicsReadyTimeoutMs = Number(process.env.RIOSE_GRAPHICS_READY_TIMEOUT_MS ?? 30_000);
const gpuMode = process.env.BENCH_GPU_MODE ?? 'software';
const rawCaptureDirectory = process.env.BENCH_RAW_DIRECTORY ? path.resolve(process.env.BENCH_RAW_DIRECTORY) : null;
const deviceProfile = process.env.BENCH_DEVICE_PROFILE ?? null;
if (!['software', 'hardware'].includes(gpuMode)) throw new TypeError('BENCH_GPU_MODE must be software or hardware.');
if (gpuMode === 'hardware' && !deviceProfile) throw new TypeError('BENCH_DEVICE_PROFILE is required when BENCH_GPU_MODE=hardware (for example, laptop-amd-radeon).');
const benchmarkUrl = new URL(origin);
benchmarkUrl.searchParams.set('benchmark-fixture', 'approved-livestock-v1');

async function chromePath() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  try {
    const cache = path.join(homedir(), '.cache/ms-playwright');
    for (const entry of (await readdir(cache)).filter(item => /^chromium-\d+$/.test(item)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))) {
      candidates.push(path.join(cache, entry, 'chrome-linux64/chrome'), path.join(cache, entry, 'chrome-linux/chrome'));
    }
  } catch {}
  for (const item of candidates.filter(Boolean)) { try { await access(item); return item; } catch {} }
  throw new Error('Chromium not found; set CHROME_BIN to a Chromium executable.');
}

class DevTools {
  constructor(url) {
    const endpoint = new URL(url), socket = net.connect(Number(endpoint.port), endpoint.hostname);
    this.socket = socket; this.buffer = Buffer.alloc(0); this.pending = new Map(); this.id = 0;
    this.ready = new Promise((resolve, reject) => {
      socket.once('connect', () => {
        const key = crypto.randomBytes(16).toString('base64');
        socket.write(`GET ${endpoint.pathname}${endpoint.search} HTTP/1.1\r\nHost: ${endpoint.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
        let response = '';
        const onData = chunk => { response += chunk.toString('binary'); if (!response.includes('\r\n\r\n')) return; socket.off('data', onData); if (!response.startsWith('HTTP/1.1 101')) reject(new Error(response)); else resolve(); };
        socket.on('data', onData);
      });
      socket.once('error', reject);
    }).then(() => socket.on('data', chunk => this.consume(chunk)));
  }
  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const opcode = this.buffer[0] & 15; let length = this.buffer[1] & 127, offset = 2;
      if (length === 126) { if (this.buffer.length < 4) return; length = this.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (this.buffer.length < 10) return; length = Number(this.buffer.readBigUInt64BE(2)); offset = 10; }
      const masked = (this.buffer[1] & 128) !== 0; if (masked) offset += 4; if (this.buffer.length < offset + length) return;
      let payload = this.buffer.subarray(offset, offset + length);
      if (masked) { const mask = this.buffer.subarray(offset - 4, offset); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]; }
      this.buffer = this.buffer.subarray(offset + length);
      if (opcode === 8) { this.socket.end(); continue; }
      if (opcode !== 1) continue;
      const message = JSON.parse(payload.toString()), pending = this.pending.get(message.id); if (!pending) continue;
      this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    }
  }
  write(payload) {
    const body = Buffer.from(payload); let header;
    if (body.length < 126) { header = Buffer.alloc(6); header[0] = 0x81; header[1] = 0x80 | body.length; }
    else if (body.length <= 65535) { header = Buffer.alloc(8); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(body.length, 2); }
    else { header = Buffer.alloc(14); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(body.length), 2); }
    const mask = crypto.randomBytes(4); mask.copy(header, header.length - 4); const masked = Buffer.alloc(body.length);
    for (let i = 0; i < body.length; i++) masked[i] = body[i] ^ mask[i % 4]; this.socket.write(Buffer.concat([header, masked]));
  }
  async send(method, params = {}) { await this.ready; const id = ++this.id; const result = new Promise((resolve, reject) => this.pending.set(id, {resolve, reject})); this.write(JSON.stringify({id, method, params})); return result; }
  async evaluate(expression) { const response = await this.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}); if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails)); return response.result?.value; }
  close() { this.socket.end(); }
}

const chrome = await chromePath(), userData = await mkdtemp(path.join(tmpdir(), 'riose-graphics-bench-'));
const chromeArgs = ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl'];
if (gpuMode === 'software') {
  chromeArgs.push('--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader-webgl');
} else {
  // Leave Chrome's ANGLE/backend selection intact so this run can use the host GPU.
  chromeArgs.push('--enable-gpu');
}
chromeArgs.push('--remote-debugging-port=0', `--user-data-dir=${userData}`, 'about:blank');
const browser = spawn(chrome, chromeArgs, {stdio: 'ignore'});
let cdp;
const waitPage = async () => {
  const deadline = Date.now() + graphicsReadyTimeoutMs;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate('Boolean(window.__graphicsReady)');
    if (ready) return;
    const error = await cdp.evaluate('window.__graphicsError');
    if (error) throw new Error(error);
    await delay(100);
  }
  const diagnostic = await cdp.evaluate(`JSON.stringify({stage:window.__graphicsInitStage ?? null, error:window.__graphicsError ?? null, readyState:document.readyState, status:document.querySelector('#scene-status')?.textContent ?? null})`);
  throw new Error(`Graphics PoC did not signal ready within ${graphicsReadyTimeoutMs} ms (${diagnostic}). Check npm run build:graphics-poc and the local server.`);
};

function assertPhysicalGpuAdapter(adapter, context) {
  if (!adapter?.available || !adapter.unmasked || adapter.softwareFallback || !adapter.identifiesGtx1060) {
    throw new Error(`Physical GTX 1060 confirmation failed in ${context}: ${JSON.stringify(adapter)}`);
  }
}

try {
  let active = '';
  for (let i = 0; i < 100; i++) { try { active = await readFile(path.join(userData, 'DevToolsActivePort'), 'utf8'); break; } catch { await delay(100); } }
  if (!active) throw new Error('Chromium did not expose a DevTools port.');
  const port = Number(active.split('\n')[0]);
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(benchmarkUrl)}`, {method: 'PUT'});
  if (!targetResponse.ok) throw new Error(`Chrome DevTools HTTP ${targetResponse.status}; is the Riose server running?`);
  const target = await targetResponse.json(); cdp = new DevTools(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Page.navigate', {url: benchmarkUrl.href}); await waitPage();
  const browserInfo = await cdp.send('Browser.getVersion');
  const fixture = await cdp.evaluate('window.__graphicsControl.fixture()');
  const gpu = fixture?.gpuInfo ?? null;
  if (gpuMode === 'hardware') assertPhysicalGpuAdapter(gpu, 'preflight page');
  const results = [], rendererLoads = [], repeatCaptures = [];
  for (let repeat = 1; repeat <= repeats; repeat++) {
    const repeatResults = [];
    for (const renderer of ['canvas', 'pixi']) {
      await cdp.evaluate('window.__graphicsReady = false');
      await cdp.send('Page.navigate', {url: benchmarkUrl.href}); await waitPage();
      await cdp.evaluate(`window.__graphicsControl.setRenderer('${renderer}')`);
      await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const rendererGpu = await cdp.evaluate('window.__graphicsControl.fixture()?.gpuInfo ?? null');
      if (gpuMode === 'hardware') assertPhysicalGpuAdapter(rendererGpu, `${renderer} page on repeat ${repeat}`);
      const load = await cdp.evaluate('window.__graphicsControl.load()');
      rendererLoads.push({repeat, renderer, assetLoadMs: load.assetsMs, pixiInitMs: load.pixiInitMs});
      for (const count of counts) {
        await cdp.evaluate(`window.__graphicsControl.reset(${count})`);
        await cdp.evaluate(`window.__graphicsControl.setCameraZoom(${cameraZoom})`);
        const focusReady = await cdp.evaluate('window.__graphicsControl.focusAnimal(1)');
        if (!focusReady) throw new Error(`Could not focus benchmark camera on animal #1 for ${count} animals.`);
        await cdp.evaluate('window.__graphicsControl.selectAnimal(1)');
        await delay(warmupMs);
        await cdp.evaluate('window.__graphicsControl.clearStats()');
        await cdp.evaluate('window.__graphicsControl.refreshScene()');
        const heapBeforeBytes = await cdp.evaluate('performance.memory?.usedJSHeapSize ?? null');
        await delay(durationMs);
        const stats = await cdp.evaluate('window.__graphicsControl.stats()');
        const heapAfterBytes = await cdp.evaluate('performance.memory?.usedJSHeapSize ?? null');
        const worker = await cdp.evaluate('window.__graphicsControl.tick()');
        const visibleIds = new Set(stats.visibleAnimalIds), culledIds = new Set(stats.culledAnimalIds);
        const idsPartitioned = visibleIds.size === stats.visibleAnimals && culledIds.size === stats.culledAnimals
          && stats.accountedAnimals === stats.visibleAnimals && [...visibleIds].every(id => !culledIds.has(id))
          && new Set([...visibleIds, ...culledIds]).size === count;
        if (stats.simulatedAnimals > 0 && (stats.visibleAnimals + stats.culledAnimals !== stats.simulatedAnimals || !idsPartitioned)) {
          throw new Error(`Visibility accounting failed for ${renderer} at ${count}: ${stats.visibleAnimals} visible + ${stats.culledAnimals} culled of ${stats.simulatedAnimals}; ${stats.accountedAnimals} represented.`);
        }
        if (stats.simulatedAnimals > 0 && (stats.selectedAnimalIds.length !== 1 || stats.selectedAnimalIds[0] !== 1)) throw new Error(`Stable selection failed for ${renderer} at ${count}.`);
        if (stats.simulatedAnimals > 0 && stats.visibleAnimals === 0) throw new Error(`Culling workload has no visible animals for ${renderer} at ${count}; benchmark camera did not reach the herd.`);
        const digestIds = ids => { let hash = 2166136261; for (const id of ids) { hash ^= Number(id); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); };
        const stableIdAccounting = {population: count, visibleUnique: visibleIds.size, culledUnique: culledIds.size, totalUnique: new Set([...visibleIds, ...culledIds]).size, partitionValid: idsPartitioned, visibleIdDigestFnv1a: digestIds([...visibleIds].sort((a, b) => a - b)), culledIdDigestFnv1a: digestIds([...culledIds].sort((a, b) => a - b))};
        const selectionStable = stats.selectedAnimalIds.length === 1 && stats.selectedAnimalIds[0] === 1;
        const row = {repeat, renderer, count, gpu: rendererGpu, workerRoundTripMs: worker.roundTripMs, engineImplementation: worker.implementation, renderFrameSampleCount: stats.renderFrameSampleCount, cullingExecutionCount: stats.cullingExecutionCount, frameMeanFps: stats.meanFps, frameMedianMs: stats.medianFrameMs, frameP95Ms: stats.p95FrameMs, renderSubmissionMedianMs: stats.medianPaintMs, renderSubmissionP95Ms: stats.p95PaintMs, sceneUpdateMedianMs: stats.medianSceneUpdateMs, sceneUpdateP95Ms: stats.p95SceneUpdateMs, cullingMedianMs: stats.medianCullingMs, cullingP95Ms: stats.p95CullingMs, motionUpdateMedianMs: stats.medianMotionUpdateMs, meanLodVisualUpdates: stats.meanLodVisualUpdates, simulatedAnimals: stats.simulatedAnimals, visibleAnimals: stats.visibleAnimals, culledAnimals: stats.culledAnimals, visibleByLod: stats.visibleByLod, accountedAnimals: stats.accountedAnimals, visibleAnimalIds: stats.visibleAnimalIds, culledAnimalIds: stats.culledAnimalIds, selectedAnimalIds: stats.selectedAnimalIds, stableIdAccounting, selectionStable, animalRenderUnits: stats.animalRenderUnits, herdClusters: stats.herdClusters, visibleSprites: stats.visibleSprites, viewportWidth: stats.viewportWidth, viewportHeight: stats.viewportHeight, devicePixelRatio: stats.devicePixelRatio, renderResolution: stats.renderResolution, cameraZoom: stats.cameraZoom, jsHeapBeforeBytes: heapBeforeBytes, jsHeapAfterBytes: heapAfterBytes, raw: {frameIntervalsMs: stats.frameIntervalsMs, renderSubmissionMs: stats.renderSubmissionSamplesMs, sceneUpdateMs: stats.sceneUpdateSamplesMs, cullingMs: stats.cullingSamplesMs}};
        results.push(row); repeatResults.push(row);
      }
    }
    repeatCaptures.push(repeatResults);
  }
  if (rawCaptureDirectory) {
    await mkdir(rawCaptureDirectory, {recursive: true});
    const first = results[0];
    for (let index = 0; index < repeatCaptures.length; index++) {
      const rows = repeatCaptures[index].map(row => ({
        repeat: row.repeat, renderer: row.renderer, count: row.count,
        workerRoundTripMs: row.workerRoundTripMs, engineImplementation: row.engineImplementation,
        renderFrameSampleCount: row.renderFrameSampleCount, cullingExecutionCount: row.cullingExecutionCount,
        meanFps: row.frameMeanFps, medianFrameMs: row.frameMedianMs, p95FrameMs: row.frameP95Ms,
        medianPaintMs: row.renderSubmissionMedianMs, p95PaintMs: row.renderSubmissionP95Ms,
        medianSceneUpdateMs: row.sceneUpdateMedianMs, p95SceneUpdateMs: row.sceneUpdateP95Ms,
        medianCullingMs: row.cullingMedianMs, p95CullingMs: row.cullingP95Ms,
        medianMotionUpdateMs: row.motionUpdateMedianMs, meanLodVisualUpdates: row.meanLodVisualUpdates,
        simulatedAnimals: row.simulatedAnimals, visibleAnimals: row.visibleAnimals, culledAnimals: row.culledAnimals,
        visibleByLod: row.visibleByLod, accountedAnimals: row.accountedAnimals,
        visibleAnimalIds: row.visibleAnimalIds, culledAnimalIds: row.culledAnimalIds,
        selectedAnimalIds: row.selectedAnimalIds, stableIdAccounting: row.stableIdAccounting,
        selectionStable: row.selectionStable, animalRenderUnits: row.animalRenderUnits,
        herdClusters: row.herdClusters, visibleSprites: row.visibleSprites,
        viewportWidth: row.viewportWidth, viewportHeight: row.viewportHeight,
        devicePixelRatio: row.devicePixelRatio, renderResolution: row.renderResolution,
        cameraZoom: row.cameraZoom, jsHeapBeforeBytes: row.jsHeapBeforeBytes,
        jsHeapAfterBytes: row.jsHeapAfterBytes,
        raw: {frameIntervalsMs: row.raw.frameIntervalsMs, renderSubmissionSamplesMs: row.raw.renderSubmissionMs,
          sceneUpdateSamplesMs: row.raw.sceneUpdateMs, cullingMs: row.raw.cullingMs},
      }));
      await writeFile(path.join(rawCaptureDirectory, `repeat-${index + 1}.json`), `${JSON.stringify({
        fixtureId: fixture.fixtureId, approvedAssetIds: fixture.approvedAssetIds, gpuInfo: gpu,
        browser: browserInfo.userAgent, measuredAt: new Date().toISOString(),
        viewport: {width: first.viewportWidth, height: first.viewportHeight, devicePixelRatio: first.devicePixelRatio, renderResolution: first.renderResolution},
        camera: {zoom: cameraZoom, anchorAnimalId: 1}, durationMs, warmupMs,
        rendererLoads: rendererLoads.filter(row => row.repeat === index + 1), results: rows,
      }, null, 2)}\n`);
    }
  }
  const median = values => { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
  const summary = ['canvas', 'pixi'].flatMap(renderer => counts.map(count => {
    const rows = results.filter(row => row.renderer === renderer && row.count === count);
    return {renderer, count, repeats: rows.length, cullingExecutionCountPerRun: rows[0]?.cullingExecutionCount, renderFrameSampleCountPerRun: rows[0]?.renderFrameSampleCount, frameMeanFpsMedian: median(rows.map(row => row.frameMeanFps)), frameMedianMsMedian: median(rows.map(row => row.frameMedianMs)), frameP95MsMedian: median(rows.map(row => row.frameP95Ms)), renderSubmissionMedianMs: median(rows.map(row => row.renderSubmissionMedianMs)), sceneUpdateMedianMs: median(rows.map(row => row.sceneUpdateMedianMs)), cullingMedianMs: median(rows.map(row => row.cullingMedianMs)), motionUpdateMedianMs: median(rows.map(row => row.motionUpdateMedianMs)), meanLodVisualUpdatesMedian: median(rows.map(row => row.meanLodVisualUpdates)), jsHeapAfterBytesMedian: median(rows.map(row => row.jsHeapAfterBytes)), workerRoundTripMsMedian: median(rows.map(row => row.workerRoundTripMs)), simulatedAnimals: rows[0]?.simulatedAnimals, visibleAnimals: rows[0]?.visibleAnimals, culledAnimals: rows[0]?.culledAnimals, visibleByLod: rows[0]?.visibleByLod, accountedAnimals: rows[0]?.accountedAnimals, animalRenderUnits: rows[0]?.animalRenderUnits, herdClusters: rows[0]?.herdClusters, visibleSprites: rows[0]?.visibleSprites};
  }));
  const measurementNotes = ['Each renderer/repeat starts on a fresh page and Worker; Canvas and Pixi use the same approved-livestock-v1 scene and one approved Nelore image, with low-resolution LOD derived at runtime.', 'Both renderers share the seeded FarmEngine Worker population, projection, camera zoom, visibility bounds, LOD thresholds, herd clustering, stable IDs, and selection behavior.', 'Frame median and p95 are RAF intervals; renderer submission timing measures JavaScript paint/render call duration and does not wait for GPU completion.', 'Culling time is recorded once per actual refreshScene() execution, not once per render frame. Each measured window begins with one fresh scene refresh after stats reset; render-frame and culling-execution counts are reported separately.', 'JS heap uses window.performance.memory only when exposed, without forced garbage collection; GPU utilization and GPU texture memory are unavailable and are not inferred.', 'One-hour Worker round-trip is reported separately from renderer frame samples.'];
  const grouped=(renderer,count)=>results.filter(row=>row.renderer===renderer&&row.count===count);
  const report = benchmarkReport({
    name:'graphics-poc',runtime:{browser:browserInfo.product,browserRevision:browserInfo.revision,userAgent:browserInfo.userAgent},
    hardware:{gpuMode,deviceProfile,gpu},
    workload:{fixtureId:'approved-livestock-v1',assets:['nelore-adult'],populations:counts.map(animals=>({animals,scope:'FarmEngine and renderer',limit:'FarmEngine and renderer maximum 10000'})),seed:20261012},
    configuration:{warmupRuns:1,repetitions:repeats,measurementDurationMs:durationMs},
    limits:{numericKernelMaxAnimalsMeasured:null},
    phases:{
      worker:{status:'measured',measurements:['canvas','pixi'].flatMap(renderer=>counts.map(count=>{const rows=grouped(renderer,count);return measurement('worker','roundTrip1h','ms',summarizeSamples(rows.map(row=>row.workerRoundTripMs)),{population:count,renderer,implementation:rows[0]?.engineImplementation});}))},
      ui:{status:'measured',measurements:['canvas','pixi'].flatMap(renderer=>counts.flatMap(count=>{const rows=grouped(renderer,count);return [
        measurement('ui','sceneUpdate','ms',summarizeSamples(rows.map(row=>row.sceneUpdateMedianMs)),{population:count,renderer}),
        measurement('ui','motionUpdate','ms',summarizeSamples(rows.map(row=>row.motionUpdateMedianMs)),{population:count,renderer}),
        measurement('ui','culling','ms',summarizeSamples(rows.map(row=>row.cullingMedianMs)),{population:count,renderer}),
      ];}))},
      render:{status:'measured',measurements:['canvas','pixi'].flatMap(renderer=>counts.flatMap(count=>{const rows=grouped(renderer,count);return [
        measurement('render','frameIntervalP95','ms',summarizeSamples(rows.map(row=>row.frameP95Ms)),{population:count,renderer}),
        measurement('render','frameIntervalMedian','ms',summarizeSamples(rows.map(row=>row.frameMedianMs)),{population:count,renderer}),
        measurement('render','submissionMedian','ms',summarizeSamples(rows.map(row=>row.renderSubmissionMedianMs)),{population:count,renderer,memory:{jsHeapBeforeBytes:summarizeSamples(rows.map(row=>row.jsHeapBeforeBytes)).median,jsHeapAfterBytes:summarizeSamples(rows.map(row=>row.jsHeapAfterBytes)).median,gpuMemoryBytes:null}}),
      ];}))},
      startup:{status:'measured',measurements:['canvas','pixi'].flatMap(renderer=>{const rows=rendererLoads.filter(row=>row.renderer===renderer);const metric=renderer==='pixi'?'pixiInitMs':'assetLoadMs';return [measurement('startup',renderer==='pixi'?'rendererInitialization':'assetLoad','ms',summarizeSamples(rows.map(row=>row[metric])),{renderer})];})},
      memory:{status:'measured',measurements:['canvas','pixi'].flatMap(renderer=>counts.map(count=>{const rows=grouped(renderer,count);const observations=rows.map(row=>row.jsHeapAfterBytes).filter(Number.isFinite);return measurement('memory','jsHeapUsed','bytes',summarizeSamples(observations),{population:count,renderer,observations,source:'window.performance.memory.usedJSHeapSize; no forced GC; GPU allocation is unavailable'});}))},
    },
    timingBoundaries:[
      {phase:'worker',timed:['One-hour Worker request and reply round-trip.'],notTimed:['Renderer frame sampling and browser startup.']},
      {phase:'ui',timed:['Scene and motion update JavaScript phase measurements.'],notTimed:['GPU completion and Worker round-trip.']},
      {phase:'render',timed:['RAF frame intervals and JavaScript render-submission call duration.'],notTimed:['GPU completion, texture memory and Worker request/reply.']},
      {phase:'startup',timed:['Canvas asset loading or Pixi renderer initialization as reported.'],notTimed:['Simulation ticks and steady-state frame loop.']},
      {phase:'memory',timed:['window.performance.memory JS heap observations before and after each measured case, when exposed.'],notTimed:['Forced garbage collection, GPU allocation, process RSS and retained per-object attribution.']},
    ],
    results:{browser:{product:browserInfo.product,revision:browserInfo.revision,userAgent:browserInfo.userAgent},gpu:{mode:gpuMode,deviceProfile, ...gpu},url:benchmarkUrl.href,counts,cameraZoom,cameraAnchor:'simulation animal #1',repeats,durationMs,warmupMs,loading:{canvasAssetLoadMsMedian:median(rendererLoads.filter(row=>row.renderer==='canvas').map(row=>row.assetLoadMs)),pixiAssetLoadMsMedian:median(rendererLoads.filter(row=>row.renderer==='pixi').map(row=>row.assetLoadMs)),pixiInitMsMedian:median(rendererLoads.filter(row=>row.renderer==='pixi').map(row=>row.pixiInitMs))},measurementNotes,summary,results},
    limitations:[...measurementNotes, ...(gpuMode === 'software' ? ['Software mode is for harness smoke checks only and cannot qualify Canvas versus Pixi on supported physical GPUs.'] : ['A hardware capture describes one device profile only; repeat on every supported GPU/browser profile before making a renderer decision.'])],
  });
  report.results.environment = {os: `${platform()} ${release()}`, architecture: arch(), cpuModel: cpus()[0]?.model ?? null, logicalCores: cpus().length, systemMemoryBytes: totalmem(), gpuDriverVersion: process.env.BENCH_GPU_DRIVER_VERSION ?? null};
  const reportJson = JSON.stringify(report, null, 2);
  if (process.env.BENCH_OUTPUT_PATH) await writeFile(path.resolve(process.env.BENCH_OUTPUT_PATH), reportJson);
  console.log(reportJson);
} finally {
  if (cdp) { await cdp.send('Browser.close').catch(() => {}); cdp.close(); }
  if (browser.exitCode === null) { browser.kill('SIGTERM'); await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(1000)]); if (browser.exitCode === null) browser.kill('SIGKILL'); }
  await rm(userData, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}
