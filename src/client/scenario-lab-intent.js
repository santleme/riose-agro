export const SCENARIO_LAB_INTENT_TYPE = 'riose-scenario-lab-intent';
export const SCENARIO_LAB_INTENT_VERSION = 1;
const MAX_PROMPT_LENGTH = 1200;
const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const SUPPLEMENT_VALUE = new RegExp(`${NUMBER}\\s*kg(?:\\s*(?:dm|ms))?`, 'gi');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const parseNumber = value => Number(value.replace(',', '.'));
const fail = message => { throw new TypeError(`Scenario lab intent is invalid: ${message}`); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function intentResult({populationCount = null, durationDays = null, levels = [], weather = 'normal', weatherExplicit = false, missingInputs = [], unsupportedRequests = []}) {
  return {
    type: SCENARIO_LAB_INTENT_TYPE,
    version: SCENARIO_LAB_INTENT_VERSION,
    ready: missingInputs.length === 0 && unsupportedRequests.length === 0,
    population: {count: populationCount},
    duration: {days: durationDays},
    supplementLevelsKgDMPerHeadPerDay: levels,
    weather,
    assumptions: [
      {field: 'supplementLevelsKgDMPerHeadPerDay', origin: 'user prompt'},
      {field: 'weather', value: weather, origin: weatherExplicit ? 'user prompt' : 'scenario-lab default'},
    ],
    missingInputs,
    unsupportedRequests,
  };
}

/** Interpret only explicit scenario-lab fields. This local parser never runs an experiment. */
export function interpretScenarioLabPrompt(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Describe a scenario first.');
  if (prompt.length > MAX_PROMPT_LENGTH) throw new RangeError(`Prompt must be ${MAX_PROMPT_LENGTH.toLocaleString()} characters or fewer.`);
  const text = prompt.toLowerCase();
  const populationMatch = text.match(new RegExp(`${NUMBER}\\s*(?:nelore\\s+)?(?:bovinos?|cattle|animals?|cows?|head|animais|cabeças|cabecas)`, 'i'));
  const durationMatch = text.match(new RegExp(`${NUMBER}\\s*(?:days?|dias?)`, 'i'));
  const unsupportedRequests = [];

  if (/\bbr[\s-]?corte\b|\bdmi\b|\bcms\b|dry matter intake|consumo de mat[eé]ria seca/.test(text)) {
    unsupportedRequests.push('The local parser does not draft BR-CORTE inputs. Use the separate BR-CORTE calculator and provide body weight and ADG explicitly.');
    return intentResult({unsupportedRequests});
  }
  if (/\b(adg|gmd|weight gain|ganho de peso|milk|leite|fertility|fertilidade|emission|emiss[aã]o|confidence interval|prediction interval|intervalo preditivo|probability|probabilidade)\b/.test(text)) {
    unsupportedRequests.push('The requested biological outcome or uncertainty is not computed by the illustrative FarmEngine.');
  }
  if (/\bnelore\b/.test(text)) unsupportedRequests.push('Breed-specific effects are not modeled by FarmEngine; the breed cannot change this scenario.');
  if (/\b(cold|frio|winter|inverno|drought|seca)\b/.test(text)) unsupportedRequests.push('That environmental condition has no corresponding supported FarmEngine input.');

  const levels = [...text.matchAll(SUPPLEMENT_VALUE)].map(match => parseNumber(match[1]));
  if (/\b(weather|climate|clima|tempo)\b/.test(text) && !/\b(hot|heat|calor|quente|rain|rainy|chuva|chuvoso|normal)\b/.test(text)) {
    unsupportedRequests.push('State normal, hot, or rain only; FarmEngine weather is a demonstrative rule set.');
  }
  const weather = /\b(hot|heat|calor|quente)\b/.test(text) ? 'hot'
    : /\b(rain|rainy|chuva|chuvoso)\b/.test(text) ? 'rain' : 'normal';
  const missingInputs = [];
  if (populationMatch === null) missingInputs.push('population count');
  if (durationMatch === null) missingInputs.push('duration');
  if (levels.length < 3) missingInputs.push('three explicit supplement levels with kg units');
  if (levels.length > 10) unsupportedRequests.push('Use at most 10 distinct scenarios including a baseline.');
  if (new Set(levels).size !== levels.length) missingInputs.push('distinct supplement levels');
  const populationCount = populationMatch === null ? null : parseNumber(populationMatch[1]);
  const durationDays = durationMatch === null ? null : parseNumber(durationMatch[1]);
  if (populationCount !== null && (!Number.isInteger(populationCount) || populationCount < 1 || populationCount > 10000)) {
    unsupportedRequests.push('Population size must be an integer from 1 to 10,000.');
  }
  if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
    unsupportedRequests.push('Duration must be an integer from 1 to 365 days.');
  }
  if (levels.some(value => !finite(value) || value < 0 || value > 4)) {
    unsupportedRequests.push('Supplement levels must be from 0 to 4 kg DM/head/day in FarmEngine.');
  }
  return intentResult({populationCount, durationDays, levels: levels.slice(0, 10), weather, weatherExplicit: weather !== 'normal' || /\bnormal\b/.test(text), missingInputs, unsupportedRequests});
}

export function validateScenarioLabIntent(intent) {
  const keys = ['type', 'version', 'ready', 'population', 'duration', 'supplementLevelsKgDMPerHeadPerDay', 'weather', 'assumptions', 'missingInputs', 'unsupportedRequests'];
  if (!isRecord(intent) || Object.keys(intent).sort().join('|') !== [...keys].sort().join('|')) fail('root must contain exactly the versioned intent fields.');
  if (intent.type !== SCENARIO_LAB_INTENT_TYPE || intent.version !== SCENARIO_LAB_INTENT_VERSION) fail('type/version is not supported.');
  if (typeof intent.ready !== 'boolean' || !isRecord(intent.population) || Object.keys(intent.population).sort().join('|') !== 'count'
      || !isRecord(intent.duration) || Object.keys(intent.duration).sort().join('|') !== 'days') fail('population, duration, or ready has an invalid shape.');
  const count = intent.population.count;
  const days = intent.duration.days;
  if (count !== null && (!finite(count) || Math.abs(count) > 1_000_000)) fail('population.count is not a bounded finite request value.');
  if (days !== null && (!finite(days) || Math.abs(days) > 1_000_000)) fail('duration.days is not a bounded finite request value.');
  if (!Array.isArray(intent.supplementLevelsKgDMPerHeadPerDay) || intent.supplementLevelsKgDMPerHeadPerDay.length > 10
      || intent.supplementLevelsKgDMPerHeadPerDay.some(value => !finite(value) || Math.abs(value) > 1_000_000)) fail('supplement levels are not bounded finite request values.');
  if (!['normal', 'hot', 'rain'].includes(intent.weather)) fail('weather is outside the FarmEngine rule-set options.');
  const allowedAssumptionFields = new Set(['supplementLevelsKgDMPerHeadPerDay', 'weather']);
  if (!Array.isArray(intent.assumptions) || intent.assumptions.length !== 2 || intent.assumptions.some(item => !isRecord(item)
      || Object.keys(item).some(key => !['field', 'value', 'origin'].includes(key))
      || typeof item.field !== 'string' || !allowedAssumptionFields.has(item.field)
      || typeof item.origin !== 'string' || !['user prompt', 'scenario-lab default'].includes(item.origin)
      || (item.value !== undefined && !(item.value === null || typeof item.value === 'string' && item.value.length <= 80 || finite(item.value))))) fail('assumptions are invalid.');
  for (const field of ['missingInputs', 'unsupportedRequests']) {
    if (!Array.isArray(intent[field]) || intent[field].length > 12 || intent[field].some(value => typeof value !== 'string' || value.length > 240)) fail(`${field} must be a bounded string list.`);
  }
  if (intent.ready !== (intent.missingInputs.length === 0 && intent.unsupportedRequests.length === 0)) fail('ready must match clarification and unsupported-request lists.');
  if (new Set(intent.assumptions.map(item => item.field)).size !== 2) fail('assumption fields must be unique.');
  if (intent.ready && (count === null || !Number.isInteger(count) || count < 1 || count > 10000
      || days === null || !Number.isInteger(days) || days < 1 || days > 365
      || intent.supplementLevelsKgDMPerHeadPerDay.length < 3
      || intent.supplementLevelsKgDMPerHeadPerDay.some(value => value < 0 || value > 4)
      || new Set(intent.supplementLevelsKgDMPerHeadPerDay).size !== intent.supplementLevelsKgDMPerHeadPerDay.length)) fail('ready intent is missing executable inputs.');
  return true;
}
