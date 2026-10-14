import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from '../src/server/server.js';

const browserCandidates = [process.env.CHROME_BIN, '/home/lucas_coimbra/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'].filter(Boolean);
let executablePath;
for (const candidate of browserCandidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }

test('spatial debug uses the solver prefab envelope and labels sprite alpha as unverified candidate', async t => {
  if (!executablePath) return t.skip('Chromium unavailable; set CHROME_BIN to run the browser envelope test.');
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({executablePath, headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1500, height: 1000}}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/graphics-poc/spatial-debug.html`);
  await page.waitForFunction(() => window.__spatialDebug?.getPlacementDiagnostics('handling-yard'));
  const report = await page.evaluate(() => {
    const selected = window.__spatialDebug.selectPlacement('handling-yard');
    const farmhouse = window.__spatialDebug.getSolution().placements.find(item => item.id === 'farmhouse');
    return {selected, diagnostics: window.__spatialDebug.getPlacementDiagnostics('handling-yard'),
      details: JSON.parse(document.querySelector('#details').textContent),
      outOfBoundsProbe: window.__spatialDebug.probe({x: 30, y: 22}),
      overlappingPlacementProbe: window.__spatialDebug.probe({x: farmhouse.position.x, y: farmhouse.position.y})};
  });
  assert.equal(report.selected, true);
  assert.equal(report.diagnostics.placementGeometry.source, 'semantic-prefab-envelope');
  assert.deepEqual(report.diagnostics.placementGeometry.footprint, {columns: 8, rows: 5});
  assert.equal(report.diagnostics.placementGeometry.worldPolygon.length, 4);
  assert.equal(report.diagnostics.alphaCandidate.physicalFootprintStatus, 'unverified');
  assert.equal(report.diagnostics.alphaCandidate.reviewRequired, true);
  assert.notDeepEqual(report.diagnostics.alphaCandidate.footprint, {columns: 8, rows: 5});
  assert.equal(report.diagnostics.clearance.radiusCells, 2.2);
  assert.deepEqual(report.details.placementGeometry.footprint, {columns: 8, rows: 5});
  assert.equal(report.details.alphaCandidate.source, 'sprite-alpha-inference-only');
  assert.equal(report.outOfBoundsProbe.reason, 'out-of-bounds', 'probe bounds use the full 8 × 5 prefab envelope');
  assert.equal(report.overlappingPlacementProbe.reason, 'collision', 'probe collision uses the full semantic yard envelope');
  assert.deepEqual(errors, []);
});
