import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server/server.js';

test('experiment dashboard is served and old product routes no longer serve graphics', async t => {
  const server = createServer({env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(`${root}/`);
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Riose/);
  assert.match(homeHtml, /href="experiments\.html"/);
  const product = await fetch(`${root}/product.html`);
  assert.equal(product.status, 200);
  const productHtml = await product.text();
  assert.match(productHtml, /url=experiments\.html/);
  assert.doesNotMatch(productHtml, /farm-scene|canvas|fazenda/i);
  const experiments = await fetch(`${root}/experiments.html`);
  assert.equal(experiments.status, 200);
  const html = await experiments.text();
  assert.match(html, /DESENHO DO EXPERIMENTO/);
  assert.match(html, /RESULTADOS/);
  assert.match(html, /SENSIBILIDADE/);
  assert.match(html, /HISTÓRICO/);
  assert.doesNotMatch(html, /<canvas|isométr|mapa da fazenda/i);
  for (const path of ['/product.css', '/src/client/product-app.js', '/src/client/engine.js', '/src/client/worker.js', '/src/client/simulation-report.js']) {
    assert.equal((await fetch(`${root}${path}`)).status, 200, `${path} should be served`);
  }
  for (const path of ['/src/client/farm-scene.js', '/src/client/farm-scene.css', '/assets/farm-scene/scene.json', '/assets/farm-scene/vendor/pixi.min.mjs', '/assets/riose-cow-cutout.png']) {
    assert.equal((await fetch(`${root}${path}`)).status, 404, `${path} should no longer be served`);
  }
});
