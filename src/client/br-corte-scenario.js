import {BR_CORTE_PASTURE_DMI_MODEL} from '../../scientific/br_corte_dmi_adapter.js';
import {BR_CORTE_PASTURE_DMI} from '../../scientific/br_corte_pasture_dmi.js';
import {runRegisteredScientificModel} from '../../scientific/model-contract.js';

export const BR_CORTE_SCENARIO_SET_TYPE = 'riose-br-corte-dmi-scenario-set';
export const BR_CORTE_SCENARIO_SET_VERSION = 1;
export const BR_CORTE_SCENARIO_RESULTS_TYPE = 'riose-br-corte-dmi-scenario-results';
export const BR_CORTE_SCENARIO_RESULTS_VERSION = 1;

const CURRENCY = /^[A-Z]{3}$/;
const KEYS = Object.freeze(['bodyWeightKg', 'adgKgPerDay', 'animalCount', 'durationDays', 'supplementLevelsKgDMPerHeadPerDay', 'supplementPricePerKgDM', 'currency']);

function fail(message) {
  throw new Error(`BR-CORTE scenario is invalid: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value) || Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) {
    fail(`${label} must contain exactly: ${expected.join(', ')}.`);
  }
}

function inRange(value, range) {
  return Number.isFinite(value) && value >= range[0] && value <= range[1];
}

function assumptionsFor({supplementPricePerKgDM, currency}) {
  return {
    populationRepresentation: 'representative animal inputs; no individual weight distribution is supplied or inferred',
    horizon: 'body weight, supplied ADG and daily supplement are held constant across the selected days; totals are arithmetic rollups, not a weight trajectory',
    cost: supplementPricePerKgDM === null ? 'not calculated; no price supplied' : `supplement DM amount multiplied by user-supplied price per kg DM (${currency}); not total ration cost or profit`,
  };
}

function validateInputs(inputs) {
  exactKeys(inputs, KEYS, 'inputs');
  const domain = BR_CORTE_PASTURE_DMI.validatedDomain;
  if (!inRange(inputs.bodyWeightKg, domain.bodyWeightKg)) fail(`bodyWeightKg must be within the published ${domain.bodyWeightKg[0]}–${domain.bodyWeightKg[1]} kg range.`);
  if (!inRange(inputs.adgKgPerDay, domain.adgKgPerDay)) fail(`adgKgPerDay must be within the published ${domain.adgKgPerDay[0]}–${domain.adgKgPerDay[1]} kg/day range; this value is an input, not a model prediction.`);
  if (!Number.isInteger(inputs.animalCount) || inputs.animalCount < 1 || inputs.animalCount > 10000) fail('animalCount must be an integer from 1 to 10,000.');
  if (!Number.isInteger(inputs.durationDays) || inputs.durationDays < 1 || inputs.durationDays > 365) fail('durationDays must be an integer from 1 to 365.');
  const levels = inputs.supplementLevelsKgDMPerHeadPerDay;
  if (!Array.isArray(levels) || levels.length < 3 || levels.length > 10) fail('supplement levels must contain 3 to 10 distinct scenarios including the baseline.');
  if (levels.some(value => !inRange(value, domain.supplementKgDMPerDay)) || new Set(levels).size !== levels.length) {
    fail(`supplement levels must be distinct values within the published ${domain.supplementKgDMPerDay[0]}–${domain.supplementKgDMPerDay[1]} kg DM/head/day range.`);
  }
  if (inputs.supplementPricePerKgDM !== null && (!Number.isFinite(inputs.supplementPricePerKgDM) || inputs.supplementPricePerKgDM < 0)) {
    fail('supplementPricePerKgDM must be a non-negative finite amount or null.');
  }
  if (inputs.supplementPricePerKgDM !== null) {
    const largestSupplementTotal = Math.max(...inputs.supplementLevelsKgDMPerHeadPerDay) * inputs.animalCount * inputs.durationDays;
    if (!Number.isFinite(largestSupplementTotal * inputs.supplementPricePerKgDM)) fail('supplementPricePerKgDM makes the declared population cost overflow a finite numeric result.');
  }
  if (inputs.supplementPricePerKgDM === null && inputs.currency !== null) fail('currency must be null when no supplement price is supplied.');
  if (inputs.supplementPricePerKgDM !== null && (typeof inputs.currency !== 'string' || !CURRENCY.test(inputs.currency))) {
    fail('currency must be a three-letter ISO 4217 code when supplement price is supplied.');
  }
  return true;
}

export function createBrCorteDmiScenarioManifest({
  bodyWeightKg,
  adgKgPerDay,
  animalCount,
  durationDays,
  supplementLevelsKgDMPerHeadPerDay,
  supplementPricePerKgDM = null,
  currency = null,
} = {}) {
  const inputs = {bodyWeightKg, adgKgPerDay, animalCount, durationDays,
    supplementLevelsKgDMPerHeadPerDay: [...(supplementLevelsKgDMPerHeadPerDay ?? [])],
    supplementPricePerKgDM, currency};
  validateInputs(inputs);
  return {
    type: BR_CORTE_SCENARIO_SET_TYPE,
    version: BR_CORTE_SCENARIO_SET_VERSION,
    modelId: BR_CORTE_PASTURE_DMI_MODEL.id,
    modelVersion: BR_CORTE_PASTURE_DMI_MODEL.version,
    inputs,
    assumptions: assumptionsFor({supplementPricePerKgDM, currency}),
  };
}

export function validateBrCorteDmiScenarioManifest(manifest) {
  exactKeys(manifest, ['type', 'version', 'modelId', 'modelVersion', 'inputs', 'assumptions'], 'manifest');
  if (manifest.type !== BR_CORTE_SCENARIO_SET_TYPE || manifest.version !== BR_CORTE_SCENARIO_SET_VERSION) {
    fail(`type/version must be ${BR_CORTE_SCENARIO_SET_TYPE}/1.`);
  }
  if (manifest.modelId !== BR_CORTE_PASTURE_DMI_MODEL.id || manifest.modelVersion !== BR_CORTE_PASTURE_DMI_MODEL.version) {
    fail(`model must be ${BR_CORTE_PASTURE_DMI_MODEL.id}@${BR_CORTE_PASTURE_DMI_MODEL.version}.`);
  }
  validateInputs(manifest.inputs);
  const expectedAssumptions = assumptionsFor(manifest.inputs);
  if (!isRecord(manifest.assumptions)
      || Object.keys(manifest.assumptions).sort().join('|') !== Object.keys(expectedAssumptions).sort().join('|')
      || Object.entries(expectedAssumptions).some(([key, value]) => manifest.assumptions[key] !== value)) {
    fail('assumptions must exactly preserve the declared population, horizon, and cost limitations.');
  }
  return true;
}

export function evaluateBrCorteDmiScenarioManifest(manifest) {
  validateBrCorteDmiScenarioManifest(manifest);
  const {inputs} = manifest;
  const multiplier = inputs.animalCount * inputs.durationDays;
  const scenarios = inputs.supplementLevelsKgDMPerHeadPerDay.map((supplement, index) => {
    const execution = runRegisteredScientificModel({
      id: manifest.modelId,
      version: manifest.modelVersion,
      inputs: {bodyWeightKg: inputs.bodyWeightKg, adgKgPerDay: inputs.adgKgPerDay, supplementKgDMPerDay: supplement},
    });
    if (!execution.outputs.inValidatedDomain) fail(`scenario ${index + 1} is outside the registered equation domain.`);
    const herdDmiKgDM = execution.outputs.totalDmiKgDMPerDay * multiplier;
    const supplementKgDM = supplement * multiplier;
    const supplementCost = inputs.supplementPricePerKgDM === null ? null : supplementKgDM * inputs.supplementPricePerKgDM;
    const baselineDmi = index === 0 ? execution.outputs.totalDmiKgDMPerDay : null;
    return {
      id: index === 0 ? 'baseline' : `scenario-${index}`,
      label: `${index === 0 ? 'Baseline' : `Scenario ${String.fromCharCode(64 + index)}`} · ${supplement} kg DM/head/day`,
      role: index === 0 ? 'baseline' : 'intervention',
      input: {supplementKgDMPerHeadPerDay: supplement, units: 'kg DM/head/day'},
      outputs: {
        totalDmiKgDMPerHeadPerDay: execution.outputs.totalDmiKgDMPerDay,
        adgRole: execution.outputs.adgRole,
        inPublishedInputRange: execution.outputs.inValidatedDomain,
      },
      totals: {
        herdDmiKgDM: herdDmiKgDM,
        supplementKgDM,
        supplementCost,
        currency: supplementCost === null ? null : inputs.currency,
      },
      provenance: execution.provenance,
      ...(index === 0 ? {} : {baselineDeltas: {dmiKgDMPerHeadPerDay: null, supplementCost: supplementCost === null ? null : supplementCost - (inputs.supplementLevelsKgDMPerHeadPerDay[0] * multiplier * inputs.supplementPricePerKgDM)}}),
    };
  });
  const baselineDmi = scenarios[0].outputs.totalDmiKgDMPerHeadPerDay;
  for (const scenario of scenarios.slice(1)) scenario.baselineDeltas.dmiKgDMPerHeadPerDay = scenario.outputs.totalDmiKgDMPerHeadPerDay - baselineDmi;
  return {
    type: BR_CORTE_SCENARIO_RESULTS_TYPE,
    version: BR_CORTE_SCENARIO_RESULTS_VERSION,
    status: 'computed',
    validated: false,
    model: {
      id: manifest.modelId,
      version: manifest.modelVersion,
      source: BR_CORTE_PASTURE_DMI.source,
      equation: BR_CORTE_PASTURE_DMI.equation,
      applicationDomain: BR_CORTE_PASTURE_DMI.validatedDomain.productionSystem,
      publishedInputRanges: BR_CORTE_PASTURE_DMI.validatedDomain,
      evidenceStatus: 'published equation; external validation reported by the source; no Riose-specific calibration',
    },
    assumptions: manifest.assumptions,
    units: {
      totalDmiKgDMPerHeadPerDay: 'kg DM/head/day',
      herdDmiKgDM: 'kg DM across the selected population and horizon',
      supplementKgDM: 'kg DM across the selected population and horizon',
      supplementCost: inputs.supplementPricePerKgDM === null ? null : `${inputs.currency} across the selected population and horizon`,
    },
    manifest,
    scenarios,
  };
}
