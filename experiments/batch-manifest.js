import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../schemas/batch-experiment-manifest-v1.schema.json' with {type: 'json'};

const MANIFEST_TYPE = 'riose-batch-experiment';
const MANIFEST_VERSION = 1;
const RESULT_TYPE = 'riose-experiment-result';
const RESULT_VERSION = 1;
const ajv = new Ajv2020({allErrors: true, strict: true, allowUnionTypes: true});
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function canonicalize(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON only accepts finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
  if (ancestors.has(value)) throw new TypeError('Canonical JSON cannot encode circular references');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError('Canonical JSON accepts only plain objects and arrays');
  }
  ancestors.add(value);
  let encoded;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new TypeError('Canonical JSON cannot encode sparse arrays');
    }
    encoded = `[${value.map(item => canonicalize(item, ancestors)).join(',')}]`;
  } else {
    const keys = Object.keys(value).sort();
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Canonical JSON cannot encode symbol keys');
    encoded = `{${keys.map(key => `${JSON.stringify(key)}:${canonicalize(value[key], ancestors)}`).join(',')}}`;
  }
  ancestors.delete(value);
  return encoded;
}

export function canonicalJson(value) {
  return canonicalize(value);
}

export function sha256Digest(value) {
  const bytes = typeof value === 'string' ? value : canonicalJson(value);
  return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`;
}

export function digestScenario(scenario) {
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) throw new TypeError('Scenario must be an object');
  return sha256Digest(scenario);
}

export function digestExperimentManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new TypeError('Manifest must be an object');
  const {manifestDigest: _digest, ...unsigned} = manifest;
  return sha256Digest(unsigned);
}

function semanticErrors(manifest) {
  const errors = [];
  const runIds = new Set();
  for (const [index, run] of manifest.runs.entries()) {
    const at = `runs[${index}]`;
    if (runIds.has(run.runId)) errors.push(`${at}.runId must be unique`);
    runIds.add(run.runId);
    const engineHasIdentity = typeof run.engine.id === 'string' && run.engine.id.length > 0 && typeof run.engine.version === 'string' && run.engine.version.length > 0;
    if (run.engine.status === 'provided' && !engineHasIdentity) errors.push(`${at}.engine status provided requires an exact id and version`);
    if (run.engine.status === 'missing' && (run.engine.id !== null || run.engine.version !== null || run.engine.buildDigest !== null)) errors.push(`${at}.engine status missing requires null identity and digest`);
    for (const [modelIndex, model] of run.models.entries()) {
      const modelHasIdentity = typeof model.id === 'string' && model.id.length > 0 && typeof model.version === 'string' && model.version.length > 0;
      if (model.status === 'provided' && !modelHasIdentity) errors.push(`${at}.models[${modelIndex}] status provided requires an exact id and version`);
      if (model.status === 'missing' && (model.id !== null || model.version !== null || model.implementationDigest !== null)) errors.push(`${at}.models[${modelIndex}] status missing requires null identity and digest`);
    }
    for (const [kind, refs] of [['datasets', run.datasets], ['evidence', run.evidence]]) {
      for (const [refIndex, ref] of refs.entries()) {
        if (ref.status === 'provided' && !(typeof ref.id === 'string' && ref.id.length > 0)) errors.push(`${at}.${kind}[${refIndex}] status provided requires an id`);
        if (ref.status === 'missing' && (ref.id !== null || ref.digest != null || ref.uri != null)) errors.push(`${at}.${kind}[${refIndex}] status missing requires null reference fields`);
      }
    }
    const completed = run.status === 'completed';
    if (completed && (run.outputDigest === null || run.resultRef === null)) errors.push(`${at} completed status must have outputDigest and resultRef`);
    if (!completed && (run.outputDigest !== null || run.resultRef !== null)) errors.push(`${at} non-completed status must not have outputDigest or resultRef`);
    if (!completed && Object.keys(run.outputs).length) errors.push(`${at} outputs must be empty unless status is completed`);
    if (completed && sha256Digest(run.outputs) !== run.outputDigest) errors.push(`${at}.outputDigest does not match declared outputs`);
  }
  return errors;
}

export function validateBatchExperimentManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new TypeError('Experiment manifest must be an object');
  if (manifest.type !== MANIFEST_TYPE || manifest.version !== MANIFEST_VERSION) {
    throw new Error(`Unsupported experiment manifest type/version: ${String(manifest.type)}/${String(manifest.version)}`);
  }
  if (!validateSchema(manifest)) {
    const details = validateSchema.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
    throw new Error(`Invalid experiment manifest: ${details}`);
  }
  const errors = semanticErrors(manifest);
  if (errors.length) throw new Error(`Invalid experiment manifest: ${errors.join('; ')}`);
  if (digestExperimentManifest(manifest) !== manifest.manifestDigest) throw new Error('Experiment manifest digest mismatch');
  return manifest;
}

export function createBatchExperimentManifest({experimentId, createdAt = new Date().toISOString(), description, runs} = {}) {
  const unsigned = {
    type: MANIFEST_TYPE,
    version: MANIFEST_VERSION,
    experimentId,
    createdAt,
    ...(description === undefined ? {} : {description}),
    runs
  };
  const manifest = {...unsigned, manifestDigest: digestExperimentManifest(unsigned)};
  return validateBatchExperimentManifest(manifest);
}

export function createExperimentResultRecord({runId, outputs} = {}) {
  if (typeof runId !== 'string' || !runId) throw new TypeError('Result runId is required');
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) throw new TypeError('Result outputs must be an object');
  const outputDigest = sha256Digest(outputs);
  return {type: RESULT_TYPE, version: RESULT_VERSION, runId, outputs, outputDigest};
}

export function verifyExperimentResults(manifest, records, {resultRefByRunId = {}} = {}) {
  validateBatchExperimentManifest(manifest);
  if (!Array.isArray(records)) throw new TypeError('Experiment result records must be an array');
  const byRunId = new Map();
  for (const record of records) {
    if (!record || record.type !== RESULT_TYPE || record.version !== RESULT_VERSION) throw new Error('Unsupported or malformed experiment result record');
    if (byRunId.has(record.runId)) throw new Error(`Duplicate result record for run ${record.runId}`);
    if (sha256Digest(record.outputs) !== record.outputDigest) throw new Error(`Result digest mismatch for run ${record.runId}`);
    byRunId.set(record.runId, record);
  }
  const completedRuns = manifest.runs.filter(run => run.status === 'completed');
  const expectedIds = new Set(completedRuns.map(run => run.runId));
  for (const id of byRunId.keys()) if (!expectedIds.has(id)) throw new Error(`Result record is not linked from manifest: ${id}`);
  for (const run of completedRuns) {
    const record = byRunId.get(run.runId);
    if (!record) throw new Error(`Missing result record for run ${run.runId}`);
    if (record.outputDigest !== run.outputDigest) throw new Error(`Output digest link mismatch for run ${run.runId}`);
    if (resultRefByRunId[run.runId] !== undefined && resultRefByRunId[run.runId] !== run.resultRef) throw new Error(`Result reference mismatch for run ${run.runId}`);
  }
  return {valid: true, completedRuns: completedRuns.length, resultRecords: byRunId.size};
}

export function parseExperimentResultJsonl(text) {
  if (typeof text !== 'string') throw new TypeError('JSONL result content must be text');
  return text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Malformed result JSON on line ${index + 1}`); }
  });
}

export function serializeExperimentResultJsonl(records) {
  if (!Array.isArray(records)) throw new TypeError('Experiment result records must be an array');
  return records.map(record => canonicalJson(record)).join('\n') + (records.length ? '\n' : '');
}
