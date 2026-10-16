import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server/server.js';

test('Product uses the institutional header and retired navigation routes forward cleanly', async t => {
  const server = createServer({env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(`${root}/`);
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Riose/);
  assert.match(homeHtml, /href="product\.html"/);
  assert.match(homeHtml, /class="theme-toggle"[^>]*>dark<\/button>/);
  assert.match(homeHtml, /header-utilities/);
  assert.match(homeHtml, /class="hero-scene"/);
  assert.match(homeHtml, /assets\/riose-cow-cutout\.png/);
  assert.match(homeHtml, /assets\/pasture-cattle-map\.webp/);
  assert.doesNotMatch(homeHtml, /href="adult-data\.html"[^>]*>· data/);
  assert.doesNotMatch(homeHtml, /MODEL\/INPUTS\/OUTPUTS/);
  const product = await fetch(`${root}/product.html`);
  assert.equal(product.status, 200);
  const productHtml = await product.text();
  assert.match(productHtml, /What would happen if\?/);
  assert.match(productHtml, /population-grid/);
  assert.match(productHtml, /class="site-header"/);
  assert.match(productHtml, /href="product\.html" aria-current="page">· product/);
  assert.doesNotMatch(productHtml, /placeholder="For example:/);
  assert.doesNotMatch(productHtml, /<nav aria-label="Main navigation"|href="scenario-lab\.html"|href="experiments\.html"|href="observed-data\.html"/);
  const scenarioLab = await fetch(`${root}/scenario-lab.html`);
  assert.equal(scenarioLab.status, 200);
  const scenarioLabHtml = await scenarioLab.text();
  assert.match(scenarioLabHtml, /class="site-header"/);
  assert.doesNotMatch(scenarioLabHtml, /<nav aria-label="Main navigation"|href="scenario-lab\.html"|href="experiments\.html"|href="observed-data\.html"/);
  assert.match(scenarioLabHtml, /Compare the conditions you can control/);
  assert.match(scenarioLabHtml, /Export manifest \+ results/);
  assert.match(scenarioLabHtml, /BR-CORTE 2023/);
  assert.match(scenarioLabHtml, /Validated draft · no auto-run/);
  assert.match(scenarioLabHtml, /Optional server-side AI interpretation/);
  assert.match(scenarioLabHtml, /user-supplied/);
  assert.doesNotMatch(productHtml, /farm-scene|<canvas|isométr|mapa da fazenda/i);
  const experiments = await fetch(`${root}/experiments.html`, {redirect: 'manual'});
  assert.equal(experiments.status, 308);
  assert.equal(experiments.headers.get('location'), '/product.html');
  const simulator = await fetch(`${root}/simulator.html`, {redirect: 'manual'});
  assert.equal(simulator.status, 308);
  assert.equal(simulator.headers.get('location'), '/product.html');
  const manifesto = await fetch(`${root}/manifesto.html`);
  assert.equal(manifesto.status, 200);
  const manifestoHtml = await manifesto.text();
  assert.match(manifestoHtml, /assets\/riose-farm-pixel-scene\.png/);
  assert.match(manifestoHtml, /assets\/riose-cow-sprite-idle\.png/);
  assert.match(manifestoHtml, /assets\/riose-cow-sprite-graze\.png/);
  for (const path of ['/assets/riose-farm-pixel-scene.png', '/assets/riose-cow-sprite-idle.png', '/assets/riose-cow-sprite-graze.png']) {
    const response = await fetch(`${root}${path}`);
    assert.equal(response.status, 200, `${path} should be served for the manifesto farm`);
    assert.match(response.headers.get('content-type') ?? '', /^image\/png/);
    assert.ok((await response.arrayBuffer()).byteLength > 0, `${path} should not be empty`);
  }
  for (const path of ['/product.css', '/scenario-lab.css', '/theme.css', '/header-interaction.js', '/src/client/scenario-lab-app.js', '/src/client/scenario-set.js', '/src/client/scenario-set-budget.js', '/src/client/scenario-lab-intent.js', '/src/client/scenario-lab-integrity.js', '/src/client/br-corte-scenario.js', '/scientific/br_corte_dmi_adapter.js', '/scientific/model-contract.js', '/scientific/br_corte_pasture_dmi.js', '/src/client/product-app.js', '/src/client/experiments-app.js', '/src/client/engine.js', '/src/client/worker.js', '/src/client/population-experiment.js', '/src/client/simulation-report.js']) {
    assert.equal((await fetch(`${root}${path}`)).status, 200, `${path} should be served`);
  }
  assert.equal((await fetch(`${root}/assets/riose-cow-cutout.png`)).status, 200, 'institutional landing illustration should be served');
  assert.equal((await fetch(`${root}/assets/pasture-cattle-map.webp`)).status, 200, 'population map thumbnail should be served');
  assert.equal((await fetch(`${root}/assets/riose-farm-diorama.webp`)).status, 200, 'manifesto farm illustration should be served');
  for (const path of ['/src/client/farm-scene.js', '/src/client/farm-scene.css', '/assets/farm-scene/scene.json', '/assets/farm-scene/vendor/pixi.min.mjs']) {
    assert.equal((await fetch(`${root}${path}`)).status, 404, `${path} should no longer be served`);
  }
});
