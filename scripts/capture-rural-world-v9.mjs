import {mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

const scene = process.argv[2] ?? 'rural-small-v9';
if (!['rural-small-v9', 'rural-property-v9', 'farm-final-v8'].includes(scene)) throw new Error(`Unknown generated world: ${scene}`);
const output = `artifacts/graphics/${scene}`;
const chrome = [process.env.CHROME_BIN, '/home/lucas_coimbra/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(path => path && existsSync(path));
const browser = await chromium.launch({headless: true, ...(chrome ? {executablePath: chrome} : {}), args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']});
const page = await browser.newPage({viewport: {width: 1536, height: 960}, deviceScaleFactor: 1});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
try {
  await page.goto(`http://127.0.0.1:8000/graphics-poc/index.html?scene=${scene}&renderer=pixi`, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__graphicsReady && window.__terrainV8?.getRenderer() === 'pixi', {timeout: 30000});
  await page.waitForTimeout(1200);
  await page.addStyleTag({content: 'html,body{width:1536px!important;height:960px!important;overflow:hidden!important}body>header,body>main>.toolbar,body>main>.workspace>.inspector,body>main>.help,.map-hud{display:none!important}body>main{width:1536px!important;height:960px!important;max-width:none!important;padding:0!important;margin:0!important}body>main>.workspace{display:block!important;width:1536px!important;height:960px!important;margin:0!important}.stage-shell{position:absolute!important;left:0!important;top:0!important;width:1536px!important;height:960px!important;min-height:0!important;border:0!important;border-radius:0!important}'});
  await page.evaluate(() => { window.__graphicsControl.fitScene(); window.__graphicsControl.setLayer('overlays', false); });
  await page.waitForTimeout(500);
  await mkdir(output, {recursive: true});
  await page.screenshot({path: `${output}/${scene}-pixi-1536x960.png`, animations: 'disabled'});
  await page.evaluate(() => {
    window.__graphicsControl.setLayer('overlays', true);
    const grid = document.querySelector('[data-layer="grid"]'); grid.checked = true; grid.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(250);
  await page.screenshot({path: `${output}/${scene}-pixi-grid-1536x960.png`, animations: 'disabled'});
  await page.evaluate(() => window.__graphicsControl.clearStats());
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__graphicsControl.clearStats());
  await page.waitForTimeout(4000);
  const capture = await page.evaluate(() => ({model: window.__terrainV8.model, assembly: window.__terrainV8.assembly,
    stats: window.__graphicsControl.stats(), measurement: {warmupMs: 1500, sampleMs: 4000, viewport: '1536x960 CSS px', deviceScaleFactor: 1}}));
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  await writeFile(`${output}/capture.json`, `${JSON.stringify({...capture, errors}, null, 2)}\n`);
  console.log(JSON.stringify({scene, screenshots: [`${output}/${scene}-pixi-1536x960.png`, `${output}/${scene}-pixi-grid-1536x960.png`], ...capture.stats}, null, 2));
} finally { await browser.close(); }
