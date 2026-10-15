import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('hosted demo metadata is generated from the source commit', () => {
  execFileSync(process.execPath, ['scripts/package-hosted-demo.mjs'], {
    cwd: ROOT,
    stdio: 'pipe',
  });

  const outputPath = join(ROOT, 'dist');
  const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const metadata = JSON.parse(readFileSync(join(outputPath, 'build-metadata.json'), 'utf8'));

  assert.equal(metadata.repository, 'santleme/riose-agro');
  assert.equal(metadata.commit, expectedCommit);
  assert.match(metadata.commit, /^[0-9a-f]{40}$/i);
  assert.equal(metadata.releaseStatus, 'candidate');
  assert.ok(readFileSync(join(outputPath, 'product.html'), 'utf8').includes('product-interface'));
  assert.ok(readFileSync(join(outputPath, 'scientific/br_corte_pasture_dmi.js'), 'utf8').includes('BR_CORTE_PASTURE_DMI'));
  assert.ok(readFileSync(join(outputPath, 'src/client/product-world-renderer.bundle.js'), 'utf8').length > 0);
  assert.ok(readFileSync(join(outputPath, 'assets/manifest.json'), 'utf8').includes('synthetic-release'));
  assert.ok(readFileSync(join(outputPath, 'assets/atlas/synthetic-release-atlas-v1.png')).length > 0);
  assert.ok(readFileSync(join(ROOT, '.openai/hosting.json'), 'utf8').includes('"directory": "dist"'));
});
