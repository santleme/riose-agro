const ALLOWED_STATUSES = new Set(['observed', 'derived', 'hypothesis', 'missing', 'not-applicable']);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function uniqueIds(items, label, errors) {
  if (!Array.isArray(items)) {
    errors.push(`${label} precisa ser uma lista.`);
    return new Map();
  }
  const byId = new Map();
  for (const [index, item] of items.entries()) {
    const id = item?.id;
    if (typeof id !== 'string' || !id.trim()) {
      errors.push(`${label}[${index}] precisa ter id não vazio.`);
      continue;
    }
    if (byId.has(id)) errors.push(`${label}: id duplicado '${id}'.`);
    else byId.set(id, item);
  }
  return byId;
}

function collectFields(snapshot, sourcesById, errors) {
  const fields = [];
  const add = (field, expectedPath, owner) => {
    if (!isRecord(field)) {
      errors.push(`${owner} precisa conter um campo com proveniência.`);
      return;
    }
    if (field.path !== expectedPath) {
      errors.push(`${owner}: caminho deve ser '${expectedPath}'.`);
    }
    fields.push(field);
  };

  for (const key of ['country', 'region']) {
    add(snapshot.farm?.location?.[key], `farm.location.${key}`, `farm.location.${key}`);
  }
  add(snapshot.population?.species, 'population.species', 'population.species');
  add(snapshot.population?.productionClass, 'population.production_class', 'population.productionClass');
  for (const animal of snapshot.animals) {
    if (!isRecord(animal)) {
      errors.push('animals contém um item que não é objeto.');
      continue;
    }
    add(animal.category, `animal.${animal.id}.category`, `animal ${animal.id}.category`);
  }
  for (const paddock of snapshot.paddocks) {
    if (!isRecord(paddock)) {
      errors.push('paddocks contém um item que não é objeto.');
      continue;
    }
    add(paddock.name, `paddock.${paddock.id}.name`, `paddock ${paddock.id}.name`);
  }
  if (!Array.isArray(snapshot.observations)) {
    errors.push('observations precisa ser uma lista.');
  } else {
    for (const [index, field] of snapshot.observations.entries()) {
      if (!isRecord(field) || typeof field.path !== 'string' || !field.path.trim()) {
        errors.push(`observations[${index}] precisa ter path não vazio.`);
      } else {
        fields.push(field);
      }
    }
  }
  for (const logName of ['operations', 'history']) {
    const events = snapshot[logName]?.events;
    if (!Array.isArray(events)) continue;
    const eventIds = new Set();
    for (const [index, event] of events.entries()) {
      if (!isRecord(event)) {
        errors.push(`${logName}.events[${index}] precisa ser um objeto.`);
        continue;
      }
      if (typeof event.id !== 'string' || !event.id.trim()) {
        errors.push(`${logName}.events[${index}].id precisa ser não vazio.`);
      } else if (eventIds.has(event.id)) {
        errors.push(`${logName}.events: id duplicado '${event.id}'.`);
      } else {
        eventIds.add(event.id);
      }
      if (!ALLOWED_STATUSES.has(event.status) || ['missing', 'not-applicable'].includes(event.status)) {
        errors.push(`${logName}.events[${index}].status precisa ser observed, derived ou hypothesis.`);
      }
      if (!sourcesById.has(event.sourceId)) errors.push(`${logName}.events[${index}]: fonte ${event.sourceId} não existe no catálogo.`);
      if (typeof event.sourceLocator !== 'string' || !event.sourceLocator.trim()) errors.push(`${logName}.events[${index}]: localizador da fonte vazio.`);
      if (typeof event.populationValidity !== 'string' || !event.populationValidity.trim()) errors.push(`${logName}.events[${index}]: validade populacional vazia.`);
      if (!Array.isArray(event.fields)) {
        errors.push(`${logName}.events[${index}].fields precisa ser uma lista.`);
        continue;
      }
      for (const [fieldIndex, field] of event.fields.entries()) {
        if (!isRecord(field)) {
          errors.push(`${logName}.events[${index}].fields[${fieldIndex}] precisa ser um objeto com proveniência.`);
          continue;
        }
        const prefix = `${logName}.${event.id}.`;
        if (typeof field.path !== 'string' || !field.path.startsWith(prefix) || field.path.length === prefix.length) {
          errors.push(`${logName}.events[${index}].fields[${fieldIndex}].path deve começar com '${prefix}' e incluir um campo.`);
        }
        fields.push(field);
      }
    }
  }
  return fields;
}

function checkEntityReferences(snapshot, lotsById, animalsById, paddockIds, errors) {
  const listedByLot = new Map();
  for (const lot of snapshot.lots) {
    if (!isRecord(lot)) {
      errors.push('lots contém um item que não é objeto.');
      continue;
    }
    if (!Array.isArray(lot.animalIds)) {
      errors.push(`lote ${lot.id}: animalIds precisa ser uma lista.`);
      continue;
    }
    if (lot.paddockId !== undefined && !paddockIds.has(lot.paddockId)) {
      errors.push(`lote ${lot.id}: piquete '${lot.paddockId}' não existe.`);
    }
    const seenInLot = new Set();
    for (const animalId of lot.animalIds) {
      if (typeof animalId !== 'string' || !animalId.trim()) {
        errors.push(`lote ${lot.id}: animalIds contém um id vazio ou inválido.`);
        continue;
      }
      if (seenInLot.has(animalId)) errors.push(`lote ${lot.id}: animal '${animalId}' está listado mais de uma vez.`);
      seenInLot.add(animalId);
      if (!animalsById.has(animalId)) {
        errors.push(`lote ${lot.id}: animal '${animalId}' não existe.`);
        continue;
      }
      if (listedByLot.has(animalId)) errors.push(`animal '${animalId}' está listado em mais de um lote.`);
      listedByLot.set(animalId, lot.id);
      if (animalsById.get(animalId).lotId !== lot.id) {
        errors.push(`animal '${animalId}': lotId não corresponde ao lote que o lista.`);
      }
    }
  }
  for (const animal of snapshot.animals) {
    if (!isRecord(animal)) continue;
    if (!lotsById.has(animal.lotId)) errors.push(`animal '${animal.id}': lote '${animal.lotId}' não existe.`);
    if (listedByLot.get(animal.id) !== animal.lotId) {
      errors.push(`animal '${animal.id}' não está listado exatamente no lote indicado por lotId.`);
    }
  }

  for (const field of snapshot.observations ?? []) {
    if (typeof field?.path !== 'string') continue;
    const [namespace, entityId, ...fieldPath] = field.path.split('.');
    if (['animal', 'paddock', 'lot'].includes(namespace)) {
      if (!entityId || fieldPath.length === 0 || fieldPath.some(part => !part)) {
        errors.push(`${field.path}: caminho de entidade precisa incluir id e campo.`);
        continue;
      }
      if (namespace === 'animal' && !animalsById.has(entityId)) {
        errors.push(`${field.path}: animal referenciado não existe.`);
      }
      if (namespace === 'paddock' && !paddockIds.has(entityId)) {
        errors.push(`${field.path}: piquete referenciado não existe.`);
      }
      if (namespace === 'lot' && !lotsById.has(entityId)) {
        errors.push(`${field.path}: lote referenciado não existe.`);
      }
    }
  }
}

function validateMeasurementSeries(observations, errors) {
  const measurementIds = new Set();
  const sampledAt = new Set();
  for (const [index, observation] of observations.entries()) {
    if (!isRecord(observation)) continue;
    if (typeof observation.measurementId !== 'string' || !observation.measurementId.trim()) {
      errors.push(`observations[${index}].measurementId precisa ser não vazio.`);
    } else if (measurementIds.has(observation.measurementId)) {
      errors.push(`observations: measurementId duplicado '${observation.measurementId}'.`);
    } else {
      measurementIds.add(observation.measurementId);
    }
    if (observation.observedAt === null) {
      if (typeof observation.timeMissingReason !== 'string' || !observation.timeMissingReason.trim()) {
        errors.push(`observations[${index}]: observedAt nulo precisa explicar por que a data exata não está disponível.`);
      }
      if (typeof observation.period !== 'string' || !observation.period.trim()) {
        errors.push(`observations[${index}]: observedAt nulo precisa manter o período disponível na fonte.`);
      }
    } else if (typeof observation.observedAt !== 'string' || !Number.isFinite(Date.parse(observation.observedAt))) {
      errors.push(`observations[${index}].observedAt precisa ser data ISO válida ou null explícito.`);
    }
    if (typeof observation.path === 'string') {
      const timeKey = observation.observedAt ?? `period:${observation.period ?? ''}`;
      const key = `${observation.path}\u0000${timeKey}`;
      if (sampledAt.has(key)) errors.push(`${observation.path}: duas medições usam o mesmo instante/período.`);
      sampledAt.add(key);
    }
  }
}

export function validateFarmSnapshot(snapshot) {
  const errors = [];
  const blockers = [];
  if (!isRecord(snapshot)) {
    return {semanticValid: false, simulationEligible: false, errors: ['snapshot precisa ser um objeto.'], blockers: [], missingRequiredFields: []};
  }

  const sourceCatalog = Array.isArray(snapshot.sourceCatalog) ? snapshot.sourceCatalog : [];
  if (!Array.isArray(snapshot.sourceCatalog)) errors.push('sourceCatalog precisa ser uma lista.');
  const sourcesById = uniqueIds(sourceCatalog, 'sourceCatalog', errors);
  const lotsById = uniqueIds(snapshot.lots, 'lots', errors);
  const animalsById = uniqueIds(snapshot.animals, 'animals', errors);
  const paddocksById = uniqueIds(snapshot.paddocks, 'paddocks', errors);
  const animalList = Array.isArray(snapshot.animals) ? snapshot.animals : [];
  const lotList = Array.isArray(snapshot.lots) ? snapshot.lots : [];
  const paddockList = Array.isArray(snapshot.paddocks) ? snapshot.paddocks : [];
  const domainZoneIds = new Set();
  for (const paddock of paddockList) {
    if (paddock?.domainZoneId === undefined) continue;
    if (typeof paddock.domainZoneId !== 'string' || !paddock.domainZoneId.trim()) {
      errors.push(`piquete ${paddock.id}: domainZoneId precisa ser texto não vazio.`);
    } else if (domainZoneIds.has(paddock.domainZoneId)) {
      errors.push(`paddocks: domainZoneId duplicado '${paddock.domainZoneId}'.`);
    } else {
      domainZoneIds.add(paddock.domainZoneId);
    }
  }

  if (typeof snapshot.snapshotId !== 'string' || !snapshot.snapshotId.trim()) errors.push('snapshotId precisa ser não vazio.');
  if (!isRecord(snapshot.farm?.location)) errors.push('farm.location precisa ser um objeto.');
  if (!isRecord(snapshot.population)) errors.push('population precisa ser um objeto.');
  if (!isRecord(snapshot.simulationEligibility)) errors.push('simulationEligibility precisa ser um objeto.');
  if (!isRecord(snapshot.caseDefinition)) errors.push('caseDefinition precisa ser um objeto.');
  if (!isRecord(snapshot.manifestReference)) errors.push('manifestReference precisa ser um objeto.');
  if (!['farm-baseline', 'observed-study-slice', 'demonstrative'].includes(snapshot.snapshotKind)) errors.push('snapshotKind inválido.');

  const safeSnapshot = {
    ...snapshot,
    animals: animalList,
    lots: lotList,
    paddocks: paddockList,
    observations: Array.isArray(snapshot.observations) ? snapshot.observations : undefined,
  };
  const fields = collectFields(safeSnapshot, sourcesById, errors);
  validateMeasurementSeries(safeSnapshot.observations ?? [], errors);
  const byPath = new Map();
  const observationSet = new Set(safeSnapshot.observations ?? []);

  for (const field of fields) {
    const path = field.path;
    if (typeof path !== 'string' || !path.trim()) {
      errors.push('Campo com proveniência precisa ter path não vazio.');
      continue;
    }
    if (!ALLOWED_STATUSES.has(field.status)) errors.push(`${path}: classificação inválida.`);
    if (!sourcesById.has(field.sourceId)) errors.push(`${path}: fonte ${field.sourceId} não existe no catálogo.`);
    if (!byPath.has(path)) byPath.set(path, []);
    else if (!observationSet.has(field) || byPath.get(path).some(previous => !observationSet.has(previous))) {
      errors.push(`${path}: caminho duplicado fora de uma série temporal de observações.`);
    }
    byPath.get(path).push(field);
    if (typeof field.unit !== 'string' || !field.unit.trim()) errors.push(`${path}: unidade vazia.`);
    if (typeof field.sourceLocator !== 'string' || !field.sourceLocator.trim()) errors.push(`${path}: localizador da fonte vazio.`);
    if (typeof field.populationValidity !== 'string' || !field.populationValidity.trim()) errors.push(`${path}: validade populacional vazia.`);
    if (['missing', 'not-applicable'].includes(field.status)) {
      if (field.value !== null) errors.push(`${path}: campo ausente/não aplicável precisa ter value=null.`);
      if (typeof field.missingReason !== 'string' || !field.missingReason.trim()) errors.push(`${path}: campo ausente/não aplicável precisa explicar o motivo.`);
    } else if (field.value === null || field.value === undefined) {
      errors.push(`${path}: valor nulo deve ser marcado explicitamente como missing/not-applicable.`);
    }
  }

  checkEntityReferences(safeSnapshot, lotsById, animalsById, new Set(paddocksById.keys()), errors);

  const requiredPaths = Array.isArray(snapshot.caseDefinition?.requiredFields) ? snapshot.caseDefinition.requiredFields : [];
  if (!Array.isArray(snapshot.caseDefinition?.requiredFields)) errors.push('caseDefinition.requiredFields precisa ser uma lista.');
  else if (requiredPaths.length === 0) errors.push('caseDefinition.requiredFields precisa definir ao menos um campo para o caso.');
  if (new Set(requiredPaths).size !== requiredPaths.length) errors.push('caseDefinition.requiredFields contém caminhos duplicados.');
  if (requiredPaths.some(path => typeof path !== 'string' || !path.trim())) errors.push('caseDefinition.requiredFields contém caminho vazio ou inválido.');
  const missingRequiredFields = requiredPaths.filter(path => {
    const matchingFields = byPath.get(path) ?? [];
    return !matchingFields.some(field => !['missing', 'not-applicable'].includes(field.status));
  });

  if (snapshot.caseDefinition?.reviewStatus !== 'approved') {
    blockers.push('O caso ainda aguarda revisão de domínio da issue #1.');
  }
  if (snapshot.snapshotKind === 'observed-study-slice') {
    blockers.push('Recorte observacional de estudo não é um estado-base executável pelo motor do Agroville.');
  }
  if (missingRequiredFields.length) {
    blockers.push(...missingRequiredFields.map(path => `Campo obrigatório ausente: ${path}.`));
  }

  const storedGaps = snapshot.simulationEligibility?.missingRequiredFields ?? [];
  if (!Array.isArray(storedGaps) || !sameStrings(storedGaps, missingRequiredFields)) {
    errors.push('simulationEligibility.missingRequiredFields não corresponde aos campos obrigatórios atuais.');
  }
  const expectedStatus = snapshot.snapshotKind === 'observed-study-slice'
    ? 'not-applicable'
    : missingRequiredFields.length
      ? 'blocked'
      : snapshot.caseDefinition?.reviewStatus === 'approved'
        ? 'ready'
        : 'review-pending';
  if (snapshot.simulationEligibility?.status !== expectedStatus) {
    errors.push(`simulationEligibility.status deve ser '${expectedStatus}'.`);
  }
  if (expectedStatus === 'not-applicable' && (typeof snapshot.simulationEligibility?.reason !== 'string' || !snapshot.simulationEligibility.reason.trim())) {
    errors.push('simulationEligibility.reason precisa explicar por que o recorte observacional não pode ser executado.');
  }

  const manifestReference = snapshot.manifestReference;
  if (manifestReference?.status === 'linked') {
    if (manifestReference.type !== 'agroville-comparison') errors.push("manifestReference.type deve ser 'agroville-comparison'.");
    if (![1, 2].includes(manifestReference.version)) errors.push('manifestReference.version deve corresponder a uma versão suportada do manifesto de comparação (1 ou 2).');
    if (typeof manifestReference.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifestReference.sha256)) errors.push('manifestReference.sha256 precisa conter o SHA-256 hexadecimal do arquivo do manifesto.');
  } else if (manifestReference?.status === 'not-linked') {
    if (typeof manifestReference.reason !== 'string' || !manifestReference.reason.trim()) errors.push('manifestReference.reason precisa estar presente quando not-linked.');
  } else {
    errors.push('manifestReference.status deve ser linked ou not-linked.');
  }

  return {
    semanticValid: errors.length === 0,
    simulationEligible: errors.length === 0 && expectedStatus === 'ready',
    errors,
    blockers,
    missingRequiredFields,
  };
}

function sameStrings(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}
