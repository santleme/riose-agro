import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('scientific data manifest validates license, source checksums, and Parquet output', () => {
  const output = execFileSync(process.execPath, ['scripts/validation/validate_scientific_data_registry.js'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /10\.17632\/nj72kmdj77\.1/);
  assert.match(output, /20 source files checksum-verified; 342 Parquet rows/);
});
