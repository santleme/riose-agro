const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

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
      const areaPaths = [`paddock.${paddock.id}.area_ha`, `paddock.${paddock.id}.area_m2`, `paddock.${paddock.id}.area_acres`, `paddock.${paddock.id}.lot_area`, `lot.${lot.id}.area_ha`, `lot.${lot.id}.area_m2`, `lot.${lot.id}.area_acres`, `lot.${lot.id}.lot_area`];
      const area = fields.find(field => areaPaths.includes(field.path) && field.status !== 'missing' && field.status !== 'not-applicable' && field.value != null) ?? fields.find(field => areaPaths.includes(field.path));
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
