import os from 'node:os';

export const EXECUTOR_PROFILE_VERSION = 'riose-executor-profile/1';

const BACKEND_ORDER = new Map([
  ['local-js', 0],
  ['local-rust', 1],
  ['modal-gpu', 2],
]);

function sameWorkload(measurement, workload) {
  return measurement.operation === workload.operation
    && measurement.scenarioCount === workload.scenarioCount
    && measurement.animalCount === workload.animalCount
    && measurement.days === workload.days
    && measurement.hours === workload.hours;
}

/** Select only an exact workload measurement; never extrapolate or guess Modal costs. */
export function selectExperimentExecutor({profile, workload, maxCostUsd = 0, maxRssBytes = Infinity, cloudAuthorized = false, availableBackends}) {
  const fallback = reason => ({backend: 'local-js', concurrency: 1, estimatedCostUsd: 0, reason, evidence: null});
  if (workload?.mode === 'interactive') {
    return {backend: 'local-js', concurrency: 1, estimatedCostUsd: 0, reason: 'interactive simulation remains local for rendering and input latency', evidence: null};
  }
  if (profile?.version !== EXECUTOR_PROFILE_VERSION || !Array.isArray(profile.records)) {
    return fallback('no valid measured executor profile; use the local JavaScript engine');
  }
  if (profile.environment?.platform !== process.platform || profile.environment?.arch !== process.arch) {
    return fallback('profile hardware platform does not match this host');
  }
  if (profile.environment?.node !== process.version) {
    return fallback('profile Node.js runtime does not match this host');
  }
  const available = new Set(availableBackends ?? BACKEND_ORDER.keys());
  const currentCpu = os.cpus()[0]?.model ?? null;
  if (!currentCpu || profile.environment?.cpu !== currentCpu) {
    return fallback('profile CPU identity does not match this host');
  }
  const eligible = profile.records.filter(record => {
    if (record.status !== 'measured' || record.parity !== 'passed' || !sameWorkload(record, workload)) return false;
    if (!BACKEND_ORDER.has(record.backend) || !available.has(record.backend)
        || !Number.isFinite(record.p95EndToEndMs) || record.p95EndToEndMs <= 0) return false;
    if (!Number.isFinite(record.estimatedCostUsd) || record.estimatedCostUsd < 0 || record.estimatedCostUsd > maxCostUsd) return false;
    if (!Number.isFinite(record.peakRssBytes) || record.peakRssBytes <= 0 || record.peakRssBytes > maxRssBytes) return false;
    if (record.backend === 'modal-gpu') {
      if (!cloudAuthorized || !Number.isFinite(record.coldStartP95Ms) || record.coldStartP95Ms < 0
          || !Number.isFinite(record.warmStartP95Ms) || record.warmStartP95Ms < 0
          || !Number.isFinite(record.totalLatencyP95Ms) || record.totalLatencyP95Ms <= 0
          || record.totalLatencyP95Ms !== record.p95EndToEndMs) return false;
    }
    return Number.isSafeInteger(record.concurrency) && record.concurrency >= 1;
  });
  if (eligible.length === 0) return fallback('no exact, parity-passed measurement fits the memory and cost limits');
  eligible.sort((a, b) => a.p95EndToEndMs - b.p95EndToEndMs
    || a.estimatedCostUsd - b.estimatedCostUsd
    || BACKEND_ORDER.get(a.backend) - BACKEND_ORDER.get(b.backend));
  const selected = eligible[0];
  return {
    backend: selected.backend,
    concurrency: selected.concurrency,
    estimatedCostUsd: selected.estimatedCostUsd,
    p95EndToEndMs: selected.p95EndToEndMs,
    peakRssBytes: selected.peakRssBytes,
    reason: 'fastest exact measured p95 that passed parity and fits memory/cost constraints',
    evidence: selected.evidence,
  };
}
