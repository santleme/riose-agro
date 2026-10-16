export const CONDITIONAL_SUPPLEMENT_COST_TYPE = 'riose-conditional-supplement-cost';
export const CONDITIONAL_SUPPLEMENT_COST_VERSION = 1;

const CURRENCY = /^[A-Z]{3}$/;
const fail = message => { throw new TypeError(`Conditional supplement cost: ${message}`); };

/** Transparent arithmetic for user supplied supplement quantities; it is not an intake or production model. */
export function calculateConditionalSupplementCosts({animalCount, days, scenarios, pricePerKgDM, currency, scope, checkpointDay = null} = {}) {
  if (!Number.isInteger(animalCount) || animalCount < 1 || animalCount > 10000) fail('animalCount must be an integer from 1 to 10,000.');
  if (!Number.isInteger(days) || days < 1 || days > 365) fail('days must be an integer from 1 to 365.');
  if (!Number.isFinite(pricePerKgDM) || pricePerKgDM < 0 || pricePerKgDM > 1e9) fail('an explicit non-negative price per kg DM is required.');
  if (typeof currency !== 'string' || !CURRENCY.test(currency)) fail('currency must be a three-letter ISO 4217 code.');
  if (!['experiment', 'branch'].includes(scope)) fail('scope must be experiment or branch.');
  if (scope === 'branch' && (!Number.isInteger(checkpointDay) || checkpointDay < 0)) fail('a branch requires its selected checkpoint day.');
  if (scope === 'experiment' && checkpointDay !== null) fail('a whole experiment cannot declare a branch checkpoint.');
  if (!Array.isArray(scenarios) || scenarios.length < 2 || scenarios.length > 10) fail('provide 2 to 10 scenario arms.');
  const ids = new Set();
  const rows = scenarios.map((scenario, index) => {
    if (!scenario || typeof scenario.id !== 'string' || !scenario.id || ids.has(scenario.id)) fail(`scenario ${index + 1} must have a unique id.`);
    ids.add(scenario.id);
    if (typeof scenario.label !== 'string' || !scenario.label || !Number.isFinite(scenario.supplementKgDMPerAnimalPerDay)
        || scenario.supplementKgDMPerAnimalPerDay < 0 || scenario.supplementKgDMPerAnimalPerDay > 4) {
      fail(`scenario ${index + 1} needs a label and supplement in 0–4 kg DM/animal/day.`);
    }
    const suppliedSupplementKgDM = scenario.supplementKgDMPerAnimalPerDay * animalCount * days;
    const expense = suppliedSupplementKgDM * pricePerKgDM;
    if (!Number.isFinite(suppliedSupplementKgDM) || !Number.isFinite(expense)) fail('calculation overflowed a finite result.');
    return {id: scenario.id, label: scenario.label, supplementKgDMPerAnimalPerDay: scenario.supplementKgDMPerAnimalPerDay,
      suppliedSupplementKgDM, expense, currency};
  });
  const baselineExpense = rows[0].expense;
  return {
    type: CONDITIONAL_SUPPLEMENT_COST_TYPE,
    version: CONDITIONAL_SUPPLEMENT_COST_VERSION,
    status: 'conditional_arithmetic',
    basis: {scope, animalCount, days, checkpointDay, pricePerKgDM, price: `${currency}/kg DM`, currency},
    units: {suppliedSupplement: 'kg DM across represented animals and applicable days', expense: currency},
    scenarios: rows.map((row, index) => ({...row, differenceFromBaseline: index === 0 ? 0 : row.expense - baselineExpense})),
    provenance: {
      source: 'user-entered supplement amounts, represented population, applicable horizon, and user-entered price',
      calculation: 'daily supplied supplement × represented animals × applicable days × user price per kg DM',
      interpretation: 'conditional expense of supplied supplement only; not observed intake, total ration cost, profit, ROI, or a production response',
    },
  };
}

export function validateConditionalSupplementCostResult(result) {
  if (!result || result.type !== CONDITIONAL_SUPPLEMENT_COST_TYPE || result.version !== CONDITIONAL_SUPPLEMENT_COST_VERSION
      || result.status !== 'conditional_arithmetic' || !Array.isArray(result.scenarios) || result.scenarios.length < 2) fail('unsupported persisted cost record.');
  const {basis} = result;
  const expected = calculateConditionalSupplementCosts({animalCount: basis?.animalCount, days: basis?.days,
    scenarios: result.scenarios.map(({id, label, supplementKgDMPerAnimalPerDay}) => ({id, label, supplementKgDMPerAnimalPerDay})),
    pricePerKgDM: basis?.pricePerKgDM, currency: basis?.currency, scope: basis?.scope, checkpointDay: basis?.checkpointDay});
  if (JSON.stringify(expected) !== JSON.stringify(result)) fail('persisted arithmetic or provenance does not match its declared inputs.');
  return true;
}
