import {FarmEngine, createComparisonManifest} from './engine.js';

const TARGETS = Object.freeze({
  diet: Object.freeze({unit: 'category'}),
  housing: Object.freeze({unit: 'category'}),
  weather: Object.freeze({unit: 'category'}),
  supplement: Object.freeze({unit: 'kg DM/animal/day'}),
});

const OUTPUTS = Object.freeze({
  weight: 'kg live weight/animal',
  gain: 'kg live weight/animal since simulation start',
  cost: 'engine cost units',
  pasture: 'kg DM across all paddocks',
  stress: 'engine stress score',
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateSnapshot(snapshot) {
  if (!isRecord(snapshot) || !isRecord(snapshot.config) || !Number.isInteger(snapshot.seed)
      || snapshot.seed < 0 || snapshot.seed > 0xffffffff) {
    throw new Error('A valid FarmEngine snapshot with an unsigned 32-bit seed is required.');
  }
  if (snapshot.initialSeed !== undefined && (!Number.isInteger(snapshot.initialSeed)
      || snapshot.initialSeed < 0 || snapshot.initialSeed > 0xffffffff)) {
    throw new Error('snapshot.initialSeed must be an unsigned 32-bit integer when present.');
  }

  const engine = FarmEngine.from(snapshot);
  engine.configure({...snapshot.config});

  try {
    createComparisonManifest(snapshot, 1);
  } catch (error) {
    throw new Error(`Invalid FarmEngine snapshot: ${error.message}`);
  }

  if (!Array.isArray(snapshot.events)) throw new Error('Invalid FarmEngine snapshot: events must be an array.');
  if (snapshot.pastures.some(value => !Number.isFinite(value))) {
    throw new Error('Invalid FarmEngine snapshot: pasture values must be finite numbers.');
  }
  if (snapshot.intake !== undefined) {
    const intakeFields = ['pastureKgDM', 'barnBaseKgDM', 'supplementKgDM', 'dietExtraKgDM'];
    if (!isRecord(snapshot.intake) || intakeFields.some(field => !Number.isFinite(snapshot.intake[field]))) {
      throw new Error('Invalid FarmEngine snapshot: intake values must be finite numbers.');
    }
  }
  for (const [index, animal] of snapshot.animals.entries()) {
    const numericFields = ['weight', 'initialWeight', 'energy', 'thirst'];
    if (!isRecord(animal) || numericFields.some(field => !Number.isFinite(animal[field]))) {
      throw new Error(`Invalid FarmEngine snapshot: animals[${index}] has invalid numeric state.`);
    }
    if (!Number.isInteger(animal.patch) || animal.patch < 0 || animal.patch > 3) {
      throw new Error(`Invalid FarmEngine snapshot: animals[${index}].patch must be from 0 to 3.`);
    }
    if (!['grazing', 'feeding', 'drinking', 'resting'].includes(animal.action)) {
      throw new Error(`Invalid FarmEngine snapshot: animals[${index}].action is unsupported.`);
    }
    if (animal.history !== undefined && !Array.isArray(animal.history)) {
      throw new Error(`Invalid FarmEngine snapshot: animals[${index}].history must be an array.`);
    }
  }

}

function validateOptions({snapshot, targetVariable, values, outputs, durationHours}) {
  validateSnapshot(snapshot);
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('values must be a non-empty array.');
  }
  for (const value of values) {
    if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`Invalid value for ${String(targetVariable)}: values must be finite numbers or strings.`);
    }
  }
  if (!Array.isArray(outputs) || outputs.length === 0) {
    throw new Error('outputs must be a non-empty array.');
  }
  if (new Set(outputs).size !== outputs.length) throw new Error('outputs must not contain duplicates.');
  for (const output of outputs) {
    if (!Object.hasOwn(OUTPUTS, output)) throw new Error(`Unsupported output: ${String(output)}.`);
  }
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 8760) {
    throw new Error('durationHours must be an integer from 1 to 8760.');
  }
  if (!Object.hasOwn(TARGETS, targetVariable)) return false;

  const validationEngine = FarmEngine.from(snapshot);
  for (const value of values) {
    validationEngine.configure({...snapshot.config, [targetVariable]: value});
  }
  return true;
}

function run(snapshot, targetVariable, inputValue, outputs, durationHours) {
  const engine = FarmEngine.from(snapshot);
  const config = {...snapshot.config, [targetVariable]: inputValue};
  engine.configure(config);
  engine.tick(durationHours);
  const metrics = engine.metrics();
  const selectedOutputs = Object.fromEntries(outputs.map(output => [output, metrics[output]]));
  if (Object.values(selectedOutputs).some(value => !Number.isFinite(value))) {
    throw new Error('FarmEngine produced a non-finite selected output for this analysis.');
  }
  return {
    config: {...engine.state.config},
    outputs: selectedOutputs,
  };
}

function delta(value, baseline) {
  const absolute = value - baseline;
  return {absolute, percent: baseline === 0 ? null : absolute / baseline * 100};
}

/**
 * Replays one FarmEngine snapshot for each explicit value of one supported config field.
 * The baseline is the field's value in snapshot.config and is executed separately.
 */
export function analyzeSensitivity({
  snapshot,
  targetVariable,
  values,
  outputs,
  durationHours = 24,
} = {}) {
  const isSupported = validateOptions({snapshot, targetVariable, values, outputs, durationHours});
  if (!isSupported) {
    return {
      type: 'agroville-sensitivity-analysis',
      version: 1,
      status: 'unsupported',
      method: 'one-at-a-time',
      targetVariable,
      reason: `The engine does not model ${String(targetVariable)} as a supported configuration input.`,
      supportedVariables: Object.keys(TARGETS),
      validated: false,
      causal: false,
    };
  }

  const baselineValue = snapshot.config[targetVariable];
  const baselineRun = run(snapshot, targetVariable, baselineValue, outputs, durationHours);
  const baseline = {
    inputValue: baselineValue,
    config: baselineRun.config,
    outputs: baselineRun.outputs,
  };
  const results = values.map(inputValue => {
    const current = run(snapshot, targetVariable, inputValue, outputs, durationHours);
    const changes = Object.keys(snapshot.config)
      .filter(key => key !== targetVariable && current.config[key] !== snapshot.config[key]);
    if (changes.length) throw new Error(`Analysis changed undeclared configuration fields: ${changes.join(', ')}.`);

    return {
      inputValue,
      config: current.config,
      outputs: current.outputs,
      deltaFromBaseline: Object.fromEntries(outputs.map(output => [
        output,
        delta(current.outputs[output], baseline.outputs[output]),
      ])),
    };
  });

  return {
    type: 'agroville-sensitivity-analysis',
    version: 1,
    status: 'supported',
    method: 'one-at-a-time',
    seed: Number.isInteger(snapshot.initialSeed) ? snapshot.initialSeed >>> 0 : snapshot.seed >>> 0,
    duration: {value: durationHours, unit: 'hour'},
    targetVariable: {
      path: `config.${targetVariable}`,
      unit: TARGETS[targetVariable].unit,
      baselineValue,
    },
    values: [...values],
    baselineIncludedInValues: values.some(value => Object.is(value, baselineValue)),
    outputs: Object.fromEntries(outputs.map(output => [output, {unit: OUTPUTS[output]}])),
    baseline,
    results,
    executionCount: values.length + 1,
    validated: false,
    causal: false,
    interpretation: 'Deterministic computational sensitivity under the current illustrative engine; not a causal estimate, forecast, confidence interval, or scientific validation.',
  };
}
