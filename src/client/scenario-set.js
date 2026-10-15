import {createComparisonManifest, FARM_ENGINE_VERSION, FarmEngine} from './engine.js';
import {runPopulationComparison} from './population-experiment.js';

export const SCENARIO_SET_TYPE = 'riose-scenario-set';
export const SCENARIO_SET_VERSION = 1;

const CONFIG_KEYS = Object.freeze(['diet', 'housing', 'supplement', 'weather']);
const MIN_SCENARIOS = 3;
const MAX_SCENARIOS = 10;

function fail(message) {
  throw new Error(`Scenario set is invalid: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  const keys = Object.keys(value).sort();
  if (keys.join('|') !== [...expected].sort().join('|')) fail(`${label} must contain exactly: ${expected.join(', ')}.`);
}

function validateSnapshot(snapshot, durationDays) {
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
    fail('durationDays must be an integer from 1 to 365.');
  }
  try {
    // Reuse the established pair-manifest validation for the engine snapshot.
    createComparisonManifest(snapshot, durationDays);
  } catch (error) {
    fail(`initialSnapshot is not a supported FarmEngine snapshot (${error.message}).`);
  }
}

function validateConfig(config, snapshot) {
  exactKeys(config, CONFIG_KEYS, 'scenario.config');
  try {
    const engine = FarmEngine.from(snapshot);
    engine.configure(config);
  } catch (error) {
    fail(`scenario config is outside the FarmEngine domain (${error.message}).`);
  }
}

function validateScenarioSetFields(value) {
  exactKeys(value, [
    'type', 'version', 'scenarioId', 'engineVersion', 'initialSnapshot', 'seed',
    'durationDays', 'factor', 'scenarios', 'validated',
  ], 'root');
  if (value.type !== SCENARIO_SET_TYPE || value.version !== SCENARIO_SET_VERSION) {
    fail(`type/version must be ${SCENARIO_SET_TYPE}/1.`);
  }
  if (typeof value.scenarioId !== 'string' || !value.scenarioId.trim() || value.scenarioId.length > 120) {
    fail('scenarioId must be a non-empty string up to 120 characters.');
  }
  if (value.engineVersion !== FARM_ENGINE_VERSION) fail(`engineVersion must be ${FARM_ENGINE_VERSION}.`);
  if (value.validated !== false) fail('validated must remain false for the illustrative FarmEngine.');

  validateSnapshot(value.initialSnapshot, value.durationDays);
  const expectedSeed = Number.isInteger(value.initialSnapshot.initialSeed)
    ? value.initialSnapshot.initialSeed >>> 0
    : value.initialSnapshot.seed >>> 0;
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff || value.seed !== expectedSeed) {
    fail('seed must match the initial snapshot seed.');
  }
  if (!Array.isArray(value.scenarios) || value.scenarios.length < MIN_SCENARIOS || value.scenarios.length > MAX_SCENARIOS) {
    fail(`scenarios must contain ${MIN_SCENARIOS} to ${MAX_SCENARIOS} arms including baseline.`);
  }

  const ids = new Set();
  const roles = new Map();
  for (const scenario of value.scenarios) {
    exactKeys(scenario, ['id', 'label', 'role', 'config'], 'scenario');
    if (typeof scenario.id !== 'string' || !scenario.id.trim() || scenario.id.length > 64 || ids.has(scenario.id)) {
      fail('scenario IDs must be unique non-empty strings up to 64 characters.');
    }
    ids.add(scenario.id);
    if (typeof scenario.label !== 'string' || !scenario.label.trim() || scenario.label.length > 80) {
      fail(`scenario ${scenario.id} label must be a non-empty string up to 80 characters.`);
    }
    if (!['baseline', 'intervention'].includes(scenario.role)) fail(`scenario ${scenario.id} has an unsupported role.`);
    roles.set(scenario.role, (roles.get(scenario.role) ?? 0) + 1);
    validateConfig(scenario.config, value.initialSnapshot);
  }
  if (roles.get('baseline') !== 1 || roles.get('intervention') !== value.scenarios.length - 1) {
    fail('exactly one baseline and at least two intervention arms are required.');
  }

  const baseline = value.scenarios.find(scenario => scenario.role === 'baseline');
  const interventions = value.scenarios.filter(scenario => scenario.role === 'intervention');
  const changed = config => CONFIG_KEYS.filter(key => baseline.config[key] !== config[key]);
  const factors = interventions.map(scenario => changed(scenario.config));
  if (factors.some(keys => keys.length !== 1)) fail('each intervention must differ from baseline in exactly one factor.');
  const factor = factors[0]?.[0];
  if (!factor || factors.some(keys => keys[0] !== factor)) fail('all interventions must vary the same declared factor.');
  const baselineChanges = CONFIG_KEYS.filter(key => baseline.config[key] !== value.initialSnapshot.config[key]);
  if (baselineChanges.some(key => key !== factor)) {
    fail('baseline may differ from the initial snapshot only by the varied factor.');
  }
  const values = [baseline.config[factor], ...interventions.map(scenario => scenario.config[factor])];
  if (new Set(values).size !== values.length) fail('each scenario must use a unique value for the varied factor.');
  if (value.factor !== factor) fail(`factor must identify the only varied config field (${factor}).`);
  return true;
}

export function createScenarioSetManifest({snapshot, durationDays, scenarioId, scenarios} = {}) {
  validateSnapshot(snapshot, durationDays);
  const initialSnapshot = structuredClone(snapshot);
  const seed = Number.isInteger(initialSnapshot.initialSeed)
    ? initialSnapshot.initialSeed >>> 0
    : initialSnapshot.seed >>> 0;
  const manifest = {
    type: SCENARIO_SET_TYPE,
    version: SCENARIO_SET_VERSION,
    scenarioId,
    engineVersion: FARM_ENGINE_VERSION,
    initialSnapshot,
    seed,
    durationDays,
    factor: null,
    scenarios: structuredClone(scenarios),
    validated: false,
  };
  if (Array.isArray(scenarios)) {
    const baseline = scenarios.find(scenario => scenario?.role === 'baseline');
    const intervention = scenarios.find(scenario => scenario?.role === 'intervention');
    if (baseline && intervention) {
      manifest.factor = CONFIG_KEYS.find(key => baseline.config?.[key] !== intervention.config?.[key]) ?? null;
    }
  }
  validateScenarioSetFields(manifest);
  return manifest;
}

export function validateScenarioSetManifest(manifest) {
  return validateScenarioSetFields(manifest);
}

function baselineRows(rows) {
  return rows.map(row => ({
    day: row.day,
    meanWeightKg: row.referenceWeight,
    cumulativeCostUnits: row.referenceCost,
    cumulativeFeedIntakeKgDM: row.referenceConsumptionKgDM,
    pastureStockKgDM: row.referencePastureKgDM,
  }));
}

function interventionRows(rows) {
  return rows.map(row => ({
    day: row.day,
    meanWeightKg: row.scenarioWeight,
    cumulativeCostUnits: row.scenarioCost,
    cumulativeFeedIntakeKgDM: row.scenarioConsumptionKgDM,
    pastureStockKgDM: row.scenarioPastureKgDM,
    deltaMeanWeightKg: row.scenarioWeight - row.referenceWeight,
    deltaCumulativeCostUnits: row.scenarioCost - row.referenceCost,
    deltaCumulativeFeedIntakeKgDM: row.scenarioConsumptionKgDM - row.referenceConsumptionKgDM,
    deltaPastureStockKgDM: row.scenarioPastureKgDM - row.referencePastureKgDM,
  }));
}

function baselineTimeline(points) {
  return points.map(point => ({
    day: point.day,
    animals: point.reference,
    pastureStockKgDM: point.referencePastureKgDM,
  }));
}

function interventionTimeline(points) {
  return points.map(point => ({
    day: point.day,
    animals: point.scenario,
    pastureStockKgDM: point.scenarioPastureKgDM,
  }));
}

/** Execute each intervention against the same baseline snapshot and return aligned named series. */
export function replayScenarioSetManifest(manifest, {onProgress} = {}) {
  validateScenarioSetManifest(manifest);
  if (onProgress !== undefined && typeof onProgress !== 'function') fail('onProgress must be a function when supplied.');

  const baseline = manifest.scenarios.find(scenario => scenario.role === 'baseline');
  const interventions = manifest.scenarios.filter(scenario => scenario.role === 'intervention');
  let baselineResult = null;
  const scenarios = interventions.map((scenario, index) => {
    const run = runPopulationComparison(manifest.initialSnapshot, {
      days: manifest.durationDays,
      referenceConfig: baseline.config,
      scenarioConfig: scenario.config,
      onProgress: progress => onProgress?.({
        ...progress,
        scenarioId: scenario.id,
        scenarioIndex: index + 1,
        scenarioCount: interventions.length,
      }),
    });
    if (!baselineResult) baselineResult = run;
    return {
      id: scenario.id,
      label: scenario.label,
      role: scenario.role,
      config: {...scenario.config},
      rows: interventionRows(run.comparison.rows),
      timeline: interventionTimeline(run.timeline),
    };
  });

  return {
    type: 'riose-scenario-results',
    version: 1,
    scenarioId: manifest.scenarioId,
    engineVersion: manifest.engineVersion,
    seed: manifest.seed,
    durationDays: manifest.durationDays,
    factor: manifest.factor,
    validated: false,
    executor: 'javascript-population-observations',
    assumptions: {...baselineResult.comparison.assumptions},
    units: {
      meanWeightKg: 'kg live weight/animal',
      cumulativeCostUnits: 'illustrative engine cost units',
      cumulativeFeedIntakeKgDM: 'kg DM across the herd',
      pastureStockKgDM: 'illustrative engine paddock stock units (kg DM)',
    },
    baseline: {
      id: baseline.id,
      label: baseline.label,
      role: baseline.role,
      config: {...baseline.config},
      rows: baselineRows(baselineResult.comparison.rows),
      timeline: baselineTimeline(baselineResult.timeline),
    },
    scenarios,
    observationFormat: baselineResult.observationFormat,
    observationGranularity: baselineResult.observationGranularity,
    individualIntakeAvailable: false,
    executionCount: interventions.length,
    interpretation: 'Deterministic sensitivity across illustrative FarmEngine scenarios; not a validated livestock forecast, causal estimate, or prediction interval.',
  };
}
