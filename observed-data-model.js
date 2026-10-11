export const OBSERVED_GROUPS = [
  {key: 'Control', color: '#557d59', name: 'CONTROL'},
  {key: 'Bucket', color: '#c58040', name: 'FENO · BALDE'},
  {key: 'Pipe', color: '#657d9b', name: 'FENO · TUBO'},
];

const MEASURE_SOURCES = {
  weight: {source: 'weights'},
  grain: {feed: 'grain'},
  hay: {feed: 'hay'},
  tmr: {feed: 'tmr'},
  water: {feed: 'water'},
};

export function summarizeObservedData(dataset, measureId) {
  const measure = MEASURE_SOURCES[measureId];
  if (!measure) throw new Error(`Unknown observed measure: ${measureId}`);
  const rows = measure.source === 'weights'
    ? dataset.weights.map(row => ({...row, value: row.weight_kg}))
    : dataset.intake.filter(row => row.feed === measure.feed).map(row => ({...row, value: row.value}));
  const animalsByGroup = new Map(OBSERVED_GROUPS.map(group => [group.key, new Map()]));
  const weekly = new Map(OBSERVED_GROUPS.map(group => [group.key, new Map()]));
  let missing = 0;

  for (const row of rows) {
    if (row.value === null || row.value === undefined) {
      missing += 1;
      continue;
    }
    const age = Number(row.age_days);
    const week = Math.min(8, Math.floor(age / 7));
    const animalKey = String(row.calf);
    const groupAnimals = animalsByGroup.get(row.treatment);
    const groupWeeks = weekly.get(row.treatment);
    if (!groupAnimals || !groupWeeks) continue;
    if (!groupAnimals.has(animalKey)) groupAnimals.set(animalKey, []);
    groupAnimals.get(animalKey).push(row);
    if (!groupWeeks.has(week)) groupWeeks.set(week, new Map());
    const weekAnimals = groupWeeks.get(week);
    if (!weekAnimals.has(animalKey)) weekAnimals.set(animalKey, []);
    weekAnimals.get(animalKey).push(Number(row.value));
  }

  const series = new Map();
  for (const group of OBSERVED_GROUPS) {
    const result = [];
    for (let week = 0; week <= 8; week += 1) {
      const individualValues = [...(weekly.get(group.key).get(week) ?? new Map()).values()]
        .map(items => items.reduce((sum, value) => sum + value, 0) / items.length);
      if (!individualValues.length) {
        result.push(null);
        continue;
      }
      result.push({
        week,
        mean: individualValues.reduce((sum, value) => sum + value, 0) / individualValues.length,
        min: Math.min(...individualValues),
        max: Math.max(...individualValues),
        n: individualValues.length,
      });
    }
    series.set(group.key, result);
  }

  return {rows, missing, animalsByGroup, series};
}

export function compareObservedGroups(dataset, measureId, referenceGroup, comparisonGroup) {
  if (referenceGroup === comparisonGroup) throw new Error('Choose two different observed groups');
  const summaries = summarizeObservedData(dataset, measureId);
  const reference = summaries.series.get(referenceGroup);
  const comparison = summaries.series.get(comparisonGroup);
  if (!reference || !comparison) throw new Error('Unknown observed group');

  return reference.map((referencePoint, week) => {
    const comparisonPoint = comparison[week];
    if (!referencePoint || !comparisonPoint) {
      return {week, reference: null, comparison: null, difference: null, percentDifference: null};
    }
    const difference = comparisonPoint.mean - referencePoint.mean;
    return {
      week,
      reference: referencePoint.mean,
      comparison: comparisonPoint.mean,
      referenceN: referencePoint.n,
      comparisonN: comparisonPoint.n,
      difference,
      percentDifference: referencePoint.mean === 0 ? null : difference / Math.abs(referencePoint.mean) * 100,
    };
  });
}
