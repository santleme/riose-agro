import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server/server.js';

test('conversational product and experiment dashboard are served without farm graphics', async t => {
  const server = createServer({env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(`${root}/`);
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Riose/);
  assert.match(homeHtml, /href="product\.html"/);
  const product = await fetch(`${root}/product.html`);
  assert.equal(product.status, 200);
  const productHtml = await product.text();
  assert.match(productHtml, /What would happen if\?/);
  assert.match(productHtml, /population-grid/);
  assert.match(productHtml, /href="scenario-lab\.html"/);
  const scenarioLab = await fetch(`${root}/scenario-lab.html`);
  assert.equal(scenarioLab.status, 200);
  const scenarioLabHtml = await scenarioLab.text();
  assert.match(scenarioLabHtml, /Compare the conditions you can control/);
  assert.match(scenarioLabHtml, /Export manifest \+ results/);
  assert.match(scenarioLabHtml, /BR-CORTE 2023/);
  assert.match(scenarioLabHtml, /Validated draft · no auto-run/);
  assert.match(scenarioLabHtml, /Optional server-side AI interpretation/);
  assert.match(scenarioLabHtml, /user-supplied/);
  assert.doesNotMatch(productHtml, /farm-scene|<canvas|isométr|mapa da fazenda/i);
  const experiments = await fetch(`${root}/experiments.html`);
  assert.equal(experiments.status, 200);
  const html = await experiments.text();
  assert.match(html, /DESENHO DO EXPERIMENTO/);
  assert.match(html, /RESULTADOS/);
  assert.match(html, /SENSIBILIDADE/);
  assert.match(html, /HISTÓRICO/);
  assert.doesNotMatch(html, /<canvas|isométr|mapa da fazenda/i);
  for (const path of ['/product.css', '/scenario-lab.css', '/src/client/scenario-lab-app.js', '/src/client/scenario-set.js', '/src/client/scenario-set-budget.js', '/src/client/scenario-lab-intent.js', '/src/client/scenario-lab-integrity.js', '/src/client/br-corte-scenario.js', '/scientific/br_corte_dmi_adapter.js', '/scientific/model-contract.js', '/scientific/br_corte_pasture_dmi.js', '/src/client/product-app.js', '/src/client/experiments-app.js', '/src/client/engine.js', '/src/client/worker.js', '/src/client/population-experiment.js', '/src/client/simulation-report.js']) {
    assert.equal((await fetch(`${root}${path}`)).status, 200, `${path} should be served`);
  }
  for (const path of ['/src/client/farm-scene.js', '/src/client/farm-scene.css', '/assets/farm-scene/scene.json', '/assets/farm-scene/vendor/pixi.min.mjs', '/assets/riose-cow-cutout.png']) {
    assert.equal((await fetch(`${root}${path}`)).status, 404, `${path} should no longer be served`);
  }
});
