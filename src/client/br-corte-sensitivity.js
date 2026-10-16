import {BR_CORTE_PASTURE_DMI} from '../../scientific/br_corte_pasture_dmi.js';
import '../../scientific/br_corte_dmi_adapter.js';
import {runRegisteredScientificModel} from '../../scientific/model-contract.js';

export const BR_CORTE_SENSITIVITY_TYPE = 'riose-br-corte-dmi-sensitivity';
export const BR_CORTE_SENSITIVITY_VERSION = 1;
export const BR_CORTE_SENSITIVITY_MAX_POINTS = 101;
const INPUT_KEYS = Object.freeze([
  'bodyWeightKg', 'adgKgPerDay', 'animalCount', 'durationDays', 'sweep',
  'supplementPricePerKgDM', 'currency',
]);
const SWEEP_KEYS = Object.freeze(['input', 'minimum', 'maximum', 'step', 'unit', 'values']);
const MODEL_KEYS = Object.freeze(['id', 'version']);
const CURRENCY = /^[A-Z]{3}$/;
const fail = message => { throw new Error(`BR-CORTE sensitivity is invalid: ${message}`); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, expected, label) {
  if (!isRecord(value) || Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) {
    fail(`${label} must contain exactly: ${expected.join(', ')}.`);
  }
}

function finiteRange(value, range, name, unit) {
  if (!Number.isFinite(value) || value < range[0] || value > range[1]) {
    fail(`${name} must be within the published ${range[0]}–${range[1]} ${unit} range.`);
  }
}

function sweepValues(minimum, maximum, step) {
  const intervals = (maximum - minimum) / step;
  const roundedIntervals = Math.round(intervals);
  if (Math.abs(intervals - roundedIntervals) > 1e-9 * Math.max(1, Math.abs(intervals))) {
    fail('step must divide the interval exactly.');
  }
  const pointCount = roundedIntervals + 1;
  if (pointCount < 2) fail('the sensitivity interval must contain at least two input values.');
  if (pointCount > BR_CORTE_SENSITIVITY_MAX_POINTS) fail(`sensitivity sweep is limited to ${BR_CORTE_SENSITIVITY_MAX_POINTS} points.`);
  return Array.from({length: pointCount}, (_, index) => index === pointCount - 1
    ? maximum
    : Number((minimum + step * index).toPrecision(12)));
}

function expectedAssumptions(inputs) {
  return {
    fixedInputs: `body weight ${inputs.bodyWeightKg} kg and user-supplied ADG ${inputs.adgKgPerDay} kg/day are held constant across the sweep`,
    population: `${inputs.animalCount} representative animals × ${inputs.durationDays} days; totals are arithmetic rollups, not a cohort distribution`,
    price: inputs.supplementPricePerKgDM === null
      ? 'cost omitted because no price was supplied'
      : `supplement DM amount multiplied by user-supplied ${inputs.currency} ${inputs.supplementPricePerKgDM} per kg DM; not total ration cost or profit`,
  };
}

function validateInputs(inputs) {
  exactKeys(inputs, INPUT_KEYS, 'inputs');
  const domain = BR_CORTE_PASTURE_DMI.validatedDomain;
  finiteRange(inputs.bodyWeightKg, domain.bodyWeightKg, 'bodyWeightKg', 'kg');
  finiteRange(inputs.adgKgPerDay, domain.adgKgPerDay, 'adgKgPerDay', 'kg/day; this is an input, not a prediction');
  if (!Number.isInteger(inputs.animalCount) || inputs.animalCount < 1 || inputs.animalCount > 10000) fail('animalCount must be an integer from 1 to 10,000.');
  if (!Number.isInteger(inputs.durationDays) || inputs.durationDays < 1 || inputs.durationDays > 365) fail('durationDays must be an integer from 1 to 365.');
  exactKeys(inputs.sweep, SWEEP_KEYS, 'sweep');
  if (inputs.sweep.input !== 'supplementKgDMPerDay' || inputs.sweep.unit !== 'kg DM/head/day') fail('only supplementKgDMPerDay in kg DM/head/day is supported for sensitivity.');
  finiteRange(inputs.sweep.minimum, domain.supplementKgDMPerDay, 'sweep.minimum', 'kg DM/head/day');
  finiteRange(inputs.sweep.maximum, domain.supplementKgDMPerDay, 'sweep.maximum', 'kg DM/head/day');
  if (!(inputs.sweep.maximum > inputs.sweep.minimum)) fail('sweep maximum must be greater than minimum.');
  if (!Number.isFinite(inputs.sweep.step) || inputs.sweep.step <= 0) fail('sweep step must be a positive finite number.');
  const expectedValues = sweepValues(inputs.sweep.minimum, inputs.sweep.maximum, inputs.sweep.step);
  if (!Array.isArray(inputs.sweep.values) || inputs.sweep.values.length !== expectedValues.length
      || inputs.sweep.values.some((value, index) => value !== expectedValues[index])) fail('sweep.values must exactly match the validated minimum, maximum, and step.');
  if (inputs.supplementPricePerKgDM !== null && (!Number.isFinite(inputs.supplementPricePerKgDM) || inputs.supplementPricePerKgDM < 0)) fail('supplementPricePerKgDM must be a non-negative finite amount or null.');
  if (inputs.supplementPricePerKgDM === null && inputs.currency !== null) fail('currency must be null when no price is supplied.');
  if (inputs.supplementPricePerKgDM !== null && (typeof inputs.currency !== 'string' || !CURRENCY.test(inputs.currency))) fail('currency must be a three-letter ISO 4217 code when a price is supplied.');
  const maximumTotalSupplement = inputs.sweep.maximum * inputs.animalCount * inputs.durationDays;
  if (!Number.isFinite(maximumTotalSupplement)) fail('supplement total exceeds a finite numeric result.');
  if (inputs.supplementPricePerKgDM !== null && !Number.isFinite(maximumTotalSupplement * inputs.supplementPricePerKgDM)) fail('supplement cost exceeds a finite numeric result.');
  return true;
}

export function createBrCorteSensitivityManifest(options = {}) {
  const allowed = [
    'bodyWeightKg', 'adgKgPerDay', 'animalCount', 'durationDays',
    'minimumSupplementKgDMPerHeadPerDay', 'maximumSupplementKgDMPerHeadPerDay',
    'stepKgDMPerHeadPerDay', 'supplementPricePerKgDM', 'currency',
  ];
  if (!isRecord(options) || Object.keys(options).some(key => !allowed.includes(key))) fail(`draft inputs may contain only: ${allowed.join(', ')}.`);
  const {
    bodyWeightKg,
    adgKgPerDay,
    animalCount,
    durationDays,
    minimumSupplementKgDMPerHeadPerDay,
    maximumSupplementKgDMPerHeadPerDay,
    stepKgDMPerHeadPerDay,
    supplementPricePerKgDM = null,
    currency = null,
  } = options;
  const domain = BR_CORTE_PASTURE_DMI.validatedDomain;
  finiteRange(minimumSupplementKgDMPerHeadPerDay, domain.supplementKgDMPerDay, 'sweep.minimum', 'kg DM/head/day');
  finiteRange(maximumSupplementKgDMPerHeadPerDay, domain.supplementKgDMPerDay, 'sweep.maximum', 'kg DM/head/day');
  if (!(maximumSupplementKgDMPerHeadPerDay > minimumSupplementKgDMPerHeadPerDay)) fail('sweep maximum must be greater than minimum.');
  if (!Number.isFinite(stepKgDMPerHeadPerDay) || stepKgDMPerHeadPerDay <= 0) fail('sweep step must be a positive finite number.');
  const values = sweepValues(minimumSupplementKgDMPerHeadPerDay, maximumSupplementKgDMPerHeadPerDay, stepKgDMPerHeadPerDay);
  const inputs = {
    bodyWeightKg,
    adgKgPerDay,
    animalCount,
    durationDays,
    sweep: {
      input: 'supplementKgDMPerDay',
      minimum: minimumSupplementKgDMPerHeadPerDay,
      maximum: maximumSupplementKgDMPerHeadPerDay,
      step: stepKgDMPerHeadPerDay,
      unit: 'kg DM/head/day',
      values,
    },
    supplementPricePerKgDM,
    currency,
  };
  validateInputs(inputs);
  return {
    type: BR_CORTE_SENSITIVITY_TYPE,
    version: BR_CORTE_SENSITIVITY_VERSION,
    model: {id: BR_CORTE_PASTURE_DMI.id, version: BR_CORTE_PASTURE_DMI.version},
    inputs,
    assumptions: expectedAssumptions(inputs),
  };
}

export function validateBrCorteSensitivityManifest(manifest) {
  exactKeys(manifest, ['type', 'version', 'model', 'inputs', 'assumptions'], 'manifest');
  if (manifest.type !== BR_CORTE_SENSITIVITY_TYPE || manifest.version !== BR_CORTE_SENSITIVITY_VERSION) fail(`type/version must be ${BR_CORTE_SENSITIVITY_TYPE}/1.`);
  exactKeys(manifest.model, MODEL_KEYS, 'model');
  if (manifest.model.id !== BR_CORTE_PASTURE_DMI.id || manifest.model.version !== BR_CORTE_PASTURE_DMI.version) fail(`model must be ${BR_CORTE_PASTURE_DMI.id}@${BR_CORTE_PASTURE_DMI.version}.`);
  validateInputs(manifest.inputs);
  const assumptions = expectedAssumptions(manifest.inputs);
  if (!isRecord(manifest.assumptions) || Object.keys(manifest.assumptions).sort().join('|') !== Object.keys(assumptions).sort().join('|')
      || Object.entries(assumptions).some(([key, value]) => manifest.assumptions[key] !== value)) fail('assumptions must match fixed inputs, population arithmetic and declared price.');
  return true;
}

export function evaluateBrCorteSensitivityManifest(manifest) {
  validateBrCorteSensitivityManifest(manifest);
  const {inputs} = manifest;
  const multiplier = inputs.animalCount * inputs.durationDays;
  const baselineDmi = runRegisteredScientificModel({
    id: manifest.model.id,
    version: manifest.model.version,
    inputs: {bodyWeightKg: inputs.bodyWeightKg, adgKgPerDay: inputs.adgKgPerDay, supplementKgDMPerDay: inputs.sweep.minimum},
  }).outputs.totalDmiKgDMPerDay;
  const rows = inputs.sweep.values.map(supplement => {
    const execution = runRegisteredScientificModel({
      id: manifest.model.id,
      version: manifest.model.version,
      inputs: {bodyWeightKg: inputs.bodyWeightKg, adgKgPerDay: inputs.adgKgPerDay, supplementKgDMPerDay: supplement},
    });
    const totalDmiKgDMPerHeadPerDay = execution.outputs.totalDmiKgDMPerDay;
    const supplementKgDM = supplement * multiplier;
    const supplementCost = inputs.supplementPricePerKgDM === null ? null : supplementKgDM * inputs.supplementPricePerKgDM;
    return {
      bodyWeightKg: inputs.bodyWeightKg,
      adgKgPerDay: inputs.adgKgPerDay,
      supplementKgDMPerHeadPerDay: supplement,
      totalDmiKgDMPerHeadPerDay,
      herdTotalDmiKgDM: totalDmiKgDMPerHeadPerDay * multiplier,
      supplementKgDM,
      supplementCost,
      currency: supplementCost === null ? null : inputs.currency,
      inPublishedInputRange: execution.outputs.inValidatedDomain,
      deltaFromMinimumKgDMPerHeadPerDay: totalDmiKgDMPerHeadPerDay - baselineDmi,
      provenance: {
        modelId: execution.provenance.modelId,
        version: execution.provenance.version,
        implementationHash: execution.provenance.implementationHash,
        evidenceStatus: execution.provenance.evidenceStatus,
        inputs: execution.provenance.inputs,
        evidenceReferences: execution.provenance.evidenceReferences,
      },
    };
  });
  const derivative = 0.7732;
  return {
    type: 'riose-br-corte-dmi-sensitivity-results',
    version: 1,
    status: 'computed',
    validated: false,
    model: {
      ...manifest.model,
      source: BR_CORTE_PASTURE_DMI.source,
      equation: BR_CORTE_PASTURE_DMI.equation,
      applicationDomain: BR_CORTE_PASTURE_DMI.validatedDomain.productionSystem,
      evidenceStatus: 'published equation; external validation reported by the source; no Riose-specific calibration',
    },
    sweep: structuredClone(inputs.sweep),
    fixedInputs: {bodyWeightKg: inputs.bodyWeightKg, adgKgPerDay: inputs.adgKgPerDay},
    population: {animalCount: inputs.animalCount, durationDays: inputs.durationDays, representation: 'representative inputs held constant; totals are arithmetic rollups'},
    localSensitivity: {
      input: 'supplementKgDMPerDay',
      derivative,
      unit: '(kg DM/head/day output)/(kg DM/head/day input)',
      method: 'exact partial derivative of the registered Eq. 2.6 with body weight and supplied ADG held constant',
      interpretation: 'equation sensitivity only; not a causal intervention effect',
    },
    assumptions: structuredClone(manifest.assumptions),
    units: {
      supplementKgDMPerHeadPerDay: 'kg DM/head/day',
      totalDmiKgDMPerHeadPerDay: 'kg DM/head/day',
      herdTotalDmiKgDM: 'kg DM across represented animals and duration',
      supplementKgDM: 'kg DM across represented animals and duration',
      supplementCost: inputs.supplementPricePerKgDM === null ? null : `${inputs.currency} across represented animals and duration`,
    },
    interpretation: 'Deterministic one-input sensitivity of a published equation with fixed inputs; not a causal effect, prediction interval, probability, or Riose-calibrated result.',
    predictionInterval: null,
    rows,
  };
}
