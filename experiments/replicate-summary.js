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
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function describe(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n ? sorted.reduce((sum, value) => sum + value, 0) / n : null;
  const variance = n > 1 ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : null;
  return {
    n,
    mean,
    standardDeviation: variance === null ? null : Math.sqrt(variance),
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

  for (const record of records) {
    if (!record || typeof record.runId !== 'string' || !record.runId) throw new TypeError('Each run record requires a runId');
    const grouping = Object.fromEntries(groupBy.map(field => [field, record.inputs?.[field] ?? null]));
    const key = canonical(grouping);
    let group = groups.get(key);
    if (!group) {
      group = {grouping, rows: [], failures: 0, incomplete: 0};
      groups.set(key, group);
    }
    if (record.status === 'failed') group.failures++;
    else if (record.status === 'completed') group.rows.push(record);
    else if (record.status === 'planned' || record.status === 'running') group.incomplete++;
    else throw new TypeError(`Run ${record.runId} has unsupported status ${record.status}`);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => ({
    grouping: group.grouping,
    completedRuns: group.rows.length,
    failedRuns: group.failures,
    incompleteRuns: group.incomplete,
    outputs: Object.fromEntries(outputNames.sort().map(name => {
      let unit = null;
      const values = [];
      let missing = 0;
      for (const record of group.rows) {
        const item = outputValue(record, name);
        if (!item) { missing++; continue; }
        if (unit === null) unit = item.unit;
        else if (unit !== item.unit) throw new TypeError(`Output ${name} has incompatible units: ${unit} and ${item.unit}`);
        values.push(item.value);
      }
      return [name, {unit, missingRuns: missing, ...describe(values)}];
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
  return summarizeReplicates(records, options);
}
