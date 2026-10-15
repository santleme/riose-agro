import {mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root = process.cwd();
const captureScene = process.env.RIOSE_V8_SCENE ?? 'terrain-v8';
const captureSeed = process.env.RIOSE_V8_SEED;
const captureName = captureSeed === undefined ? captureScene : `${captureScene}-seed-${captureSeed}`;
const output = path.join(root, `artifacts/graphics/${captureName}`);
const seedQuery = captureSeed === undefined ? '' : `&seed=${encodeURIComponent(captureSeed)}`;
const url = process.env.RIOSE_V8_URL ?? `http://127.0.0.1:8000/graphics-poc/index.html?scene=${captureScene}&renderer=pixi${seedQuery}`;
const chrome = [process.env.CHROME_BIN, '/home/lucas_coimbra/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(candidate => candidate && existsSync(candidate));
const browser = await chromium.launch({headless: true, ...(chrome ? {executablePath: chrome} : {}), args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']});
const page = await browser.newPage({viewport: {width: 1536, height: 960}, deviceScaleFactor: 1});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource: the server responded with a status of 404')) errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/favicon')) errors.push(`HTTP ${response.status()} ${response.url()}`); });

try {
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__graphicsReady && window.__terrainV8, {timeout: 30_000});
  await page.waitForFunction(() => window.__terrainV8.getRenderer() === 'pixi' && document.querySelector('#pixi-canvas')?.width > 0, {timeout: 30_000});
  await page.waitForTimeout(1000);
  const validation = await page.evaluate(() => {
    const model = window.__terrainV8.model;
    const cells = model.cells.flat();
    return {
      sceneId: window.__terrainV8.sceneId,
      modelId: model.id,
      viewport: {width: innerWidth, height: innerHeight},
      canvas: {width: document.querySelector('#pixi-canvas').width, height: document.querySelector('#pixi-canvas').height},
      stage: (() => { const rect = document.querySelector('#stage').getBoundingClientRect(); return {width: rect.width, height: rect.height}; })(),
      renderer: window.__terrainV8.getRenderer(),
      dimensions: model.dimensions,
      heightLevels: [...new Set(model.heightMap.flat())].sort((a, b) => a - b),
      materials: [...new Set(cells.map(cell => cell.material))].sort(),
      navigableCells: cells.filter(cell => cell.navigable).length,
      cliffSegments: model.cliffSegments.length,
      bridgePath: model.routes.bridgeCrossing,
      routeCells: model.routes.navigable.length,
      visibleSprites: window.__terrainV8.getVisibleSprites(),
      assembly: {
        ...window.__terrainV8.assembly,
      },
      frameStats: window.__graphicsControl.stats(),
    };
  });
  assert.equal(validation.renderer, 'pixi');
  assert.equal(validation.materials.includes('water'), true);
  assert.ok(validation.heightLevels.length >= 2);
  assert.ok(validation.cliffSegments > 0 && validation.routeCells > 0);
  if (captureScene === 'farm-assembly-v8') {
    assert.equal(validation.assembly.animals, 5);
    assert.equal(validation.assembly.fences, 10);
    assert.ok(validation.assembly.prefabs >= 18);
  }
  if (captureScene === 'farm-final-v8') {
    assert.equal(validation.assembly.animals, 20);
    assert.equal(validation.assembly.modularFenceSegments, 21);
    assert.equal(validation.assembly.pastureGates, 3);
    assert.equal(validation.assembly.fences, 25);
    assert.equal(validation.assembly.pastures, 3);
  }
  await mkdir(output, {recursive: true});

  await page.addStyleTag({content: `
    html,body{width:1536px!important;height:960px!important;overflow:hidden!important}
    body>header,body>main>.toolbar,body>main>.workspace>.inspector,body>main>.help,.map-hud{display:none!important}
    body>main{width:1536px!important;height:960px!important;max-width:none!important;padding:0!important;margin:0!important}
    body>main>.workspace{display:block!important;width:1536px!important;height:960px!important;margin:0!important}
    .stage-shell{position:absolute!important;left:0!important;top:0!important;width:1536px!important;height:960px!important;min-height:0!important;border:0!important;border-radius:0!important}
  `});
  await page.waitForTimeout(700);
  await page.evaluate(() => { window.__graphicsControl.fitScene(); window.__graphicsControl.setLayer('overlays', false); });
  await page.waitForTimeout(450);
  await page.screenshot({path: path.join(output, `${captureName}-proof-1536x960.png`), animations: 'disabled'});
  await page.evaluate(() => {
    window.__graphicsControl.setLayer('overlays', true);
    const grid = document.querySelector('[data-layer="grid"]');
    grid.checked = true;
    grid.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(250);
  await page.screenshot({path: path.join(output, `${captureName}-proof-grid-1536x960.png`), animations: 'disabled'});
  Object.assign(validation, await page.evaluate(() => {
    const canvas = document.querySelector('#pixi-canvas'), rect = document.querySelector('#stage').getBoundingClientRect();
    return {canvas: {width: canvas.width, height: canvas.height}, stage: {width: rect.width, height: rect.height}, frameStats: window.__graphicsControl.stats(), visibleSprites: window.__terrainV8.getVisibleSprites()};
  }));
  validation.errors = errors;
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
  await writeFile(path.join(output, 'browser-capture.json'), `${JSON.stringify(validation, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({...validation, screenshots: [path.join(output, `${captureName}-proof-1536x960.png`), path.join(output, `${captureName}-proof-grid-1536x960.png`)]}, null, 2)}\n`);
} finally {
  await browser.close();
}
