import {spawn} from 'node:child_process';
import {access, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {benchmarkReport, measurement, summarizeSamples} from '../benchmark-report.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ORIGIN = process.env.RIOSE_ATLAS_URL ?? 'http://127.0.0.1:8000';
const REPEATS = Number(process.env.ATLAS_LOAD_REPEATS ?? 3);
const OUTPUT = path.join(ROOT, 'docs/evidence/graphics-atlas-load-2026-10-12.json');
const measuredAt = new Date().toISOString().slice(0, 10);
const manifestPath = path.join(ROOT, 'graphics-poc/assets/main-composer-render-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

async function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  try {
    const cache = path.join(homedir(), '.cache/ms-playwright');
    for (const entry of (await readdir(cache)).filter(item => /^chromium-\d+$/.test(item)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))) {
      candidates.push(path.join(cache, entry, 'chrome-linux64/chrome'), path.join(cache, entry, 'chrome-linux/chrome'));
    }
  } catch {}
  for (const candidate of candidates.filter(Boolean)) { try { await access(candidate); return candidate; } catch {} }
  throw new Error('Chromium not found; set CHROME_BIN to a local Chromium executable.');
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
  async send(method, params = {}) { await this.ready; const id = ++this.id; const response = new Promise((resolve, reject) => this.pending.set(id, {resolve, reject})); this.write(JSON.stringify({id, method, params})); return response; }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
  close() { this.socket.end(); }
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const atlasRows = [];
for (const [key, url] of Object.entries(manifest.atlases)) {
  const relative = url.replace(/^\//, '');
  const absolute = path.join(ROOT, relative);
  const bytes = await readFile(absolute);
  atlasRows.push({
    key, url, file: relative, byteSize: bytes.length, sha256: sha256(bytes),
    expectedSha256: manifest.atlasSha256[key],
    semanticStatuses: Object.fromEntries(Object.entries(manifest.assets.filter(asset => asset.atlasKey === key).reduce((counts, asset) => {
      counts[asset.reviewStatus ?? 'UNRESOLVED'] = (counts[asset.reviewStatus ?? 'UNRESOLVED'] ?? 0) + 1; return counts;
    }, {})).sort(([a], [b]) => a.localeCompare(b))),
  });
  if (atlasRows.at(-1).sha256 !== atlasRows.at(-1).expectedSha256) throw new Error(`Atlas hash mismatch for ${key}`);
}

const chromePath = await findChrome(), userData = await mkdtemp(path.join(tmpdir(), 'riose-atlas-load-'));
const browser = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${userData}`, 'about:blank'], {stdio: 'ignore'});
let cdp;
try {
  let active = '';
  for (let attempt = 0; attempt < 100; attempt++) { try { active = await readFile(path.join(userData, 'DevToolsActivePort'), 'utf8'); break; } catch { await delay(100); } }
  if (!active) throw new Error('Chromium did not expose DevTools.');
  const port = Number(active.split('\n')[0]);
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${ORIGIN}/graphics-poc/assets/main-composer-render-manifest.json`)}`, {method: 'PUT'});
  if (!targetResponse.ok) throw new Error(`Chrome DevTools HTTP ${targetResponse.status}; is the local Riose server running?`);
  const target = await targetResponse.json(); cdp = new DevTools(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
  await cdp.send('Page.navigate', {url: `${ORIGIN}/graphics-poc/assets/main-composer-render-manifest.json`});
  await delay(250);
  const browserInfo = await cdp.send('Browser.getVersion');
  for (const atlas of atlasRows) {
    atlas.browserSamples = [];
    const browserUrl = `${ORIGIN}${atlas.url}`;
    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      const result = await cdp.evaluate(`(async()=>{
        const start=performance.now();
        const response=await fetch(${JSON.stringify(browserUrl)}, {cache:'no-store'});
        if(!response.ok) throw new Error('HTTP '+response.status+' loading '+${JSON.stringify(browserUrl)});
        const blob=await response.blob();
        const fetched=performance.now();
        const bitmap=await createImageBitmap(blob);
        const decoded=performance.now();
        const sample={byteSize:blob.size,width:bitmap.width,height:bitmap.height,fetchMs:fetched-start,decodeMs:decoded-fetched,totalMs:decoded-start};
        bitmap.close();
        return sample;
      })()`);
      if (result.byteSize !== atlas.byteSize) throw new Error(`${atlas.key} browser byte count differs from file byte count`);
      atlas.browserSamples.push({repeat, ...result});
    }
    const totals = atlas.browserSamples.map(sample => sample.totalMs).sort((a, b) => a - b);
    atlas.browserLoad = {repeats: REPEATS, medianTotalMs: Number(totals[Math.floor(totals.length / 2)].toFixed(3)), minTotalMs: Number(totals[0].toFixed(3)), maxTotalMs: Number(totals.at(-1).toFixed(3))};
  }

  const details = {
    measuredAt,
    purpose: 'Atlas byte size and local browser fetch/decode evidence for the current graphics PoC manifest.',
    scope: 'Only atlases listed by graphics-poc/assets/main-composer-render-manifest.json; review/unresolved candidates remain unapproved. No renderer comparison was performed.',
    manifest: {path: 'graphics-poc/assets/main-composer-render-manifest.json', sourceRevision: manifest.sourceRevision},
    environment: {browser: browserInfo.product, browserRevision: browserInfo.revision, userAgent: browserInfo.userAgent, origin: ORIGIN, cacheDisabled: true, repeats: REPEATS, method: 'Sequential fetch(cache=no-store), Blob read, createImageBitmap decode; browser performance.now() timing.'},
    atlasCount: atlasRows.length,
    totalBytes: atlasRows.reduce((total, atlas) => total + atlas.byteSize, 0),
    totalMiB: Number((atlasRows.reduce((total, atlas) => total + atlas.byteSize, 0) / 1024 / 1024).toFixed(3)),
    unresolvedAssetIds: manifest.unresolvedAssetIds,
    atlases: atlasRows,
    limitations: ['Local loopback timing is a development-host baseline, not a network/CDN or supported-device estimate.', 'Browser cache was disabled and each atlas was fetched and decoded sequentially; concurrency behavior was not measured.', 'The measurements cover current REVIEW/UNRESOLVED atlas candidates only and do not imply visual, technical, rights, or release approval.'],
  };
  const totalBytes = atlasRows.reduce((total, atlas) => total + atlas.byteSize, 0);
  const report = benchmarkReport({
    name: 'graphics-atlas-fetch-decode',
    runtime: {browser: browserInfo.product, browserRevision: browserInfo.revision, userAgent: browserInfo.userAgent},
    workload: {seed: 'no-random-input', populations: [{count: atlasRows.length, unit: 'atlases', scope: 'local-browser-asset-fetch-decode'}]},
    configuration: {warmupRuns: 0, repetitions: REPEATS, cacheDisabled: true, sequential: true},
    phases: {render: {status: 'measured', measurements: [
      measurement('render', 'atlas fetch and image decode', 'ms', summarizeSamples(atlasRows.flatMap(atlas => atlas.browserSamples.map(sample => sample.totalMs))), {population: {count: atlasRows.length, unit: 'atlases'}, source: 'Chrome performance.now(); sequential fetch(cache=no-store), Blob read, createImageBitmap decode'}),
    ]}},
    timingBoundaries: [{phase: 'render', timed: ['HTTP fetch to loopback origin', 'Blob read', 'createImageBitmap decode'], notTimed: ['manifest validation', 'SHA-256 file verification', 'renderer draw', 'concurrent asset loading', 'CDN/network/device conditions']}],
    results: {atlasCount: atlasRows.length, totalBytes, totalMiB: Number((totalBytes / 1024 / 1024).toFixed(3)), atlases: atlasRows},
    limitations: details.limitations,
  });
  if (report.results.atlases.some(atlas => atlas.browserSamples.length !== REPEATS || atlas.browserSamples.some(sample => !Number.isFinite(sample.totalMs)))) throw new Error('Atlas load evidence failed sample validation.');
  Object.assign(report, details, {schemaVersion: 1, atlasCount: report.results.atlasCount, totalBytes: report.results.totalBytes, totalMiB: report.results.totalMiB, atlases: report.results.atlases});
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Wrote ${path.relative(ROOT, OUTPUT)}: ${atlasRows.length} atlases, ${report.totalBytes} bytes, ${REPEATS} browser sample(s) per atlas.\n`);
} finally {
  if (cdp) cdp.close();
  if (browser.exitCode === null) { browser.kill('SIGTERM'); await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(1000)]); if (browser.exitCode === null) browser.kill('SIGKILL'); }
  await rm(userData, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}
