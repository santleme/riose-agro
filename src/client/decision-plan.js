import {interpretScenarioLabPrompt, validateScenarioLabIntent} from './scenario-lab-intent.js';
import {interpretExperimentPrompt} from './population-experiment.js';
import {createBrCorteSensitivityManifest} from './br-corte-sensitivity.js';
import {createBrCorteDmiScenarioManifest} from './br-corte-scenario.js';

export const DECISION_LABELS = ['create_experiment', 'compare_scenarios', 'sensitivity_analysis', 'conditional_cost',
  'scientific_explanation', 'inspect_results', 'clarification_needed', 'unsupported_request'];
export const CAPABILITIES = ['farm_pair_comparison', 'farm_comparison', 'br_corte_single', 'br_corte_scenarios', 'br_corte_sensitivity', 'evidence', 'results', 'none'];
export const EVIDENCE = Object.freeze({
  farm_demonstrative: 'FarmEngine uses deterministic demonstrative rules for weight, intake and weather. Its outputs do not establish real weight gain, intervention effects or management recommendations.',
  br_corte_conditional: 'BR-CORTE 2023 Eq. 2.6 estimates total dry matter intake conditional on user-supplied average daily gain (ADG/GMD). ADG is an input, never a predicted output. Domain: growing Zebu cattle on tropical pasture with supplementation; no Riose-specific calibration.',
  behavior_no_go: 'No validated individual rumination forecast is available. The Perea semi-Markov candidate remains NO-GO and is not integrated into the engine.',
  conditional_cost: 'Conditional supplement expense is supplied kg dry matter × animals × days × user price per kg dry matter. This is not total ration cost, profit, ROI or observed intake.',
  sensitivity_noncausal: 'A deterministic equation sweep holds other inputs fixed. It is a mathematical response, not a calibrated probability, uncertainty interval or evidence of a causal supplementation effect.',
});
const PARAMETER_PROPERTIES = {
  populationCount: {type: ['integer', 'null']}, durationDays: {type: ['integer', 'null']},
  bodyWeightKg: {type: ['number', 'null']}, adgKgPerDay: {type: ['number', 'null']},
  supplementLevels: {type: 'array', maxItems: 10, items: {type: 'number'}},
  sweepMinimum: {type: ['number', 'null']}, sweepMaximum: {type: ['number', 'null']}, sweepStep: {type: ['number', 'null']},
  weather: {type: ['string', 'null'], enum: ['normal', 'hot', 'rain', null]},
  pricePerKgDM: {type: ['number', 'null']}, currency: {type: ['string', 'null']},
};
export const DECISION_PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['type', 'version', 'intent', 'capability', 'parameters', 'missingInputs', 'evidenceIds'],
  properties: {
    type: {type: 'string', enum: ['riose-decision-plan']}, version: {type: 'integer', enum: [1]},
    intent: {type: 'string', enum: DECISION_LABELS}, capability: {type: 'string', enum: CAPABILITIES},
    parameters: {type: 'object', additionalProperties: false, required: Object.keys(PARAMETER_PROPERTIES), properties: PARAMETER_PROPERTIES},
    missingInputs: {type: 'array', maxItems: 12, items: {type: 'string', maxLength: 160}},
    evidenceIds: {type: 'array', maxItems: 5, items: {type: 'string', enum: Object.keys(EVIDENCE)}},
  },
};
const normalize = prompt => prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const exact = (value, keys) => value && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const fail = message => { throw new TypeError(`Decision plan: ${message}`); };

/** Conservative lexical routing baseline; it cannot reject, authorize or execute tools. */
export function classifyIntentLocally(prompt) {
  const text = normalize(prompt);
  if (/ignore.*(?:confirm|valid)|shell|fabricat|(?:preveja|predict exactly|forecast exactly).*rumin/.test(text)) return 'unsupported_request';
  if (/sensib|sensitiv|\bsweep\b|\bvarra\b|mantendo.*(?:gmd|constant)|with others fixed/.test(text)) return 'sensitivity_analysis';
  if (/custo|despesa|cost|expense|expenditure/.test(text)) return 'conditional_cost';
  if (/limitac|limitation|hipotes|hypothes|provenance|evidenc|consegue.*prever|can.*predict|br[ -]?corte/.test(text)) return 'scientific_explanation';
  if (/resultados|results|outputs|experimento concluido|completed|existing run/.test(text)) return 'inspect_results';
  if (/compar|alternativ|strateg/.test(text)) return 'compare_scenarios';
  if (/crie|create|draft|simul|experimento/.test(text)) return 'create_experiment';
  return 'clarification_needed';
}

export function emptyDecisionPlan(prompt) {
  const intent = classifyIntentLocally(prompt);
  return {type: 'riose-decision-plan', version: 1, intent,
    capability: ['scientific_explanation', 'unsupported_request'].includes(intent) ? 'evidence' : intent === 'inspect_results' ? 'results' : 'none',
    parameters: Object.fromEntries(Object.keys(PARAMETER_PROPERTIES).map(key => [key, key === 'supplementLevels' ? [] : null])),
    missingInputs: [], evidenceIds: intent === 'unsupported_request' ? ['behavior_no_go'] : intent === 'scientific_explanation' ? ['br_corte_conditional', 'farm_demonstrative'] : []};
}

export function validateDecisionPlan(plan) {
  if (!exact(plan, DECISION_PLAN_SCHEMA.required) || plan.type !== 'riose-decision-plan' || plan.version !== 1
      || !DECISION_LABELS.includes(plan.intent) || !CAPABILITIES.includes(plan.capability)
      || !exact(plan.parameters, Object.keys(PARAMETER_PROPERTIES))) fail('invalid version, keys or capability.');
  const p = plan.parameters;
  for (const key of ['populationCount', 'durationDays', 'bodyWeightKg', 'adgKgPerDay', 'sweepMinimum', 'sweepMaximum', 'sweepStep', 'pricePerKgDM']) {
    if (p[key] !== null && !Number.isFinite(p[key])) fail(`${key} must be finite or missing.`);
  }
  if (!Array.isArray(p.supplementLevels) || p.supplementLevels.length > 10 || p.supplementLevels.some(x => !Number.isFinite(x))) fail('invalid supplement inputs.');
  if (![null, 'normal', 'hot', 'rain'].includes(p.weather) || (p.currency !== null && !/^[A-Z]{3}$/.test(p.currency))) fail('invalid weather or currency.');
  for (const key of ['missingInputs', 'evidenceIds']) {
    if (!Array.isArray(plan[key]) || plan[key].length > 12 || plan[key].some(x => typeof x !== 'string' || x.length > 160)) fail(`invalid ${key}.`);
  }
  if (plan.evidenceIds.some(id => !Object.hasOwn(EVIDENCE, id))) fail('unknown evidence.');
  if (p.populationCount !== null && (!Number.isInteger(p.populationCount) || p.populationCount < 1 || p.populationCount > 10000)) fail('population outside 1–10,000.');
  if (p.durationDays !== null && (!Number.isInteger(p.durationDays) || p.durationDays < 1 || p.durationDays > 365)) fail('duration outside 1–365 days.');
  if (p.bodyWeightKg !== null && (p.bodyWeightKg < 133 || p.bodyWeightKg > 474)) fail('body weight outside published 133–474 kg domain.');
  if (p.adgKgPerDay !== null && (p.adgKgPerDay < -0.18 || p.adgKgPerDay > 1.34)) fail('supplied ADG outside published domain.');
  if (p.pricePerKgDM !== null && (p.pricePerKgDM < 0 || p.pricePerKgDM > 1e9)) fail('price outside supported arithmetic bounds.');
  const maxSupplement = ['farm_comparison','farm_pair_comparison'].includes(plan.capability) ? 4 : 5.32;
  if (p.supplementLevels.some(x => x < 0 || x > maxSupplement) || new Set(p.supplementLevels).size !== p.supplementLevels.length) fail('supplement inputs outside domain or duplicated.');
  return plan;
}

/** Independent input/domain reconciliation. It creates a review proposal and never calculates outputs. */
export function reconcileDecisionPlan(plan, prompt, previousPrompt = '') {
  validateDecisionPlan(plan);
  plan = structuredClone(plan);
  const p = plan.parameters;
  const source = `${previousPrompt}\n${prompt}`;
  const text = normalize(source);
  // Missing-input authority is local: providers often list irrelevant nullable fields.
  // The selected capability's required inputs are checked below from first principles.
  const missing = new Set(['none', 'evidence', 'results'].includes(plan.capability) ? plan.missingInputs : []);
  const numericTokens = new Set((source.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map(x => Number(x.replace(',', '.'))));
  // Every proposed number must occur in the user context; no model-created defaults.
  for (const value of [...Object.values(p).filter(x => typeof x === 'number'), ...p.supplementLevels]) {
    if (!numericTokens.has(value)) fail('the provider supplied a number absent from the user request.');
  }
  for (const [field, expression] of [['populationCount', /(\d+(?:[.,]\d+)?)\s*(?:nelore\s+)?(?:bovinos?|cattle|animals?|animais)\b/gi],
    ['durationDays', /(\d+(?:[.,]\d+)?)\s*(?:days?|dias?)\b/gi]]) {
    const requested = [...normalize(prompt).matchAll(expression)].map(match => Number(match[1].replace(',', '.')));
    if (new Set(requested).size > 1) fail(`ambiguous ${field}.`);
    if (requested.length && p[field] !== null && p[field] !== requested[0]) fail(`provider changed explicit ${field}.`);
  }
  if (classifyIntentLocally(prompt) === 'unsupported_request'
      || /^\s*(preveja|predict|forecast|prever)/.test(normalize(prompt)) && /rumin|weight gain|ganho de peso/.test(normalize(prompt))) {
    plan.intent = 'unsupported_request'; plan.capability = 'evidence'; plan.evidenceIds = ['behavior_no_go', 'farm_demonstrative'];
  }
  if (['scientific_explanation', 'unsupported_request'].includes(plan.intent)) {
    plan.capability = 'evidence';
    plan.evidenceIds = [...new Set([...plan.evidenceIds, 'br_corte_conditional', 'farm_demonstrative', ...(plan.intent === 'unsupported_request' ? ['behavior_no_go'] : [])])];
  }
  const executable = ['farm_pair_comparison','farm_comparison','br_corte_single','br_corte_scenarios','br_corte_sensitivity'].includes(plan.capability);
  if (executable) {
    if (['farm_comparison','farm_pair_comparison'].includes(plan.capability) && /br[ -]?corte|\bcms\b|\bdmi\b/.test(normalize(prompt))) fail('FarmEngine cannot substitute for a requested scientific calculation.');
    if (plan.capability === 'farm_comparison') {
      for (const unsupported of interpretScenarioLabPrompt(prompt).unsupportedRequests) missing.add(unsupported);
    } else if (plan.capability === 'farm_pair_comparison') {
      const paired = interpretExperimentPrompt(source);
      for (const unsupported of paired.unsupported_requests) missing.add(unsupported);
      if (paired.missing_inputs.length) for (const item of paired.missing_inputs) missing.add(item);
      if (paired.baseline.supplement !== p.supplementLevels[0] || paired.intervention.supplement !== p.supplementLevels[1]) fail('provider pair does not match the explicit supplement values or order.');
      if (paired.population.count !== p.populationCount || paired.duration.days !== p.durationDays || paired.baseline.weather !== p.weather) fail('provider pair does not match the explicit herd, duration or weather.');
    }
    if (!/kg\s*(?:de\s*)?(?:dm|ms|materia seca|dry matter)[\s\S]{0,70}(?:head|animal|cabeca)[\s\S]{0,30}(?:day|dia)/.test(text)) missing.add('supplement in kg DM/head/day (explicit dry-matter basis)');
    if (plan.capability !== 'br_corte_single') {
      if (p.populationCount === null) missing.add('animal count');
      if (p.durationDays === null) missing.add('duration in days');
    }
    if (plan.capability.startsWith('br_corte')) {
      if (/dairy|holstein|lactat|mature cows|vacas adultas|gestantes|feedlot|confinamento/.test(normalize(prompt))) missing.add('requested population/system is outside growing Zebu on tropical pasture');
      const weights = [...normalize(prompt).matchAll(/(-?\d+(?:[.,]\d+)?)\s*kg\b(?!\s*(?:\/|dm\b|ms\b|dry\b|de\s+(?:materia|ms)))/g)].map(match => Number(match[1].replace(',', '.')));
      if (new Set(weights).size > 1) fail('ambiguous body weight.');
      if (weights.length === 1 && p.bodyWeightKg !== null && p.bodyWeightKg !== weights[0]) fail('provider changed explicit body weight.');
      const adg = normalize(prompt).match(/(?:adg|gmd|average daily gain|ganho medio diario)[a-z\s:=-]{0,30}(-?\d+(?:[.,]\d+)?)\s*kg\s*(?:\/|per\s+)(?:day|dia)/);
      if (adg && p.adgKgPerDay !== null && p.adgKgPerDay !== Number(adg[1].replace(',', '.'))) fail('provider changed supplied ADG.');
      if (p.bodyWeightKg === null) missing.add('body weight in kg');
      if (p.adgKgPerDay === null) missing.add('user-supplied ADG/GMD in kg/day');
      if (!/(zebu|nelore|tabapua)/.test(text) || !/(growing|crescimento|recria)/.test(text)
          || !/(tropical)/.test(text) || !/(pasture|pasto|pastagem)/.test(text)) missing.add('confirm growing Zebu cattle on tropical pasture');
    }
    if (plan.capability === 'br_corte_sensitivity') {
      for (const key of ['sweepMinimum', 'sweepMaximum', 'sweepStep']) if (p[key] === null) missing.add(key);
    } else if (plan.capability === 'farm_pair_comparison' && p.supplementLevels.length !== 2) missing.add('two distinct supplement levels for the Product pair comparison');
    else if (plan.capability !== 'farm_pair_comparison' && p.supplementLevels.length < (plan.capability === 'br_corte_single' ? 1 : 3)) missing.add(plan.capability === 'br_corte_single' ? 'one supplement input' : 'three explicit supplement alternatives');
    if (plan.capability === 'br_corte_single' && p.supplementLevels.length !== 1) missing.add('one supplement input for a single estimate');
    const weatherExplicit = {normal: /\bnormal\b/, hot: /\bhot\b|heat|calor|quente/, rain: /rain|chuva|chuvoso/};
    if (['farm_comparison','farm_pair_comparison'].includes(plan.capability) && (p.weather === null || !weatherExplicit[p.weather].test(text))) missing.add('shared weather: normal, hot or rain (demonstrative rule)');
    if (plan.capability === 'farm_comparison') {
      const latestWeather = Object.entries(weatherExplicit).filter(([, expression]) => expression.test(normalize(prompt))).map(([category]) => category);
      if (latestWeather.length === 1 && p.weather !== null && p.weather !== latestWeather[0]) fail('provider changed explicit weather.');
      const localLevels = interpretScenarioLabPrompt(prompt).supplementLevelsKgDMPerHeadPerDay;
      if (localLevels.length >= 3 && JSON.stringify(localLevels) !== JSON.stringify(p.supplementLevels)) fail('provider changed explicit supplement levels or baseline order.');
    }
    if (p.pricePerKgDM !== null && p.currency === null) missing.add('currency and price per kg dry matter');
    if (p.pricePerKgDM !== null && p.currency !== null) {
      const statedCurrency = /r\$|\bbrl\b/.test(text) ? 'BRL' : /us\$|\busd\b/.test(text) ? 'USD' : null;
      if (statedCurrency && statedCurrency !== p.currency || !statedCurrency && !text.includes(p.currency.toLowerCase())) fail('provider changed or invented the price currency.');
      if (!/(?:price|preco|r\$|brl|usd)[\s\S]{0,60}(?:per|por|\/)\s*kg\s*(?:dm|ms|de\s*(?:materia seca|ms)|dry matter)/.test(text)) missing.add('explicit supplement price basis per kg dry matter');
    }
    if (plan.intent === 'conditional_cost' && p.pricePerKgDM === null) missing.add('user price per kg dry matter and currency');
  }
  plan.missingInputs = [...missing].slice(0, 12);
  if (executable && !plan.missingInputs.length) {
    if (plan.capability === 'farm_comparison') validateScenarioLabIntent(decisionPlanToFarmIntent(plan));
    if (plan.capability === 'br_corte_scenarios') createBrCorteDmiScenarioManifest(decisionPlanScientificInputs(plan));
    if (plan.capability === 'br_corte_sensitivity') createBrCorteSensitivityManifest(decisionPlanSensitivityInputs(plan));
  }
  return validateDecisionPlan(plan);
}

export function decisionPlanScientificInputs(plan) {
  const p = plan.parameters;
  return {bodyWeightKg: p.bodyWeightKg, adgKgPerDay: p.adgKgPerDay, animalCount: p.populationCount,
    durationDays: p.durationDays, supplementLevelsKgDMPerHeadPerDay: p.supplementLevels,
    supplementPricePerKgDM: p.pricePerKgDM, currency: p.pricePerKgDM === null ? null : p.currency};
}

export function decisionPlanSensitivityInputs(plan) {
  const {supplementLevelsKgDMPerHeadPerDay: _levels, ...inputs} = decisionPlanScientificInputs(plan);
  return {...inputs, minimumSupplementKgDMPerHeadPerDay: plan.parameters.sweepMinimum,
    maximumSupplementKgDMPerHeadPerDay: plan.parameters.sweepMaximum, stepKgDMPerHeadPerDay: plan.parameters.sweepStep};
}

export function decisionPlanToFarmIntent(plan) {
  const p = plan.parameters;
  return {type: 'riose-scenario-lab-intent', version: 1, ready: !plan.missingInputs.length,
    population: {count: p.populationCount}, duration: {days: p.durationDays}, supplementLevelsKgDMPerHeadPerDay: p.supplementLevels,
    weather: p.weather, assumptions: [{field: 'supplementLevelsKgDMPerHeadPerDay', origin: 'user prompt'},
      {field: 'weather', value: p.weather, origin: 'user prompt'}], missingInputs: plan.missingInputs, unsupportedRequests: []};
}

export function deterministicDecisionPlan(prompt) {
  const plan = emptyDecisionPlan(prompt);
  if (['create_experiment', 'compare_scenarios'].includes(plan.intent)) {
    try {
      const explicitLevels = interpretScenarioLabPrompt(prompt).supplementLevelsKgDMPerHeadPerDay;
      const enumeratesThree = /\d+(?:[.,]\d+)?\s*,\s*\d+(?:[.,]\d+)?\s*(?:,\s*\d+(?:[.,]\d+)?|and\s+\d+(?:[.,]\d+)?|e\s+\d+(?:[.,]\d+)?)/i.test(prompt);
      const pair = explicitLevels.length >= 3 || enumeratesThree ? null : interpretExperimentPrompt(prompt);
      const origins = new Map(pair.assumptions.map(item => [item.field, item.origin]));
      if (pair.missing_inputs.length === 0 && pair.unsupported_requests.length === 0
          && pair.baseline.supplement !== pair.intervention.supplement
          && ['population.count','duration.days','weather'].every(field => origins.get(field) === 'user prompt')) {
        plan.capability = 'farm_pair_comparison';
        Object.assign(plan.parameters, {populationCount: pair.population.count, durationDays: pair.duration.days,
          supplementLevels: [pair.baseline.supplement, pair.intervention.supplement], weather: pair.baseline.weather});
        plan.missingInputs = []; plan.evidenceIds = ['farm_demonstrative']; return validateDecisionPlan(plan);
      }
    } catch { /* Fall through to the Scenario Lab planner for multi-arm or incomplete requests. */ }
    const intent = interpretScenarioLabPrompt(prompt);
    plan.capability = 'farm_comparison';
    Object.assign(plan.parameters, {populationCount: intent.population.count, durationDays: intent.duration.days,
      supplementLevels: intent.supplementLevelsKgDMPerHeadPerDay, weather: intent.weather});
    plan.missingInputs = [...intent.missingInputs, ...intent.unsupportedRequests];
    plan.evidenceIds = ['farm_demonstrative'];
  } else if (['sensitivity_analysis', 'conditional_cost', 'clarification_needed'].includes(plan.intent)) {
    plan.missingInputs = ['Use the structured BR-CORTE form or specify the operation, body weight, supplied ADG, supplement units and applicability.'];
  }
  return validateDecisionPlan(plan);
}
