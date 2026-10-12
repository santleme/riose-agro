const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

function outputValue(record, name) {
  const value = record.outputs?.[name];
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'value') || typeof value.unit !== 'string' || !value.unit.trim()) {
    throw new TypeError(`Run ${record.runId} output ${name} must include a value and unit`);
  }
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) throw new TypeError(`Run ${record.runId} output ${name} must be finite numeric data`);
  return value;
}

function quantile(sortedValues, probability) {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index), upper = Math.ceil(index);
  const fraction = index - lower;
  // Weighted interpolation avoids overflowing the difference for opposite,
  // finite endpoints such as -1e308 and 1e308.
  const value = sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
  if (!Number.isFinite(value)) throw new RangeError('Quantile is outside the finite numeric range');
  return value;
}

function stableSum(values) {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const next = sum + value;
    correction += Math.abs(sum) >= Math.abs(value) ? (sum - next) + value : (value - next) + sum;
    sum = next;
  }
  return sum + correction;
}

function describe(values) {
  // Sort before every reduction so permuting result rows cannot change the
  // floating-point accumulation order (which would make summaries drift).
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  // Divide before summing so a finite mean does not overflow just because
  // the unscaled sum exceeds Number.MAX_VALUE.
  const mean = n ? stableSum(sorted.map(value => value / n)) : null;
  if (mean !== null && !Number.isFinite(mean)) throw new RangeError('Mean is outside the finite numeric range');
  let standardDeviation = null;
  if (n > 1) {
    const differences = sorted.map(value => value - mean);
    const directSquares = differences.map(value => value ** 2);
    const directVariance = stableSum(directSquares) / (n - 1);
    if (Number.isFinite(directVariance)) standardDeviation = Math.sqrt(directVariance);
    else {
      // Normalize deviations before squaring: direct squared deviations can
      // overflow even when the resulting sample SD is representable.
      const scale = sorted.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), Math.abs(mean));
      if (scale === 0) standardDeviation = 0;
      else {
        const scaledMean = mean / scale;
        const scaledSquares = stableSum(sorted.map(value => (value / scale - scaledMean) ** 2));
        const scaledSd = Math.sqrt(scaledSquares / (n - 1));
        if (scaledSd > Number.MAX_VALUE / scale) throw new RangeError('Sample standard deviation is outside the finite numeric range');
        standardDeviation = scale * scaledSd;
        if (!Number.isFinite(standardDeviation)) throw new RangeError('Sample standard deviation is outside the finite numeric range');
      }
    }
  }
  return {
    n,
    mean,
    standardDeviation,
    quantiles: {p05: quantile(sorted, .05), p25: quantile(sorted, .25), p50: quantile(sorted, .5), p75: quantile(sorted, .75), p95: quantile(sorted, .95)},
    label: 'descriptive replicate variability; quantiles are not confidence intervals',
  };
}

/** Summarize completed replicate records without interpreting their spread as calibrated uncertainty. */
export function summarizeReplicates(records, {groupBy = [], outputs} = {}) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  if (!Array.isArray(groupBy) || groupBy.some(field => typeof field !== 'string' || !field)) throw new TypeError('groupBy must contain input field names');
  const outputNames = outputs ? [...new Set(outputs)] : [...new Set(records.flatMap(record => Object.entries(record.outputs ?? [])
    .filter(([, value]) => typeof value?.value === 'number' && Number.isFinite(value.value)).map(([name]) => name)))].sort();
  const groups = new Map();
  const runIds = new Set();

  for (const record of records) {
    if (!record || typeof record.runId !== 'string' || !record.runId) throw new TypeError('Each run record requires a runId');
    if (runIds.has(record.runId)) throw new TypeError(`Duplicate runId ${record.runId}`);
    runIds.add(record.runId);
    const grouping = Object.fromEntries(groupBy.map(field => [field, record.inputs?.[field] ?? null]));
    const key = canonical(grouping);
    let group = groups.get(key);
    if (!group) {
      group = {grouping, rows: [], failedIds: [], incompleteIds: []};
      groups.set(key, group);
    }
    if (record.status === 'failed') group.failedIds.push(record.runId);
    else if (record.status === 'completed') group.rows.push(record);
    else if (record.status === 'planned' || record.status === 'running') group.incompleteIds.push(record.runId);
    else throw new TypeError(`Run ${record.runId} has unsupported status ${record.status}`);
  }

  return [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, group]) => ({
    grouping: group.grouping,
    completedRuns: group.rows.length,
    failedRuns: group.failedIds.length,
    incompleteRuns: group.incompleteIds.length,
    provenance: {
      runIds: [...group.rows.map(record => record.runId), ...group.failedIds, ...group.incompleteIds].sort(),
      completedRunIds: group.rows.map(record => record.runId).sort(),
      failedRunIds: [...group.failedIds].sort(),
      incompleteRunIds: [...group.incompleteIds].sort(),
    },
    outputs: Object.fromEntries(outputNames.sort().map(name => {
      let unit = null;
      const values = [];
      let missing = 0;
      const includedRunIds = [];
      const missingRunIds = [];
      for (const record of group.rows) {
        const item = outputValue(record, name);
        if (!item) { missing++; missingRunIds.push(record.runId); continue; }
        if (unit === null) unit = item.unit;
        else if (unit !== item.unit) throw new TypeError(`Output ${name} has incompatible units: ${unit} and ${item.unit}`);
        values.push(item.value);
        includedRunIds.push(record.runId);
      }
      return [name, {
        unit, missingRuns: missing,
        provenance: {includedRunIds: includedRunIds.sort(), missingRunIds: missingRunIds.sort()},
        ...describe(values),
      }];
    })),
  }));
}
import {verifyExperimentResults} from './batch-manifest.js';


/** Verify the v1 manifest/result links before aggregating only completed numeric outputs. */
export function summarizeExperimentReplicates(manifest, resultRecords, options = {}) {
  verifyExperimentResults(manifest, resultRecords);
  const resultsByRunId = new Map(resultRecords.map(record => [record.runId, record]));
  const records = manifest.runs.map(run => ({
    runId: run.runId,
    status: run.status,
    inputs: run.inputs,
    outputs: run.status === 'completed' ? resultsByRunId.get(run.runId).outputs : {},
  }));
  const summary = summarizeReplicates(records, options);
  return summary.map(group => ({
    ...group,
    provenance: {
      ...group.provenance,
      experimentId: manifest.experimentId,
      manifestDigest: manifest.manifestDigest,
      resultRecordCount: resultRecords.length,
      resultRecordDigests: resultRecords.filter(record => group.provenance.completedRunIds.includes(record.runId))
        .map(record => ({runId: record.runId, outputDigest: record.outputDigest}))
        .sort((a, b) => a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0),
    },
  }));
}
