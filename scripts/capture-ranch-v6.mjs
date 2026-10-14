import {createServer} from 'node:http';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import './build-ranch-v6.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'artifacts/graphics/spatial-assembly-v6');
await mkdir(outputDir, {recursive: true});

function signatureFor(scene) {
  const stableLayout = JSON.stringify({
    structures: scene.placements.map(item => ({id: item.id, assetId: item.assetId,
      position: [item.position.x, item.position.y], polygon: (item.worldPolygon ?? []).map(point => [point.x, point.y])})).sort((a, b) => a.id.localeCompare(b.id)),
    paddocks: (scene.paddocks ?? []).map(item => ({id: item.zoneId, polygon: item.polygon.map(point => [point.x, point.y])})).sort((a, b) => a.id.localeCompare(b.id))
  });
  let value = 0x811c9dc5;
  for (let i = 0; i < stableLayout.length; i++) { value ^= stableLayout.charCodeAt(i); value = Math.imul(value, 0x01000193); }
  return `fnv1a32-${(value >>> 0).toString(16).padStart(8, '0')}`;
}
const beefMacroLayouts = [];
for (const seed of [84018, 84019, 84020]) {
  const scene = JSON.parse(await readFile(path.join(outputDir, `compiled-beef-${seed}.json`), 'utf8'));
  beefMacroLayouts.push({seed, signature: signatureFor(scene), structureCount: scene.placements.length,
    paddockPolygonCount: scene.paddocks.length, paddockPolygonVertexCount: scene.paddocks.reduce((sum, paddock) => sum + paddock.polygon.length, 0)});
}
if (new Set(beefMacroLayouts.map(item => item.signature)).size !== 3) throw new Error(`Beef seeds did not produce distinct macro layouts: ${JSON.stringify(beefMacroLayouts)}`);
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    if (!['/graphics-poc/', '/assets/', '/artifacts/graphics/spatial-assembly-v6/'].some(prefix => pathname.startsWith(prefix))) return res.writeHead(404).end();
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
    const body = await readFile(file);
    const mime = ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png'})[path.extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, {'content-type': `${mime}; charset=utf-8`, 'cache-control': 'no-store'}).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const chromeCandidates = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/home/lucas_coimbra/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'].filter(Boolean);
let chromePath;
for (const candidate of chromeCandidates) { try { await access(candidate); chromePath = candidate; break; } catch {} }
if (!chromePath) throw new Error('Chromium missing. Set CHROME_BIN to an installed browser.');
const browser = await chromium.launch({executablePath: chromePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 1});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(`${message.text()} ${JSON.stringify(message.location())}`); });
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
const results = [];
try {
  for (const sceneKey of ['beef-84018', 'beef-84019', 'beef-84020', 'dairy-84018']) {
    await page.goto(`http://127.0.0.1:${server.address().port}/graphics-poc/ranch-v6.html?scene=${sceneKey}`);
    await page.waitForFunction(() => window.__ranchV6Ready || window.__ranchV6Error, {timeout: 60000});
    const loadError = await page.evaluate(() => window.__ranchV6Error);
    if (loadError) throw new Error(loadError);
    await page.waitForTimeout(350);
    const metrics = await page.evaluate(() => ({...window.__ranchV6, viewport: {width: innerWidth, height: innerHeight}, stage: {width: document.querySelector('#stage').clientWidth, height: document.querySelector('#stage').clientHeight}, canvas: Boolean(document.querySelector('#stage canvas'))}));
    if (metrics.placementCount < 4 || metrics.renderedAssetCount !== metrics.placementCount + metrics.vegetationCount || metrics.cattleCount < 5 || metrics.animationFrames !== 4 || metrics.scientificStateWrites !== 0 || !metrics.canvas) throw new Error(`V6 browser integration metrics fail: ${JSON.stringify(metrics)}`);
    if (metrics.fenceArtCount !== metrics.fenceSegmentCount || metrics.fenceGateArtCount !== metrics.fenceGateSegmentCount || metrics.fenceGateArtCount < 1 || !metrics.fenceArtReviewStatuses.includes('REVIEW') || metrics.fenceCardinalFlipCount < 1) throw new Error(`Fence art/provenance metrics fail: ${JSON.stringify(metrics)}`);
    const expectedMacro = metrics.sceneKey.startsWith('beef-') ? beefMacroLayouts.find(item => item.seed === metrics.seed) : null;
    if (expectedMacro && (metrics.macroLayoutSignature !== expectedMacro.signature || metrics.macroStructureCount !== expectedMacro.structureCount || metrics.paddockPolygonCount !== expectedMacro.paddockPolygonCount || metrics.paddockPolygonVertexCount !== expectedMacro.paddockPolygonVertexCount)) throw new Error(`Macro/paddock signature mismatch: ${JSON.stringify({metrics, expectedMacro})}`);
    await page.screenshot({path: path.join(outputDir, `ranch-v6-${sceneKey}.png`), fullPage: true});
    await page.locator('#topology-toggle').check();
    await page.waitForTimeout(150);
    await page.screenshot({path: path.join(outputDir, `ranch-v6-${sceneKey}-topology.png`), fullPage: true});
    await page.locator('#topology-toggle').uncheck();
    if (sceneKey === 'beef-84018') {
      await page.setViewportSize({width: 1080, height: 820});
      await page.waitForTimeout(250);
      await page.screenshot({path: path.join(outputDir, 'ranch-v6-beef-84018-responsive.png'), fullPage: true});
      await page.setViewportSize({width: 1600, height: 1000});
      await page.locator('#camera-fit').click();
    }
    results.push(metrics);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  const report = {browser: chromePath, renderer: 'PixiJS 8 WebGL / SwiftShader', assets: 'main-composer-render-manifest; REVIEW provenance preserved', fenceRendering: 'candidate sprites; world-x source orientation and world-y horizontal flips in preview only', sceneSource: 'compiled V6 JSON', beefMacroLayouts, errors, results};
  await writeFile(path.join(outputDir, 'ranch-v6-browser-capture.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
