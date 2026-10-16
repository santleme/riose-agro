import {cp, mkdir, rm, copyFile, access} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PUBLIC_FILES} from '../../src/server/server.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export async function buildVercelSite(outputDirectory = resolve(ROOT, 'dist')) {
  await rm(outputDirectory, {recursive: true, force: true});
  await mkdir(outputDirectory, {recursive: true});

  for (const relativePath of PUBLIC_FILES) {
    if (relativePath.startsWith('assets/')) continue;
    let source = resolve(ROOT, relativePath);
    try {
      await access(source);
    } catch {
      source = resolve(ROOT, 'src/client', relativePath);
    }
    const destination = resolve(outputDirectory, relativePath);
    await mkdir(dirname(destination), {recursive: true});
    await copyFile(source, destination);
  }

  await cp(resolve(ROOT, 'src/client'), resolve(outputDirectory, 'src/client'), {recursive: true});
  await cp(resolve(ROOT, 'assets'), resolve(outputDirectory, 'assets'), {recursive: true});
  await cp(resolve(ROOT, 'public/assets'), resolve(outputDirectory, 'assets'), {recursive: true, force: true});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildVercelSite();
}
