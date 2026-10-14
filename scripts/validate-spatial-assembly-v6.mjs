import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {assembleFarmMacrostructure, createFarmAssemblySpecification} from '../graphics-poc/assembly-specs-v6.js';

const engine = process.argv.find(value => value.startsWith('--engine='))?.split('=')[1] ?? 'javascript';
if (!['javascript', 'cpsat'].includes(engine)) throw new TypeError('Use --engine=javascript|cpsat.');
const python = process.env.RIOSE_SPATIAL_PYTHON || 'python3';
const solverVersionProbe = engine === 'cpsat' ? spawnSync(python, ['-c', 'import ortools; print(ortools.__version__)'], {encoding: 'utf8'}) : null;
const solverRuntime = engine === 'cpsat' ? {python, ortoolsVersion: solverVersionProbe.status === 0 ? solverVersionProbe.stdout.trim() : null,
  availabilityError: solverVersionProbe.status === 0 ? null : (solverVersionProbe.stderr || 'OR-Tools unavailable').trim()} : {engine: 'javascript-bounded-search'};
const temporaryDirectory = engine === 'cpsat' ? await mkdtemp(path.join(os.tmpdir(), 'riose-v6-validation-')) : null;
const solverInput = new Map();
const solverBatches = new Map();

function createSolverInput(system) {
  const specification = createFarmAssemblySpecification({system});
  return {...specification, terrain: {columns: specification.terrain.columns, rows: specification.terrain.rows,
    slopeGrid: Array.from({length: specification.terrain.rows}, (_, y) => Array.from({length: specification.terrain.columns}, (_, x) => specification.terrain.slopeAt(x + 0.5, y + 0.5)))}};
}

async function solveSystemSeed(system, seed) {
  if (engine === 'javascript') return assembleFarmMacrostructure({system, seed});
  let input = solverInput.get(system);
  if (!input) {
    input = path.join(temporaryDirectory, `${system}-spec.json`);
    await writeFile(input, `${JSON.stringify(createSolverInput(system))}\n`);
    solverInput.set(system, input);
  }
  if (!solverBatches.has(system)) {
    const batchOutput = path.join(temporaryDirectory, `${system}-batch.json`);
    const batchPromise = (async () => {
      const run = spawnSync(process.execPath, ['scripts/spatial/solve-macro.mjs', `--input=${input}`, '--engine=cpsat', '--seeds=1:100', `--output=${batchOutput}`], {
        encoding: 'utf8', env: {...process.env, RIOSE_SPATIAL_PYTHON: python},
      });
      let batch;
      try { batch = JSON.parse(await readFile(batchOutput, 'utf8')); }
      catch { throw new Error(`CP-SAT batch ${system}/1:100 failed (${run.status}) to return results: ${run.stderr || run.stdout}`); }
      if (!Array.isArray(batch.results) || batch.results.length !== 100) {
        throw new Error(`CP-SAT batch ${system}/1:100 returned ${batch.results?.length ?? 0} results; expected 100 (exit ${run.status}).`);
      }
      return new Map(batch.results.map((result, index) => [result.seed ?? index + 1, result]));
    })();
    solverBatches.set(system, batchPromise);
  }
  const batchResults = await solverBatches.get(system);
  const solverResult = batchResults.get(seed);
  if (!solverResult) throw new Error(`CP-SAT batch ${system} omitted seed ${seed}.`);
  return assembleFarmMacrostructure({system, seed, solverResult});
}

function polygonOverlap(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], axis = {x: q.y - p.y, y: p.x - q.x};
    const project = shape => shape.map(point => point.x * axis.x + point.y * axis.y);
    const pa = project(a), pb = project(b);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const violations = [];
const seedOutcomes = [];
const summary = {engine, seedCountPerSystem: 100, systems: {}, constraints: {bounds: 0, pairCollisions: 0, roadConnectivity: 0, topologicalRoadGraphs: 0, roadEdges: 0, roadModules: 0, routeBlockedCells: 0, closedFenceEdges: 0, gates: 0, paddockLoops: 0, paddockGates: 0, socketConnections: 0, sharedFenceSegments: 0, sharedBoundaryLayouts: 0, corralPrefabs: 0, vegetationClearance: 0, poissonSpacing: 0}};
for (const system of ['beef', 'dairy']) {
  let validCount = 0, rejectedCount = 0, layoutSignatures = new Set(), expansionTotal = 0, vegetationTotal = 0, searchBudgetReached = 0, optimalCount = 0, restrictedOptimumCount = 0, timeLimitCount = 0;
  const outcomes = [];
  for (let seed = 1; seed <= 100; seed++) {
    let solution;
    try {
      solution = await solveSystemSeed(system, seed);
    } catch (error) {
      const outcome = {system, seed, status: 'rejected', stage: 'solver-execution', reason: error.message, solverStatus: 'ERROR'};
      outcomes.push(outcome); seedOutcomes.push(outcome); rejectedCount++;
      violations.push({system, seed, constraint: 'solver-execution', reason: error.message});
      continue;
    }
    if (!solution.valid) {
      const outcome = {system, seed, status: 'rejected', stage: 'solver-or-assembly', reason: solution.reason ?? 'invalid-solver-result',
        solverStatus: solution.solverStatus ?? solution.optimality ?? 'UNKNOWN', candidateDomainComplete: solution.candidateDomainComplete ?? null};
      outcomes.push(outcome); seedOutcomes.push(outcome); rejectedCount++;
      violations.push({system, seed, constraint: 'solver-rejected', reason: solution.reason, solverStatus: outcome.solverStatus, details: solution.violations ?? solution.hardViolations ?? []});
      continue;
    }
    const violationsBeforeSeed = violations.length;
    expansionTotal += solution.expansions ?? 0;
    if (engine === 'javascript' && !solution.searchComplete) searchBudgetReached++;
    if (solution.solverStatus === 'OPTIMAL' && solution.candidateDomainComplete === true) optimalCount++;
    else if (solution.solverStatus === 'OPTIMAL') restrictedOptimumCount++;
    if (solution.optimality === 'feasible-time-limit') timeLimitCount++;
    const terrain = solution.specification.terrain;
    const layoutSignature = solution.placements.map(item => `${Math.floor(item.position.x)},${Math.floor(item.position.y)}`).join(';');
    for (const item of solution.placements) {
      const xs = item.worldPolygon.map(point => point.x), ys = item.worldPolygon.map(point => point.y);
      if (Math.min(...xs) < 0 || Math.min(...ys) < 0 || Math.max(...xs) > terrain.columns || Math.max(...ys) > terrain.rows) violations.push({system, seed, constraint: 'bounds', objectId: item.id});
      summary.constraints.bounds++;
    }
    for (let i = 0; i < solution.placements.length; i++) for (let j = i + 1; j < solution.placements.length; j++) {
      const a = solution.placements[i], b = solution.placements[j];
      if (a.blocking !== false && b.blocking !== false && polygonOverlap(a.worldPolygon, b.worldPolygon)) violations.push({system, seed, constraint: 'collision', pair: [a.id, b.id]});
      summary.constraints.pairCollisions++;
    }
    const occupied = solution.placements.filter(item => item.blocking !== false).flatMap(item => {
      const xs = item.worldPolygon.map(point => point.x), ys = item.worldPolygon.map(point => point.y), cells = [];
      for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) if (pointInPolygon({x: x + 0.5, y: y + 0.5}, item.worldPolygon)) cells.push({x, y});
      return cells;
    });
    for (const path of solution.roadPaths) {
      if (!path.cells?.length || path.cells.some((cell, index) => index > 0 && Math.abs(cell.x - path.cells[index - 1].x) + Math.abs(cell.y - path.cells[index - 1].y) !== 1)) violations.push({system, seed, constraint: 'road-connectivity', path: path.from + '->' + path.to});
      if (path.cells.some(cell => occupied.some(blocked => cell.x === blocked.x && cell.y === blocked.y))) violations.push({system, seed, constraint: 'route-blocked-cell', path: path.from + '->' + path.to});
      summary.constraints.roadConnectivity++;
    }
    if (!solution.roadNetwork?.valid || solution.roadNetwork.connectedComponentCount !== 1
      || solution.roadNetwork.routeConnectivity?.length !== solution.roadPaths.length
      || solution.roadNetwork.edges?.some(edge => !edge.connected)
      || solution.roadNetwork.modules?.some(module => module.connections?.some(connection => !connection.connected))) {
      violations.push({system, seed, constraint: 'road-topology', details: solution.roadNetwork?.violations ?? []});
    } else {
      summary.constraints.topologicalRoadGraphs++;
      summary.constraints.roadEdges += solution.roadNetwork.edges.length;
      summary.constraints.roadModules += solution.roadNetwork.modules.length;
    }
    const trees = solution.vegetation ?? [];
    vegetationTotal += trees.length;
    for (const tree of trees) {
      if (tree.position.x < 0 || tree.position.y < 0 || tree.position.x >= terrain.columns || tree.position.y >= terrain.rows) violations.push({system, seed, constraint: 'vegetation-bounds', objectId: tree.id});
      if (solution.placements.some(item => {
        const xs = item.worldPolygon.map(point => point.x), ys = item.worldPolygon.map(point => point.y);
        return tree.position.x >= Math.min(...xs) - 2.2 && tree.position.x <= Math.max(...xs) + 2.2 && tree.position.y >= Math.min(...ys) - 2.2 && tree.position.y <= Math.max(...ys) + 2.2;
      })) violations.push({system, seed, constraint: 'vegetation-clearance', objectId: tree.id});
      if (solution.roadPaths.some(path => path.cells.some(cell => tree.position.x >= cell.x - 1.4 && tree.position.x <= cell.x + 2.4 && tree.position.y >= cell.y - 1.4 && tree.position.y <= cell.y + 2.4))) violations.push({system, seed, constraint: 'vegetation-route-clearance', objectId: tree.id});
      summary.constraints.vegetationClearance++;
    }
    for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) {
      if (Math.hypot(trees[i].position.x - trees[j].position.x, trees[i].position.y - trees[j].position.y) < 3.5) violations.push({system, seed, constraint: 'poisson-spacing', pair: [trees[i].id, trees[j].id]});
      summary.constraints.poissonSpacing++;
    }
    if (solution.fence.length < 4 || solution.fence.some(edge => !edge.connected)) violations.push({system, seed, constraint: 'fence-closure'});
    else summary.constraints.closedFenceEdges += solution.fence.length;
    if (solution.fence.filter(edge => edge.piece === 'gate').length !== 1) violations.push({system, seed, constraint: 'gate-count'});
    else summary.constraints.gates++;
    if (!solution.fenceNetwork?.valid || new Set(solution.fenceNetwork?.segments.map(segment => segment.networkSegmentId)).size !== solution.fenceNetwork?.segments.length) {
      violations.push({system, seed, constraint: 'fence-network-topology'});
    } else {
      summary.constraints.sharedFenceSegments += solution.fenceNetwork.sharedSegments.length;
      if (solution.fenceNetwork.sharedSegments.length > 0) summary.constraints.sharedBoundaryLayouts++;
      else violations.push({system, seed, constraint: 'paddock-shared-edge-missing'});
      if (solution.fenceNetwork.sharedSegments.some(segment => new Set(segment.owners).size < 2)) violations.push({system, seed, constraint: 'shared-edge-owner-count'});
    }
    if (system === 'beef' && (!solution.corralPrefab?.valid || solution.corralPrefab.boundary.gateCount !== 1 || solution.corralPrefab.geometryStatus !== 'composite-source-review-required')) {
      violations.push({system, seed, constraint: 'modular-corral-prefab'});
    } else if (solution.corralPrefab) summary.constraints.corralPrefabs++;
    if (!solution.paddocks || solution.paddocks.length < 2) violations.push({system, seed, constraint: 'paddock-count'});
    for (const paddock of solution.paddocks ?? []) {
      if (!paddock.fence.closed || paddock.fence.segments.some(segment => !segment.connected)) violations.push({system, seed, constraint: 'paddock-fence-closure', zoneId: paddock.zoneId});
      else summary.constraints.paddockLoops++;
      if (paddock.fence.gateCount !== 1) violations.push({system, seed, constraint: 'paddock-gate-count', zoneId: paddock.zoneId});
      else summary.constraints.paddockGates++;
      for (const connection of paddock.connections ?? []) {
        if (!connection.connected) violations.push({system, seed, constraint: 'paddock-socket-connection', zoneId: paddock.zoneId});
        else summary.constraints.socketConnections++;
      }
      if (!paddock.accessPath?.length || paddock.accessPath.some((cell, index) => index > 0 && Math.abs(cell.x - paddock.accessPath[index - 1].x) + Math.abs(cell.y - paddock.accessPath[index - 1].y) !== 1)) {
        violations.push({system, seed, constraint: 'paddock-access-path', zoneId: paddock.zoneId});
      }
    }
    const newViolations = violations.slice(violationsBeforeSeed).filter(item => item.system === system && item.seed === seed);
    const outcome = {system, seed, status: newViolations.length ? 'rejected' : 'accepted', stage: newViolations.length ? 'hard-constraint-validation' : 'complete',
      solverStatus: solution.solverStatus ?? solution.optimality ?? 'FEASIBLE', candidateDomainComplete: solution.candidateDomainComplete ?? null,
      candidateDomainStats: solution.candidateDomainStats ?? null, hardConstraintsPassed: solution.hardConstraintsPassed ?? null,
      hardViolationCount: newViolations.length};
    outcomes.push(outcome); seedOutcomes.push(outcome);
    if (newViolations.length) rejectedCount++;
    else { validCount++; layoutSignatures.add(layoutSignature); }
  }
  summary.systems[system] = {attemptedCount: outcomes.length, acceptedCount: validCount, rejectedCount, validCount, statusCounts: {
      accepted: outcomes.filter(item => item.status === 'accepted').length,
      rejected: outcomes.filter(item => item.status === 'rejected').length,
    }, distinctMacroLayouts: layoutSignatures.size,
    ...(engine === 'javascript' ? {averageSearchExpansions: Math.round(expansionTotal / Math.max(1, validCount)), searchBudgetReached} : {optimalCount, restrictedOptimumCount, timeLimitCount}),
    averageVegetationCount: Number((vegetationTotal / Math.max(1, validCount)).toFixed(1))};
}
summary.totalLayouts = Object.values(summary.systems).reduce((sum, item) => sum + item.validCount, 0);
summary.violationCount = violations.length;
summary.solverRuntime = solverRuntime;
summary.hardViolations = violations.map(item => ({severity: 'hard', ...item}));
summary.hardViolationCountsByConstraint = Object.fromEntries([...new Set(violations.map(item => item.constraint))].sort().map(constraint =>
  [constraint, violations.filter(item => item.constraint === constraint).length]));
summary.seedOutcomes = seedOutcomes;
summary.statusAccounting = {attempted: seedOutcomes.length, accepted: seedOutcomes.filter(item => item.status === 'accepted').length,
  rejected: seedOutcomes.filter(item => item.status === 'rejected').length, expected: 200,
  complete: seedOutcomes.length === 200 && Object.values(summary.systems).every(item => item.attemptedCount === 100)};
summary.optimizationGuarantee = engine === 'cpsat' ? 'CP-SAT OPTIMAL proves the integer-scaled objective sum(round(candidate_score * 10000)) over the complete generated discrete candidate domain only when candidateDomainComplete is true; otherwise the proof is limited to retained candidates. It does not prove optimality for the unrounded floating-point score. Downstream connectivity and fence constraints are independently validated.'
  : 'feasible layouts are best-found within the bounded search; optimality is not claimed when searchBudgetReached is non-zero';
summary.violations = violations;
summary.geometryReview = 'All sprite-derived physical footprints remain review-required; this report validates composition against their measured candidate geometry, not art approval.';
await mkdir('artifacts/graphics/spatial-assembly-v6', {recursive: true});
await writeFile('artifacts/graphics/spatial-assembly-v6/seed-validation-100.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({systems: summary.systems, totalLayouts: summary.totalLayouts, violationCount: summary.violationCount, report: 'artifacts/graphics/spatial-assembly-v6/seed-validation-100.json'}, null, 2));
if (temporaryDirectory) await rm(temporaryDirectory, {recursive: true, force: true});
if (violations.length || summary.totalLayouts !== 200 || !summary.statusAccounting.complete || summary.statusAccounting.rejected !== 0) process.exitCode = 1;
