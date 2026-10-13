const EVIDENCE_STATES = Object.freeze({
  observed: 'OBSERVED',
  derived: 'SIMULATED',
  hypothesis: 'ASSUMED',
  missing: 'MISSING',
  'not-applicable': 'MISSING'
});

export function resolveFieldEvidence(snapshot, fieldPath) {
  const field = Array.isArray(snapshot?.observations)
    ? snapshot.observations.find(item => item?.path === fieldPath)
    : undefined;
  if (!field) {
    return {
      state: 'MISSING', status: 'missing', fieldPath, sourceId: null,
      sourceLocator: null, population: null, period: null,
      freshness: {status: 'not-recorded', reason: 'Campo não encontrado no snapshot.'}, source: null
    };
  }

  const status = typeof field.status === 'string' ? field.status : 'missing';
  const state = EVIDENCE_STATES[status] ?? 'MISSING';
  const source = Array.isArray(snapshot?.sourceCatalog)
    ? snapshot.sourceCatalog.find(item => item?.id === field.sourceId) ?? null
    : null;
  return {
    state,
    status,
    fieldPath: field.path ?? fieldPath,
    sourceId: field.sourceId ?? null,
    sourceLocator: field.sourceLocator ?? null,
    population: field.populationValidity ?? null,
    period: field.period ?? null,
    freshness: field.observedAt
      ? {observedAt: field.observedAt}
      : {status: 'not-recorded', reason: field.timeMissingReason ?? 'Data de observação não registrada.'},
    source: source ? {id: source.id, title: source.title, url: source.url, version: source.version} : null
  };
}

export const EVIDENCE_STATE_MAP = EVIDENCE_STATES;
