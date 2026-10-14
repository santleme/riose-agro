const unavailable = 'não informado';

function valueText(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : unavailable;
  if (typeof value === 'string' && value.trim()) return value;
  return unavailable;
}

function configText(config) {
  if (!config || typeof config !== 'object') return unavailable;
  return [
    `- Dieta: ${valueText(config.diet)}`,
    `- Alojamento: ${valueText(config.housing)}`,
    `- Clima: ${valueText(config.weather)}`,
    `- Suplemento (kg MS/animal/dia): ${valueText(config.supplement)}`
  ].join('\n');
}

function metricRow(label, key, row) {
  return `- ${label}: base ${valueText(row?.[`baseline${key}`])}; intervenção ${valueText(row?.[`scenario${key}`])}`;
}

function renderModelProvenance(models) {
  if (!Array.isArray(models) || models.length === 0) return null;
  return [
    '## Proveniência de modelos científicos',
    ...models.map(model => {
      const inputs = model.inputs && typeof model.inputs === 'object'
        ? Object.entries(model.inputs).map(([name, item]) => `${name}=${valueText(item?.value)} ${item?.unit ?? '(unidade não informada)'}`).join('; ')
        : 'não informado';
      const references = Array.isArray(model.evidenceReferences) && model.evidenceReferences.length
        ? model.evidenceReferences.map(reference => `${reference.id ?? reference.locator ?? 'referência'} [${reference.status ?? 'status não informado'}]`).join('; ')
        : 'não informada';
      return [
        `- Modelo: ${valueText(model.modelId)}@${valueText(model.version)}`,
        `- Entradas: ${inputs}`,
        `- Evidência: ${references}; estado: ${valueText(model.evidenceStatus)}`,
        `- Hash da implementação: ${valueText(model.implementationHash)}`
      ].join('\n');
    }),
    '- O status da evidência é preservado; a resolução não promove evidência nem valida o modelo.'
  ].join('\n');
}

export function renderSimulationReport(result, manifest, {lotContext} = {}) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.rows)) {
    throw new Error('Resultado inválido: informe um resultado de comparação do motor com uma série de linhas.');
  }
  if (!Number.isInteger(result.days) || result.days < 1 || result.days > 365) {
    throw new Error('Resultado inválido: o horizonte deve ser um número inteiro de dias entre 1 e 365.');
  }

  const lastRow = result.rows.find(row => row && row.day === result.days);
  const assumptions = result.assumptions && typeof result.assumptions === 'object'
    ? Object.entries(result.assumptions).map(([key, value]) => `- ${key}: ${valueText(value)}`).join('\n')
    : unavailable;
  const manifestDetails = manifest && typeof manifest === 'object'
    ? [
      `- Tipo/versão: ${valueText(manifest.type)} / ${valueText(manifest.version)}`,
      `- Semente: ${valueText(manifest.seed)}`,
      `- Fator comparado: ${valueText(manifest.factor)}`,
      `- Horizonte (dias): ${valueText(manifest.periodDays)}`
    ].join('\n')
    : unavailable;
  const validation = result.validated === false ? 'demonstrativo; não validado' : 'não informado';
  const differenceRows = [
    metricRow('Peso médio no último dia (kg/animal)', 'Weight', lastRow),
    metricRow('Consumo estimado no período (kg MS/lote)', 'ConsumptionKgDM', lastRow),
    metricRow('Estoque de forragem no último dia (kg MS)', 'PastureKgDM', lastRow),
    metricRow('Custo acumulado no período (R$/lote)', 'Cost', lastRow)
  ].join('\n');
  const modelProvenance = renderModelProvenance(result.scientificProvenance);
  const lotDetails=lotContext?[
    '## Lote demonstrativo',
    `- ID estável: ${valueText(lotContext.lotId)}`,
    `- IDs de animais simulados: ${Array.isArray(lotContext.animalIds)?lotContext.animalIds.join(', '):unavailable}`,
    `- Modelo: ${valueText(lotContext.model?.id)}@${valueText(lotContext.model?.version)}; estado: ${valueText(lotContext.model?.status)}`,
    `- Intervenção única: ${valueText(lotContext.intervention?.factor)} ${valueText(lotContext.intervention?.referenceValue)} → ${valueText(lotContext.intervention?.scenarioValue)}`,
    '- Dados de snapshots observados não foram usados como estado inicial.'
  ].join('\n'):null;

  return [
    '# Relatório da simulação',
    '',
    '## Cenário',
    `- Classificação do resultado: ${validation}`,
    `- Horizonte (dias): ${valueText(result.days)}`,
    `- Rebanho (animais): ${valueText(result.herdSize)}`,
    `- Peso médio inicial (kg/animal): ${valueText(result.startWeight)}`,
    '',
    '## Entradas registradas',
    '### Base',
    configText(manifest?.scenarios?.reference ?? result.baselineConfig),
    '',
    '### Intervenção',
    configText(manifest?.scenarios?.scenario ?? result.scenarioConfig),
    ...(lotDetails?['',lotDetails]:[]),
    '',
    '## Principais resultados e diferenças',
    'Valores apresentados lado a lado diretamente da linha final do resultado do motor; não são recalculados pelo relatório.',
    differenceRows,
    '',
    '## Hipóteses do motor',
    assumptions,
    '',
    '## Limitações',
    '- Os resultados são simulados e não representam observações de animais reais.',
    '- Resultado demonstrativo e não validado; não constitui recomendação, prescrição ou previsão validada.',
    '- Campos ausentes ou não finitos são apresentados como “não informado”.',
    '',
    '## Fontes e proveniência disponíveis',
    `- Resultado: saída do motor de simulação (engine.js); estado: ${validation}.`,
    `- Manifesto de reprodução:\n${manifestDetails}`,
    '- Fontes empíricas vinculadas a esta execução: não informado.',
    ...(modelProvenance ? ['', modelProvenance] : []),
    ''
  ].join('\n');
}
