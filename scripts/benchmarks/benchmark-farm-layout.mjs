import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateFarmLayout} from '../../src/client/scenario-editor/scene-layout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];

export function benchmarkFarmLayouts({prefabs, manifest, repetitions = 15, warmups = 2, seed = 417} = {}) {
  if (!Array.isArray(prefabs) || !manifest) throw new TypeError('Farm layout benchmark requires prefabs and manifest.');
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new TypeError('repetitions must be a positive integer.');
  if (!Number.isInteger(warmups) || warmups < 0) throw new TypeError('warmups must be a non-negative integer.');
  const results = [];
  for (const scenarioType of ['beef', 'dairy']) {
    const input = {scenarioType, seed, prefabs, manifest};
    for (let index = 0; index < warmups; index++) generateFarmLayout(input);
    const samplesMs = [];
    let scene;
    for (let index = 0; index < repetitions; index++) {
      const start = performance.now();
      scene = generateFarmLayout(input);
      samplesMs.push(performance.now() - start);
    }
    results.push({
      scenarioType,
      seed,
      placementCount: scene.placements.length,
      prefabInstanceCount: scene.prefabInstances.length,
      editableObjectCount: scene.placements.length + scene.prefabInstances.length,
      validationDiagnosticCount: scene.generation.validation.length,
      inputFingerprint: scene.generation.inputFingerprint,
      generationTimeMs: {
        median: quantile(samplesMs, .5),
        p95: quantile(samplesMs, .95),
        min: Math.min(...samplesMs),
        max: Math.max(...samplesMs),
        samples: samplesMs,
      },
    });
  }
  return {
    schemaVersion: 1,
    benchmark: 'seeded-farm-layout-generation',
    methodology: {
      seed,
      warmupRunsPerSystem: warmups,
      repetitionsPerSystem: repetitions,
      timed: ['generateFarmLayout including deterministic placement, constraints, and validation'],
      excluded: ['browser rendering', 'asset loading', 'interactive editing'],
    },
    results,
  };
}

async function main() {
  const [prefabDocument, manifest] = await Promise.all([
    readFile(path.join(root, 'public/assets/scenario-editor/prefabs.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'public/assets/manifest.json'), 'utf8').then(JSON.parse),
  ]);
  const report = benchmarkFarmLayouts({prefabs: prefabDocument.prefabs, manifest});
  try {
    report.source = {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
      dirty: Boolean(execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim()),
    };
  } catch {
    report.source = {revision: null, dirty: null};
  }
  report.runtime = {node: process.version, platform: process.platform, architecture: process.arch};
  const output = path.join(root, 'docs/evidence/farm-layout-generation-2026-10.json');
  await mkdir(path.dirname(output), {recursive: true});
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({output, results: report.results.map(({scenarioType, placementCount, prefabInstanceCount, editableObjectCount, generationTimeMs}) => ({scenarioType, placementCount, prefabInstanceCount, editableObjectCount, medianMs: generationTimeMs.median, p95Ms: generationTimeMs.p95}))}, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
