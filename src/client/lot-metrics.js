const unavailable = reason => ({available: false, value: null, reason});

function numericField(field) {
  if (!field || field.status === 'missing' || field.value == null || field.value === '') return null;
  if (typeof field.value !== 'number' && (typeof field.value !== 'string' || field.value.trim() === '')) return null;
  const value = Number(field.value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function hectares(field) {
  const value = numericField(field);
  if (value == null) return null;
  const unit = String(field.unit ?? '').trim().toLowerCase();
  if (['ha', 'hectare', 'hectares'].includes(unit)) return value;
  if (['m2', 'm²', 'sq m'].includes(unit)) return value / 10_000;
  if (['acre', 'acres', 'ac'].includes(unit)) return value * 0.40468564224;
  return null;
}

function meters(field) {
  const value = numericField(field);
  if (value == null) return null;
  const unit = String(field.unit ?? '').trim().toLowerCase();
  if (['m', 'meter', 'meters', 'metre', 'metres'].includes(unit)) return value;
  if (['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'].includes(unit)) return value / 100;
  if (['mm'].includes(unit)) return value / 1000;
  if (['ft', 'foot', 'feet'].includes(unit)) return value * 0.3048;
  return null;
}

/** Calculate descriptive lot metrics from observed/provenanced snapshot fields only. */
export function calculateLotMetrics({animalCount, area, troughLength} = {}) {
  if (typeof animalCount !== 'number' && (typeof animalCount !== 'string' || animalCount.trim() === '')) animalCount = NaN;
  const count = Number(animalCount);
  const validCount = Number.isInteger(count) && count > 0;
  const hectaresAvailable = hectares(area);
  const troughMeters = meters(troughLength);

  let animalsPerHectare = unavailable('Informe uma quantidade positiva de animais e uma área válida em ha, m² ou acres.');
  let areaPerAnimalHa = unavailable('Informe uma quantidade positiva de animais e uma área válida em ha, m² ou acres.');
  let areaPerAnimalM2 = unavailable('Informe uma quantidade positiva de animais e uma área válida em ha, m² ou acres.');
  if (validCount && hectaresAvailable != null && hectaresAvailable > 0) {
    animalsPerHectare = {available: true, value: count / hectaresAvailable, unit: 'animais/ha'};
    areaPerAnimalHa = {available: true, value: hectaresAvailable / count, unit: 'ha/animal'};
    areaPerAnimalM2 = {available: true, value: hectaresAvailable * 10_000 / count, unit: 'm²/animal'};
  } else if (validCount && hectaresAvailable === 0) {
    animalsPerHectare = unavailable('A área é zero; densidade indefinida.');
    areaPerAnimalHa = unavailable('A área é zero; espaço por animal indefinido.');
    areaPerAnimalM2 = unavailable('A área é zero; espaço por animal indefinido.');
  }

  let troughMetersPerAnimal = unavailable('Informe um comprimento de cocho em unidade compatível e uma quantidade positiva de animais.');
  let troughCentimetersPerAnimal = unavailable('Informe um comprimento de cocho em unidade compatível e uma quantidade positiva de animais.');
  if (validCount && troughMeters != null) {
    troughMetersPerAnimal = {available: true, value: troughMeters / count, unit: 'm/animal'};
    troughCentimetersPerAnimal = {available: true, value: troughMeters * 100 / count, unit: 'cm/animal'};
  }
  return {animalsPerHectare, areaPerAnimalHa, areaPerAnimalM2, troughMetersPerAnimal, troughCentimetersPerAnimal};
}

export function findPaddockField(fields, paddockId, suffixes) {
  for (const suffix of suffixes) {
    const field = fields?.find(item => item.path === `paddock.${paddockId}.${suffix}`);
    if (field) return field;
  }
  return null;
}
