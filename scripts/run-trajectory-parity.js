#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FarmEngine} from '../src/client/engine.js';
import {SCENARIO_ENGINE_VERSION} from '../src/client/scenario-contract.js';
import {runScenarioPreset} from '../src/client/scenario-presets.js';
import {canonicalTrajectoryJson, compareTrajectoryCheckpoint} from '../src/client/trajectory-comparator.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDirectory = resolve(root, 'artifacts/parity');
const baselineGoldenPath = resolve(root, 'tests/scenario-goldens/baseline-pasture.json');
const housingGoldenPath = resolve(root, 'tests/scenario-goldens/housing-comparison.json');
const runnerName = `riose-run${process.platform === 'win32' ? '.exe' : ''}`;
const runner = process.env.RIOSE_RUNNER || resolve(root, 'target/release', runnerName);
const baselineCheckpoints = 24;
const housingDays = 30;

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function runNative(request) {
  const input = JSON.stringify(request);
  const wslRunner = runner.startsWith('wsl:');
  const command = wslRunner ? 'wsl.exe' : runner;
  const args = wslRunner
    ? ['-e', runner.slice('wsl:'.length), '--input', '-', '--output', '-']
    : ['--input', '-', '--output', '-'];
  const output = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    windowsHide: true,
  });
  if (output.error) throw new Error(`Could not run riose-run at ${runner}: ${output.error.message}`);
  if (output.status !== 0) throw new Error(`riose-run failed (${output.status}): ${output.stderr.trim()}`);
  const record = JSON.parse(output.stdout);
  if (record.type !== 'riose-native-result' || record.status !== 'success') {
    throw new Error('riose-run returned an unexpected result envelope.');
  }
  return {record, inputBytes: Buffer.from(input)};
}

function hourLabel(elapsedHours, daily) {
  return daily && elapsedHours % 24 === 0
    ? `day-${elapsedHours / 24}`
    : `hour-${elapsedHours}`;
}

function rerunDivergence({scenario, seed, checkpoint, original, rerun, source}) {
  const comparison = compareTrajectoryCheckpoint({
    scenario, seed, checkpoint, previousMatchingCheckpoint: null,
    jsValue: original, rustValue: rerun,
  });
  return comparison.firstDivergence ? {...comparison.firstDivergence, source} : null;
}

function saveTrajectory(name, trajectory) {
  const bytes = gzipSync(Buffer.from(canonicalTrajectoryJson(trajectory), 'utf8'), {mtime: 0});
  const path = resolve(artifactDirectory, `${name}.json.gz`);
  return writeFile(path, bytes).then(() => ({path: `artifacts/parity/${name}.json.gz`, sha256: sha256(bytes)}));
}

async function main() {
  const [baselineGolden, housingGolden] = await Promise.all([
    readFile(baselineGoldenPath, 'utf8').then(JSON.parse),
    readFile(housingGoldenPath, 'utf8').then(JSON.parse),
  ]);
  const jsIdentity = {engineVersion: SCENARIO_ENGINE_VERSION, implementation: 'src/client/engine.js', nodeVersion: process.version};
  const runMetadata = {generatedAt: new Date().toISOString()};
  let firstDivergence = null;
  let firstBaselineDivergence = null;
  let firstHousingDivergence = null;
  let comparedFieldCount = 0;
  let checkpointCount = 0;
  let rustIdentity;
  let firstHousingRowDivergence = null;
  let firstBaselineRerunDivergence = null;
  let firstHousingRerunDivergence = null;
  const housingArmDivergences = {baseline: null, intervention: null};
  let housingRowComparedFieldCount = 0;

  const baselineEngine = new FarmEngine(baselineGolden.seed, baselineGolden.animalCount);
  baselineEngine.configure(baselineGolden.configuration);
  const baselineRerunEngine = new FarmEngine(baselineGolden.seed, baselineGolden.animalCount);
  baselineRerunEngine.configure(baselineGolden.configuration);
  const baselineJs = [];
  const baselineRust = [];
  let previousBaselineMatch = null;
  for (let elapsedHours = 1; elapsedHours <= baselineCheckpoints; elapsedHours += 1) {
    baselineEngine.tick(1);
    const jsValue = {state: baselineEngine.snapshot(), metrics: baselineEngine.metrics()};
    baselineRerunEngine.tick(1);
    const jsRerunValue = {state: baselineRerunEngine.snapshot(), metrics: baselineRerunEngine.metrics()};
    const request = {
      type: 'baseline', version: 1, seed: baselineGolden.seed,
      animalCount: baselineGolden.animalCount,
      configuration: baselineGolden.configuration,
      hours: elapsedHours,
    };
    const {record, inputBytes} = runNative(request);
    const rustResult = record.nativeResult.result;
    const rustValue = {state: rustResult.snapshot, metrics: rustResult.metrics};
    rustIdentity = record.nativeResult.engine;
    const rerunJsDivergence = rerunDivergence({
      scenario: 'baseline-pasture', seed: baselineGolden.seed,
      checkpoint: `rerun-javascript-${elapsedHours}`, original: jsValue,
      rerun: jsRerunValue, source: 'javascript',
    });
    const {record: rerunRecord} = runNative(request);
    const rerunRust = rerunRecord.nativeResult.result;
    const rerunRustDivergence = rerunDivergence({
      scenario: 'baseline-pasture', seed: baselineGolden.seed,
      checkpoint: `rerun-native-${elapsedHours}`, original: rustValue,
      rerun: {state: rerunRust.snapshot, metrics: rerunRust.metrics}, source: 'native',
    });
    firstBaselineRerunDivergence ??= rerunJsDivergence ?? rerunRustDivergence;
    firstDivergence ??= firstBaselineRerunDivergence;
    const checkpoint = hourLabel(elapsedHours, false);
    const result = compareTrajectoryCheckpoint({
      scenario: 'baseline-pasture', seed: baselineGolden.seed, checkpoint,
      previousMatchingCheckpoint: previousBaselineMatch, jsValue, rustValue,
    });
    comparedFieldCount += result.comparedFieldCount;
    checkpointCount += 1;
    if (!result.firstDivergence) previousBaselineMatch = checkpoint;
    else {
      firstBaselineDivergence ??= result.firstDivergence;
      firstDivergence ??= result.firstDivergence;
    }
    baselineJs.push({checkpoint, elapsedHours, value: jsValue});
    baselineRust.push({checkpoint, elapsedHours, inputSha256: record.inputSha256, value: rustValue});
  }

  const jsBaselineFinal = baselineJs.at(-1).value;
  const baselineGoldenCheck = compareTrajectoryCheckpoint({
    scenario: 'baseline-pasture-golden', seed: baselineGolden.seed,
    checkpoint: 'hour-24', previousMatchingCheckpoint: null,
    jsValue: jsBaselineFinal,
    rustValue: {state: baselineGolden.output.state, metrics: baselineGolden.output.metrics},
  });
  if (baselineGoldenCheck.firstDivergence) {
    throw new Error(`JavaScript baseline no longer matches its official golden at ${baselineGoldenCheck.firstDivergence.path}`);
  }

  const housingExecution = runScenarioPreset('housing-comparison');
  const housingInitialSnapshot = housingExecution.snapshot;
  const housingJSEngines = {
    baseline: FarmEngine.from(housingInitialSnapshot),
    intervention: FarmEngine.from(housingInitialSnapshot),
  };
  const housingRerunEngines = {
    baseline: FarmEngine.from(housingInitialSnapshot),
    intervention: FarmEngine.from(housingInitialSnapshot),
  };
  housingJSEngines.baseline.configure({housing: 'pasture'});
  housingJSEngines.intervention.configure({housing: 'barn'});
  housingRerunEngines.baseline.configure({housing: 'pasture'});
  housingRerunEngines.intervention.configure({housing: 'barn'});
  const housingJSTrajectories = {baseline: [], intervention: []};
  const housingRustTrajectories = {baseline: [], intervention: []};
  const previousHousingMatches = {baseline: null, intervention: null};
  const configurations = {
    baseline: {...housingInitialSnapshot.config, housing: 'pasture'},
    intervention: {...housingInitialSnapshot.config, housing: 'barn'},
  };

  for (let elapsedHours = 1; elapsedHours <= housingDays * 24; elapsedHours += 1) {
    for (const arm of ['baseline', 'intervention']) {
      const jsEngine = housingJSEngines[arm];
      jsEngine.tick(1);
      const jsValue = {state: jsEngine.snapshot(), metrics: jsEngine.metrics()};
      const jsRerunEngine = housingRerunEngines[arm];
      jsRerunEngine.tick(1);
      const jsRerunValue = {state: jsRerunEngine.snapshot(), metrics: jsRerunEngine.metrics()};
      const request = {
        type: 'baseline', version: 1, seed: housingGolden.seed,
        animalCount: housingGolden.animalCount,
        configuration: configurations[arm],
        hours: elapsedHours,
      };
      const {record} = runNative(request);
      const rustResult = record.nativeResult.result;
      const rustValue = {state: rustResult.snapshot, metrics: rustResult.metrics};
      rustIdentity = record.nativeResult.engine;
      const rerunJsDivergence = rerunDivergence({
        scenario: 'housing-comparison', seed: housingGolden.seed,
        checkpoint: `rerun-javascript-${arm}-${elapsedHours}`, original: jsValue,
        rerun: jsRerunValue, source: 'javascript',
      });
      const {record: rerunRecord} = runNative(request);
      const rerunRust = rerunRecord.nativeResult.result;
      const rerunRustDivergence = rerunDivergence({
        scenario: 'housing-comparison', seed: housingGolden.seed,
        checkpoint: `rerun-native-${arm}-${elapsedHours}`, original: rustValue,
        rerun: {state: rerunRust.snapshot, metrics: rerunRust.metrics}, source: 'native',
      });
      firstHousingRerunDivergence ??= rerunJsDivergence ?? rerunRustDivergence;
      firstDivergence ??= firstHousingRerunDivergence;
      const checkpoint = hourLabel(elapsedHours, true);
      const result = compareTrajectoryCheckpoint({
        scenario: 'housing-comparison', seed: housingGolden.seed,
        checkpoint: `${arm}-${checkpoint}`,
        previousMatchingCheckpoint: previousHousingMatches[arm], jsValue, rustValue,
      });
      comparedFieldCount += result.comparedFieldCount;
      checkpointCount += 1;
      if (!result.firstDivergence) previousHousingMatches[arm] = `${arm}-${checkpoint}`;
      else {
        housingArmDivergences[arm] ??= result.firstDivergence;
        firstHousingDivergence ??= result.firstDivergence;
        firstDivergence ??= result.firstDivergence;
      }
      housingJSTrajectories[arm].push({checkpoint, elapsedHours, value: jsValue});
      housingRustTrajectories[arm].push({checkpoint, elapsedHours, inputSha256: record.inputSha256, value: rustValue});
    }
  }

  const housingRequest = {
    type: 'housing-comparison', version: 1,
    snapshot: housingGolden.replayManifest.baseline,
    days: housingDays,
  };
  const {record: housingRecord} = runNative(housingRequest);
  rustIdentity = housingRecord.nativeResult.engine;
  const nativeComparison = housingRecord.nativeResult.result.comparison;
  const jsComparison = housingExecution.result;
  const jsComparisonRerun = runScenarioPreset('housing-comparison').result;
  firstHousingRerunDivergence ??= rerunDivergence({
    scenario: 'housing-comparison', seed: housingGolden.seed,
    checkpoint: 'rerun-javascript-comparison', original: jsComparison,
    rerun: jsComparisonRerun, source: 'javascript',
  });
  const {record: rerunHousingRecord} = runNative(housingRequest);
  firstHousingRerunDivergence ??= rerunDivergence({
    scenario: 'housing-comparison', seed: housingGolden.seed,
    checkpoint: 'rerun-native-comparison', original: nativeComparison,
    rerun: rerunHousingRecord.nativeResult.result.comparison, source: 'native',
  });
  firstDivergence ??= firstHousingRerunDivergence;
  const comparisonSummary = {...jsComparison};
  delete comparisonSummary.rows;
  const nativeSummary = {...nativeComparison};
  delete nativeSummary.rows;
  const summaryResult = compareTrajectoryCheckpoint({
    scenario: 'housing-comparison', seed: housingGolden.seed,
    checkpoint: 'comparison-summary', previousMatchingCheckpoint: 'day-30',
    jsValue: comparisonSummary, rustValue: nativeSummary,
  });
  comparedFieldCount += summaryResult.comparedFieldCount;
  if (summaryResult.firstDivergence) {
    firstHousingDivergence ??= summaryResult.firstDivergence;
    firstDivergence ??= summaryResult.firstDivergence;
  }

  for (let day = 0; day <= housingDays; day += 1) {
    const result = compareTrajectoryCheckpoint({
      scenario: 'housing-comparison', seed: housingGolden.seed,
      checkpoint: `day-${day}`,
      previousMatchingCheckpoint: day === 0 ? null : `day-${day - 1}`,
      jsValue: jsComparison.rows[day], rustValue: nativeComparison.rows[day],
    });
    comparedFieldCount += result.comparedFieldCount;
    housingRowComparedFieldCount += result.comparedFieldCount;
    checkpointCount += 1;
    if (result.firstDivergence) {
      firstHousingRowDivergence ??= result.firstDivergence;
      firstHousingDivergence ??= result.firstDivergence;
      firstDivergence ??= result.firstDivergence;
    }
  }
  const goldenComparison = compareTrajectoryCheckpoint({
    scenario: 'housing-comparison-golden', seed: housingGolden.seed,
    checkpoint: 'all-days', previousMatchingCheckpoint: null,
    jsValue: jsComparison, rustValue: housingGolden.output,
  });
  if (goldenComparison.firstDivergence) {
    throw new Error(`JavaScript housing output no longer matches its official golden at ${goldenComparison.firstDivergence.path}`);
  }

  await mkdir(artifactDirectory, {recursive: true});
  const traceArtifacts = [];
  traceArtifacts.push(await saveTrajectory('baseline-pasture-417-js-trajectory', {
    scenario: 'baseline-pasture', seed: 417, engine: jsIdentity, checkpoints: baselineJs,
  }));
  traceArtifacts.push(await saveTrajectory('baseline-pasture-417-rust-trajectory', {
    scenario: 'baseline-pasture', seed: 417, engine: rustIdentity, checkpoints: baselineRust,
  }));
  for (const arm of ['baseline', 'intervention']) {
    traceArtifacts.push(await saveTrajectory(`housing-comparison-2026-${arm}-js-trajectory`, {
      scenario: 'housing-comparison', arm, seed: 2026, engine: jsIdentity,
      checkpoints: housingJSTrajectories[arm],
    }));
    traceArtifacts.push(await saveTrajectory(`housing-comparison-2026-${arm}-rust-trajectory`, {
      scenario: 'housing-comparison', arm, seed: 2026, engine: rustIdentity,
      checkpoints: housingRustTrajectories[arm],
    }));
  }

  const baselinePass = firstBaselineDivergence === null && firstBaselineRerunDivergence === null;
  const housingPass = firstHousingDivergence === null && firstHousingRerunDivergence === null;
  const baselineDivergence = firstBaselineDivergence ?? firstBaselineRerunDivergence;
  const housingDivergence = firstHousingDivergence ?? firstHousingRerunDivergence;
  const report = {
    format: 'riose-js-rust-trajectory-parity', formatVersion: 1,
    scenario: 'baseline-pasture', seed: 417,
    jsEngine: jsIdentity, rustEngine: rustIdentity,
    buildId: rustIdentity.buildId,
    checkpointCount: baselineCheckpoints,
    comparedFieldCount: baselineJs.reduce((total, item, index) => total + compareTrajectoryCheckpoint({
      scenario: 'baseline-pasture', seed: 417, checkpoint: item.checkpoint,
      jsValue: item.value, rustValue: baselineRust[index].value,
    }).comparedFieldCount, 0),
    parityResult: baselinePass ? 'PASS' : 'FAIL',
    checks: {
      rngParity: baselinePass ? 'PASS' : baselineDivergence.divergenceClass === 'RNG_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      animalOrdering: baselinePass ? 'PASS' : baselineDivergence.divergenceClass === 'ORDER_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      eventOrdering: baselinePass ? 'PASS' : baselineDivergence.divergenceClass === 'EVENT_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      snapshotShape: baselinePass ? 'PASS' : baselineDivergence.divergenceClass === 'SNAPSHOT_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      metricsParity: baselinePass ? 'PASS' : baselineDivergence.divergenceClass === 'NUMERIC_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      toleranceIntroduced: false,
      deterministicRerun: firstBaselineRerunDivergence ? 'FAIL' : 'PASS',
    },
    firstDivergence: baselineDivergence,
    artifactHashes: traceArtifacts.slice(0, 2),
    metadata: runMetadata,
  };
  await writeFile(resolve(artifactDirectory, 'baseline-pasture-417.json'), `${JSON.stringify(report, null, 2)}\n`);

  const housingReport = {
    format: 'riose-js-rust-trajectory-parity', formatVersion: 1,
    scenario: 'housing-comparison', seed: 2026,
    jsEngine: jsIdentity, rustEngine: rustIdentity,
    buildId: rustIdentity.buildId,
    checkpointCount: housingDays * 24 * 2 + housingDays + 2,
    comparedFieldCount: housingJSTrajectories.baseline.reduce((total, item, index) => total +
      compareTrajectoryCheckpoint({scenario: 'housing-comparison', seed: 2026, checkpoint: item.checkpoint,
        jsValue: item.value, rustValue: housingRustTrajectories.baseline[index].value}).comparedFieldCount, 0) +
      housingJSTrajectories.intervention.reduce((total, item, index) => total +
        compareTrajectoryCheckpoint({scenario: 'housing-comparison', seed: 2026, checkpoint: item.checkpoint,
          jsValue: item.value, rustValue: housingRustTrajectories.intervention[index].value}).comparedFieldCount, 0) +
      summaryResult.comparedFieldCount + housingRowComparedFieldCount,
    parityResult: housingPass ? 'PASS' : 'FAIL',
    baselineArmParity: housingArmDivergences.baseline ? 'FAIL' : 'PASS',
    interventionArmParity: housingArmDivergences.intervention ? 'FAIL' : 'PASS',
    checks: {
      rngParity: housingPass ? 'PASS' : housingDivergence.divergenceClass === 'RNG_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      animalOrdering: housingPass ? 'PASS' : housingDivergence.divergenceClass === 'ORDER_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      eventOrdering: housingPass ? 'PASS' : housingDivergence.divergenceClass === 'EVENT_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      snapshotShape: housingPass ? 'PASS' : housingDivergence.divergenceClass === 'SNAPSHOT_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      metricsParity: housingPass ? 'PASS' : housingDivergence.divergenceClass === 'NUMERIC_DIVERGENCE' ? 'FAIL' : 'NOT_COMPLETE',
      toleranceIntroduced: false,
      deterministicRerun: firstHousingRerunDivergence ? 'FAIL' : 'PASS',
    },
    firstDivergence: housingDivergence,
    rowsParity: firstHousingRowDivergence ? 'FAIL' : 'PASS',
    nativeComparisonInputSha256: housingRecord.inputSha256,
    artifactHashes: traceArtifacts.slice(2),
    metadata: runMetadata,
  };
  await writeFile(resolve(artifactDirectory, 'housing-comparison-2026.json'), `${JSON.stringify(housingReport, null, 2)}\n`);

  process.stdout.write(`baseline-pasture seed=417 trajectory=${report.parityResult} checkpoints=${baselineCheckpoints}\n`);
  process.stdout.write(`housing-comparison seed=2026 trajectory=${housingReport.parityResult} hourly-checkpoints=${housingDays * 24 * 2} daily-rows=${housingDays + 1}\n`);
  process.stdout.write(`Parity artifacts: ${dirname(resolve(artifactDirectory, 'baseline-pasture-417.json'))}\n`);
  if (firstDivergence) {
    process.stderr.write(`First divergence: ${JSON.stringify(firstDivergence)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
