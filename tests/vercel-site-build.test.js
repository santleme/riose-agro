import test from 'node:test';
import assert from 'node:assert/strict';
import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildVercelSite} from '../scripts/build/build-vercel-site.mjs';

test('Vercel static output contains approved site assets and excludes repository-only files', async () => {
  const output = await mkdtemp(join(tmpdir(), 'riose-vercel-site-'));
  try {
    await buildVercelSite(output);
    for (const file of [
      'index.html',
      'home.html',
      'product.html',
      'src/client/product-app.js',
      'src/client/worker.js',
      'assets/product-farm/pasture-pixel.webp',
      'data/observed-calves-zenodo-7251167.json',
    ]) {
      await access(join(output, file));
    }
    for (const file of ['package.json', 'README.md', '.env', 'experiments/behavior/precision-beef-instrument-agreement/model_package/README.md']) {
      await assert.rejects(access(join(output, file)));
    }
    const index = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(index, /home\.html/);
  } finally {
    await rm(output, {recursive: true, force: true});
  }
});
