import {evaluateBrCorteSensitivityManifest, validateBrCorteSensitivityManifest} from './br-corte-sensitivity.js';
import {canonicalScenarioLabJson, sha256ScenarioLabJson} from './scenario-lab-integrity.js';

export const BR_CORTE_SENSITIVITY_ARCHIVE_TYPE = 'riose-br-corte-dmi-sensitivity-archive';
export const BR_CORTE_SENSITIVITY_ARCHIVE_VERSION = 1;

const fail = message => { throw new TypeError(`BR-CORTE sensitivity archive is invalid: ${message}`); };
const same = (left, right) => canonicalScenarioLabJson(left) === canonicalScenarioLabJson(right);
const exactKeys = (value, fields, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...fields].sort().join('|')) fail(`${label} has an invalid shape.`);
};

function implementationHash(results) {
  const hashes = [...new Set(results.rows.map(row => row?.provenance?.implementationHash))];
  if (hashes.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(hashes[0])) fail('results must identify one registered model implementation hash.');
  return hashes[0];
}

function expectedResult(manifest) {
  return evaluateBrCorteSensitivityManifest(manifest);
}

export async function createBrCorteSensitivityArchive({manifest, results} = {}) {
  validateBrCorteSensitivityManifest(manifest);
  if (!same(results, expectedResult(manifest))) fail('results do not reproduce from the supplied sensitivity manifest.');
  const archive = {
    type: BR_CORTE_SENSITIVITY_ARCHIVE_TYPE,
    version: BR_CORTE_SENSITIVITY_ARCHIVE_VERSION,
    manifest: structuredClone(manifest),
    results: structuredClone(results),
    provenance: {
      manifestSha256: await sha256ScenarioLabJson(manifest),
      resultsSha256: await sha256ScenarioLabJson(results),
      modelId: manifest.model.id,
      modelVersion: manifest.model.version,
      modelImplementationHash: implementationHash(results),
      executor: 'registered-scientific-model',
      seed: null,
      units: structuredClone(results.units),
      assumptions: structuredClone(results.assumptions),
      validated: false,
    },
  };
  await validateBrCorteSensitivityArchive(archive);
  return archive;
}

export async function validateBrCorteSensitivityArchive(archive) {
  exactKeys(archive, ['type', 'version', 'manifest', 'results', 'provenance'], 'root');
  if (archive.type !== BR_CORTE_SENSITIVITY_ARCHIVE_TYPE || archive.version !== BR_CORTE_SENSITIVITY_ARCHIVE_VERSION) fail('type/version is unsupported.');
  validateBrCorteSensitivityManifest(archive.manifest);
  if (!same(archive.results, expectedResult(archive.manifest))) fail('results do not reproduce from the archived manifest.');
  const expected = {
    manifestSha256: await sha256ScenarioLabJson(archive.manifest),
    resultsSha256: await sha256ScenarioLabJson(archive.results),
    modelId: archive.manifest.model.id,
    modelVersion: archive.manifest.model.version,
    modelImplementationHash: implementationHash(archive.results),
    executor: 'registered-scientific-model',
    seed: null,
    units: archive.results.units,
    assumptions: archive.results.assumptions,
    validated: false,
  };
  exactKeys(archive.provenance, Object.keys(expected), 'provenance');
  if (!same(archive.provenance, expected)) fail('provenance or canonical digests do not match the manifest and results.');
  return true;
}
