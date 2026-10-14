import {createServer} from 'node:http';
import {readFile, mkdir, access, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'artifacts/graphics/spatial-assembly-v6');
await mkdir(outputDir, {recursive: true});
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/favicon.ico') return response.writeHead(204).end();
    if (!pathname.startsWith('/graphics-poc/') && !pathname.startsWith('/assets/') && !pathname.startsWith('/artifacts/graphics/spatial-assembly-v6/')) return response.writeHead(404).end();
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    const body = await readFile(file);
    const mime = ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png'})[path.extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, {'content-type': `${mime}; charset=utf-8`, 'cache-control': 'no-store'}).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
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
  const importedScene = process.env.RIOSE_SPATIAL_SCENE_URL;
  const sceneQuery = importedScene ? `?scene=${encodeURIComponent(importedScene)}` : '';
  await page.goto(`http://127.0.0.1:${server.address().port}/graphics-poc/spatial-debug.html${sceneQuery}`);
  await page.waitForTimeout(5000);
  const initialStatus = await page.locator('#status').textContent();
  if (!initialStatus.startsWith('Aceito')) throw new Error(`Debug view did not generate: ${initialStatus}; ${errors.join(' | ')}`);
  await page.waitForTimeout(500);
  const metadata = await page.evaluate(() => {
    const scene = window.__spatialDebug.getSolution();
    return {seed: scene.seed, system: scene.specification?.sceneIntent?.productionSystem ?? document.querySelector('#system').value};
  });
  const captureKey = `${metadata.system}-seed-${metadata.seed}`;
  const output = {seed: String(metadata.seed), system: metadata.system,
    status: await page.locator('#status').textContent(), canvas: await page.locator('canvas').evaluate(canvas => ({width: canvas.width, height: canvas.height})),
    details: await page.locator('#details').textContent(), errors};
  const sceneName = `macro-assembly-${importedScene ? 'cpsat-' : ''}${captureKey}.png`;
  await page.screenshot({path: path.join(outputDir, sceneName), fullPage: true});
  const overlayNames = ['grid', 'collision', 'support', 'sockets', 'clearance', 'height', 'cells', 'paddocks', 'fenceArt', 'roads', 'roadModules', 'errors'];
  for (const overlay of overlayNames) await page.evaluate(name => window.__spatialDebug.setOverlay(name, true), overlay);
  await page.waitForTimeout(500);
  output.debugOverlays = await page.evaluate(() => window.__spatialDebug.getOverlays());
  if (overlayNames.some(name => output.debugOverlays[name] !== true)) throw new Error('Not all spatial debug overlays could be activated.');
  await page.screenshot({path: path.join(outputDir, `debug-overlays-all-${importedScene ? 'cpsat-' : ''}${captureKey}.png`), fullPage: true});
  for (const overlay of ['grid', 'support', 'clearance', 'height', 'cells', 'fenceArt']) await page.evaluate(name => window.__spatialDebug.setOverlay(name, false), overlay);
  await page.waitForTimeout(250);
  for (const mode of ['terrain', 'structures', 'roads', 'fences', 'environment', 'complete']) {
    await page.locator('#stage-mode').selectOption(mode); await page.waitForTimeout(250);
    await page.screenshot({path: path.join(outputDir, `step-${mode}-${importedScene ? 'cpsat-' : ''}${captureKey}.png`), fullPage: true});
  }
  for (const seed of importedScene ? [] : [84019, 84020]) {
    await page.locator('#seed').fill(String(seed)); await page.locator('#generate').click();
    await page.waitForTimeout(250);
    await page.screenshot({path: path.join(outputDir, `macro-assembly-beef-seed-${seed}.png`), fullPage: true});
  }
  output.positionProbes = await page.evaluate(() => {
    const layout = window.__spatialDebug.getSolution();
    const accepted = window.__spatialDebug.probe(layout.placements[0].position);
    const rejected = window.__spatialDebug.probe({x: -1, y: -1});
    return {accepted: accepted.valid, rejectedReason: rejected.reason};
  });
  if (!output.positionProbes.accepted || output.positionProbes.rejectedReason !== 'out-of-bounds') throw new Error(`Spatial position probes failed: ${JSON.stringify(output.positionProbes)}`);
  if (!importedScene) {
    await page.locator('#seed').fill('84018');
    await page.locator('#system').selectOption('dairy');
    await page.waitForTimeout(250);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Aceito'));
    await page.screenshot({path: path.join(outputDir, 'macro-assembly-dairy-seed-84018.png'), fullPage: true});
    await page.locator('#generate').click();
    await page.waitForTimeout(200);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  const reportName = `browser-capture-${importedScene ? 'cpsat-' : ''}${captureKey}.json`;
  await writeFile(path.join(outputDir, reportName), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
