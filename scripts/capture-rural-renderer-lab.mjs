import {mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

const scene = process.argv[2] ?? 'rural-small-v9', renderer = process.argv[3] ?? 'pixi';
if (!['rural-small-v9', 'rural-property-v9'].includes(scene) || !['pixi', 'babylon'].includes(renderer)) throw new Error('Usage: node scripts/capture-rural-renderer-lab.mjs <rural-small-v9|rural-property-v9> <pixi|babylon>');
const chrome = [process.env.CHROME_BIN, '/home/lucas_coimbra/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(path => path && existsSync(path));
const browser = await chromium.launch({headless: true, ...(chrome ? {executablePath: chrome} : {}), args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']});
const page = await browser.newPage({viewport: {width: 1536, height: 960}, deviceScaleFactor: 1});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.location().url?.endsWith('/favicon.ico')) errors.push(`${message.text()} ${JSON.stringify(message.location())}`); });
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
try {
  await page.goto(`http://127.0.0.1:8000/graphics-poc/rural-renderer-lab.html?scene=${scene}&renderer=${renderer}&capture=1`, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__ruralRendererLab, {timeout: 30000});
  await page.waitForTimeout(1600);
  const out = `artifacts/graphics/${scene}/renderer-comparison`;
  await mkdir(out, {recursive: true});
  await page.screenshot({path: `${out}/${scene}-${renderer}-1536x960.png`, animations: 'disabled'});
  const report = await page.evaluate(async () => await window.__ruralRendererLab.measure());
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  const browser = await page.evaluate(() => {
    const canvas = document.querySelector('#renderer-canvas'), gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return {userAgent: navigator.userAgent, webglVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
      webglRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null, devicePixelRatio: devicePixelRatio};
  });
  const result = {...report, scene, renderer, browser, errors, screenshot: `${out}/${scene}-${renderer}-1536x960.png`, measurement: {warmupMs: 1500, sampleMs: 4000, viewport: '1536x960 CSS px', deviceScaleFactor: 1}};
  await writeFile(`${out}/${scene}-${renderer}-metrics.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
