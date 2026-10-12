import {spawn} from 'node:child_process';
import {access,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const origin = process.env.RIOSE_GRAPHICS_URL ?? 'http://127.0.0.1:8000/graphics-poc/index.html';
const counts = (process.env.BENCH_HERDS ?? '100,1000,10000').split(',').map(Number);
const durationMs = Number(process.env.BENCH_DURATION_MS ?? 2500), warmupMs = Number(process.env.BENCH_WARMUP_MS ?? 700);
const cameraZoom = Number(process.env.BENCH_CAMERA_ZOOM ?? 3.2);
const repeats = Number(process.env.BENCH_REPEATS ?? 2);

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
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader-webgl', '--remote-debugging-port=0', `--user-data-dir=${userData}`, 'about:blank'], {stdio: 'ignore'});
let cdp;
const waitPage = async () => {
  for (let i = 0; i < 200; i++) { const ready = await cdp.evaluate('Boolean(window.__graphicsReady)'); if (ready) return; const error = await cdp.evaluate('window.__graphicsError'); if (error) throw new Error(error); await delay(50); }
  throw new Error('Graphics PoC did not signal ready. Check npm run build:graphics-poc and the local server.');
};

try {
  let active = '';
  for (let i = 0; i < 100; i++) { try { active = await readFile(path.join(userData, 'DevToolsActivePort'), 'utf8'); break; } catch { await delay(100); } }
  if (!active) throw new Error('Chromium did not expose a DevTools port.');
  const port = Number(active.split('\n')[0]);
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, {method: 'PUT'});
  if (!targetResponse.ok) throw new Error(`Chrome DevTools HTTP ${targetResponse.status}; is the Riose server running?`);
  const target = await targetResponse.json(); cdp = new DevTools(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable'); await cdp.send('Page.navigate', {url: origin}); await waitPage();
  const browserInfo = await cdp.send('Browser.getVersion');
  const results = [], rendererLoads = [];
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const renderer of ['canvas', 'pixi']) {
      await cdp.evaluate('window.__graphicsReady = false');
      await cdp.send('Page.navigate', {url: origin}); await waitPage();
      await cdp.evaluate(`window.__graphicsControl.setRenderer('${renderer}')`);
      await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      rendererLoads.push({repeat, renderer, ...await cdp.evaluate('window.__graphicsControl.load()')});
      for (const count of counts) {
        await cdp.evaluate(`window.__graphicsControl.reset(${count})`);
        await cdp.evaluate(`window.__graphicsControl.setCameraZoom(${cameraZoom})`);
        await delay(warmupMs);
        await cdp.send('HeapProfiler.collectGarbage');
        await cdp.evaluate('window.__graphicsControl.clearStats()');
        const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
        await delay(durationMs);
        const stats = await cdp.evaluate('window.__graphicsControl.stats()');
        const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
        await cdp.send('HeapProfiler.collectGarbage');
        const heap = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
        const worker = await cdp.evaluate('window.__graphicsControl.tick()');
        results.push({repeat, renderer, count, workerRoundTripMs: worker.roundTripMs, engineImplementation: worker.implementation, frameMeanFps: stats.meanFps, frameP95Ms: stats.p95FrameMs, renderSubmissionMedianMs: stats.medianPaintMs, renderSubmissionP95Ms: stats.p95PaintMs, sceneUpdateMedianMs: stats.medianSceneUpdateMs, sceneUpdateP95Ms: stats.p95SceneUpdateMs, simulatedAnimals: stats.simulatedAnimals, visibleAnimals: stats.visibleAnimals, visibleSprites: stats.visibleSprites, jsHeapBeforeBytes: before.JSHeapUsedSize, jsHeapAfterBytes: heap.JSHeapUsedSize, layoutDeltaMs: (after.LayoutDuration - before.LayoutDuration) * 1000});
      }
    }
  }
  const median = values => { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
  const summary = ['canvas', 'pixi'].flatMap(renderer => counts.map(count => {
    const rows = results.filter(row => row.renderer === renderer && row.count === count);
    return {renderer, count, repeats: rows.length, frameMeanFpsMedian: median(rows.map(row => row.frameMeanFps)), frameP95MsMedian: median(rows.map(row => row.frameP95Ms)), renderSubmissionMedianMs: median(rows.map(row => row.renderSubmissionMedianMs)), sceneUpdateMedianMs: median(rows.map(row => row.sceneUpdateMedianMs)), jsHeapAfterBytesMedian: median(rows.map(row => row.jsHeapAfterBytes)), workerRoundTripMsMedian: median(rows.map(row => row.workerRoundTripMs)), simulatedAnimals: rows[0]?.simulatedAnimals, visibleAnimals: rows[0]?.visibleAnimals, visibleSprites: rows[0]?.visibleSprites};
  }));
  const report = {browser: {product: browserInfo.product, revision: browserInfo.revision, userAgent: browserInfo.userAgent}, url: origin, counts, cameraZoom, repeats, durationMs, warmupMs, loading: {canvasAssetLoadMsMedian: median(rendererLoads.filter(row => row.renderer === 'canvas').map(row => row.assetsMs)), pixiAssetLoadMsMedian: median(rendererLoads.filter(row => row.renderer === 'pixi').map(row => row.assetsMs)), pixiInitMsMedian: median(rendererLoads.filter(row => row.renderer === 'pixi').map(row => row.pixiInitMs))}, measurementNotes: ['Each renderer/repeat starts with a fresh page and Worker; assets use the same browser cache after the first load.', 'Same source scene, atlas images, Worker model, camera zoom and culling bounds for both renderers.', 'Frame p95 is RAF interval; render submission timing is JavaScript call time and does not wait for the GPU.', 'JS heap is post-GC Chrome Performance.getMetrics for the isolated renderer page; GPU texture memory is unavailable and is not inferred.', 'One-hour Worker round-trip is reported separately from renderer frame samples.'], summary, results};
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (cdp) { await cdp.send('Browser.close').catch(() => {}); cdp.close(); }
  if (browser.exitCode === null) { browser.kill('SIGTERM'); await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(1000)]); if (browser.exitCode === null) browser.kill('SIGKILL'); }
  await rm(userData, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}
