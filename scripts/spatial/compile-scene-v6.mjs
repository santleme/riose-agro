#!/usr/bin/env node
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createFarmAssemblySpecification, assembleFarmMacrostructure} from '../../graphics-poc/assembly-specs-v6.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('='); return [key, rest.join('=') || true];
}));
const system = String(args.system ?? 'beef'), seed = Number(args.seed ?? 1), engine = String(args.engine ?? 'cpsat');
const outputPath = path.resolve(String(args.output ?? `artifacts/graphics/spatial-assembly-v6/compiled-${system}-${seed}.json`));
if (!['beef', 'dairy'].includes(system) || !Number.isInteger(seed)) throw new TypeError('Use --system=beef|dairy and an integer --seed.');
if (!['cpsat', 'javascript', 'auto'].includes(engine)) throw new TypeError('Use --engine=cpsat|javascript|auto.');

const specification = createFarmAssemblySpecification({system});
const serializable = {
  ...specification,
  terrain: {
    columns: specification.terrain.columns,
    rows: specification.terrain.rows,
    slopeGrid: Array.from({length: specification.terrain.rows}, (_, y) =>
      Array.from({length: specification.terrain.columns}, (_, x) => specification.terrain.slopeAt(x + 0.5, y + 0.5))),
  },
};
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'riose-spatial-scene-'));
try {
  const inputPath = path.join(tempDir, 'macro-specification.json'), solverPath = path.join(tempDir, 'macro-solution.json');
  await writeFile(inputPath, `${JSON.stringify(serializable)}\n`);
  const solved = spawnSync(process.execPath, [path.join(root, 'scripts/spatial/solve-macro.mjs'), `--input=${inputPath}`, `--output=${solverPath}`, `--engine=${engine}`, `--seed=${seed}`], {
    cwd: root, encoding: 'utf8', env: process.env,
  });
  let solverResult;
  try {
    solverResult = JSON.parse(await readFile(solverPath, 'utf8'));
  } catch (error) {
    throw new Error(`Macro solver failed (${solved.status}): ${solved.stderr || solved.stdout || error.message}`);
  }
  if (solved.status !== 0 || !solverResult.valid) {
    const diagnostics = solverResult.hardViolations ?? solverResult.violations ?? solverResult.detail ?? solverResult.reason;
    throw new Error(`Macro solver rejected scene (${solved.status}, ${solverResult.solverStatus ?? 'no solver status'}): ${JSON.stringify(diagnostics)}`);
  }
  const scene = assembleFarmMacrostructure({system, seed, solverResult});
  if (!scene.valid) throw new Error(`Scene compilation rejected: ${scene.reason}; ${(scene.violations ?? []).map(item => item.type).join(', ')}`);
  scene.sceneSchemaVersion = 'riose-compiled-farm-scene-v6';
  scene.solverIntegration = {engine: solverResult.solverEngine, status: solverResult.solverStatus ?? solverResult.optimality,
    seed, macroPlacements: solverResult.placements.length, downstream: ['A* access routes', 'paddock gates and fence loops', 'modular corral prefab', 'Poisson-disk vegetation']};
  await (await import('node:fs/promises')).mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(scene, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({valid: scene.valid, system, seed, solver: scene.solverIntegration, routeCount: scene.roadPaths.length,
    paddockCount: scene.paddocks.length, fenceSegmentCount: scene.fenceNetwork?.segments.length ?? scene.fence.length,
    output: path.relative(root, outputPath)}, null, 2)}\n`);
} finally {
  await rm(tempDir, {recursive: true, force: true});
}
