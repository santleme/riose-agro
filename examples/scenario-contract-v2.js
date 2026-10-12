import assert from 'node:assert/strict';
import {FarmEngine} from '../engine.js';
import {createScenarioContract, replayScenarioContract, validateScenarioContract} from '../scenario-contract.js';

const engine = new FarmEngine(2741, 5);
engine.configure({diet: 'balanced', supplement: 1.5, weather: 'rain'});
engine.tick(48);

const contract = createScenarioContract(engine.snapshot(), 17, {scenarioId: 'example-rainy-herd-2741'});
const serialized = JSON.stringify(contract);
const imported = JSON.parse(serialized);
assert.equal(validateScenarioContract(imported), true);

const firstRun = replayScenarioContract(imported);
const secondRun = replayScenarioContract(JSON.parse(serialized));
assert.deepEqual(firstRun, secondRun);

console.log(JSON.stringify({
  scenario_id: imported.scenario_id,
  seed: imported.seed,
  duration: imported.duration,
  herd_size: imported.target_scope.animal_ids.length,
  final_baseline_weight_kg: firstRun.rows.at(-1).baselineWeight,
  final_scenario_weight_kg: firstRun.rows.at(-1).scenarioWeight,
  reproducible: true,
  validated: imported.validated,
}, null, 2));
