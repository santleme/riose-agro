#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createComparisonArchive} from '../comparison-archive.js';

const [manifestArg, outputArg] = process.argv.slice(2);
if (!manifestArg || !outputArg) {
  process.stderr.write('Uso: npm run archive:comparison -- <manifesto.json> <arquivo-projecao.json>\n');
  process.exitCode = 1;
} else {
  try {
    const manifestPath = resolve(manifestArg);
    const outputPath = resolve(outputArg);
    const enginePath = fileURLToPath(new URL('../engine.js', import.meta.url));
    const archive = createComparisonArchive(readFileSync(manifestPath), readFileSync(enginePath));
    writeFileSync(outputPath, `${JSON.stringify(archive, null, 2)}\n`, {flag: 'wx'});
    process.stdout.write(`${JSON.stringify({created: outputPath, archiveSha256: archiveDigest(outputPath), manifestSha256: archive.manifestReference.sha256, engineSourceSha256: archive.engineSourceSha256}, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

function archiveDigest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
