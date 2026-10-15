import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../schemas/scenario.schema.json' with {type: 'json'};
import {validateReproducibilityManifest} from '../src/client/scenario-contract.js';
import {canonicalJson, sha256Digest} from './batch-manifest.js';

export const HARNESS_FORMAT = 'riose-scenario-harness';
const validateHarness = new Ajv2020({allErrors: true, strict: true}).compile(schema);

export function safeScenarioReference(reference) {
  return typeof reference === 'string' && !!reference && !reference.startsWith('/') &&
    !/[\\:?#]/.test(reference) && reference.split('/').every(part => part && part !== '.' && part !== '..');
}

function validateNativeRequest(scenario, version) {
  if (version !== 1 || scenario.version !== 1) throw new Error(`Unsupported native scenario version: ${String(version)}`);
  const fields = scenario.type === 'baseline'
    ? ['type', 'version', 'seed', 'animalCount', 'configuration', 'hours']
    : scenario.type === 'housing-comparison'
      ? ['type', 'version', 'snapshot', 'days'] : null;
  if (!fields || Object.keys(scenario).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(scenario, key))) {
    throw new Error('Native scenario request fields do not match its declared type');
  }
  const object = (value, required, optional = []) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
      throw new Error('Native scenario object does not match the riose-run request contract');
    }
    return value;
  };
  const config = value => {
    object(value, [], ['diet', 'housing', 'weather', 'supplement']);
    for (const [key, choices] of Object.entries({diet: ['pasture', 'balanced', 'concentrate'], housing: ['pasture', 'barn'], weather: ['normal', 'hot', 'rain']})) {
      if (Object.hasOwn(value, key) && !choices.includes(value[key])) throw new Error(`Native configuration ${key} is unsupported`);
    }
    if (Object.hasOwn(value, 'supplement') && (typeof value.supplement !== 'number' || !Number.isFinite(value.supplement) || value.supplement < 0 || value.supplement > 4)) throw new Error('Native configuration supplement is invalid');
  };
  const integer = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  const seed = scenario.type === 'baseline' ? scenario.seed
    : Number.isInteger(scenario.snapshot?.initialSeed) ? scenario.snapshot.initialSeed : scenario.snapshot?.seed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Native scenario seed is invalid');
  if (scenario.type === 'baseline') {
    if (!integer(scenario.seed, 0xffffffff) || !integer(scenario.animalCount) || scenario.animalCount < 1 || scenario.animalCount > 10_000 || !integer(scenario.hours) || scenario.hours < 1 || scenario.hours > 8_760) throw new Error('Native baseline scenario inputs are invalid');
    config(object(scenario.configuration, [], ['diet', 'housing', 'weather', 'supplement']));
  } else {
    if (!integer(scenario.days) || scenario.days < 1 || scenario.days > 365) throw new Error('Native housing comparison inputs are invalid');
    const snapshot = object(scenario.snapshot, ['hour', 'animals', 'pastures', 'intake', 'config', 'cost', 'events', 'seed'], ['initialSeed', 'locomotionSeed']);
    if (!integer(snapshot.hour) || !integer(snapshot.seed, 0xffffffff) || (Object.hasOwn(snapshot, 'initialSeed') && !integer(snapshot.initialSeed, 0xffffffff)) || (Object.hasOwn(snapshot, 'locomotionSeed') && !integer(snapshot.locomotionSeed, 0xffffffff))) throw new Error('Native snapshot counters or seeds are invalid');
    if (!Array.isArray(snapshot.animals) || !Array.isArray(snapshot.pastures) || !snapshot.pastures.every(value => typeof value === 'number' && Number.isFinite(value)) || !Array.isArray(snapshot.events)) throw new Error('Native snapshot collections are invalid');
    object(snapshot.intake, ['pastureKgDM', 'barnBaseKgDM', 'supplementKgDM', 'dietExtraKgDM']);
    for (const value of Object.values(snapshot.intake)) if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Native snapshot intake is invalid');
    config(object(snapshot.config, [], ['diet', 'housing', 'weather', 'supplement']));
    if (typeof snapshot.cost !== 'number' || !Number.isFinite(snapshot.cost)) throw new Error('Native snapshot cost is invalid');
    const enums = {action: ['grazing', 'feeding', 'drinking', 'resting'], reason: ['pasture_housing', 'barn_housing', 'thirst_threshold', 'rest_window']};
    for (const [index, animalValue] of snapshot.animals.entries()) {
      const animal = object(animalValue, ['id', 'name', 'weight', 'initialWeight', 'energy', 'thirst', 'action', 'patch'], ['history', 'x', 'y', 'targetX', 'targetY']);
      if (!integer(animal.id, 0xffffffff) || typeof animal.name !== 'string' || !integer(animal.patch, 0xffffffff) || !['weight', 'initialWeight', 'energy', 'thirst'].every(key => typeof animal[key] === 'number' && Number.isFinite(animal[key])) || !['x', 'y', 'targetX', 'targetY'].every(key => animal[key] === undefined || (typeof animal[key] === 'number' && Number.isFinite(animal[key]))) || !enums.action.includes(animal.action)) throw new Error(`Native snapshot animal ${index} is invalid`);
      if (animal.history !== undefined) {
        if (!Array.isArray(animal.history)) throw new Error(`Native snapshot animal ${index} history is invalid`);
        for (const recordValue of animal.history) {
          const record = object(recordValue, ['hour', 'action', 'reason', 'observed']);
          const observed = object(record.observed, ['hour', 'thirst', 'housing']);
          if (!integer(record.hour) || !enums.action.includes(record.action) || !enums.reason.includes(record.reason) || !integer(observed.hour, 255) || typeof observed.thirst !== 'number' || !Number.isFinite(observed.thirst) || !['pasture', 'barn'].includes(observed.housing)) throw new Error('Native snapshot activity history is invalid');
        }
      }
    }
    for (const eventValue of snapshot.events) {
      const event = object(eventValue, ['hour', 'text'], ['animalId']);
      if (!integer(event.hour) || typeof event.text !== 'string' || (event.animalId !== undefined && !integer(event.animalId, 0xffffffff))) throw new Error('Native snapshot event is invalid');
    }
  }
  return seed;
}

/** Explicit family/version dispatch; validate first, then hash semantic JSON. */
export function validateScenarioIdentity({scenarioFormat, scenarioVersion, scenarioId, scenarioRef, seed, scenario} = {}) {
  if (!safeScenarioReference(scenarioRef)) throw new Error('Scenario reference must be a safe relative path');
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) throw new Error('Scenario must be an object');
  let validatedSeed;
  switch (scenarioFormat) {
    case 'agroville-comparison':
      if (scenario.version !== scenarioVersion) throw new Error('Comparison scenario version mismatch');
      validateReproducibilityManifest(scenario);
      if (scenarioVersion === 2 && (typeof scenarioId !== 'string' || !scenarioId.trim() || scenario.scenario_id !== scenarioId)) throw new Error('Comparison scenario ID mismatch');
      if (scenarioVersion === 1 && scenarioId !== null) throw new Error('Comparison v1 has no scenario ID; use null and bind its reference and digest');
      validatedSeed = scenarioVersion === 1 ? scenario.seed : (Number.isInteger(scenario.baseline?.initialSeed) ? scenario.baseline.initialSeed : scenario.baseline?.seed);
      break;
    case HARNESS_FORMAT:
      if (scenarioVersion !== 1 || !validateHarness(scenario)) throw new Error('Invalid or unsupported scenario harness contract');
      if (typeof scenarioId !== 'string' || !scenarioId.trim() || scenario.scenarioId !== scenarioId) throw new Error('Scenario harness ID mismatch');
      validatedSeed = scenario.engine.seed;
      break;
    case 'baseline':
    case 'housing-comparison':
      if (scenario.type !== scenarioFormat) throw new Error('Native scenario format mismatch');
      if (scenarioId !== null) throw new Error('Native scenario request has no scenario ID; use null and bind its reference and digest');
      validatedSeed = validateNativeRequest(scenario, scenarioVersion);
      break;
    default: throw new Error(`Unsupported scenario format: ${String(scenarioFormat)}`);
  }
  if (validatedSeed !== undefined && seed !== validatedSeed) throw new Error('Batch seed does not match validated scenario seed');
  if (validatedSeed === undefined && seed !== null) throw new Error('Batch seed must be null when format has no seed');
  return {scenarioFormat, scenarioVersion, scenarioId, scenarioRef, seed, scenarioDigest: sha256Digest(canonicalJson(scenario))};
}
