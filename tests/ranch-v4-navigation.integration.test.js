import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ranch preview wires presentation-only A* cattle motion to atlas walk frames', async t => {
  const build = spawnSync('npm', ['run', 'build:graphics-poc'], {cwd: root, encoding: 'utf8'});
  assert.equal(build.status, 0, `graphics preview build failed:\n${build.stdout}\n${build.stderr}`);

  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith('/graphics-poc/') && !pathname.startsWith('/assets/')) return response.writeHead(404).end();
      const file = path.resolve(root, `.${pathname}`);
      if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
      const body = await readFile(file);
      const extension = path.extname(file);
      const type = ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.tmj': 'application/json', '.png': 'image/png'})[extension] ?? 'application/octet-stream';
      response.writeHead(200, {'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store'}).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const candidates = [process.env.CHROME_BIN, path.join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')].filter(Boolean);
  let executablePath;
  for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
  if (!executablePath) return t.skip('Chromium is not installed; set CHROME_BIN to run this browser integration check.');
  const browser = await chromium.launch({executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/graphics-poc/ranch-v4.html`);
  await page.waitForFunction(() => window.__ranchReady || window.__ranchError, {timeout: 60000});
  assert.equal(await page.evaluate(() => window.__ranchError ?? null), null);
  const result = await page.evaluate(() => {
    const debug = window.__ranchNavigationDebug;
    if (!debug) throw new Error('The ranch preview did not expose its visual navigation diagnostics.');
    const route = debug.route;
    const step = debug.step(.25);
    return {
      source: route.motionSource,
      visualIntent: route.visualDemonstration?.intent,
      simulationState: route.simulationState,
      routeCells: route.pathCells.length,
      blockedPolygons: debug.grid.blockedPolygons.length,
      fenceSegments: debug.grid.fenceSegments.length,
      hasWalkClip: debug.clipStates.some(clip => clip.state === 'walk' && clip.source === 'visual-presentation-only'),
      moved: step.isTranslating,
      walkFramesAdvance: step.walkFramesAdvance,
      stateSource: step.animationStateSource,
    };
  });
  assert.equal(result.source, 'visual-demonstration');
  assert.equal(result.visualIntent, 'walk');
  assert.equal(result.simulationState, null);
  assert.ok(result.routeCells >= 4);
  assert.ok(result.blockedPolygons > 0);
  assert.ok(result.fenceSegments > 0);
  assert.equal(result.hasWalkClip, true);
  assert.equal(result.moved, true);
  assert.equal(result.walkFramesAdvance, true);
  assert.equal(result.stateSource, 'visual-demonstration');
  assert.deepEqual(errors, []);
});
