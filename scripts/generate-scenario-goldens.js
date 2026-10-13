#!/usr/bin/env node
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FarmEngine, metrics} from '../src/client/engine.js';
import {SCENARIO_CONTRACT_VERSION, SCENARIO_ENGINE_VERSION, createScenarioContract, replayScenarioContract} from '../src/client/scenario-contract.js';
import {SCENARIO_PRESET_CATALOG_VERSION, getScenarioPreset, runScenarioPreset} from '../src/client/scenario-presets.js';
import {executeScenario} from './run-scenarios.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const goldenDirectory = resolve(root, 'tests/scenario-goldens');
const baselineScenarioPath = resolve(root, 'tests/scenarios/baseline-pasture.json');
const supportedGoldenIds = ['baseline-pasture', 'housing-comparison'];

function endpointState(engine) {
  const state = engine.snapshot();
  return {
    hour: state.hour,
    seed: state.seed,
    initialSeed: state.initialSeed,
    locomotionSeed: state.locomotionSeed,
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

function runHousingEndpoints(snapshot, days) {
  const baseline = FarmEngine.from(snapshot);
  const scenario = FarmEngine.from(snapshot);
  baseline.configure({housing: 'pasture'});
  scenario.configure({housing: 'barn'});
  for (let day = 0; day < days; day += 1) {
    baseline.tick(24);
    scenario.tick(24);
  }
  return {baseline: endpointState(baseline), scenario: endpointState(scenario)};
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
    endpoints,
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
