export const ALLOMETRY_HORIZON_DAYS = 70;
export const ALLOMETRY_BREED_NAMES = Object.freeze({AH: 'Angus × Holstein', OB: 'Original Braunvieh', HC: 'Highland'});
export const ALLOMETRY_PUBLISHED_ROUNDED_MEANS = Object.freeze({AH: -0.6, OB: -0.3, HC: 0.08});

export function parseAllometryTsv(text) {
  const lines = String(text).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('Arquivo sem linhas de dados.');
  const headers = lines[0].split('\t');
  const indexes = Object.fromEntries(headers.map((name, index) => [name, index]));
  for (const key of ['Breed', 'Age', 'Weight_1', 'Weight_2', 'Steps_mean', 'Speed_mean', 'Lying_mean', 'Space_evenness_mean', 'Sel_evenness_mean', 'Sel_quality_mean']) {
    if (!(key in indexes)) throw new Error(`Coluna necessária ausente: ${key}`);
  }
  const number = value => value === undefined || value.trim() === '' || value.trim() === 'NA' ? null : Number(value);
  return lines.slice(1).filter(Boolean).map((line, rowIndex) => {
    const fields = line.split('\t');
    const get = key => fields[indexes[key]] ?? '';
    const ageMonths = number(get('Age'));
    const startWeightKg = number(get('Weight_1'));
    const endWeightKg = number(get('Weight_2'));
    if (!Object.hasOwn(ALLOMETRY_BREED_NAMES, get('Breed')) || !Number.isFinite(ageMonths) || !Number.isFinite(startWeightKg) || !Number.isFinite(endWeightKg)) {
      throw new Error(`Linha ${rowIndex + 2} tem categoria ou pesos ausentes/inválidos.`);
    }
    return {
      rowNumber: rowIndex + 1,
      breed: get('Breed'),
      ageMonths,
      startWeightKg,
      endWeightKg,
      derivedAdgKgPerDay: (endWeightKg - startWeightKg) / ALLOMETRY_HORIZON_DAYS,
      stepsPerHour: number(get('Steps_mean')),
      speedMetersPerHour: number(get('Speed_mean')),
      lyingRatio: number(get('Lying_mean')),
      spaceUseEvenness: number(get('Space_evenness_mean')),
      forageSelectionEvenness: number(get('Sel_evenness_mean')),
      selectedForageQuality: number(get('Sel_quality_mean')),
    };
  });
}

export function summarizeAllometryRows(rows) {
  return Object.fromEntries(Object.keys(ALLOMETRY_BREED_NAMES).map(breed => {
    const animals = rows.filter(row => row.breed === breed);
    const ages = animals.map(row => row.ageMonths);
    const adgs = animals.map(row => row.derivedAdgKgPerDay);
    return [breed, {
      n: animals.length,
      ageMinMonths: animals.length ? Math.min(...ages) : null,
      ageMaxMonths: animals.length ? Math.max(...ages) : null,
      meanDerivedAdgKgPerDay: animals.length ? adgs.reduce((sum, value) => sum + value, 0) / adgs.length : null,
      publishedRoundedMeanKgPerDay: ALLOMETRY_PUBLISHED_ROUNDED_MEANS[breed],
      absoluteDifferenceFromPublishedRoundedMeanKgPerDay: animals.length
        ? Math.abs(adgs.reduce((sum, value) => sum + value, 0) / adgs.length - ALLOMETRY_PUBLISHED_ROUNDED_MEANS[breed])
        : null,
    }];
  }));
}
