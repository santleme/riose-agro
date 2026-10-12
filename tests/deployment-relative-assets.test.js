import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('root HTML entrypoints resolve client assets below a deployment subpath', () => {
  const entrypoints = readdirSync(ROOT).filter(filename => filename.endsWith('.html'));
  let clientAssetCount = 0;

  for (const entrypoint of entrypoints) {
    const html = readFileSync(join(ROOT, entrypoint), 'utf8');
    const assetReferences = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map(([, url]) => url);

    for (const asset of assetReferences.filter(url => url.includes('src/client/'))) {
      assert.ok(!asset.startsWith('/'), `${entrypoint} must keep ${asset} relative to the deployment base`);
      assert.ok(asset.startsWith('src/client/'), `${entrypoint} should reference a root client asset: ${asset}`);

      const resolved = new URL(asset, 'https://example.test/riose-agro/');
      assert.ok(resolved.pathname.startsWith('/riose-agro/src/client/'), `${asset} escaped the deployment subpath`);
      assert.ok(existsSync(join(ROOT, asset)), `${entrypoint} references a missing asset: ${asset}`);
      clientAssetCount += 1;
    }
  }

  assert.ok(clientAssetCount > 0, 'expected to inspect client assets from root HTML entrypoints');
});
