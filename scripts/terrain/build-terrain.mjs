import {spawnSync} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seedIndex = process.argv.indexOf('--seed');
const seed = seedIndex >= 0 ? Number(process.argv[seedIndex + 1]) : 84017;
if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Use --seed <non-negative integer>.');

function run(command, args) {
  const result = spawnSync(command, args, {cwd: root, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

run('python3', ['scripts/terrain/generate_heightmaps.py', '--seed', String(seed)]);
const selectionPath = path.join(root, 'graphics-poc/generated/terrain-v5/selection.json');
const selection = JSON.parse(await readFile(selectionPath, 'utf8'));
selection.seed = seed;
selection.status = 'selected-for-runtime-review';
await writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
run('node', ['scripts/blender/render-terrain-proposals.mjs']);
