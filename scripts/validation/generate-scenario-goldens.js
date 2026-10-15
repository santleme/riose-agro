#!/usr/bin/env node
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FarmEngine, metrics} from '../../src/client/engine.js';
import {SCENARIO_CONTRACT_VERSION, SCENARIO_ENGINE_VERSION, createScenarioContract, replayScenarioContract} from '../../src/client/scenario-contract.js';
import {SCENARIO_PRESET_CATALOG_VERSION, getScenarioPreset, runScenarioPreset} from '../../src/client/scenario-presets.js';
import {executeScenario} from '../experiments/run-scenarios.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const goldenDirectory = resolve(root, 'tests/scenario-goldens');
const baselineScenarioPath = resolve(root, 'tests/scenarios/baseline-pasture.json');
const supportedGoldenIds = ['baseline-pasture', 'housing-comparison'];

function endpointState(engine) {
  const state = engine.snapshot();
  return {
    hour: state.hour,
    seed: state.seed,
    initialSeed: state.initialSeed,
    config: state.config,
    animals: state.animals.map(({id, weight, initialWeight, energy, thirst, action, patch}) => ({
      id, weight, initialWeight, energy, thirst, action, patch,
    })),
    pastures: state.pastures,
    intake: state.intake,
    cost: state.cost,
    metrics: metrics(state),
  };
}

function createParityCursor() {
  return {events: [], histories: new Map()};
}

function appendedRecords(previous, current) {
  const maxOverlap = Math.min(previous.length, current.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (JSON.stringify(previous.slice(-overlap)) === JSON.stringify(current.slice(0, overlap))) {
      return current.slice(overlap);
    }
  }
  return current;
}

function prependedRecords(previous, current) {
  const maxOverlap = Math.min(previous.length, current.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (JSON.stringify(previous.slice(0, overlap)) === JSON.stringify(current.slice(-overlap))) {
      return current.slice(0, current.length - overlap);
    }
  }
  return current;
}

function parityState(engine, cursor) {
  const snapshot = engine.snapshot();
  const eventDelta = prependedRecords(cursor.events, snapshot.events);
  cursor.events = snapshot.events;
  const historyDeltas = {};
  const animals = snapshot.animals.map(animal => {
    const previous = cursor.histories.get(animal.id) ?? [];
    historyDeltas[animal.id] = appendedRecords(previous, animal.history);
    cursor.histories.set(animal.id, animal.history);
    const {history, ...state} = animal;
    return state;
  });
  const {events, ...state} = snapshot;
  return {
    snapshot: {...state, animals},
    metrics: metrics(snapshot),
    eventDelta,
    historyDeltas,
  };
}

function runBaselineTrajectory(input) {
  const engine = new FarmEngine(input.engine.seed, input.engine.animalCount);
  if (input.configuration) engine.configure(input.configuration);
  const cursor = createParityCursor();
  const trajectory = [];
  const days = Math.ceil(input.run.hours / 24);
  for (let day = 1; day <= days; day += 1) {
    engine.tick(Math.min(24, input.run.hours - (day - 1) * 24));
    trajectory.push({day, ...parityState(engine, cursor)});
  }
  return trajectory;
}

function runHousingEndpoints(snapshot, days) {
  const baseline = FarmEngine.from(snapshot);
  const scenario = FarmEngine.from(snapshot);
  baseline.configure({housing: 'pasture'});
  scenario.configure({housing: 'barn'});
  const baselineCursor = createParityCursor();
  const scenarioCursor = createParityCursor();
  const trajectory = [{day: 0, baseline: parityState(baseline, baselineCursor), scenario: parityState(scenario, scenarioCursor)}];
  for (let day = 1; day <= days; day += 1) {
    baseline.tick(24);
    scenario.tick(24);
    trajectory.push({day, baseline: parityState(baseline, baselineCursor), scenario: parityState(scenario, scenarioCursor)});
  }
  return {baseline: endpointState(baseline), scenario: endpointState(scenario), trajectory};
}

export async function generateScenarioGolden(id) {
  if (id === 'baseline-pasture') {
    const input = JSON.parse(await readFile(baselineScenarioPath, 'utf8'));
    const execution = executeScenario(input);
    if (!execution.passed) throw new Error(`Baseline scenario failed: ${execution.errors.join('; ')}`);
    return {
      format: 'riose-js-scenario-golden',
      formatVersion: 1,
      scenarioId: input.scenarioId,
      execution: 'engine-harness',
      engineVersion: SCENARIO_ENGINE_VERSION,
      seed: input.engine.seed,
      animalCount: input.engine.animalCount,
      horizon: {value: input.run.hours, unit: 'hour'},
      configuration: input.configuration,
      output: execution.result,
      trajectory: runBaselineTrajectory(input),
    };
  }

  const preset = getScenarioPreset(id);
  if (preset.status !== 'supported') throw new Error(`Scenario preset is unsupported: ${id}`);
  if (id !== 'housing-comparison' || preset.execution !== 'comparison') {
    throw new Error(`No golden generator is defined for scenario: ${id}`);
  }

  const execution = runScenarioPreset(id);
  const replayManifest = createScenarioContract(execution.snapshot, preset.durationDays, {scenarioId: id});
  const replayed = replayScenarioContract(replayManifest);
  if (JSON.stringify(replayed) !== JSON.stringify(execution.result)) {
    throw new Error(`Scenario replay does not match the preset output: ${id}`);
  }
  const endpoints = runHousingEndpoints(execution.snapshot, preset.durationDays);
  if (JSON.stringify(endpoints.baseline.metrics) !== JSON.stringify(execution.result.baseline) ||
      JSON.stringify(endpoints.scenario.metrics) !== JSON.stringify(execution.result.scenario)) {
    throw new Error(`Scenario endpoint state does not match comparison metrics: ${id}`);
  }

  return {
    format: 'riose-js-scenario-golden',
    formatVersion: 1,
    scenarioId: preset.id,
    scenarioPresetVersion: preset.version,
    scenarioCatalogVersion: SCENARIO_PRESET_CATALOG_VERSION,
    execution: preset.execution,
    engineVersion: SCENARIO_ENGINE_VERSION,
    replayContractVersion: SCENARIO_CONTRACT_VERSION,
    seed: preset.seed,
    animalCount: preset.initialState.animalCount,
    horizon: {value: preset.durationDays, unit: 'day'},
    replayManifest,
    output: execution.result,
    endpoints: {baseline: endpoints.baseline, scenario: endpoints.scenario},
    trajectory: endpoints.trajectory,
  };
}

export function serializeScenarioGolden(golden) {
  return `${JSON.stringify(golden, null, 2)}\n`;
}

export async function generateScenarioGoldenBytes(id) {
  return serializeScenarioGolden(await generateScenarioGolden(id));
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const ids = args.filter(argument => argument !== '--write');
  const requestedIds = ids.length ? ids : supportedGoldenIds;
  if (write) await mkdir(goldenDirectory, {recursive: true});

  for (const id of requestedIds) {
    if (!supportedGoldenIds.includes(id)) {
      await generateScenarioGolden(id);
    }
    const bytes = await generateScenarioGoldenBytes(id);
    if (write) {
      const path = resolve(goldenDirectory, `${id}.json`);
      await writeFile(path, bytes, 'utf8');
      process.stdout.write(`Wrote ${path}\n`);
    } else {
      process.stdout.write(bytes);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
