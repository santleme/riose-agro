import {runRegisteredScientificModel} from '../../scientific/model-contract.js';
import {BR_CORTE_PASTURE_DMI_MODEL} from '../../scientific/br_corte_dmi_adapter.js';
import {canonicalScenarioLabJson, sha256ScenarioLabJson} from './scenario-lab-integrity.js';

const MODEL = {id: BR_CORTE_PASTURE_DMI_MODEL.id, version: BR_CORTE_PASTURE_DMI_MODEL.version};
const DOMAIN = 'growing Zebu on tropical pasture, explicitly confirmed by the user request';
const LIMITATION = 'Conditional total DMI only; ADG is supplied, not predicted; no Riose-specific calibration.';
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join('|') === keys.sort().join('|');

export function validateSingleInputs(inputs) {
  if (!exact(inputs, ['bodyWeightKg', 'adgKgPerDay', 'supplementKgDMPerDay'])
      || !Number.isFinite(inputs.bodyWeightKg) || inputs.bodyWeightKg < 133 || inputs.bodyWeightKg > 474
      || !Number.isFinite(inputs.adgKgPerDay) || inputs.adgKgPerDay < -0.18 || inputs.adgKgPerDay > 1.34
      || !Number.isFinite(inputs.supplementKgDMPerDay) || inputs.supplementKgDMPerDay < 0 || inputs.supplementKgDMPerDay > 5.32) throw new TypeError('Single BR-CORTE inputs outside the declared published domain.');
  return inputs;
}

export function evaluateSingleInputs(inputs) {
  validateSingleInputs(inputs);
  return runRegisteredScientificModel({...MODEL, inputs: {...inputs}});
}

export async function createSingleReport({inputs, result, request}) {
  validateSingleInputs(inputs);
  const payload = {type: 'riose-br-corte-single-report', version: 1, model: MODEL,
    inputs: structuredClone(inputs), result: structuredClone(result), request: structuredClone(request), seed: null,
    domain: DOMAIN, limitation: LIMITATION};
  const report = {...payload, sha256: await sha256ScenarioLabJson(payload)};
  await validateSingleReport(report);
  return report;
}

export async function validateSingleReport(report) {
  if (!exact(report, ['type', 'version', 'model', 'inputs', 'result', 'request', 'seed', 'domain', 'limitation', 'sha256'])
      || report.type !== 'riose-br-corte-single-report' || report.version !== 1 || report.seed !== null
      || report.domain !== DOMAIN || report.limitation !== LIMITATION
      || canonicalScenarioLabJson(report.model) !== canonicalScenarioLabJson(MODEL)) throw new TypeError('Unsupported single calculation report.');
  validateSingleInputs(report.inputs);
  if (!exact(report.request, ['sourcePrompt', 'interpretation']) || typeof report.request.sourcePrompt !== 'string'
      || report.request.sourcePrompt.length > 1200 || !exact(report.request.interpretation, ['source', 'provider', 'model'])
      || !['llm', 'deterministic'].includes(report.request.interpretation.source)
      || ![null, 'groq', 'huggingface'].includes(report.request.interpretation.provider)
      || !(report.request.interpretation.model === null || typeof report.request.interpretation.model === 'string' && report.request.interpretation.model.length <= 120)) throw new TypeError('Invalid single calculation provenance.');
  const interpreter = report.request.interpretation;
  if (interpreter.source === 'llm' && (!interpreter.provider || !interpreter.model)
      || interpreter.source === 'deterministic' && (interpreter.provider !== null || interpreter.model !== null)) throw new TypeError('Inconsistent single calculation interpreter.');
  const {sha256, ...payload} = report;
  if (sha256 !== await sha256ScenarioLabJson(payload)) throw new TypeError('Single calculation report digest mismatch.');
  const result = report.result;
  if (!exact(result, ['modelId', 'version', 'outputs', 'evidence', 'provenance', 'scientificProvenance'])
      || result.modelId !== MODEL.id || result.version !== MODEL.version
      || canonicalScenarioLabJson(result.evidence) !== canonicalScenarioLabJson(BR_CORTE_PASTURE_DMI_MODEL.evidence)
      || !exact(result.outputs, Object.keys(BR_CORTE_PASTURE_DMI_MODEL.outputs))
      || !result.outputs.inValidatedDomain || !Number.isFinite(result.outputs.totalDmiKgDMPerDay)
      || result.outputs.totalDmiKgDMPerDay <= 0 || result.outputs.supplementKgDMPerDay !== report.inputs.supplementKgDMPerDay
      || !result.outputs.adgRole.includes('not predicted') || !Array.isArray(result.scientificProvenance)
      || result.scientificProvenance.length !== 1 || canonicalScenarioLabJson(result.scientificProvenance[0]) !== canonicalScenarioLabJson(result.provenance)
      || result.provenance.modelId !== MODEL.id || result.provenance.version !== MODEL.version) throw new TypeError('Invalid single calculation output or model provenance.');
  const sourceBytes = new TextEncoder().encode(BR_CORTE_PASTURE_DMI_MODEL.implementationSource);
  const sourceDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', sourceBytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (result.provenance.implementationHash !== `sha256:${sourceDigest}`) throw new TypeError('Single calculation implementation hash mismatch.');
  for (const [key, value] of Object.entries(report.inputs)) {
    if (result.provenance.inputs[key]?.value !== value || result.provenance.inputs[key]?.unit !== BR_CORTE_PASTURE_DMI_MODEL.units[key]) throw new TypeError('Single calculation input provenance mismatch.');
  }
  // No scientific execution occurs when a report opens. Explicit replay compares the registered result.
  return report;
}
