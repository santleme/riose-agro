import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server/server.js';

test('science-first homepage and experiment dashboard are served without map assets', async t => {
  const server = createServer({env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(`${root}/`);
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Riose/);
  assert.match(homeHtml, /experiment-preview/);
  assert.doesNotMatch(homeHtml, /farm-map|Explore farm map|DEMONSTRATION FARM/i);
  const product = await fetch(`${root}/product.html`);
  assert.equal(product.status, 200);
  const html = await product.text();
  assert.match(html, /Configuração/);
  assert.match(html, /Executar comparação/);
  assert.match(html, /weight-chart/);
  assert.match(html, /run-history/);
  assert.doesNotMatch(html, /<canvas|pixi|isométr|mapa da fazenda/i);
  for (const path of ['/product.css', '/src/client/product-app.js', '/src/client/engine.js', '/src/client/worker.js', '/src/client/simulation-report.js']) {
    assert.equal((await fetch(`${root}${path}`)).status, 200, `${path} should be served`);
  }
  for (const path of ['/experiments.html', '/farm-scene.css', '/src/client/farm-scene.js', '/assets/farm-scene/scene.json', '/assets/riose-farm-map-preview.webp']) {
    assert.equal((await fetch(`${root}${path}`)).status, 404, `${path} should be removed`);
  }
});
