import {
  ASSUMPTIONS,
  FARM_ENGINE_VERSION,
  compareConfiguredScenarios,
  createConfiguredComparisonManifest,
  validateConfiguredComparisonManifest
} from './engine.js';

export const LOT_COMPARISON_MANIFEST_TYPE = 'riose-configured-comparison';
export const LOT_COMPARISON_MANIFEST_VERSION = 1;
export const LOT_DEMONSTRATION_MODEL = Object.freeze({
  id: 'agroville-engine',
  version: FARM_ENGINE_VERSION,
  status: 'demonstrative_unvalidated',
  evidenceStatus: 'demonstrative',
  validated: false,
  implementation: 'src/client/engine.js + src/client/feeding-model.js',
  evidenceReferences: []
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function snapshotFingerprint(snapshot) {
  let hash = 0xcbf29ce484222325n;
  const canonicalSnapshot = {...snapshot, animals: [...snapshot.animals].sort((a, b) => a.id - b.id)};
  for (const byte of new TextEncoder().encode(stableJson(canonicalSnapshot))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function lotIdentity(snapshot, patchIndex, domainZoneId) {
  if (snapshot?.schemaVersion || snapshot?.snapshotKind === 'observed' || (Array.isArray(snapshot?.observations) && snapshot.observations.length)) {
    throw new Error('Snapshots observados ou de fazenda importados são somente leitura para a simulação demonstrativa por lote.');
  }
  if (!Number.isInteger(patchIndex) || patchIndex < 0 || patchIndex > 3) throw new Error('Piquete demonstrativo inválido.');
  if (domainZoneId !== `paddock-${patchIndex + 1}`) throw new Error('O ID do mapa não corresponde ao piquete selecionado.');
  if (!Array.isArray(snapshot?.animals) || snapshot.animals.length < 1) throw new Error('Snapshot demonstrativo sem animais.');
  const animals = snapshot.animals;
  const ids = animals.map(animal => animal.id);
  if (ids.some(id => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) throw new Error('IDs de animais do snapshot devem ser inteiros únicos.');
  const lotAnimals = animals.filter(animal => animal.patch === patchIndex);
  if (!lotAnimals.length) throw new Error('O piquete selecionado não possui animais demonstrativos.');
  return {
    kind: 'lot',
    sourceKind: 'synthetic-demonstration',
    farmId: 'fazenda-horizonte-demo',
    domainZoneId,
    paddockId: `demo-paddock-${String(patchIndex + 1).padStart(2, '0')}`,
    lotId: `demo-lot-${String(patchIndex + 1).padStart(2, '0')}`,
    patchIndex,
    animalIds: lotAnimals.map(animal => animal.id).sort((a, b) => a - b),
    unaffectedAnimalIds: animals.filter(animal => animal.patch !== patchIndex).map(animal => animal.id).sort((a, b) => a - b),
    populationScope: 'selected-lot-only',
    model: {...LOT_DEMONSTRATION_MODEL},
    modelParameters: {...ASSUMPTIONS},
    snapshotFingerprint: snapshotFingerprint(snapshot)
  };
}

function assertSingleSupplementChange(snapshot, scenarios, periodDays) {
  const inner = createConfiguredComparisonManifest(snapshot, {
    referenceConfig: scenarios?.reference,
    scenarioConfig: scenarios?.scenario,
    days: periodDays
  });
  if (inner.factor !== 'supplement') throw new Error('A simulação por lote v1 suporta somente a intervenção de suplementação.');
  if (scenarios.reference.supplement === scenarios.scenario.supplement) throw new Error('A alternativa deve alterar a suplementação do lote.');
  for (const key of ['diet', 'housing', 'weather', 'supplement']) {
    if (scenarios.reference[key] !== snapshot.config[key]) throw new Error('A referência deve corresponder ao snapshot inicial em todas as configurações.');
    if (key !== 'supplement' && scenarios.scenario[key] !== snapshot.config[key]) throw new Error('A alternativa não pode alterar fatores fora da intervenção selecionada.');
  }
}

export function createLotComparisonManifest(snapshot, {
  patchIndex,
  domainZoneId = `paddock-${patchIndex + 1}`,
  periodDays = 30,
  alternativeSupplementKgDMPerAnimalPerDay
} = {}) {
  if (!record(snapshot)) throw new Error('Snapshot da fazenda demonstrativa inválido.');
  const lot = lotIdentity(snapshot, patchIndex, domainZoneId);
  const reference = {...snapshot.config};
  const nextSupplement = Number(alternativeSupplementKgDMPerAnimalPerDay);
  if (!Number.isFinite(nextSupplement) || nextSupplement < 0 || nextSupplement > 4) throw new Error('Suplementação alternativa deve ficar entre 0 e 4 kg MS/animal/dia.');
  if (nextSupplement === reference.supplement) throw new Error('Escolha uma suplementação diferente da referência para comparar.');
  const scenario = {...reference, supplement: nextSupplement};
  assertSingleSupplementChange(snapshot, {reference, scenario}, periodDays);
  const manifest = createConfiguredComparisonManifest(snapshot, {
    referenceConfig: reference,
    scenarioConfig: scenario,
    days: periodDays,
    targetScope: lot
  });
  validateLotComparisonManifest(manifest);
  return manifest;
}

export function validateLotComparisonManifest(manifest) {
  if (!record(manifest) || manifest.type !== 'riose-configured-comparison' || manifest.version !== 1 || manifest.targetScope?.kind !== 'lot') throw new Error('O manifesto configurado não declara um lote demonstrativo suportado.');
  validateConfiguredComparisonManifest(manifest);
  if (manifest.engineVersion !== FARM_ENGINE_VERSION) throw new Error('Versão do motor incompatível com este manifesto de lote.');
  if (manifest.factor !== 'supplement') throw new Error('O manifesto configurado por lote suporta somente suplementação.');
  assertSingleSupplementChange(manifest.initialSnapshot, manifest.scenarios, manifest.periodDays);
  const lot = manifest.targetScope;
  if (!record(lot) || !Number.isInteger(lot.patchIndex) || lot.patchIndex < 0 || lot.patchIndex > 3) throw new Error('Identidade do lote inválida.');
  const expectedLot = lotIdentity(manifest.initialSnapshot, lot.patchIndex, lot.domainZoneId);
  if (stableJson(lot) !== stableJson(expectedLot)) throw new Error('A identidade ou proveniência do lote não corresponde aos animais do snapshot.');
  return true;
}

export function createLotScopedSnapshot(snapshot, lot) {
  const expected = lotIdentity(snapshot, lot?.patchIndex, lot?.domainZoneId);
  if (stableJson(expected) !== stableJson(lot)) throw new Error('O lote não corresponde ao snapshot demonstrativo.');
  return {...clone(snapshot), animals: snapshot.animals.filter(animal => animal.patch === lot.patchIndex).sort((a, b) => a.id - b.id).map(clone)};
}

export function compareLotConfiguredScenarios(manifest, metabolismKernel) {
  validateLotComparisonManifest(manifest);
  const snapshot = createLotScopedSnapshot(manifest.initialSnapshot, manifest.targetScope);
  const result = compareConfiguredScenarios(snapshot, {
    days: manifest.periodDays,
    referenceConfig: manifest.scenarios.reference,
    scenarioConfig: manifest.scenarios.scenario
  }, metabolismKernel);
  return addLotComparisonContext(manifest, result);
}

export function addLotComparisonContext(manifest, result) {
  validateLotComparisonManifest(manifest);
  const patchIndex = manifest.targetScope.patchIndex;
  const rows = result.rows.map(row => ({...row,
    referencePastureKgDM: row.referencePastureByPaddock[patchIndex],
    scenarioPastureKgDM: row.scenarioPastureByPaddock[patchIndex]
  }));
  return {...result, rows, lot: clone(manifest.targetScope), model: clone(manifest.targetScope.model), modelParameters: clone(manifest.targetScope.modelParameters)};
}

export function replayLotComparisonManifest(manifest, metabolismKernel) {
  return compareLotConfiguredScenarios(manifest, metabolismKernel);
}
