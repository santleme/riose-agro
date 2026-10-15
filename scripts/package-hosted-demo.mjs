import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(repositoryRoot, 'dist');
execFileSync(process.execPath, ['scripts/build-product-renderer.mjs'], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const sourceFiles = new Set(trackedFiles);
sourceFiles.add('src/client/product-world-renderer.bundle.js');
const hostedFiles = discoverHostedFiles(sourceFiles);
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
  return sourceFiles.has(file) && existsSync(join(repositoryRoot, file));
}

function discoverHostedFiles(files) {
  const pending = ['product.html'];
  const included = new Set();

  while (pending.length > 0) {
    const file = normalizeRepoPath(pending.pop());
    if (!file || included.has(file)) continue;
    if (!isHostedFile(file)) {
      throw new Error(`Hosted runtime dependency is missing from the checkout: ${file}`);
    }

    included.add(file);
    const source = readFileSync(join(repositoryRoot, file), 'utf8');
    const extension = extname(file).toLowerCase();

    if (extension === '.html') {
      for (const match of source.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) {
        queueReference(match[1], file, pending);
      }
      for (const match of source.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
        for (const candidate of match[1].split(',')) queueReference(candidate.trim().split(/\s+/)[0], file, pending);
      }
    } else if (extension === '.css') {
      for (const match of source.matchAll(/@import\s+(?:url\()?\s*["']?([^"'\s)]+)["']?\s*\)?/gi)) {
        queueReference(match[1], file, pending);
      }
      for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        queueReference(match[1], file, pending);
      }
    } else if ((extension === '.js' || extension === '.mjs') && !file.endsWith('.bundle.js')) {
      for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?["']([^"']+)["']/g)) {
        queueReference(match[1], file, pending);
      }
      for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
        queueReference(match[1], file, pending);
      }
      for (const match of source.matchAll(/new\s+URL\(\s*["']([^"']+)["']/g)) {
        queueReference(match[1], file, pending);
      }
      for (const match of source.matchAll(/\bfetch\(\s*["']([^"']+)["']/g)) {
        queueReference(match[1], file, pending);
      }
    } else if (extension === '.json') {
      queueManifestAssets(source, file, pending);
    }
  }

  return [...included].sort();
}

function queueReference(reference, importer, pending) {
  if (!reference || /^(?:[a-z]+:|#|data:|blob:|\/\/)/i.test(reference)) return;
  const pathname = reference.split(/[?#]/, 1)[0];
  if (!pathname || pathname.startsWith('/api/')) return;
  const sourcePath = pathname.startsWith('/')
    ? findRootSource(pathname)
    : normalizeRepoPath(posix.join(posix.dirname(importer.replaceAll(sep, '/')), pathname));

  if (sourcePath) pending.push(sourcePath);
  else if (hasFileExtension(pathname)) throw new Error(`Cannot resolve hosted reference ${reference} from ${importer}`);
}

function findRootSource(urlPath) {
  const normalized = normalizeRepoPath(urlPath);
  const candidates = [normalized, normalizeRepoPath(`public/${normalized}`)];
  return candidates.find(candidate => sourceFiles.has(candidate) && existsSync(join(repositoryRoot, candidate))) ?? null;
}

function queueManifestAssets(source, importer, pending) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    return;
  }
  const referenced = [
    ...Object.values(manifest.atlases ?? {}).map(atlas => atlas.image),
    ...(manifest.assets ?? []).map(asset => asset.file),
  ];
  for (const reference of new Set(referenced)) {
    if (typeof reference === 'string') queueReference(reference, importer, pending);
  }
}

function normalizeRepoPath(value) {
  const normalized = posix.normalize(value.replaceAll(sep, '/').replace(/^\/+/, ''));
  return normalized === '.' || normalized.startsWith('../') ? null : normalized;
}

function hasFileExtension(value) {
  return /\.[a-z0-9]{1,8}$/i.test(value);
}
