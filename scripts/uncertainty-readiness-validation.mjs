export const UNCERTAINTY_CLASSIFICATIONS = new Set([
  'not-estimable',
  'partially-estimable',
  'not-applicable',
]);

export const REQUIRED_UNCERTAINTY_SOURCES = new Set([
  'measurement',
  'parameter',
  'between-animal',
  'between-farm-year-region-system',
  'structural-model-error',
  'extrapolation-and-missing-inputs',
]);

export function validateIssue15ReadinessContract(inventory) {
  const errors = [];
  const requireCondition = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const sources = inventory?.sourcesOfUncertainty;
  requireCondition(Array.isArray(sources), 'issue #15 uncertainty sources must be an array');
  const sourceIds = Array.isArray(sources) ? sources.map(item => item?.source) : [];
  requireCondition(
    sourceIds.length === REQUIRED_UNCERTAINTY_SOURCES.size
      && new Set(sourceIds).size === sourceIds.length
      && [...REQUIRED_UNCERTAINTY_SOURCES].every(source => sourceIds.includes(source)),
    'issue #15 must classify the six required uncertainty sources exactly once',
  );

  const gate = inventory?.evaluationGate ?? {};
  const freeze = gate.mustFreezeBeforeHoldout;
  requireCondition(Array.isArray(freeze), 'holdout freeze requirements must be an array');
  const freezeItems = Array.isArray(freeze) ? freeze : [];
  for (const concept of ['estimand and units', 'engine version and parameters', 'cluster split', 'interval construction method']) {
    requireCondition(freezeItems.some(item => typeof item === 'string' && item.toLowerCase().includes(concept)),
      `holdout freeze requirements must include ${concept}`);
  }
  const splitPolicy = typeof gate.splitPolicy === 'string' ? gate.splitPolicy.toLowerCase() : '';
  requireCondition(splitPolicy.includes('animal'),
    'split policy must keep all observations from an animal together');
  requireCondition(splitPolicy.includes('farm') || splitPolicy.includes('site') || splitPolicy.includes('year'),
    'split policy must address relevant higher-level clusters');
  requireCondition(!splitPolicy.includes('random row'), 'random row splits are prohibited');

  const reportFields = gate.requiredReport;
  requireCondition(Array.isArray(reportFields), 'required evaluation report fields must be an array');
  const reportText = (Array.isArray(reportFields) ? reportFields : [])
    .filter(item => typeof item === 'string').join(' ').toLowerCase();
  for (const concept of ['error', 'bias', 'nominal and empirical coverage', 'mean interval width', 'subgroup', 'independent-cluster counts']) {
    requireCondition(reportText.includes(concept), `required evaluation report must include ${concept}`);
  }
  const promotion = typeof gate.promotionRule === 'string' ? gate.promotionRule.toLowerCase() : '';
  requireCondition(promotion.includes('independent') && promotion.includes('coverage'),
    'interval promotion must require independent evaluation with coverage evidence');
  requireCondition(promotion.includes('deterministic sensitivity') && promotion.includes('do not satisfy'),
    'interval promotion must reject deterministic sensitivity as calibration evidence');
  requireCondition(promotion.includes('bootstrap') && promotion.includes('do not satisfy'),
    'interval promotion must reject metric bootstrap intervals as prediction calibration evidence');
  return errors;
}

export function validateOutcomeUncertaintyClassifications(outcomes, sources) {
  const errors = [];
  const requireCondition = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const sourceIds = (sources ?? []).map(item => item?.source);
  const expectedSources = new Set(sourceIds);

  requireCondition(sourceIds.length > 0, 'uncertainty source categories are required');
  requireCondition(expectedSources.size === sourceIds.length, 'uncertainty source categories must be unique');
  requireCondition(
    sourceIds.length === REQUIRED_UNCERTAINTY_SOURCES.size
      && [...REQUIRED_UNCERTAINTY_SOURCES].every(source => expectedSources.has(source)),
    'all six required uncertainty source categories must be present',
  );

  for (const outcome of outcomes ?? []) {
    const outcomeId = outcome?.id ?? '<unknown outcome>';
    const classifications = outcome?.uncertaintyBySource;
    requireCondition(Array.isArray(classifications), `${outcomeId}: per-source uncertainty classifications are required`);
    if (!Array.isArray(classifications)) continue;

    const seen = new Set();
    for (const classification of classifications) {
      const source = classification?.source;
      requireCondition(expectedSources.has(source), `${outcomeId}: unknown uncertainty source ${source}`);
      requireCondition(!seen.has(source), `${outcomeId}: duplicate uncertainty source ${source}`);
      seen.add(source);
      requireCondition(
        UNCERTAINTY_CLASSIFICATIONS.has(classification?.classification),
        `${outcomeId}/${source}: classification must be not-estimable, partially-estimable, or not-applicable`,
      );
      requireCondition(
        typeof classification?.reason === 'string' && classification.reason.trim().length > 0,
        `${outcomeId}/${source}: classification reason is required`,
      );
    }

    for (const source of expectedSources) {
      requireCondition(seen.has(source), `${outcomeId}: missing uncertainty classification for ${source}`);
    }
  }

  return errors;
}
