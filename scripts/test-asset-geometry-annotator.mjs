import {createServer} from 'node:http';
import {readFile, access, mkdir, writeFile, unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep) || (!pathname.startsWith('/graphics-poc/') && !pathname.startsWith('/assets/'))) return response.writeHead(404).end();
    const body = await readFile(file);
    const mime = ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png'})[path.extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, {'content-type': `${mime}; charset=utf-8`, 'cache-control': 'no-store'}).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const candidates = [process.env.CHROME_BIN, '/home/lucas_coimbra/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
if (!executablePath) throw new Error('Chromium missing; set CHROME_BIN to the browser executable.');
const browser = await chromium.launch({executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']});
const page = await browser.newPage({viewport: {width: 1500, height: 1000}}), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/graphics-poc/asset-geometry-annotator.html`);
  await page.waitForFunction(() => document.querySelector('#asset')?.options.length > 0 && document.querySelector('#canvas')?.getContext('2d'));
  await page.waitForTimeout(200);
  const canvas = page.locator('#canvas'), rect = await canvas.boundingBox();
  for (const [x, y] of [[0.39, 0.64], [0.61, 0.64], [0.61, 0.76], [0.39, 0.76]]) {
    await page.mouse.click(rect.x + rect.width * x, rect.y + rect.height * y);
  }
  const pointCount = await page.evaluate(() => JSON.parse(document.querySelector('#details').textContent).annotationPointsWorldCell.length);
  if (pointCount !== 4) throw new Error(`Expected four projected annotation points, got ${pointCount}`);
  const screenshotDir = path.join(root, 'artifacts/graphics/spatial-assembly-v6');
  await mkdir(screenshotDir, {recursive: true});
  await page.screenshot({path: path.join(screenshotDir, 'asset-geometry-annotator.png'), fullPage: true});
  await page.locator('#review').selectOption('reviewed');
  await page.locator('#reviewer').fill('browser-test');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise, downloadPath = await download.path();
  const output = JSON.parse(await readFile(downloadPath, 'utf8'));
  const saved = output.assets[await page.locator('#asset').inputValue()];
  if (saved?.reviewStatus !== 'reviewed' || saved.reviewer !== 'browser-test' || saved.collisionPolygon.length !== 4) throw new Error('Downloaded spatial annotation did not preserve polygon/review fields.');
  await page.locator('#import').setInputFiles(downloadPath);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Arquivo importado') || document.querySelector('#status').textContent.includes('Importação rejeitada'), null, {timeout: 5000});
  const importStatus = await page.locator('#status').textContent();
  if (!importStatus.includes('Arquivo importado')) throw new Error(`Fresh annotation provenance should pass import validation: ${importStatus}`);
  const stalePath = path.join(screenshotDir, 'stale-asset-geometry-annotation-test.json');
  saved.provenance.sourceSha256 = '0'.repeat(64);
  await writeFile(stalePath, JSON.stringify({schemaVersion: '1.0.0', units: 'world-cell', projection: 'isometric-2to1', assets: {[await page.locator('#asset').inputValue()]: saved}}));
  await page.locator('#import').setInputFiles(stalePath);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('source changed') || document.querySelector('#status').textContent.includes('Importação rejeitada'), null, {timeout: 5000});
  const staleStatus = await page.locator('#status').textContent();
  if (!staleStatus.includes('source changed')) throw new Error(`Stale source annotation should be rejected during import: ${staleStatus}`);
  await unlink(stalePath);
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({assetCount: await page.locator('#asset option').count(), annotatedPoints: saved.collisionPolygon.length, reviewStatus: saved.reviewStatus, errors}, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
