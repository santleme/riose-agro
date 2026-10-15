import {validateScenarioSetManifest} from './scenario-set.js';
import {interpretScenarioLabPrompt, validateScenarioLabIntent} from './scenario-lab-intent.js';

export const SCENARIO_LAB_ARCHIVE_TYPE = 'riose-scenario-lab-archive';
export const SCENARIO_LAB_ARCHIVE_VERSION = 2;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`Scenario lab archive is invalid: ${message}`); };

function exactKeys(value, fields, label) {
  if (!isRecord(value) || Object.keys(value).sort().join('|') !== [...fields].sort().join('|')) fail(`${label} has an invalid shape.`);
}

function canonical(value, stack = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('canonical JSON only supports finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (stack.has(value)) fail('canonical JSON cannot encode circular references.');
    stack.add(value);
    const result = `[${value.map(item => canonical(item, stack)).join(',')}]`;
    stack.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail('canonical JSON only supports plain objects.');
    if (stack.has(value)) fail('canonical JSON cannot encode circular references.');
    stack.add(value);
    const result = `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], stack)}`).join(',')}}`;
    stack.delete(value);
    return result;
  }
  fail('canonical JSON cannot encode undefined or executable values.');
}

export function canonicalScenarioLabJson(value) {
  return canonical(value);
}

export async function sha256ScenarioLabJson(value) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder !== 'function') fail('Web Crypto SHA-256 is unavailable in this environment.');
  const bytes = new TextEncoder().encode(canonicalScenarioLabJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function same(left, right) {
  return canonicalScenarioLabJson(left) === canonicalScenarioLabJson(right);
}

function intentMatchesManifest(intent, manifest) {
  validateScenarioLabIntent(intent);
  const levels = [manifest.scenarios.find(scenario => scenario.role === 'baseline'), ...manifest.scenarios.filter(scenario => scenario.role === 'intervention')]
    .map(scenario => scenario.config.supplement);
  const sharedWeather = manifest.scenarios.every(scenario => scenario.config.weather === intent.weather);
  return intent.ready
    && intent.population.count === manifest.initialSnapshot.animals.length
    && intent.duration.days === manifest.durationDays
    && same(intent.supplementLevelsKgDMPerHeadPerDay, levels)
    && sharedWeather;
}

export function validateScenarioLabResultBinding(manifest, result) {
  validateScenarioSetManifest(manifest);
  if (!isRecord(result) || result.type !== 'riose-scenario-results' || result.version !== 1 || result.validated !== false
      || result.scenarioId !== manifest.scenarioId || result.engineVersion !== manifest.engineVersion || result.seed !== manifest.seed
      || result.durationDays !== manifest.durationDays || result.factor !== manifest.factor
      || result.executor !== 'javascript-population-observations' || result.executionCount !== manifest.scenarios.length - 1) {
    fail('results do not match the confirmed manifest dimensions or registered illustrative executor.');
  }
  const baseline = manifest.scenarios.find(scenario => scenario.role === 'baseline');
  const interventions = manifest.scenarios.filter(scenario => scenario.role === 'intervention');
  if (!isRecord(result.baseline) || result.baseline.id !== baseline.id || result.baseline.label !== baseline.label
      || result.baseline.role !== 'baseline' || !same(result.baseline.config, baseline.config)
      || !Array.isArray(result.baseline.rows) || !Array.isArray(result.baseline.timeline)
      || result.baseline.rows.length !== manifest.durationDays + 1 || result.baseline.timeline.length < 2
      || !Array.isArray(result.scenarios) || result.scenarios.length !== interventions.length) {
    fail('results do not match the confirmed manifest arms.');
  }
  const animalIds = manifest.initialSnapshot.animals.map(animal => animal.id);
  for (const [day, row] of result.baseline.rows.entries()) {
    if (!isRecord(row) || row.day !== day || Object.entries(row).some(([key, value]) => key !== 'day' && !Number.isFinite(value))) {
      fail('baseline daily output is incomplete or non-finite.');
    }
  }
  for (const point of result.baseline.timeline) {
    if (!isRecord(point) || !Number.isInteger(point.day) || point.day < 0 || point.day > manifest.durationDays
        || !Array.isArray(point.animals) || !same(point.animals.map(animal => animal.id), animalIds)) fail('baseline observations do not preserve the confirmed population identities and horizon.');
  }
  for (const [index, expected] of interventions.entries()) {
    const actual = result.scenarios[index];
    if (!isRecord(actual) || actual.id !== expected.id || actual.label !== expected.label || actual.role !== expected.role || !same(actual.config, expected.config)
        || !Array.isArray(actual.rows) || !Array.isArray(actual.timeline)
        || actual.rows.length !== result.baseline.rows.length || actual.timeline.length !== result.baseline.timeline.length) {
      fail(`results do not match the confirmed manifest arm ${expected.id}.`);
    }
    if (actual.rows.some((point, pointIndex) => !isRecord(point)
        || point.day !== result.baseline.rows[pointIndex]?.day
        || Object.entries(point).some(([key, value]) => key !== 'day' && !Number.isFinite(value)))) fail(`daily results for arm ${expected.id} do not match the confirmed timeline.`);
    if (actual.timeline.some((point, pointIndex) => !isRecord(point)
        || point.day !== result.baseline.timeline[pointIndex]?.day
        || !Array.isArray(point.animals) || !same(point.animals.map(animal => animal.id), animalIds))) {
      fail(`observations for arm ${expected.id} do not preserve the confirmed identities and timeline.`);
    }
  }
  const expectedUnits = {
    meanWeightKg: 'kg live weight/animal',
    cumulativeCostUnits: 'illustrative engine cost units',
    cumulativeFeedIntakeKgDM: 'kg DM across the herd',
    pastureStockKgDM: 'illustrative engine paddock stock units (kg DM)',
  };
  if (!same(result.units, expectedUnits) || !isRecord(result.assumptions) || typeof result.interpretation !== 'string') fail('results omit expected units, assumptions, or interpretation metadata.');
  return true;
}

function provenanceFor(manifest, results, manifestSha256, resultsSha256, interpreter = {source: 'deterministic', provider: null, model: null}) {
  return {
    confirmedManifestSha256: manifestSha256,
    executedManifestSha256: manifestSha256,
    resultsSha256,
    seed: manifest.seed,
    executor: 'javascript-scenario-set',
    resultExecutor: results.executor,
    engine: {id: 'FarmEngine', version: manifest.engineVersion, evidenceStatus: 'demonstration', validated: false},
    scientificModel: {id: null, version: null, status: 'not-used'},
    interpreter: structuredClone(interpreter),
    units: structuredClone(results.units),
    assumptions: structuredClone(results.assumptions),
    hypothesis: {
      statement: null,
      origin: 'not supplied',
      status: 'no scientific hypothesis was evaluated',
    },
  };
}

export async function createScenarioLabArchive({manifest, results, sourcePrompt = null, intent = null, interpretation = {source: 'deterministic', provider: null, model: null}, relationship, executedManifestSha256 = null} = {}) {
  validateScenarioLabResultBinding(manifest, results);
  if (sourcePrompt !== null && (typeof sourcePrompt !== 'string' || sourcePrompt.length > 1200)) fail('source prompt must be null or at most 1,200 characters.');
  if (intent !== null && (!sourcePrompt || !isRecord(intent))) fail('validated intent requires its source prompt.');
  if (intent !== null) validateScenarioLabIntent(intent);
  if (intent !== null && relationship !== 'manual-revision' && !intentMatchesManifest(intent, manifest)) fail('validated intent does not match the confirmed manifest.');
  validateInterpretation(interpretation);
  if (intent !== null && interpretation.source === 'deterministic' && !same(intent, interpretScenarioLabPrompt(sourcePrompt))) fail('validated intent does not match its source prompt.');
  const requestRelationship = relationship ?? (intent ? (interpretation.source === 'llm' ? 'validated-ai-draft' : 'validated-prompt-draft') : sourcePrompt ? 'manual-revision' : 'structured-only');
  if (!['validated-prompt-draft', 'validated-ai-draft', 'manual-revision', 'structured-only', 'legacy-import'].includes(requestRelationship)) fail('request relationship is unsupported.');
  const manifestSha256 = await sha256ScenarioLabJson(manifest);
  if (executedManifestSha256 !== null && executedManifestSha256 !== manifestSha256) fail('Worker execution digest does not match the confirmed manifest.');
  const resultsSha256 = await sha256ScenarioLabJson(results);
  const hypothesis = sourcePrompt === null
    ? {statement: null, origin: 'not supplied', status: 'no scientific hypothesis was evaluated'}
    : {statement: sourcePrompt, origin: 'user question', status: 'not independently evaluated'};
  const archive = {
    type: SCENARIO_LAB_ARCHIVE_TYPE,
    version: SCENARIO_LAB_ARCHIVE_VERSION,
    request: {sourcePrompt, intent: intent === null ? null : structuredClone(intent), relationship: requestRelationship, hypothesis, interpretation: structuredClone(interpretation)},
    manifest: structuredClone(manifest),
    results: structuredClone(results),
    provenance: {...provenanceFor(manifest, results, manifestSha256, resultsSha256, interpretation), hypothesis},
  };
  await validateScenarioLabArchive(archive);
  return archive;
}

export async function validateScenarioLabArchive(archive) {
  exactKeys(archive, ['type', 'version', 'request', 'manifest', 'results', 'provenance'], 'root');
  if (archive.type !== SCENARIO_LAB_ARCHIVE_TYPE || ![1, SCENARIO_LAB_ARCHIVE_VERSION].includes(archive.version)) fail('type/version is unsupported.');
  exactKeys(archive.request, archive.version === 1 ? ['sourcePrompt', 'intent', 'relationship', 'hypothesis'] : ['sourcePrompt', 'intent', 'relationship', 'hypothesis', 'interpretation'], 'request');
  const interpretation = archive.version === 1 ? {source: 'deterministic', provider: null, model: null} : archive.request.interpretation;
  validateInterpretation(interpretation);
  const allowedRelationships = archive.version === 1
    ? ['validated-prompt-draft', 'manual-revision', 'structured-only', 'legacy-import']
    : ['validated-prompt-draft', 'validated-ai-draft', 'manual-revision', 'structured-only', 'legacy-import'];
  if (!allowedRelationships.includes(archive.request.relationship)) fail('request relationship is unsupported.');
  if (archive.request.sourcePrompt !== null && (typeof archive.request.sourcePrompt !== 'string' || archive.request.sourcePrompt.length > 1200)) fail('source prompt is invalid.');
  if (archive.request.intent !== null && !archive.request.sourcePrompt) fail('intent requires its source prompt.');
  if (archive.request.intent !== null) validateScenarioLabIntent(archive.request.intent);
  if (archive.request.intent !== null && archive.request.relationship !== 'manual-revision' && !intentMatchesManifest(archive.request.intent, archive.manifest)) fail('intent does not match the confirmed manifest.');
  if (archive.request.intent !== null && interpretation.source === 'deterministic' && !same(archive.request.intent, interpretScenarioLabPrompt(archive.request.sourcePrompt))) fail('intent does not match its source prompt.');
  const validatedDraftRelationship = ['validated-prompt-draft', 'validated-ai-draft'].includes(archive.request.relationship);
  if ((validatedDraftRelationship && archive.request.intent === null)
      || (!validatedDraftRelationship && archive.request.relationship !== 'manual-revision' && archive.request.intent !== null)
      || (archive.request.relationship === 'structured-only' && archive.request.sourcePrompt !== null)) fail('request relationship does not match the supplied intent and source prompt.');
  if (validatedDraftRelationship && ((archive.request.relationship === 'validated-ai-draft') !== (interpretation.source === 'llm'))) fail('AI interpretation provenance does not match the request relationship.');
  if (interpretation.source === 'llm' && (archive.request.intent === null || archive.request.sourcePrompt === null)) fail('AI interpretation provenance requires its original prompt and validated proposal.');
  const expectedHypothesis = archive.request.sourcePrompt === null
    ? {statement: null, origin: 'not supplied', status: 'no scientific hypothesis was evaluated'}
    : {statement: archive.request.sourcePrompt, origin: 'user question', status: 'not independently evaluated'};
  if (!same(archive.request.hypothesis, expectedHypothesis)) fail('request hypothesis provenance is inconsistent.');
  validateScenarioLabResultBinding(archive.manifest, archive.results);
  const expectedProvenance = provenanceFor(archive.manifest, archive.results, archive.provenance?.confirmedManifestSha256, archive.provenance?.resultsSha256, interpretation);
  if (archive.version === 1) delete expectedProvenance.interpreter;
  expectedProvenance.hypothesis = expectedHypothesis;
  exactKeys(archive.provenance, Object.keys(expectedProvenance), 'provenance');
  if (!same(archive.provenance, expectedProvenance)) fail('provenance does not match the confirmed manifest and results.');
  const manifestSha256 = await sha256ScenarioLabJson(archive.manifest);
  if (archive.provenance.confirmedManifestSha256 !== manifestSha256 || archive.provenance.executedManifestSha256 !== manifestSha256) fail('manifest digest does not match the confirmed and executed manifest.');
  if (archive.provenance.resultsSha256 !== await sha256ScenarioLabJson(archive.results)) fail('result digest does not match the archived results.');
  return archive;
}

function validateInterpretation(value) {
  exactKeys(value, ['source', 'provider', 'model'], 'interpretation provenance');
  if (!['deterministic', 'llm'].includes(value.source)) fail('interpretation source is unsupported.');
  if (value.source === 'deterministic') {
    if (value.provider !== null || value.model !== null) fail('deterministic interpretation cannot claim a remote provider.');
  } else if (!['groq', 'huggingface'].includes(value.provider) || typeof value.model !== 'string' || !value.model.trim() || value.model.length > 120) {
    fail('LLM interpretation must identify its provider and model.');
  }
}
