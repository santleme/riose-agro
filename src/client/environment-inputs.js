const finiteField = field => {
  if (!field || field.status === 'missing' || field.value == null || field.value === '') return null;
  const value = Number(field.value);
  return Number.isFinite(value) ? value : null;
};

export function snapshotEnvironmentField(snapshot, key) {
  const fromFarm = snapshot?.farm?.environment?.[key];
  if (fromFarm) return fromFarm;
  return snapshot?.observations?.find(field => field?.path === `environment.${key}` || field?.path === `farm.${key}`) ?? null;
}

export function environmentBaseline(snapshot) {
  const temperature = snapshotEnvironmentField(snapshot, 'temperature_c');
  const humidity = snapshotEnvironmentField(snapshot, 'relative_humidity_pct');
  const read = (field, acceptedUnits) => {
    if (!field || field.status === 'missing' || field.value == null || field.value === '') return {value: null, status: 'missing', source: field?.sourceLocator ?? null};
    if (!acceptedUnits.includes(String(field.unit ?? '').trim().toLowerCase())) return {value: null, status: 'invalid-unit', source: field.sourceLocator ?? null};
    const value = finiteField(field);
    return value == null ? {value: null, status: 'invalid-value', source: field.sourceLocator ?? null} : {value, status: field.status ?? 'reported', source: field.sourceLocator ?? null};
  };
  return {
    temperatureC: read(temperature, ['°c', 'c', 'degc', 'celsius']),
    relativeHumidityPct: read(humidity, ['%', 'percent', 'percentage'])
  };
}

export function initialEnvironmentState(snapshot, saved = null) {
  const baseline = environmentBaseline(snapshot);
  if (saved && saved.snapshotId === (snapshot?.snapshotId ?? null) && saved.current) return structuredClone(saved);
  const valueOrEmpty = input => input.value == null ? '' : String(input.value);
  return {
    snapshotId: snapshot?.snapshotId ?? null,
    baseline,
    current: {temperatureC: valueOrEmpty(baseline.temperatureC), relativeHumidityPct: valueOrEmpty(baseline.relativeHumidityPct)},
    currentSource: {temperatureC: baseline.temperatureC.status === 'missing' ? 'missing' : baseline.temperatureC.status, relativeHumidityPct: baseline.relativeHumidityPct.status === 'missing' ? 'missing' : baseline.relativeHumidityPct.status}
  };
}

export function updateEnvironmentInput(state, key, rawValue) {
  if (!['temperatureC', 'relativeHumidityPct'].includes(key)) throw new Error('Entrada ambiental desconhecida.');
  const value = rawValue === '' ? '' : Number(rawValue);
  if (rawValue !== '' && !Number.isFinite(value)) throw new Error('Informe um número finito.');
  if (key === 'temperatureC' && value !== '' && (value < -40 || value > 60)) throw new Error('A temperatura deve estar entre −40 e 60 °C.');
  if (key === 'relativeHumidityPct' && value !== '' && (value < 0 || value > 100)) throw new Error('A umidade deve estar entre 0 e 100%.');
  return {...state, current: {...state.current, [key]: rawValue === '' ? '' : String(value)}, currentSource: {...state.currentSource, [key]: rawValue === '' ? 'missing' : 'reported'}};
}

export function environmentDiffRows(state, config = {}, frequency = null) {
  const baseline = state?.baseline ?? {};
  const current = state?.current ?? {};
  const sourceLabel = field => field?.status === 'invalid-unit' ? 'Unidade incompatível' : field?.status === 'invalid-value' ? 'Valor inválido' : field?.status === 'missing' || field?.value == null ? 'Não informado' : `${field.value}`;
  const scenarioLabel = (key, unit) => current[key] === '' || current[key] == null ? 'Não informado' : `${current[key]} ${unit}`;
  const rows = [
    {name: 'Temperatura', baseline: sourceLabel(baseline.temperatureC) + (baseline.temperatureC?.value == null ? '' : ' °C'), scenario: scenarioLabel('temperatureC', '°C'), changed: String(baseline.temperatureC?.value ?? '') !== String(current.temperatureC ?? '')},
    {name: 'Umidade relativa', baseline: sourceLabel(baseline.relativeHumidityPct) + (baseline.relativeHumidityPct?.value == null ? '' : ' %'), scenario: scenarioLabel('relativeHumidityPct', '%'), changed: String(baseline.relativeHumidityPct?.value ?? '') !== String(current.relativeHumidityPct ?? '')},
    {name: 'Dieta', baseline: config.dietLabel ?? 'Não informado', scenario: config.dietLabel ?? 'Não informado', changed: false},
    {name: 'Frequência alimentar', baseline: frequency ?? 'Não informado', scenario: frequency ?? 'Não informado', changed: false}
  ];
  return rows;
}
