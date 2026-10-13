export const UNCERTAINTY_CLASSIFICATIONS = new Set([
  'not-estimable',
  'partially-estimable',
  'not-applicable',
]);

export function validateOutcomeUncertaintyClassifications(outcomes, sources) {
  const errors = [];
  const requireCondition = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const sourceIds = (sources ?? []).map(item => item?.source);
  const expectedSources = new Set(sourceIds);

  requireCondition(sourceIds.length > 0, 'uncertainty source categories are required');
  requireCondition(expectedSources.size === sourceIds.length, 'uncertainty source categories must be unique');

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
