const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const DEMO_LOT_MODEL = Object.freeze({
  id: 'riose-registered-demo-lot',
  version: '1.0.0',
  status: 'demonstrative_unvalidated'
});

/** A map patch is a stable lot in the registered demo farm, independent of observed snapshots. */
export function resolveDemoLot(snapshot, patchIndex) {
  if (!record(snapshot) || !Number.isInteger(patchIndex) || patchIndex < 0 || patchIndex > 3
    || !Array.isArray(snapshot.animals)) return null;
  const animals = snapshot.animals.filter(animal => animal?.patch === patchIndex);
  if (!animals.length) return null;
  return {
    lotId: `demo-paddock-${patchIndex + 1}`,
    patchIndex,
    animalIds: animals.map(animal => animal.id)
  };
}

/** Isolate a demo lot while preserving its current state, seed, and four-paddock model. */
export function isolateDemoLotSnapshot(snapshot, demoLot) {
  if (!record(snapshot) || !Array.isArray(snapshot.animals) || !record(demoLot)
    || demoLot.lotId !== `demo-paddock-${demoLot.patchIndex + 1}`
    || !Array.isArray(demoLot.animalIds) || !demoLot.animalIds.length) {
    throw new Error('Lote demonstrativo inválido.');
  }
  const selected = snapshot.animals.filter(animal => demoLot.animalIds.includes(animal.id));
  if (selected.length !== demoLot.animalIds.length
    || selected.some(animal => animal.patch !== demoLot.patchIndex)
    || new Set(demoLot.animalIds).size !== demoLot.animalIds.length) {
    throw new Error('Os animais do lote demonstrativo não correspondem ao snapshot selecionado.');
  }
  return {...structuredClone(snapshot), animals: structuredClone(selected)};
}

export function createDemoLotContext(demoLot, factor, referenceConfig, scenarioConfig) {
  if (!record(demoLot) || !['diet', 'housing', 'supplement', 'weather'].includes(factor)
    || !Array.isArray(demoLot.animalIds) || demoLot.animalIds.length === 0
    || referenceConfig?.[factor] === scenarioConfig?.[factor]) {
    throw new Error('Intervenção do lote demonstrativo inválida.');
  }
  return {
    type: 'riose-demo-lot-context',
    version: 1,
    source: 'registered-demonstrative-scenario',
    lotId: demoLot.lotId,
    patchIndex: demoLot.patchIndex,
    animalIds: [...demoLot.animalIds],
    model: {...DEMO_LOT_MODEL},
    intervention: {
      factor,
      referenceValue: referenceConfig[factor],
      scenarioValue: scenarioConfig[factor]
    }
  };
}

export function validateDemoLotContext(context, snapshot, factor, referenceConfig, scenarioConfig) {
  const expected=['animalIds','intervention','lotId','model','patchIndex','source','type','version'];
  if(!context||context.type!=='riose-demo-lot-context'||context.version!==1
    ||Object.keys(context).sort().join(',')!==expected.sort().join(',')
    ||context.source!=='registered-demonstrative-scenario'
    ||!Number.isInteger(context.patchIndex)||context.patchIndex<0||context.patchIndex>3
    ||context.lotId!==`demo-paddock-${context.patchIndex+1}`
    ||!Array.isArray(context.animalIds)||context.animalIds.length===0
    ||new Set(context.animalIds).size!==context.animalIds.length
    ||context.model?.id!==DEMO_LOT_MODEL.id||context.model.version!==DEMO_LOT_MODEL.version
    ||context.model.status!==DEMO_LOT_MODEL.status
    ||Object.keys(context.model).sort().join(',')!=='id,status,version'
    ||!context.intervention||Object.keys(context.intervention).sort().join(',')!=='factor,referenceValue,scenarioValue'
    ||context.intervention.factor!==factor
    ||context.intervention.referenceValue!==referenceConfig?.[factor]
    ||context.intervention.scenarioValue!==scenarioConfig?.[factor]
    ||context.animalIds.length!==snapshot?.animals?.length
    ||context.animalIds.some((id,index)=>id!==snapshot.animals[index]?.id)
    ||snapshot.animals.some(animal=>animal.patch!==context.patchIndex)) {
    throw new Error('Contexto de lote demonstrativo incompatível com o manifesto e o snapshot.');
  }
  return true;
}

export function createDemoLotManifestEnvelope(manifest, lotContext) {
  validateDemoLotContext(lotContext,manifest?.initialSnapshot,manifest?.factor,manifest?.scenarios?.reference,manifest?.scenarios?.scenario);
  return {type:'riose-demo-lot-comparison-envelope',version:1,manifest:structuredClone(manifest),lotContext:structuredClone(lotContext)};
}

export function validateDemoLotManifestEnvelope(envelope) {
  const keys=['lotContext','manifest','type','version'];
  if(!record(envelope)||envelope.type!=='riose-demo-lot-comparison-envelope'||envelope.version!==1
    ||Object.keys(envelope).sort().join(',')!==keys.sort().join(','))throw new Error('Envelope de comparação por lote inválido.');
  validateDemoLotContext(envelope.lotContext,envelope.manifest?.initialSnapshot,envelope.manifest?.factor,
    envelope.manifest?.scenarios?.reference,envelope.manifest?.scenarios?.scenario);
  return true;
}

/** Resolve a visual pasture zone to a real snapshot paddock and its lots.
 * No positional or ordinal matching is performed: the snapshot must declare
 * paddock.domainZoneId and each lot must declare paddockId.
 */
export function resolveLotSelection(snapshot, domainZoneId) {
  if (!record(snapshot) || typeof domainZoneId !== 'string' || !domainZoneId) return null;
  const paddocks = Array.isArray(snapshot.paddocks) ? snapshot.paddocks : [];
  const paddock = paddocks.find(item => item?.domainZoneId === domainZoneId);
  if (!paddock) return null;

  const animalById = new Map((Array.isArray(snapshot.animals) ? snapshot.animals : []).map(animal => [animal?.id, animal]));
  const lots = (Array.isArray(snapshot.lots) ? snapshot.lots : [])
    .filter(lot => lot?.paddockId === paddock.id)
    .map(lot => {
      const animalIds = Array.isArray(lot.animalIds) ? lot.animalIds : [];
      const lotAnimals = animalIds.map(id => animalById.get(id)).filter(Boolean);
      const fields = [];
      const prefix = `paddock.${paddock.id}.`;
      for (const field of Array.isArray(snapshot.observations) ? snapshot.observations : []) {
        if (field?.path?.startsWith(prefix)) fields.push(field);
      }
      const animalIdsInLot = new Set(lotAnimals.map(animal => animal.id));
      for (const field of Array.isArray(snapshot.observations) ? snapshot.observations : []) {
        const path = field?.path;
        const pathParts = typeof path === 'string' ? path.split('.') : [];
        if (pathParts[0] === 'animal' && animalIdsInLot.has(pathParts[1]) && pathParts.length > 2) fields.push(field);
        if (pathParts[0] === 'lot' && pathParts[1] === lot.id && pathParts.length > 2) fields.push(field);
      }
      const lotAreaPaths = [`lot.${lot.id}.area_ha`, `lot.${lot.id}.area_m2`, `lot.${lot.id}.area_acres`, `lot.${lot.id}.lot_area`];
      const paddockAreaPaths = [`paddock.${paddock.id}.area_ha`, `paddock.${paddock.id}.area_m2`, `paddock.${paddock.id}.area_acres`, `paddock.${paddock.id}.lot_area`];
      const areaPaths = [...lotAreaPaths, ...paddockAreaPaths];
      const availableArea = field => field.status !== 'missing' && field.status !== 'not-applicable' && field.value != null;
      const area = fields.find(field => lotAreaPaths.includes(field.path) && availableArea(field))
        ?? fields.find(field => paddockAreaPaths.includes(field.path) && availableArea(field))
        ?? fields.find(field => areaPaths.includes(field.path));
      return {lot, paddock, animals: lotAnimals, fields, area: area ?? null};
    });
  return {paddock, lots};
}

export function formatLotArea(area) {
  if (!area || area.status === 'missing' || area.value == null || !Number.isFinite(Number(area.value))) {
    return {value: 'Não informada', detail: area?.missingReason ?? 'O snapshot não declara a área do piquete.'};
  }
  return {value: `${Number(area.value).toLocaleString('pt-BR')} ${area.unit || 'ha'}`, detail: `${area.status} · ${area.sourceLocator || 'origem não informada'}`};
}
