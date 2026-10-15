import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('hosted demo metadata is generated from the source commit', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'riose-hosted-demo-'));
  const outputPath = join(tempRoot, 'site');

  try {
    execFileSync(process.execPath, ['scripts/package-hosted-demo.mjs', outputPath], {
      cwd: ROOT,
      stdio: 'pipe',
    });

    const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const metadata = JSON.parse(readFileSync(join(outputPath, 'build-metadata.json'), 'utf8'));

    assert.equal(metadata.repository, 'santleme/riose-agro');
    assert.equal(metadata.commit, expectedCommit);
    assert.match(metadata.commit, /^[0-9a-f]{40}$/i);
    assert.equal(metadata.releaseStatus, 'candidate');
    assert.ok(readFileSync(join(outputPath, 'experiments.html'), 'utf8').includes('experiment-form'));
    assert.ok(readFileSync(join(ROOT, '.openai/hosting.json'), 'utf8').includes('"directory": "dist/hosted-demo"'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
