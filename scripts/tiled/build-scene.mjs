import {spawnSync} from 'node:child_process';
import {access,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundled = path.join(homedir(), '.local/share/riose-tools/tiled-1.12.2/squashfs-root/AppRun');
let executable = process.env.TILED_BIN || 'tiled';
let args = [];
try { await access(executable); } catch { try { await access(bundled); executable = bundled; } catch {} }
await mkdir(path.join(root, 'graphics-poc/generated'), {recursive: true});
const requestedArgs = process.argv.slice(2);
if (requestedArgs.length === 0) {
  const selectionPath = path.join(root, 'graphics-poc/generated/terrain-v5/composition-proposals/selection.json');
  try {
    const selection = JSON.parse(await (await import('node:fs/promises')).readFile(selectionPath, 'utf8'));
    if (selection.selectedScene) requestedArgs.push(selection.selectedScene);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  requestedArgs.push('ranch-v4');
}
args = ['--evaluate', path.join(root, 'scripts/tiled/build-scene.js'), root, ...requestedArgs];
const result = spawnSync(executable, args, {cwd: root, encoding: 'utf8', env: {...process.env, QT_QPA_PLATFORM: 'xcb'}});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Tiled CLI exited with status ${result.status}`);
