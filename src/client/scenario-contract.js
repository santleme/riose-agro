import {createComparisonManifest, replayComparisonManifest, validateComparisonManifest} from './engine.js';

export const SCENARIO_CONTRACT_TYPE = 'agroville-comparison';
export const SCENARIO_CONTRACT_VERSION = 2;
export const SCENARIO_ENGINE_VERSION = 'agroville-engine/1';

const OUTPUTS = ['weight', 'cost', 'pasture', 'intake'];
// Legacy engine provenance is valid only for the in-memory object returned by
// the v1 adapter. It must not become a forgeable persisted v2 identifier.
const legacyAdaptedContracts = new WeakSet();

function fail(message) {
  throw new Error(`Contrato de cenário inválido: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys, label) {
  if (!isRecord(value)) fail(`${label} precisa ser um objeto.`);
  const missing = keys.filter(key => !Object.hasOwn(value, key));
  if (missing.length) fail(`${label} está sem campo(s) obrigatório(s): ${missing.join(', ')}.`);
  const extra = Object.keys(value).filter(key => !keys.includes(key));
  if (extra.length) fail(`${label} contém campo(s) não suportado(s): ${extra.join(', ')}.`);
}

function legacyView(contract) {
  return {
    type: SCENARIO_CONTRACT_TYPE,
    version: 1,
    seed: contract.seed,
    initialSnapshot: contract.baseline,
    periodDays: contract.duration.value,
    factor: contract.intervention.factor,
    scenarios: {
      reference: contract.inputs.baseline_config,
      scenario: contract.inputs.scenario_config,
    },
    validated: false,
  };
}

function animalIds(snapshot) {
  return snapshot.animals.map((animal, index) => {
    const id = animal?.id;
    if (typeof id === 'string' && id.trim()) return id;
    if (typeof id === 'number' && Number.isFinite(id)) return String(id);
    fail(`baseline.animals[${index}].id precisa ser texto não vazio ou número finito.`);
  });
}

export function validateScenarioContract(contract) {
  if (contract?.type === SCENARIO_CONTRACT_TYPE && contract.version !== SCENARIO_CONTRACT_VERSION) {
    fail(`versão não suportada: ${String(contract.version)}.`);
  }
  exactKeys(contract, [
    'type', 'version', 'scenario_id', 'baseline', 'intervention', 'target_scope',
    'duration', 'seed', 'engine_version', 'inputs', 'expected_outputs', 'validated',
  ], 'objeto raiz');
  if (contract.type !== SCENARIO_CONTRACT_TYPE || contract.version !== SCENARIO_CONTRACT_VERSION) {
    fail(`type/version suportado: ${SCENARIO_CONTRACT_TYPE}/2.`);
  }
  if (typeof contract.scenario_id !== 'string' || !contract.scenario_id.trim()) fail('scenario_id precisa ser texto não vazio.');
  if (contract.engine_version !== SCENARIO_ENGINE_VERSION &&
      !(contract.engine_version === 'legacy-unspecified' && legacyAdaptedContracts.has(contract))) {
    fail(`engine_version deve ser ${SCENARIO_ENGINE_VERSION}; legacy-unspecified só é aceito no objeto adaptado de um manifesto v1.`);
  }
  if (contract.validated !== false) fail('validated deve permanecer false; o motor não foi validado cientificamente.');
  if (!Number.isInteger(contract.seed) || contract.seed < 0 || contract.seed > 0xffffffff) fail('seed precisa ser um inteiro sem sinal de 32 bits.');

  exactKeys(contract.duration, ['value', 'unit'], 'duration');
  if (contract.duration.unit !== 'day' || !Number.isInteger(contract.duration.value)) fail('duration deve ser um número inteiro de dias.');
  exactKeys(contract.intervention, ['factor', 'value'], 'intervention');
  if (contract.intervention.factor !== 'housing' || contract.intervention.value !== 'barn') {
    fail('intervention atualmente suporta somente factor=housing e value=barn.');
  }
  exactKeys(contract.target_scope, ['kind', 'animal_ids'], 'target_scope');
  if (contract.target_scope.kind !== 'whole-herd' || !Array.isArray(contract.target_scope.animal_ids)) {
    fail('target_scope deve declarar kind=whole-herd e a lista explícita animal_ids.');
  }
  if (new Set(contract.target_scope.animal_ids).size !== contract.target_scope.animal_ids.length ||
      contract.target_scope.animal_ids.some(id => typeof id !== 'string' || !id.trim())) {
    fail('target_scope.animal_ids deve conter IDs de texto não vazios e sem duplicatas.');
  }
  exactKeys(contract.inputs, ['baseline_config', 'scenario_config'], 'inputs');
  if (!Array.isArray(contract.expected_outputs) || contract.expected_outputs.length === 0 ||
      contract.expected_outputs.some(output => !OUTPUTS.includes(output)) ||
      new Set(contract.expected_outputs).size !== contract.expected_outputs.length) {
    fail(`expected_outputs deve listar, sem duplicatas, ao menos uma saída entre: ${OUTPUTS.join(', ')}.`);
  }

  const expectedSeed = Number.isInteger(contract.baseline?.initialSeed) ? contract.baseline.initialSeed : contract.baseline?.seed;
  if (contract.seed !== expectedSeed) fail('seed deve corresponder à semente original do snapshot baseline.');

  const legacy = legacyView(contract);
  try {
    validateComparisonManifest(legacy);
  } catch (error) {
    fail(error.message);
  }
  const actualIds = animalIds(contract.baseline);
  if (contract.target_scope.animal_ids.length !== actualIds.length ||
      contract.target_scope.animal_ids.some((id, index) => id !== actualIds[index])) {
    fail('target_scope.animal_ids deve corresponder, na mesma ordem, aos animais do snapshot baseline.');
  }
  return true;
}

export function validateReproducibilityManifest(manifest) {
  if (manifest?.type !== SCENARIO_CONTRACT_TYPE) fail(`type suportado: ${SCENARIO_CONTRACT_TYPE}.`);
  if (manifest.version === 1) return validateComparisonManifest(manifest);
  if (manifest.version === SCENARIO_CONTRACT_VERSION) return validateScenarioContract(manifest);
  fail(`versão não suportada: ${String(manifest.version)}.`);
}

export function createScenarioContract(snapshot, durationDays = 30, {scenarioId} = {}) {
  const legacy = createComparisonManifest(snapshot, durationDays);
  const id = scenarioId ?? `scenario-${legacy.seed}-${durationDays}`;
  const contract = {
    type: SCENARIO_CONTRACT_TYPE,
    version: SCENARIO_CONTRACT_VERSION,
    scenario_id: id,
    baseline: structuredClone(legacy.initialSnapshot),
    intervention: {factor: legacy.factor, value: legacy.scenarios.scenario.housing},
    target_scope: {kind: 'whole-herd', animal_ids: animalIds(legacy.initialSnapshot)},
    duration: {value: legacy.periodDays, unit: 'day'},
    seed: legacy.seed,
    engine_version: SCENARIO_ENGINE_VERSION,
    inputs: {
      baseline_config: structuredClone(legacy.scenarios.reference),
      scenario_config: structuredClone(legacy.scenarios.scenario),
    },
    expected_outputs: [...OUTPUTS],
    validated: false,
  };
  validateScenarioContract(contract);
  return contract;
}

export function upgradeComparisonManifestToScenarioContract(manifest, {scenarioId} = {}) {
  validateComparisonManifest(manifest);
  const contract = createScenarioContract(manifest.initialSnapshot, manifest.periodDays, {
    scenarioId: scenarioId ?? `legacy-${manifest.seed}-${manifest.periodDays}`,
  });
  contract.inputs = {
    baseline_config: structuredClone(manifest.scenarios.reference),
    scenario_config: structuredClone(manifest.scenarios.scenario),
  };
  contract.engine_version = 'legacy-unspecified';
  legacyAdaptedContracts.add(contract);
  validateScenarioContract(contract);
  return contract;
}

export function replayScenarioContract(contract) {
  if (contract?.type === SCENARIO_CONTRACT_TYPE && contract.version === 1) return replayComparisonManifest(contract);
  validateReproducibilityManifest(contract);
  return replayComparisonManifest(legacyView(contract));
}
