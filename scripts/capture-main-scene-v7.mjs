import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseUrl = process.env.RIOSE_MAIN_URL ?? 'http://127.0.0.1:8312/';
const output = 'artifacts/graphics';
const candidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/home/lucas_coimbra/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = candidates.find((candidate) => existsSync(candidate));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const failures = [];
page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
page.on('requestfailed', (request) => failures.push(`request failed: ${request.url()} (${request.failure()?.errorText})`));
page.on('response', (response) => {
  if (response.status() >= 400 && !new URL(response.url()).pathname.endsWith('/favicon.ico')) failures.push(`HTTP ${response.status()}: ${response.url()}`);
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  assert.equal(new URL(page.url()).pathname, '/', 'must capture the product root route');
  await page.waitForFunction(() => window.__RIOSE_SCENE_V7?.sceneVersion === 'riose-scene-v7', { timeout: 30_000 });
  await page.waitForTimeout(800);
  const integration = await page.evaluate(() => window.__RIOSE_SCENE_V7);
  assert.equal(integration.route, '/', 'scene was not compiled in the main interface');
  assert.equal(integration.renderer, 'src/client/app.js:Canvas2D', 'active renderer changed unexpectedly');
  assert.equal(integration.validation.valid, true, 'V7 rejected the scene');
  assert.equal(integration.validation.errors.length, 0, 'V7 reported hard geometry violations');
  assert.equal(integration.renderedPaddockIds.length, 4, 'four paddocks should reach the renderer');
  assert.ok(integration.renderedFenceSegments >= 60, 'compiled fence network was not rendered');
  assert.ok(integration.renderedRoads.length >= 5, 'compiled road graph was not rendered');
  for (const required of ['farmhouse', 'shed', 'fence-straight', 'gate', 'water-trough', 'cow-beef']) {
    assert.ok(integration.renderedAssetIds.includes(required), `main renderer is missing ${required}`);
  }
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/v7-main-after.png`, fullPage: true });
  await page.locator('#map').screenshot({ path: `${output}/v7-main-map-after.png` });
  await page.locator('#assembly-debug').click();
  await page.waitForTimeout(100);
  await page.locator('#map').screenshot({ path: `${output}/v7-main-map-debug.png` });
  await page.locator('#assembly-debug').click();
  if (failures.length) throw new Error(failures.join('\n'));
  await writeFile(`${output}/v7-main-integration.json`, `${JSON.stringify({ baseUrl, integration, failures }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, route: integration.route, renderer: integration.renderer, sceneVersion: integration.sceneVersion,
    paddocks: integration.renderedPaddockIds.length, fenceSegments: integration.renderedFenceSegments, roads: integration.renderedRoads.length,
    screenshots: [`${output}/v7-main-after.png`, `${output}/v7-main-map-after.png`, `${output}/v7-main-map-debug.png`] }, null, 2)}\n`);
} finally {
  await browser.close();
}
