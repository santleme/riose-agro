import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(repositoryRoot, 'dist');
const hostedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter(isHostedFile);
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();

if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
  throw new Error(`Expected a full Git commit SHA, received: ${commitSha}`);
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

for (const file of hostedFiles) {
  const source = join(repositoryRoot, file);
  const destination = join(outputRoot, file);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}

writeFileSync(join(outputRoot, 'build-metadata.json'), `${JSON.stringify({
  repository: 'santleme/riose-agro',
  commit: commitSha,
  ref: branch || null,
  releaseStatus: 'candidate',
}, null, 2)}\n`);

console.log(`Hosted demo packaged at ${relative(repositoryRoot, outputRoot).split(sep).join('/')}`);
console.log(`Source commit: ${commitSha}`);

const archivePath = join(repositoryRoot, 'dist-hosted-demo.tar');
mkdirSync(dirname(archivePath), { recursive: true });
execFileSync('tar', [
  '-cf', archivePath,
  '-C', repositoryRoot,
  '.openai/hosting.json',
  'dist',
], { stdio: 'inherit' });
console.log(`Sites archive: ${relative(repositoryRoot, archivePath).split(sep).join('/')}`);

function isHostedFile(file) {
  if (/^(index|home|experiments|product|simulator|manifesto)\.html$/.test(file)) return true;
  if (/^[^/]+\.(css|js|svg)$/.test(file)) return true;
  if (file.startsWith('src/client/')) return true;
  if (file.startsWith('wasm/')) return true;
  return /^assets\/research-pages\//.test(file);
}