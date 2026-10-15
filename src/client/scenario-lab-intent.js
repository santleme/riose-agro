export const SCENARIO_LAB_INTENT_TYPE = 'riose-scenario-lab-intent';
export const SCENARIO_LAB_INTENT_VERSION = 1;
const MAX_PROMPT_LENGTH = 1200;
const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const PER_DAY_EN = '(?:\\/\\s*(?:head|animal)\\s*\\/\\s*day|per\\s+(?:head|animal)\\s+per\\s+day)';
const PER_DAY_PT = '(?:\\/\\s*(?:cabe[cç]a|animal)\\s*\\/\\s*dia|por\\s+(?:cabe[cç]a|animal)\\s+por\\s+dia)';
const DRY_MATTER_UNIT = `(?:(?:dm|dry\\s+matter)\\s*${PER_DAY_EN}|(?:ms|mat[eé]ria\\s+seca)\\s*${PER_DAY_PT}|de\\s+mat[eé]ria\\s+seca\\s*${PER_DAY_PT})`;
const SUPPLEMENT_VALUE = new RegExp(`${NUMBER}\\s*kg\\s*(${DRY_MATTER_UNIT})`, 'gi');
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
  const populationMatches = [...text.matchAll(new RegExp(`${NUMBER}\\s*(?:nelore\\s+)?(?:bovinos?|cattle|animals?|cows?|head|animais|cabeças|cabecas)`, 'gi'))];
  const durationMatches = [...text.matchAll(new RegExp(`${NUMBER}\\s*(?:days?|dias?)`, 'gi'))];
  const unsupportedRequests = [];

  if (/\bbr[\s-]?corte\b|\bdmi\b|\bcms\b|dry matter intake|consumo de mat[eé]ria seca/.test(text)) {
    unsupportedRequests.push('The local parser does not draft BR-CORTE inputs. Use the separate BR-CORTE calculator and provide body weight and ADG explicitly.');
    return intentResult({unsupportedRequests});
  }
  if (/\b(adg|gmd|weight gain|ganho de peso|milk|leite|fertility|fertilidade|emission|emiss[aã]o|confidence interval|prediction interval|intervalo preditivo|probability|probabilidade)\b/.test(text)) {
    unsupportedRequests.push('The requested biological outcome or uncertainty is not computed by the illustrative FarmEngine.');
  }
  if (/\bnelore\b/.test(text)) unsupportedRequests.push('Breed-specific effects are not modeled by FarmEngine; the breed cannot change this scenario.');
  if (/\b(cold|frio|winter|inverno|drought)\b/.test(text) || (/\bseca\b/.test(text) && !/mat[eé]ria\s+seca/.test(text))) unsupportedRequests.push('That environmental condition has no corresponding supported FarmEngine input.');

  const levels = [...text.matchAll(SUPPLEMENT_VALUE)].map(match => parseNumber(match[1]));
  const populationValues = [...new Set(populationMatches.map(match => parseNumber(match[1])))];
  const durationValues = [...new Set(durationMatches.map(match => parseNumber(match[1])))];
  if (populationValues.length > 1) unsupportedRequests.push('Population is ambiguous; provide one animal count.');
  if (durationValues.length > 1) unsupportedRequests.push('Duration is ambiguous; provide one number of days.');
  if (/\b(weather|climate|clima|tempo)\b/.test(text) && !/\b(hot|heat|calor|quente|rain|rainy|chuva|chuvoso|normal)\b/.test(text)) {
    unsupportedRequests.push('State normal, hot, or rain only; FarmEngine weather is a demonstrative rule set.');
  }
  const weatherOptions = new Set();
  if (/\b(hot|heat|calor|quente)\b/.test(text)) weatherOptions.add('hot');
  if (/\b(rain|rainy|chuva|chuvoso)\b/.test(text)) weatherOptions.add('rain');
  if (/\bnormal\b/.test(text)) weatherOptions.add('normal');
  if (weatherOptions.size > 1) unsupportedRequests.push('The requested weather conditions conflict; choose one shared weather condition for the scenarios.');
  const weather = weatherOptions.has('hot') ? 'hot' : weatherOptions.has('rain') ? 'rain' : 'normal';
  if (/\b(?:also\s+)?(?:change|vary|alter|mudar|variar|alterar)\s+(?:the\s+)?(?:housing|diet|pasture|paddock|weather|climate|alojamento|dieta|pasto|piquete|clima)\b/.test(text)) {
    unsupportedRequests.push('This scenario set can vary one factor only: supplement level. Remove the additional intervention factor.');
  }
  const missingInputs = [];
  if (populationMatches.length === 0) missingInputs.push('population count');
  if (durationMatches.length === 0) missingInputs.push('duration');
  if (levels.length < 3) missingInputs.push('three explicit supplement levels with kg DM/head/day units');
  if (levels.length > 10) unsupportedRequests.push('Use at most 10 distinct scenarios including a baseline.');
  if (new Set(levels).size !== levels.length) missingInputs.push('distinct supplement levels');
  const populationCount = populationValues.length === 0 ? null : populationValues[0];
  const durationDays = durationValues.length === 0 ? null : durationValues[0];
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

/** Combine a clarification reply with its original request without interpreting it as privileged instructions. */
export function combineScenarioLabClarification(originalPrompt, clarification) {
  if (typeof originalPrompt !== 'string' || !originalPrompt.trim() || originalPrompt.length > MAX_PROMPT_LENGTH) fail('original clarification request is invalid.');
  if (typeof clarification !== 'string' || !clarification.trim()) fail('clarification reply must not be empty.');
  const reply = clarification.trim();
  if (reply.startsWith(originalPrompt.trim())) return reply;
  const replyLooksComplete = [...reply.matchAll(SUPPLEMENT_VALUE)].length >= 3
    && /\b(?:bovinos?|cattle|animals?|animais)\b/i.test(reply)
    && /\b(?:days?|dias?)\b/i.test(reply);
  const combined = replyLooksComplete ? reply : `${originalPrompt.trim()}\n${reply}`;
  if (combined.length > MAX_PROMPT_LENGTH) throw new RangeError(`Prompt must be ${MAX_PROMPT_LENGTH.toLocaleString()} characters or fewer.`);
  return combined;
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
  const supplementAssumption = intent.assumptions.find(item => item.field === 'supplementLevelsKgDMPerHeadPerDay');
  const weatherAssumption = intent.assumptions.find(item => item.field === 'weather');
  if (supplementAssumption.origin !== 'user prompt' || Object.hasOwn(supplementAssumption, 'value')) fail('supplement assumption must preserve explicit user-supplied values.');
  if (weatherAssumption.value !== intent.weather
      || (intent.weather !== 'normal' && weatherAssumption.origin !== 'user prompt')
      || (weatherAssumption.origin === 'scenario-lab default' && intent.weather !== 'normal')) fail('weather assumption provenance must match the requested or declared default weather.');
  if (intent.ready && (count === null || !Number.isInteger(count) || count < 1 || count > 10000
      || days === null || !Number.isInteger(days) || days < 1 || days > 365
      || intent.supplementLevelsKgDMPerHeadPerDay.length < 3
      || intent.supplementLevelsKgDMPerHeadPerDay.some(value => value < 0 || value > 4)
      || new Set(intent.supplementLevelsKgDMPerHeadPerDay).size !== intent.supplementLevelsKgDMPerHeadPerDay.length)) fail('ready intent is missing executable inputs.');
  return true;
}
