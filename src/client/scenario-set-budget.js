// Measured from Product V3's real 10,000-animal, 3-arm, 7-day result projection.
export const SCENARIO_SET_REFERENCE_JSON_BYTES = 31_580_825;
export const SCENARIO_SET_REFERENCE_ANIMALS = 10_000;
export const SCENARIO_SET_REFERENCE_ARMS = 3;
export const SCENARIO_SET_REFERENCE_CHECKPOINTS = 3;
export const SCENARIO_SET_PROJECTED_JSON_BUDGET_BYTES = 40 * 1024 * 1024;

export function scenarioSetCheckpointCount(durationDays) {
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
    throw new RangeError('durationDays must be an integer from 1 to 365.');
  }
  return [0, 1, 7, 15, 30, 60, 90, 180, durationDays]
    .filter((day, index, all) => day <= durationDays && all.indexOf(day) === index).length;
}

export function estimateScenarioSetResultJsonBytes({animalCount, durationDays, scenarioCount} = {}) {
  if (!Number.isInteger(animalCount) || animalCount < 1 || animalCount > SCENARIO_SET_REFERENCE_ANIMALS) {
    throw new RangeError(`animalCount must be an integer from 1 to ${SCENARIO_SET_REFERENCE_ANIMALS}.`);
  }
  if (!Number.isInteger(scenarioCount) || scenarioCount < 3 || scenarioCount > 10) {
    throw new RangeError('scenarioCount must be an integer from 3 to 10.');
  }
  const workUnits = animalCount * scenarioCount * scenarioSetCheckpointCount(durationDays);
  const referenceUnits = SCENARIO_SET_REFERENCE_ANIMALS * SCENARIO_SET_REFERENCE_ARMS * SCENARIO_SET_REFERENCE_CHECKPOINTS;
  return Math.ceil(SCENARIO_SET_REFERENCE_JSON_BYTES * workUnits / referenceUnits);
}

export function scenarioSetResultBudgetStatus(options) {
  const estimatedBytes = estimateScenarioSetResultJsonBytes(options);
  return {
    estimatedBytes,
    budgetBytes: SCENARIO_SET_PROJECTED_JSON_BUDGET_BYTES,
    withinBudget: estimatedBytes <= SCENARIO_SET_PROJECTED_JSON_BUDGET_BYTES,
    source: 'Product V3 three-arm, 7-day, 10,000-animal Chromium 143 benchmark; JSON result size is a planning proxy, not browser transfer or memory size.',
  };
}
