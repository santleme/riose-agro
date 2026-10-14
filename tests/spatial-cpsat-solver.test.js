import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = {
  schemaVersion: 'riose-spatial-assembly-v6',
  terrain: {columns: 12, rows: 10},
  structures: [
    {id: 'home', assetId: 'home', collisionPolygon: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}, {x: 0, y: 2}],
      target: {x: 0.3, y: 0.4}, targetWeight: 0.2, variation: 1, priority: 10, zone: {left: 1, right: 11, top: 1, bottom: 9}, candidateLimit: 20,
      access: {offset: {x: 2.2, y: 1}, targets: [{x: 6, y: 5}], maxDistance: 5}},
    {id: 'yard', assetId: 'yard', collisionPolygon: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}, {x: 0, y: 2}],
      target: {x: 0.4, y: 0.4}, targetWeight: 0.2, variation: 1, priority: 1, zone: {left: 1, right: 11, top: 1, bottom: 9}, candidateLimit: 20},
  ],
};

test('bounded JavaScript adapter remains operational without optional OR-Tools', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riose-cpsat-'));
  try {
    const input = path.join(directory, 'spec.json');
    await writeFile(input, JSON.stringify(fixture));
    const run = spawnSync(process.execPath, ['scripts/spatial/solve-macro.mjs', `--input=${input}`, '--engine=javascript', '--seed=42'], {cwd: root, encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.valid, true);
    assert.equal(result.solverEngine, 'javascript-bounded-search');
    assert.equal(result.placements.length, 2);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('CP-SAT honors mandatory bounds and polygon non-overlap', async t => {
  const python = process.env.RIOSE_SPATIAL_PYTHON || 'python3';
  const available = spawnSync(python, ['-c', 'import ortools'], {encoding: 'utf8'}).status === 0;
  if (!available) return t.skip(`OR-Tools is not installed for ${python}; install scripts/spatial/requirements.txt in a venv`);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riose-cpsat-'));
  try {
    const input = path.join(directory, 'spec.json'), output = path.join(directory, 'result.json');
    await writeFile(input, JSON.stringify(fixture));
    const run = spawnSync(process.execPath, ['scripts/spatial/solve-macro.mjs', `--input=${input}`, `--output=${output}`, '--engine=cpsat', '--seed=42'], {cwd: root, encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const result = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(result.valid, true);
    assert.equal(result.solverEngine, 'ortools-cp-sat');
    assert.equal(result.solverStatus, 'OPTIMAL');
    assert.equal(result.candidateDomainComplete, false, 'the output must not claim whole-domain optimality when domains were truncated');
    assert.equal(result.optimality, 'optimal-quantized-within-truncated-candidate-domains');
    assert.deepEqual(result.optimizationProof, {
      status: 'proven-optimal',
      solverStatus: 'OPTIMAL',
      objective: 'sum(round(candidate_score * scoreScale))',
      scoreScale: 10000,
      scope: 'truncated-generated-candidate-domains',
      candidateDomainComplete: false,
      claim: 'OPTIMAL for the integer-scaled objective over retained candidates only; candidate generation truncated the domain',
      unroundedFloatScoreOptimality: false,
    });
    assert.equal(result.scoreScale, 10000);
    assert.ok(Number.isInteger(result.objectiveInteger));
    assert.equal(result.score, result.objectiveInteger / result.scoreScale);
    const [a, b] = result.placements;
    assert.ok(a.worldPolygon.every(point => point.x >= 0 && point.y >= 0 && point.x <= fixture.terrain.columns && point.y <= fixture.terrain.rows));
    assert.ok(b.worldPolygon.every(point => point.x >= 0 && point.y >= 0 && point.x <= fixture.terrain.columns && point.y <= fixture.terrain.rows));
    assert.ok(Math.hypot(a.accessPoint.x - 6, a.accessPoint.y - 5) <= 5);
    const distance = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
    assert.ok(distance >= 2, `placement centers too close: ${distance}`);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('full discrete domains are solved without candidate truncation and batch mode keeps per-seed proofs', async t => {
  const python = process.env.RIOSE_SPATIAL_PYTHON || 'python3';
  if (spawnSync(python, ['-c', 'import ortools'], {encoding: 'utf8'}).status !== 0) return t.skip(`OR-Tools is not installed for ${python}`);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riose-cpsat-full-domain-'));
  try {
    const input = path.join(directory, 'spec.json');
    const completeFixture = structuredClone(fixture);
    for (const item of completeFixture.structures) delete item.candidateLimit;
    await writeFile(input, JSON.stringify(completeFixture));
    const run = spawnSync(process.execPath, ['scripts/spatial/solve-macro.mjs', `--input=${input}`, '--engine=cpsat', '--seeds=41:42'], {cwd: root, encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const batch = JSON.parse(run.stdout);
    assert.equal(batch.valid, true);
    assert.equal(batch.seedCount, 2);
    assert.equal(batch.acceptedCount, 2);
    assert.equal(batch.rejectedCount, 0);
    assert.equal(batch.reusedHardConstraintModel, true);
    const signatures = batch.results.map(result => result.placements.map(item => `${item.id}:${item.position.x},${item.position.y}`).join(';'));
    assert.notEqual(signatures[0], signatures[1], 'seed objectives should still produce spatial variation with a shared constraint model');
    for (const result of batch.results) {
      assert.equal(result.candidateDomainComplete, true);
      assert.equal(result.optimality, 'optimal-quantized-discrete-domain');
      assert.equal(result.optimizationProof.status, 'proven-optimal');
      assert.equal(result.optimizationProof.solverStatus, 'OPTIMAL');
      assert.equal(result.optimizationProof.objective, 'sum(round(candidate_score * scoreScale))');
      assert.equal(result.optimizationProof.scoreScale, 10000);
      assert.equal(result.optimizationProof.scope, 'complete-generated-discrete-domain');
      assert.equal(result.optimizationProof.candidateDomainComplete, true);
      assert.equal(result.optimizationProof.claim,
        'OPTIMAL for the integer-scaled objective over the complete generated discrete candidate domain');
      assert.equal(result.optimizationProof.unroundedFloatScoreOptimality, false);
      assert.equal(result.scoreScale, 10000);
      assert.ok(Number.isInteger(result.objectiveInteger));
      assert.equal(result.score, result.objectiveInteger / result.scoreScale);
      assert.ok(Object.values(result.candidateDomainStats).every(domain => domain.enumerated === domain.retained && domain.complete));
    }
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('CP-SAT rejects an infeasible domain instead of returning a partial layout', async t => {
  const python = process.env.RIOSE_SPATIAL_PYTHON || 'python3';
  if (spawnSync(python, ['-c', 'import ortools'], {encoding: 'utf8'}).status !== 0) return t.skip(`OR-Tools is not installed for ${python}`);
  const impossible = {terrain: {columns: 4, rows: 4}, structures: [{id: 'too-large',
    collisionPolygon: [{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 4}, {x: 0, y: 4}], zone: {left: 1, right: 3, top: 1, bottom: 3}}]};
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riose-cpsat-'));
  try {
    const input = path.join(directory, 'spec.json');
    await writeFile(input, JSON.stringify(impossible));
    const run = spawnSync(process.execPath, ['scripts/spatial/solve-macro.mjs', `--input=${input}`, '--engine=cpsat'], {cwd: root, encoding: 'utf8'});
    assert.equal(run.status, 2);
    const result = JSON.parse(run.stdout);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'invalid-input');
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('CP-SAT placements pass through the full V6 route, fence, paddock and vegetation compiler', async t => {
  const python = process.env.RIOSE_SPATIAL_PYTHON || 'python3';
  const available = spawnSync(python, ['-c', 'import ortools'], {encoding: 'utf8'}).status === 0;
  if (!available) return t.skip(`OR-Tools is not installed for ${python}; install scripts/spatial/requirements.txt in a venv`);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riose-cpsat-scene-'));
  try {
    const output = path.join(directory, 'scene.json');
    const run = spawnSync(process.execPath, ['scripts/spatial/compile-scene-v6.mjs', '--system=beef', '--seed=84018', `--output=${output}`], {cwd: root, encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const scene = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(scene.valid, true);
    assert.equal(scene.solverIntegration.engine, 'ortools-cp-sat');
    assert.equal(scene.solverIntegration.status, 'OPTIMAL');
    assert.equal(scene.placements.length, 5);
    assert.ok(scene.roadPaths.length >= 5);
    assert.ok(scene.paddocks.length >= 2);
    assert.ok(scene.fenceNetwork.valid);
    assert.ok(scene.vegetation.length > 0);
    assert.ok(scene.placements.every(item => item.geometryStatus && item.reviewRequired === true));
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('CP-SAT rejects slopes hidden inside a structure footprint even when its anchor is flat', async t => {
  const python = process.env.RIOSE_SPATIAL_PYTHON || 'python3';
  const available = spawnSync(python, ['-c', 'import ortools'], {encoding: 'utf8'}).status === 0;
  if (!available) return t.skip(`OR-Tools is not installed for ${python}; install scripts/spatial/requirements.txt in a venv`);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riose-cpsat-slope-'));
  try {
    const input = path.join(directory, 'spec.json');
    const slopeGrid = Array.from({length: 10}, () => Array.from({length: 10}, (_, x) => x === 3 ? 0.4 : 0));
    await writeFile(input, JSON.stringify({schemaVersion: 'riose-spatial-assembly-v6', terrain: {columns: 10, rows: 10, slopeGrid}, structures: [
      {id: 'wide-home', collisionPolygon: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}, {x: 0, y: 2}], target: {x: 0.2, y: 0.5},
        maxSlope: 0.12, zone: {left: 1, right: 8, top: 1, bottom: 8}, candidateLimit: 50},
    ]}));
    const run = spawnSync(process.execPath, ['scripts/spatial/solve-macro.mjs', `--input=${input}`, '--engine=cpsat', '--seed=9'], {cwd: root, encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const result = JSON.parse(run.stdout);
    assert.equal(result.valid, true);
    assert.ok(result.placements[0].position.x > 3, `solver selected a footprint that avoids the steep column: ${result.placements[0].position.x}`);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
