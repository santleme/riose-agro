import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {access} from 'node:fs/promises';
import {homedir} from 'node:os';
import test from 'node:test';
import {chromium} from 'playwright';
import {createServer} from '../src/server/server.js';

test('V6 scene is served by the project server and renders beef/dairy assemblies in PixiJS', async t => {
  const build = spawnSync(process.execPath, ['scripts/build-ranch-v6.mjs'], {encoding: 'utf8'});
  assert.equal(build.status, 0, `V6 renderer build failed:\n${build.stdout}\n${build.stderr}`);
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const candidates = [process.env.CHROME_BIN, `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`].filter(Boolean);
  let executablePath;
  for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
  if (!executablePath) return t.skip('Chromium is not installed; set CHROME_BIN to run the V6 runtime integration check.');
  const browser = await chromium.launch({executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1280, height: 900}}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/graphics-poc/ranch-v6.html?scene=beef-84018`);
  await page.waitForFunction(() => window.__ranchV6Ready || window.__ranchV6Error, {timeout: 60000});
  let result = await page.evaluate(() => ({error: window.__ranchV6Error ?? null, metrics: window.__ranchV6}));
  assert.equal(result.error, null);
  assert.equal(result.metrics.placementCount, 5);
  assert.equal(result.metrics.paddockCount, 3);
  assert.equal(result.metrics.cattleMode, 'visual-demonstration-only');
  assert.equal(result.metrics.scientificStateWrites, 0);
  assert.equal(result.metrics.camera.boardOccupancy, 94);
  await page.locator('#scene-select').selectOption('dairy-84018');
  await page.waitForFunction(() => window.__ranchV6?.sceneKey === 'dairy-84018');
  result = await page.evaluate(() => ({error: window.__ranchV6Error ?? null, metrics: window.__ranchV6}));
  assert.equal(result.error, null);
  assert.equal(result.metrics.paddockCount, 5);
  assert.equal(result.metrics.cattleCount, 25);
  assert.deepEqual(errors, []);
});
