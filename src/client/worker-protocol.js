import {WEATHER_VALUES} from './environment-model.js';

export const WORKER_PROTOCOL_VERSION = 1;

const commandFields = {
  reset: ['seed', 'count'],
  load: ['snapshot'],
  configure: ['patch'],
  tick: ['hours'],
  compare: ['snapshot', 'days'],
  compareConfigured: ['snapshot', 'days', 'referenceConfig', 'scenarioConfig'],
  populationCompare: ['snapshot', 'days', 'referenceConfig', 'scenarioConfig'],
  compareLotConfigured: ['manifest'],
  replayComparison: ['manifest'],
  replayConfigured: ['manifest'],
  replayLotConfigured: ['manifest'],
  replayScenarioSet: ['manifest'],
  snapshot: []
};
const responseTypes = new Set(['state', 'comparison', 'population', 'scenarioSet', 'progress', 'error']);
const actions = new Set(['grazing', 'feeding', 'drinking', 'resting']);

export class WorkerProtocolError extends Error {
  constructor(code, message, command) {
    super(message);
    this.name = 'WorkerProtocolError';
    this.code = code;
    if (command) this.command = command;
  }
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function fail(code, message, command) {
  throw new WorkerProtocolError(code, message, command);
}
function requireInteger(value, field, min, max, command) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail('INVALID_COMMAND_PAYLOAD', `${field} must be an integer between ${min} and ${max}.`, command);
  }
}

function validateCommandPayload(message) {
  const command = message.type;
  switch (command) {
    case 'reset':
      if (message.seed != null && !Number.isInteger(message.seed)) fail('INVALID_COMMAND_PAYLOAD', 'reset.seed must be an integer.', command);
      if (message.count != null) requireInteger(message.count, 'reset.count', 1, 10000, command);
      break;
    case 'load':
      if (!isRecord(message.snapshot)) fail('INVALID_COMMAND_PAYLOAD', 'load.snapshot must be an object.', command);
      try {validateState(message.snapshot);} catch (error) {
        fail('INVALID_COMMAND_PAYLOAD', `load.snapshot is invalid: ${error.message}`, command);
      }
      break;
    case 'configure':
      if (!isRecord(message.patch)) fail('INVALID_COMMAND_PAYLOAD', 'configure.patch must be an object.', command);
      break;
    case 'tick':
      if (message.hours != null) requireInteger(message.hours, 'tick.hours', 1, 8760, command);
      break;
    case 'compare':
      if (message.snapshot != null && !isRecord(message.snapshot)) fail('INVALID_COMMAND_PAYLOAD', 'compare.snapshot must be an object.', command);
      if (message.days != null) requireInteger(message.days, 'compare.days', 1, 365, command);
      break;
    case 'compareConfigured':
      if (!isRecord(message.snapshot)) fail('INVALID_COMMAND_PAYLOAD', 'compareConfigured.snapshot must be an object.', command);
      try {validateState(message.snapshot);} catch (error) {
        fail('INVALID_COMMAND_PAYLOAD', `compareConfigured.snapshot is invalid: ${error.message}`, command);
      }
      if (message.days != null) requireInteger(message.days, 'compareConfigured.days', 1, 365, command);
      if (!isValidConfig(message.referenceConfig) || !isValidConfig(message.scenarioConfig)) {
        fail('INVALID_COMMAND_PAYLOAD', 'compareConfigured requires two complete valid configurations.', command);
      }
      break;
    case 'populationCompare':
      if (!isRecord(message.snapshot)) fail('INVALID_COMMAND_PAYLOAD', 'populationCompare.snapshot must be an object.', command);
      try {validateState(message.snapshot,{allowMissingAnimalName:true});} catch (error) {
        fail('INVALID_COMMAND_PAYLOAD', `populationCompare.snapshot is invalid: ${error.message}`, command);
      }
      requireInteger(message.days, 'populationCompare.days', 1, 365, command);
      if (!isValidConfig(message.referenceConfig) || !isValidConfig(message.scenarioConfig)) {
        fail('INVALID_COMMAND_PAYLOAD', 'populationCompare requires two complete valid configurations.', command);
      }
      break;
    case 'replayComparison':
      if (!isRecord(message.manifest)) fail('INVALID_COMMAND_PAYLOAD', 'replayComparison.manifest must be an object.', command);
      break;
    case 'replayConfigured':
      if (!isRecord(message.manifest)) fail('INVALID_COMMAND_PAYLOAD', 'replayConfigured.manifest must be an object.', command);
      break;
    case 'compareLotConfigured':
    case 'replayLotConfigured':
      if (!isRecord(message.manifest)) fail('INVALID_COMMAND_PAYLOAD', `${command}.manifest must be an object.`, command);
      break;
    case 'replayScenarioSet':
      if (!isRecord(message.manifest) || message.manifest.type !== 'riose-scenario-set' || message.manifest.version !== 1) {
        fail('INVALID_COMMAND_PAYLOAD', 'replayScenarioSet.manifest must be a riose-scenario-set/v1 object.', command);
      }
      break;
    case 'snapshot':
      break;
  }
}

export function decodeWorkerCommand(raw) {
  if (!isRecord(raw)) fail('INVALID_COMMAND', 'Worker command must be an object.');
  if (typeof raw.type !== 'string' || !raw.type) fail('INVALID_COMMAND', 'Worker command type must be a non-empty string.');

  const legacy = !owns(raw, 'protocolVersion');
  if (!legacy) {
    if (!Number.isInteger(raw.protocolVersion)) fail('INVALID_PROTOCOL_VERSION', 'Worker protocolVersion must be an integer.', raw.type);
    if (raw.protocolVersion !== WORKER_PROTOCOL_VERSION) {
      fail('UNSUPPORTED_PROTOCOL_VERSION', `Unsupported Worker protocol version: ${raw.protocolVersion}. Supported version: ${WORKER_PROTOCOL_VERSION}.`, raw.type);
    }
  }
  if (!owns(commandFields, raw.type)) fail('UNKNOWN_COMMAND', `Unknown Worker command: ${raw.type}.`, raw.type);

  const command = {protocolVersion: WORKER_PROTOCOL_VERSION, type: raw.type};
  for (const field of commandFields[raw.type]) if (owns(raw, field)) command[field] = raw[field];
  validateCommandPayload(command);
  return {command, legacy};
}

export function createWorkerResponse(type, fields, engineImplementation) {
  return {protocolVersion: WORKER_PROTOCOL_VERSION, type, ...fields, engineImplementation};
}

export function createWorkerError(error, command, engineImplementation) {
  const code = error instanceof WorkerProtocolError ? error.code : 'ENGINE_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  const failedCommand = command ?? (error instanceof WorkerProtocolError ? error.command : undefined);
  const structuredError = {code, message, ...(failedCommand ? {command: failedCommand} : {})};
  return {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    type: 'error',
    error: structuredError,
    message,
    ...(engineImplementation ? {engineImplementation} : {})
  };
}

export function normalizeWorkerResponse(raw) {
  if (!isRecord(raw)) fail('INVALID_RESPONSE', 'Worker response must be an object.');
  const legacy = !owns(raw, 'protocolVersion');
  if (!legacy) {
    if (!Number.isInteger(raw.protocolVersion)) fail('INVALID_PROTOCOL_VERSION', 'Worker response protocolVersion must be an integer.');
    if (raw.protocolVersion !== WORKER_PROTOCOL_VERSION) {
      fail('UNSUPPORTED_PROTOCOL_VERSION', `Unsupported Worker protocol version: ${raw.protocolVersion}. Supported version: ${WORKER_PROTOCOL_VERSION}.`);
    }
  }
  if (!responseTypes.has(raw.type)) fail('INVALID_RESPONSE', `Unknown Worker response type: ${String(raw.type)}.`);

  const response = {...raw, protocolVersion: WORKER_PROTOCOL_VERSION};
  if (raw.type === 'state') validateState(raw.state);
  if (raw.type === 'comparison') validateComparison(raw.data);
  if (raw.type === 'population' && (!isRecord(raw.data) || !isRecord(raw.data.comparison) || !Array.isArray(raw.data.timeline))) {
    fail('INVALID_RESPONSE', 'Population response must include a comparison and timeline.');
  }
  if (raw.type === 'scenarioSet' && (!isRecord(raw.data) || raw.data.type !== 'riose-scenario-results' || raw.data.version !== 1
      || raw.data.validated !== false || !isRecord(raw.data.baseline) || !Array.isArray(raw.data.baseline.timeline)
      || !Array.isArray(raw.data.scenarios) || raw.data.scenarios.length < 2 || raw.data.scenarios.some(scenario => !isRecord(scenario) || !Array.isArray(scenario.rows) || !Array.isArray(scenario.timeline)))) {
    fail('INVALID_RESPONSE', 'scenarioSet response must include validated-false baseline and aligned intervention results.');
  }
  if (raw.type === 'progress') {
    if (!Number.isInteger(raw.day) || !Number.isInteger(raw.days) || raw.day < 0 || raw.day > raw.days) {
      fail('INVALID_RESPONSE', 'Progress response must contain a bounded day and horizon.');
    }
    const hasScenarioProgress = owns(raw, 'scenarioId') || owns(raw, 'scenarioCount') || owns(raw, 'scenarioIndex');
    if (hasScenarioProgress && (typeof raw.scenarioId !== 'string' || !raw.scenarioId
        || !Number.isInteger(raw.scenarioCount) || raw.scenarioCount < 1 || raw.scenarioCount > 9
        || !Number.isInteger(raw.scenarioIndex) || raw.scenarioIndex < 1 || raw.scenarioIndex > raw.scenarioCount)) {
      fail('INVALID_RESPONSE', 'Scenario progress identity must contain a bounded arm ID, index and count.');
    }
  }
  if (raw.type === 'comparison' && owns(raw, 'execution')) {
    const execution = raw.execution;
    if (!isRecord(execution) || !['local-rust','local-js'].includes(execution.backend) || typeof execution.fallbackUsed !== 'boolean'
      || (execution.engineImplementation !== undefined && typeof execution.engineImplementation !== 'string')
      || (execution.backend === 'local-rust' && (typeof execution.engineVersion !== 'string' || typeof execution.buildId !== 'string'))
      || (execution.runId !== undefined && typeof execution.runId !== 'string')
      || (execution.inputSha256 !== undefined && !/^(?:sha256:)?[a-f0-9]{64}$/.test(execution.inputSha256))) {
      fail('INVALID_RESPONSE', 'comparison.execution must identify a valid local executor and fallback state.');
    }
  }
  if (raw.type === 'error') {
    if (legacy) {
      if (typeof raw.message !== 'string' || !raw.message) fail('INVALID_RESPONSE', 'Legacy error.message must be a non-empty string.');
      response.error = {code: 'LEGACY_WORKER_ERROR', message: raw.message};
    } else if (!isRecord(raw.error) || typeof raw.error.code !== 'string' || !raw.error.code || typeof raw.error.message !== 'string' || !raw.error.message) {
      fail('INVALID_RESPONSE', 'error.error must include a code and readable message.');
    }
    response.message = response.error.message;
  }
  if (raw.type !== 'error' && typeof raw.engineImplementation !== 'string') {
    fail('INVALID_RESPONSE', `${raw.type}.engineImplementation must identify the active engine.`);
  }
  return response;
}

function validateState(state,{allowMissingAnimalName=false}={}) {
  if (!isRecord(state)) fail('INVALID_RESPONSE', 'state.state must be an object.');
  if (!Number.isInteger(state.hour) || !Number.isFinite(state.cost) || !Array.isArray(state.animals) || state.animals.length < 1 || state.animals.length > 10000) {
    fail('INVALID_RESPONSE', 'state.state must contain a valid hour, cost and animal list.');
  }
  if (!Array.isArray(state.pastures) || state.pastures.length !== 4 || state.pastures.some(value => !Number.isFinite(value))) {
    fail('INVALID_RESPONSE', 'state.state.pastures must contain four finite stocks.');
  }
  if (owns(state, 'intake') && !isValidStateIntake(state.intake)) {
    fail('INVALID_RESPONSE', 'state.state.intake must contain all four finite intake components.');
  }
  if (!isValidConfig(state.config) || !Array.isArray(state.events)) fail('INVALID_RESPONSE', 'state.state is missing valid configuration or events.');
  const seen = new Set();
  for (const animal of state.animals) {
    if (!isRecord(animal) || !Number.isInteger(animal.id) || animal.id < 1 || animal.id > 0xffffffff || seen.has(animal.id)) {
      fail('INVALID_RESPONSE', 'state.state.animals must contain unique positive integer IDs.');
    }
    seen.add(animal.id);
    if ((!allowMissingAnimalName&&typeof animal.name!=='string')||(animal.name!==undefined&&typeof animal.name!=='string')||!actions.has(animal.action)||!Number.isInteger(animal.patch)||animal.patch<0||animal.patch>3
      || ![animal.weight, animal.initialWeight, animal.energy, animal.thirst].every(Number.isFinite)) {
      fail('INVALID_RESPONSE', 'state.state.animals must contain finite scientific values.');
    }
    if (animal.history !== undefined) validateHistory(animal.history, 'state.state.animals.history');
  }
  validateEvents(state.events, 'state.state.events');
}

function isValidConfig(config) {
  return isRecord(config)
    && ['pasture', 'balanced', 'concentrate'].includes(config.diet)
    && ['pasture', 'barn'].includes(config.housing)
    && WEATHER_VALUES.includes(config.weather)
    && Number.isFinite(config.supplement)
    && config.supplement >= 0
    && config.supplement <= 4;
}

function validateEvents(events, field) {
  for (const event of events) {
    if (!isRecord(event) || !Number.isInteger(event.hour) || typeof event.text !== 'string') {
      fail('INVALID_RESPONSE', `${field} contains a malformed event.`);
    }
  }
}

function validateHistory(history, field) {
  if (!Array.isArray(history)) fail('INVALID_RESPONSE', `${field} must be an array.`);
  for (const record of history) {
    if (!isRecord(record) || !Number.isInteger(record.hour) || !actions.has(record.action) || typeof record.reason !== 'string'
      || !isRecord(record.observed) || !Number.isFinite(record.observed.thirst)
      || !['pasture', 'barn'].includes(record.observed.housing)) {
      fail('INVALID_RESPONSE', `${field} contains a malformed activity record.`);
    }
  }
}

function validateComparison(data) {
  const configured = isRecord(data) && (Object.hasOwn(data, 'referenceConfig') || Object.hasOwn(data, 'reference'));
  const referenceConfig = configured ? data.referenceConfig : data?.baselineConfig;
  const referenceMetrics = configured ? data.reference : data?.baseline;
  if (!isRecord(data) || !Number.isInteger(data.days) || data.days < 1 || data.days > 365
    || !Number.isFinite(data.startWeight) || !isValidConfig(data.initialConfig)
    || !Number.isInteger(data.herdSize) || data.herdSize < 1
    || !Array.isArray(data.initialPastureByPaddock) || data.initialPastureByPaddock.length !== 4
    || data.initialPastureByPaddock.some(value => !Number.isFinite(value))
    || !['housing', 'diet', 'weather', 'supplement'].includes(data.comparisonFactor)
    || !isValidConfig(referenceConfig) || !isValidConfig(data.scenarioConfig)
    || !Array.isArray(data.rows) || data.rows.length !== data.days + 1
    || !isValidMetrics(referenceMetrics) || !isValidMetrics(data.scenario)
    || !isRecord(data.assumptions) || data.validated !== false) {
    fail('INVALID_RESPONSE', 'comparison.data does not match the current comparison response shape.');
  }
  for (let index = 0; index < data.rows.length; index++) {
    const row = data.rows[index];
    const prefix = configured ? 'reference' : 'baseline';
    if (!isRecord(row) || row.day !== index
      || ![row[`${prefix}Weight`], row.scenarioWeight, row[`${prefix}Cost`], row.scenarioCost,
        row[`${prefix}ConsumptionKgDM`], row.scenarioConsumptionKgDM, row[`${prefix}PastureKgDM`], row.scenarioPastureKgDM].every(Number.isFinite)
      || !isValidIntake(row[`${prefix}IntakeBySourceKgDM`]) || !isValidIntake(row.scenarioIntakeBySourceKgDM)
      || !isFinitePaddocks(row[`${prefix}PastureByPaddock`]) || !isFinitePaddocks(row.scenarioPastureByPaddock)) {
      fail('INVALID_RESPONSE', `comparison.data.rows[${index}] is malformed.`);
    }
  }
}

function isFinitePaddocks(values) {
  return Array.isArray(values) && values.length === 4 && values.every(Number.isFinite);
}

function isValidStateIntake(intake) {
  return isRecord(intake) && ['pastureKgDM', 'barnBaseKgDM', 'supplementKgDM', 'dietExtraKgDM']
    .every(key => owns(intake, key) && typeof intake[key] === 'number' && Number.isFinite(intake[key]));
}

function isValidIntake(intake) {
  return isRecord(intake) && ['pastureKgDM', 'barnBaseKgDM', 'supplementKgDM', 'dietExtraKgDM', 'totalKgDM'].every(key => Number.isFinite(intake[key]));
}

function isValidMetrics(metrics) {
  return isRecord(metrics) && [metrics.weight, metrics.gain, metrics.cost, metrics.pasture, metrics.stress].every(Number.isFinite)
    && isFinitePaddocks(metrics.pastureByPaddock) && isValidIntake(metrics.intake);
}
