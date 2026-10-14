import {createServer} from 'node:http';
import {readFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'artifacts/graphics');
await mkdir(outputDir, {recursive: true});
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/favicon.svg') {
      const body = await readFile(path.join(root, 'favicon.svg'));
      return res.writeHead(200, {'content-type': 'image/svg+xml', 'cache-control': 'no-store'}).end(body);
    }
    if (!pathname.startsWith('/graphics-poc/') && !pathname.startsWith('/assets/')) return res.writeHead(404).end();
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    const body = await readFile(file);
    const mime = ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, {'content-type': `${mime}; charset=utf-8`, 'cache-control': 'no-store'}).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const chromeCandidates = [process.env.CHROME_BIN, '/home/lucas_coimbra/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'].filter(Boolean);
let chromePath;
for (const candidate of chromeCandidates) { try { await access(candidate); chromePath = candidate; break; } catch {} }
if (!chromePath) throw new Error('Chromium missing. Set CHROME_BIN to the browser executable.');
const browser = await chromium.launch({executablePath: chromePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 1});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`HTTP ${response.status()} ${response.url()}`); });
try {
  const mapName = process.env.RIOSE_CAPTURE_MAP || 'ranch-v4';
  if (!/^[a-z0-9-]+$/.test(mapName)) throw new Error('RIOSE_CAPTURE_MAP must be lowercase kebab-case.');
  await page.goto(`http://127.0.0.1:${port}/graphics-poc/ranch-v4.html?map=${mapName}`);
  await page.waitForFunction(() => window.__ranchReady || window.__ranchError, {timeout: 60000});
  if (await page.evaluate(() => window.__ranchError)) throw new Error(await page.evaluate(() => window.__ranchError));
  await page.waitForTimeout(500);
  const performanceMetrics = await page.evaluate(async () => {
    const samples = [];
    let previous = 0;
    await new Promise(resolve => {
      const tick = time => { if (previous) samples.push(time - previous); previous = time; if (samples.length < 120) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    });
    const sorted = [...samples].sort((a, b) => a - b);
    const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    const navigation = performance.getEntriesByType('navigation')[0];
    return {sampledFrames: samples.length, medianFrameMs: Number(percentile(.5).toFixed(2)), p95FrameMs: Number(percentile(.95).toFixed(2)), medianFps: Number((1000 / percentile(.5)).toFixed(1)), loadEventMs: Number(navigation.loadEventEnd.toFixed(1)), transferredResourceBytes: performance.getEntriesByType('resource').reduce((total, entry) => total + (entry.transferSize || 0), 0)};
  });
  const metrics = await page.evaluate(() => ({...window.__ranchVisual, viewport: {width: innerWidth, height: innerHeight}, canvas: {width: document.querySelector('canvas').clientWidth, height: document.querySelector('canvas').clientHeight}, errors: window.__ranchVisual.errors}));
  metrics.performance = performanceMetrics;
  const screenshotPrefix = mapName === 'ranch-v4' ? 'ranch-v4' : mapName;
  await page.screenshot({path: path.join(outputDir, `${screenshotPrefix}-after.png`), fullPage: true});
  await page.locator('#stage canvas').screenshot({path: path.join(outputDir, `${screenshotPrefix}-canvas-after.png`)});
  await page.locator('#zoom-in').click();
  await page.waitForTimeout(250);
  await page.screenshot({path: path.join(outputDir, `${screenshotPrefix}-zoom.png`), fullPage: true});
  await page.setViewportSize({width: 1120, height: 900});
  await page.waitForTimeout(250);
  await page.screenshot({path: path.join(outputDir, `${screenshotPrefix}-responsive.png`), fullPage: true});
  if (metrics.placements !== 82 || metrics.uniqueAssets < 20 || metrics.animatedCattle < 1 || metrics.animationFrames !== 4 || metrics.terrainWidthOccupancy < 85 || metrics.terrainWidthOccupancy > 95 || metrics.surfaceMaterialZones !== 7 || metrics.surfaceMaterialGrammar !== 'pasture-ground-grammar-v1') throw new Error(`Unexpected rendered scene metrics: ${JSON.stringify(metrics)}`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  await import('node:fs/promises').then(({writeFile}) => writeFile(path.join(outputDir, `${screenshotPrefix}-capture.json`), JSON.stringify({browser: chromePath, ...metrics}, null, 2) + '\n'));
  process.stdout.write(`Captured browser scene: ${JSON.stringify(metrics)}\n`);
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
