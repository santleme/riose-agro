import {WEATHER_VALUES} from './environment-model.js';

export const WORKER_PROTOCOL_VERSION = 1;

const commandFields = {
  reset: ['seed', 'count'],
  load: ['snapshot', 'selectedAnimalId'],
  configure: ['patch'],
  select: ['animalId'],
  tick: ['hours'],
  compare: ['snapshot', 'days'],
  compareConfigured: ['snapshot', 'days', 'referenceConfig', 'scenarioConfig'],
  compareLotConfigured: ['manifest'],
  replayComparison: ['manifest'],
  replayConfigured: ['manifest'],
  replayLotConfigured: ['manifest'],
  snapshot: []
};
const responseTypes = new Set(['state', 'view', 'comparison', 'error']);
const actionCodes = {grazing: 0, feeding: 1, drinking: 2, resting: 3};
const actions = new Set(Object.keys(actionCodes));
const valueFields = ['x', 'y', 'weight', 'initialWeight'];

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
      if (message.selectedAnimalId != null) requireInteger(message.selectedAnimalId, 'load.selectedAnimalId', 1, 0xffffffff, command);
      break;
    case 'configure':
      if (!isRecord(message.patch)) fail('INVALID_COMMAND_PAYLOAD', 'configure.patch must be an object.', command);
      break;
    case 'select':
      requireInteger(message.animalId, 'select.animalId', 1, 0xffffffff, command);
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

export function createViewLayout(animalCount) {
  return {
    version: 1,
    animalCount,
    animalIds: {elementType: 'Uint32Array', count: animalCount, stride: 1, byteLength: animalCount * Uint32Array.BYTES_PER_ELEMENT},
    animalValues: {
      elementType: 'Float64Array',
      count: animalCount * valueFields.length,
      stride: valueFields.length,
      byteLength: animalCount * valueFields.length * Float64Array.BYTES_PER_ELEMENT,
      fields: [...valueFields],
      units: ['map-unit', 'map-unit', 'kg', 'kg']
    },
    animalActions: {elementType: 'Uint8Array', count: animalCount, stride: 1, byteLength: animalCount * Uint8Array.BYTES_PER_ELEMENT, codes: {...actionCodes}}
  };
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

function validateViewLayout(message) {
  const ids = message.animalIds;
  const values = message.animalValues;
  const actions = message.animalActions;
  if (!(ids instanceof Uint32Array)) fail('INVALID_RESPONSE', 'view.animalIds must be a Uint32Array.');
  const count = ids.length;
  if (count < 1 || count > 10000) fail('INVALID_RESPONSE', 'view.animalIds length must be between 1 and 10000.');
  if (ids.byteOffset !== 0 || ids.byteLength !== count * Uint32Array.BYTES_PER_ELEMENT || ids.buffer.byteLength !== ids.byteLength) {
    fail('INVALID_RESPONSE', 'view.animalIds must use an exact, densely packed buffer.');
  }
  if (!(values instanceof Float64Array) || values.length !== count * valueFields.length) {
    fail('INVALID_RESPONSE', 'view.animalValues must be a Float64Array with length animalIds.length × 4.');
  }
  if (values.byteOffset !== 0 || values.byteLength !== values.length * Float64Array.BYTES_PER_ELEMENT || values.buffer.byteLength !== values.byteLength) {
    fail('INVALID_RESPONSE', 'view.animalValues must use an exact, densely packed buffer.');
  }
  if (!(actions instanceof Uint8Array) || actions.length !== count) {
    fail('INVALID_RESPONSE', 'view.animalActions must be a Uint8Array with length animalIds.length.');
  }
  if (actions.byteOffset !== 0 || actions.byteLength !== actions.length * Uint8Array.BYTES_PER_ELEMENT || actions.buffer.byteLength !== actions.byteLength) {
    fail('INVALID_RESPONSE', 'view.animalActions must use an exact, densely packed buffer.');
  }

  const expected = createViewLayout(count);
  const layout = message.viewLayout;
  if (!isRecord(layout) || layout.version !== expected.version || layout.animalCount !== count) {
    fail('INVALID_RESPONSE', 'view.viewLayout must declare layout version 1 and the animal count.');
  }
  for (const field of ['animalIds', 'animalValues', 'animalActions']) {
    if (!sameMetadata(layout[field], expected[field])) {
      fail('INVALID_RESPONSE', `view.viewLayout.${field} does not match the protocol v1 layout.`);
    }
  }

  const seen = new Set();
  for (const id of ids) {
    if (id === 0 || seen.has(id)) fail('INVALID_RESPONSE', 'view.animalIds must contain unique non-zero IDs.');
    seen.add(id);
  }
  for (const value of values) if (!Number.isFinite(value)) fail('INVALID_RESPONSE', 'view.animalValues must contain only finite numbers.');
  for (const action of actions) if (action > 3) fail('INVALID_RESPONSE', 'view.animalActions contains an unknown action code.');
  if (!Number.isInteger(message.hour) || !Array.isArray(message.pastures) || message.pastures.length !== 4 || message.pastures.some(value => !Number.isFinite(value))) {
    fail('INVALID_RESPONSE', 'view.hour and view.pastures must contain valid simulation values.');
  }
  if (!Number.isFinite(message.cost) || !isValidConfig(message.config) || !Array.isArray(message.events) || !Array.isArray(message.selectedHistory)) {
    fail('INVALID_RESPONSE', 'view is missing valid state fields.');
  }
  validateEvents(message.events, 'view.events');
  validateHistory(message.selectedHistory, 'view.selectedHistory');
  if (message.selectedAnimalId != null && !seen.has(message.selectedAnimalId)) {
    fail('INVALID_RESPONSE', 'view.selectedAnimalId must identify an animal in view.animalIds.');
  }
  return count;
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
  if (raw.type === 'view') {
    if (legacy) response.viewLayout = createViewLayout(raw.animalIds?.length);
    validateViewLayout(response);
  }
  if (raw.type !== 'error' && typeof raw.engineImplementation !== 'string') {
    fail('INVALID_RESPONSE', `${raw.type}.engineImplementation must identify the active engine.`);
  }
  return response;
}

function validateState(state) {
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
    if (typeof animal.name !== 'string' || !actions.has(animal.action) || !Number.isInteger(animal.patch) || animal.patch < 0 || animal.patch > 3
      || ![animal.x, animal.y, animal.weight, animal.initialWeight, animal.energy, animal.thirst].every(Number.isFinite)) {
      fail('INVALID_RESPONSE', 'state.state.animals must contain finite positions and weights.');
    }
    if (animal.history !== undefined) validateHistory(animal.history, 'state.state.animals.history');
  }
  validateEvents(state.events, 'state.state.events');
}

function sameMetadata(actual, expected) {
  if (!isRecord(actual) || Object.keys(actual).length !== Object.keys(expected).length) return false;
  return Object.keys(expected).every(key => {
    const wanted = expected[key], found = actual[key];
    if (isRecord(wanted)) return sameMetadata(found, wanted);
    if (Array.isArray(wanted)) return Array.isArray(found) && wanted.length === found.length && wanted.every((value, index) => value === found[index]);
    return found === wanted;
  });
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
