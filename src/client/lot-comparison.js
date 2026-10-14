import {
  ASSUMPTIONS,
  FARM_ENGINE_VERSION,
  compareConfiguredScenarios,
  createConfiguredComparisonManifest
} from './engine.js';

export const LOT_COMPARISON_MANIFEST_TYPE = 'riose-lot-configured-comparison';
export const LOT_COMPARISON_MANIFEST_VERSION = 1;
export const LOT_DEMONSTRATION_MODEL = Object.freeze({
  id: 'agroville-engine',
  version: FARM_ENGINE_VERSION.split('/').at(-1),
  status: 'demonstrative_unvalidated',
  evidenceStatus: 'demonstrative',
  evidenceReferences: Object.freeze([]),
  validated: false,
  implementation: 'src/client/engine.js + src/client/feeding-model.js'
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
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
    sourceKind: 'synthetic-demonstration',
    farmId: 'fazenda-horizonte-demo',
    domainZoneId,
    paddockId: `demo-paddock-${String(patchIndex + 1).padStart(2, '0')}`,
    lotId: `demo-lot-${String(patchIndex + 1).padStart(2, '0')}`,
    patchIndex,
    animalIds: lotAnimals.map(animal => animal.id),
    unaffectedAnimalIds: animals.filter(animal => animal.patch !== patchIndex).map(animal => animal.id),
    populationScope: 'selected-lot-only',
    model: {...LOT_DEMONSTRATION_MODEL},
    modelParameters: {...ASSUMPTIONS}
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
  const manifest = {
    type: LOT_COMPARISON_MANIFEST_TYPE,
    version: LOT_COMPARISON_MANIFEST_VERSION,
    engineVersion: FARM_ENGINE_VERSION,
    seed: Number.isInteger(snapshot.initialSeed) ? snapshot.initialSeed : snapshot.seed,
    periodDays,
    factor: 'supplement',
    initialSnapshot: clone(snapshot),
    lot,
    scenarios: {reference, scenario},
    validated: false
  };
  validateLotComparisonManifest(manifest);
  return manifest;
}

export function validateLotComparisonManifest(manifest) {
  const keys = ['type', 'version', 'engineVersion', 'seed', 'periodDays', 'factor', 'initialSnapshot', 'lot', 'scenarios', 'validated'];
  if (!record(manifest) || manifest.type !== LOT_COMPARISON_MANIFEST_TYPE || manifest.version !== LOT_COMPARISON_MANIFEST_VERSION
    || Object.keys(manifest).length !== keys.length || keys.some(key => !Object.hasOwn(manifest, key))) {
    throw new Error('Tipo, versão ou campos do manifesto de lote não suportados.');
  }
  if (manifest.engineVersion !== FARM_ENGINE_VERSION) throw new Error('Versão do motor incompatível com este manifesto de lote.');
  if (manifest.validated !== false) throw new Error('O manifesto deve preservar o estado demonstrativo não validado.');
  const expectedSeed = Number.isInteger(manifest.initialSnapshot?.initialSeed) ? manifest.initialSnapshot.initialSeed : manifest.initialSnapshot?.seed;
  if (!Number.isInteger(manifest.seed) || manifest.seed !== expectedSeed) throw new Error('A semente do manifesto não corresponde ao snapshot inicial.');
  if (manifest.factor !== 'supplement') throw new Error('O manifesto de lote v1 suporta somente suplementação.');
  if (!Number.isInteger(manifest.periodDays) || manifest.periodDays < 1 || manifest.periodDays > 365) throw new Error('Horizonte do manifesto de lote deve ser de 1–365 dias.');
  assertSingleSupplementChange(manifest.initialSnapshot, manifest.scenarios, manifest.periodDays);
  const lot = manifest.lot;
  if (!record(lot) || !Number.isInteger(lot.patchIndex) || lot.patchIndex < 0 || lot.patchIndex > 3) throw new Error('Identidade do lote inválida.');
  const expectedLot = lotIdentity(manifest.initialSnapshot, lot.patchIndex, lot.domainZoneId);
  if (stableJson(lot) !== stableJson(expectedLot)) throw new Error('A identidade ou proveniência do lote não corresponde aos animais do snapshot.');
  return true;
}

export function createLotScopedSnapshot(snapshot, lot) {
  const expected = lotIdentity(snapshot, lot?.patchIndex, lot?.domainZoneId);
  if (stableJson(expected) !== stableJson(lot)) throw new Error('O lote não corresponde ao snapshot demonstrativo.');
  return {...clone(snapshot), animals: snapshot.animals.filter(animal => animal.patch === lot.patchIndex).map(clone)};
}

export function compareLotConfiguredScenarios(manifest, metabolismKernel) {
  validateLotComparisonManifest(manifest);
  const snapshot = createLotScopedSnapshot(manifest.initialSnapshot, manifest.lot);
  const result = compareConfiguredScenarios(snapshot, {
    days: manifest.periodDays,
    referenceConfig: manifest.scenarios.reference,
    scenarioConfig: manifest.scenarios.scenario
  }, metabolismKernel);
  return addLotComparisonContext(manifest, result);
}

export function addLotComparisonContext(manifest, result) {
  validateLotComparisonManifest(manifest);
  const patchIndex = manifest.lot.patchIndex;
  const rows = result.rows.map(row => ({...row,
    referencePastureKgDM: row.referencePastureByPaddock[patchIndex],
    scenarioPastureKgDM: row.scenarioPastureByPaddock[patchIndex]
  }));
  return {...result, rows, lot: clone(manifest.lot), model: clone(manifest.lot.model), modelParameters: clone(manifest.lot.modelParameters)};
}

export function replayLotComparisonManifest(manifest, metabolismKernel) {
  return compareLotConfiguredScenarios(manifest, metabolismKernel);
}
