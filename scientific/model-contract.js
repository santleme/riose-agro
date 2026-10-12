const SUPPORTED_FIELD_TYPES = new Set(['array', 'boolean', 'integer', 'number', 'object', 'string']);

export const SCIENTIFIC_MODEL_INTERFACE_VERSION = 1;

function assertShape(shape, name) {
  if (!shape || typeof shape !== 'object' || Array.isArray(shape) || Object.keys(shape).length === 0) {
    throw new TypeError(`${name} must declare at least one field`);
  }
  for (const [field, type] of Object.entries(shape)) {
    if (!SUPPORTED_FIELD_TYPES.has(type)) {
      throw new TypeError(`${name}.${field} uses unsupported type "${type}"`);
    }
  }
}

function assertDataMatchesShape(value, shape, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  for (const [field, type] of Object.entries(shape)) {
    if (!Object.hasOwn(value, field)) {
      throw new TypeError(`${name}.${field} is required`);
    }
    const actual = value[field];
    const valid = type === 'number' ? Number.isFinite(actual)
      : type === 'integer' ? Number.isInteger(actual)
        : type === 'array' ? Array.isArray(actual)
          : type === 'object' ? actual !== null && typeof actual === 'object' && !Array.isArray(actual)
            : typeof actual === type;
    if (!valid) throw new TypeError(`${name}.${field} must be ${type}`);
  }
}

function cloneAndFreeze(value, ancestors = new Set()) {
  if (!value || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new TypeError('Scientific model evidence cannot contain circular references');
  ancestors.add(value);
  const clone = Array.isArray(value)
    ? value.map(item => cloneAndFreeze(item, ancestors))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneAndFreeze(item, ancestors)]));
  ancestors.delete(value);
  return Object.freeze(clone);
}

export function defineScientificModel({id, version, inputs, outputs, evidence, run} = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new TypeError('Scientific model id must be a non-empty string');
  if (typeof version !== 'string' || !version.trim()) throw new TypeError(`Scientific model "${id}" version must be a non-empty string`);
  assertShape(inputs, `Scientific model "${id}" inputs`);
  assertShape(outputs, `Scientific model "${id}" outputs`);
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError(`Scientific model "${id}" evidence must be an object`);
  }
  if (typeof run !== 'function') throw new TypeError(`Scientific model "${id}" run must be a function`);

  return Object.freeze({
    interfaceVersion: SCIENTIFIC_MODEL_INTERFACE_VERSION,
    id,
    version,
    inputs: Object.freeze({...inputs}),
    outputs: Object.freeze({...outputs}),
    evidence: cloneAndFreeze(evidence),
    run
  });
}

export function runScientificModel(model, inputs) {
  if (!model || model.interfaceVersion !== SCIENTIFIC_MODEL_INTERFACE_VERSION) {
    throw new Error(`Unsupported scientific model interface version; expected ${SCIENTIFIC_MODEL_INTERFACE_VERSION}`);
  }
  if (typeof model.id !== 'string' || !model.id.trim()) throw new TypeError('Scientific model id must be a non-empty string');
  if (typeof model.version !== 'string' || !model.version.trim()) {
    throw new TypeError(`Scientific model "${model.id}" version must be a non-empty string`);
  }
  assertShape(model.inputs, `Scientific model "${model.id}" inputs`);
  assertShape(model.outputs, `Scientific model "${model.id}" outputs`);
  if (!model.evidence || typeof model.evidence !== 'object' || Array.isArray(model.evidence)) {
    throw new TypeError(`Scientific model "${model.id}" evidence must be an object`);
  }
  if (typeof model.run !== 'function') throw new TypeError(`Scientific model "${model.id}" run must be a function`);

  assertDataMatchesShape(inputs, model.inputs, `Scientific model "${model.id}" inputs`);
  const outputs = model.run(inputs);
  assertDataMatchesShape(outputs, model.outputs, `Scientific model "${model.id}" outputs`);
  return {modelId: model.id, version: model.version, outputs, evidence: model.evidence};
}
