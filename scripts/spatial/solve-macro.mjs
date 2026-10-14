#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {solveMacroPlacement} from '../../graphics-poc/spatial-assembly-v6.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
if (!args.input) throw new Error('Usage: node scripts/spatial/solve-macro.mjs --input=spec.json [--engine=auto|cpsat|javascript] [--seed=1|--seeds=1:100] [--output=result.json]');
const engine = args.engine ?? 'auto';
if (!['auto', 'cpsat', 'javascript'].includes(engine)) throw new Error(`Unknown solver engine: ${engine}`);
const input = path.resolve(String(args.input));
const spec = JSON.parse(await readFile(input, 'utf8'));
const seed = Number(args.seed ?? 1);
const seeds = args.seeds == null ? null : String(args.seeds).includes(':')
  ? (() => { const [start, end] = String(args.seeds).split(':').map(Number); if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) throw new Error(`Invalid seed range: ${args.seeds}`); return Array.from({length: end - start + 1}, (_, index) => start + index); })()
  : String(args.seeds).split(',').map(Number);
let result;
let selectedEngine = engine;

if (engine !== 'javascript') {
  const python = process.env.RIOSE_SPATIAL_PYTHON || 'python3';
  const probe = spawnSync(python, ['-c', 'import ortools; print(ortools.__version__)'], {encoding: 'utf8'});
  if (probe.status === 0) {
    const outputPath = args.output ? path.resolve(String(args.output)) : undefined;
    const commandArgs = [path.join(here, 'solve_macro_cpsat.py'), `--input=${input}`];
    commandArgs.push(seeds ? `--seeds=${seeds.join(',')}` : `--seed=${seed}`);
    if (outputPath) commandArgs.push(`--output=${outputPath}`);
    if (args['time-limit']) commandArgs.push(`--time-limit=${args['time-limit']}`);
    if (args.workers) commandArgs.push(`--workers=${args.workers}`);
    const solved = spawnSync(python, commandArgs, {encoding: 'utf8'});
    if (solved.status === 0) {
      result = outputPath ? JSON.parse(await readFile(outputPath, 'utf8')) : JSON.parse(solved.stdout);
      selectedEngine = 'ortools-cp-sat';
    } else if (engine === 'cpsat') {
      try {
        result = outputPath ? JSON.parse(await readFile(outputPath, 'utf8')) : JSON.parse(solved.stdout);
        selectedEngine = 'ortools-cp-sat';
      } catch {
        process.stderr.write(solved.stderr || solved.stdout);
        process.exit(solved.status ?? 2);
      }
    } else {
      // A valid JSON failure is a genuine infeasible/invalid solve. Do not mask
      // it by quietly retrying a different algorithm.
      try {
        result = outputPath ? JSON.parse(await readFile(outputPath, 'utf8')) : JSON.parse(solved.stdout);
        selectedEngine = 'ortools-cp-sat';
      } catch {
        result = undefined;
      }
    }
  } else if (engine === 'cpsat') {
    throw new Error(`OR-Tools is unavailable for ${python}. Install scripts/spatial/requirements.txt or set RIOSE_SPATIAL_PYTHON. ${probe.stderr.trim()}`);
  }
}

if (!result) {
  if (seeds) {
    const results = seeds.map(value => solveMacroPlacement(spec, {seed: value, maxExpansions: Number(args['max-expansions'] ?? 6000)}));
    const acceptedCount = results.filter(item => item.valid).length;
    result = {valid: acceptedCount === results.length, batch: true, seedCount: results.length, acceptedCount,
      rejectedCount: results.length - acceptedCount, results};
  } else {
    result = solveMacroPlacement(spec, {seed, maxExpansions: Number(args['max-expansions'] ?? 6000)});
  }
  selectedEngine = 'javascript-bounded-search';
}
result.solverEngine = selectedEngine;
if (Array.isArray(result.results)) for (const item of result.results) item.solverEngine = selectedEngine;
const encoded = `${JSON.stringify(result, null, 2)}\n`;
if (args.output) await writeFile(path.resolve(String(args.output)), encoded);
else process.stdout.write(encoded);
if (!result.valid) process.exitCode = 2;
