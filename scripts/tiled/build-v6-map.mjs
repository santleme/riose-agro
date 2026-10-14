import {access, mkdir, readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scenePath = path.resolve(String(process.argv[2] ?? 'artifacts/graphics/spatial-assembly-v6/compiled-beef-84018.json'));
const outputName = String(process.argv[3] ?? 'spatial-v6-beef-84018');
let executable = process.env.TILED_BIN || 'tiled';
const bundled = path.join(homedir(), '.local/share/riose-tools/tiled-1.12.2/squashfs-root/AppRun');
try { await access(executable); } catch { try { await access(bundled); executable = bundled; } catch {} }
await access(scenePath);
await mkdir(path.join(root, 'graphics-poc/generated'), {recursive: true});
const result = spawnSync(executable, ['--evaluate', path.join(root, 'scripts/tiled/build-v6-map.js'), root, scenePath, outputName], {
  cwd: root, encoding: 'utf8', env: {...process.env, QT_QPA_PLATFORM: 'xcb'},
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Tiled CLI exited with status ${result.status}`);
const outputDir = path.join(root, 'graphics-poc/generated');
for (const extension of ['tmj', 'tmx', 'tsx']) await access(path.join(outputDir, `${outputName}.${extension}`));
const parsedMap = JSON.parse(await readFile(path.join(outputDir, `${outputName}.tmj`), 'utf8'));
const counts = parsedMap.layers.map(layer => ({name: layer.name, objects: layer.objects?.length ?? 0}));
const scene = JSON.parse(await readFile(scenePath, 'utf8'));
const expected = new Map([['Macro structures', scene.placements.length], ['Vegetation', scene.vegetation.length],
  ['Road graph', scene.roadPaths.length], ['Road modules', scene.roadNetwork.modules.length], ['Fence network', scene.fenceNetwork.segments.length]]);
for (const [name, expectedCount] of expected) {
  const actualCount = counts.find(layer => layer.name === name)?.objects;
  if (actualCount !== expectedCount) throw new Error(`Tiled layer ${name} has ${actualCount} objects; expected ${expectedCount}.`);
}
process.stdout.write(`${JSON.stringify({valid: true, tiledVersion: result.stdout.match(/"version":"([^"]+)/)?.[1], output: `graphics-poc/generated/${outputName}.tmj`, layers: counts}, null, 2)}\n`);
