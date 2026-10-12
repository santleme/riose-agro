import {validateReproducibilityManifest} from './scenario-contract.js';
import {sha256Bytes} from './comparison-archive.js';
import {validateFarmSnapshot} from './snapshot-validator.js';
import {validateFarmSnapshotManifestReference} from './snapshot-manifest-link.js';

const projectedMetrics = {
  'weight': {unit: 'kg/animal', get: metrics => metrics.weight},
  'gain': {unit: 'kg/animal', get: metrics => metrics.gain},
  'cost': {unit: 'BRL/lot', get: metrics => metrics.cost},
  'pasture': {unit: 'kg_DM/all_paddocks', get: metrics => metrics.pasture},
  'stress': {unit: 'index', get: metrics => metrics.stress},
  'intake.totalKgDM': {unit: 'kg_DM/lot', get: metrics => metrics.intake?.totalKgDM},
  'intake.pastureKgDM': {unit: 'kg_DM/lot', get: metrics => metrics.intake?.pastureKgDM},
  'intake.barnBaseKgDM': {unit: 'kg_DM/lot', get: metrics => metrics.intake?.barnBaseKgDM},
  'intake.supplementKgDM': {unit: 'kg_DM/lot', get: metrics => metrics.intake?.supplementKgDM},
  'intake.dietExtraKgDM': {unit: 'kg_DM/lot', get: metrics => metrics.intake?.dietExtraKgDM},
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateOutcomeRecord(record, archiveBytes, manifestBytes, snapshotBytes) {
  const errors = [];
  const archiveRaw = Buffer.isBuffer(archiveBytes) ? archiveBytes : Buffer.from(archiveBytes);
  const manifestRaw = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes);
  const snapshotRaw = Buffer.isBuffer(snapshotBytes) ? snapshotBytes : Buffer.from(snapshotBytes ?? '');
  let archive;
  let manifest;
  let snapshot;
  let manifestBaseline;
  let manifestDuration;
  try {
    archive = JSON.parse(archiveRaw.toString('utf8'));
  } catch {
    return {valid: false, errors: ['Não foi possível ler o JSON do arquivo de projeção.'], comparisons: []};
  }
  try {
    manifest = JSON.parse(manifestRaw.toString('utf8'));
    validateReproducibilityManifest(manifest);
    manifestBaseline = manifest.version === 1 ? manifest.initialSnapshot : manifest.baseline;
    manifestDuration = manifest.version === 1 ? manifest.periodDays : manifest.duration.value;
  } catch (error) {
    return {valid: false, errors: [`Manifesto de comparação inválido: ${error.message}`], comparisons: []};
  }
  try {
    snapshot = JSON.parse(snapshotRaw.toString('utf8'));
  } catch {
    return {valid: false, errors: ['Não foi possível ler o JSON do snapshot da fazenda.'], comparisons: []};
  }
  if (archive?.type !== 'agroville-comparison-result' || archive.version !== 1) {
    errors.push('Tipo/versão do arquivo de projeção não suportado.');
  }
  if (archive?.manifestReference?.sha256 !== sha256Bytes(manifestRaw)) {
    errors.push('SHA-256 do manifesto não corresponde ao arquivo de projeção.');
  }
  if (archive?.manifestReference?.type !== manifest.type || archive?.manifestReference?.version !== manifest.version) {
    errors.push('Tipo/versão do manifesto não correspondem à referência do arquivo de projeção.');
  }
  if (!/^[a-f0-9]{64}$/.test(archive?.engineSourceSha256 ?? '')) {
    errors.push('Arquivo de projeção não identifica um SHA-256 válido do código do motor.');
  }
  if (record?.projection?.archiveSha256 !== sha256Bytes(archiveRaw)) {
    errors.push('SHA-256 do arquivo de projeção não corresponde ao registro de desfecho.');
  }
  if (record?.projection?.manifestSha256 !== sha256Bytes(manifestRaw)) {
    errors.push('SHA-256 do manifesto não corresponde ao registro de desfecho.');
  }
  if (record?.subject?.snapshotSha256 !== sha256Bytes(snapshotRaw)) {
    errors.push('SHA-256 do snapshot não corresponde ao registro de desfecho.');
  }
  if (snapshot?.snapshotKind === 'observed-study-slice') {
    errors.push('Recorte observacional de estudo não pode vincular uma projeção de fazenda.');
  }
  const snapshotValidation = validateFarmSnapshot(snapshot);
  errors.push(...snapshotValidation.errors.map(error => `Snapshot: ${error}`));
  if (!Array.isArray(snapshot?.caseDefinition?.requiredFields) || snapshot.caseDefinition.requiredFields.length === 0) errors.push('Snapshot não declara campos obrigatórios para o caso zootécnico aprovado.');
  if (!snapshotValidation.simulationEligible) errors.push('Snapshot não está aprovado e elegível como estado-base de simulação.');
  const snapshotManifest = validateFarmSnapshotManifestReference(snapshot, manifestRaw);
  errors.push(...snapshotManifest.errors.map(error => `Snapshot: ${error}`));
  const selectedLot = Array.isArray(snapshot?.lots) ? snapshot.lots.find(lot => lot?.id === record?.subject?.entityId) : undefined;
  if (!selectedLot) errors.push('ID da entidade do registro não corresponde a um lote do snapshot vinculado.');
  else if (!Array.isArray(selectedLot.animalIds) || selectedLot.animalIds.length !== manifestBaseline?.animals?.length || selectedLot.animalIds.length !== archive?.comparison?.herdSize) {
    errors.push('Quantidade de animais do lote no snapshot não corresponde ao rebanho da projeção.');
  }
  if (record?.decision?.status === 'implemented' && typeof record.decision.occurredAt !== 'string') {
    errors.push('Decisão marcada como implementada precisa ter ocorridoAt.');
  }
  if (record?.decision?.status === 'implemented' && !['baseline', 'scenario', 'unknown'].includes(record.decision.executedScenario)) {
    errors.push('Decisão marcada como implementada precisa identificar o cenário executado ou declarar unknown.');
  }
  const comparison = archive?.comparison;
  if (!isRecord(comparison) || !isRecord(comparison.baseline) || !isRecord(comparison.scenario)) {
    errors.push('Arquivo de projeção não contém resultados reproduzíveis para base e alternativa.');
  } else {
    if (comparison.validated !== false) errors.push('Arquivo de projeção não preserva o estado demonstrativo não validado do motor.');
    if (comparison.days !== manifestDuration) errors.push('Horizonte do resultado arquivado não corresponde ao manifesto.');
  }
  const referencesValid = errors.length === 0;

  const comparisons = [];
  const observationIds = new Set();
  for (const [index, observation] of (Array.isArray(record?.observations) ? record.observations : []).entries()) {
    if (typeof observation?.id === 'string' && observation.id.trim()) {
      if (observationIds.has(observation.id)) errors.push(`observations: id duplicado '${observation.id}'.`);
      observationIds.add(observation.id);
    }
    const metric = projectedMetrics[observation?.metricPath];
    const projected = metric?.get(comparison?.[observation?.scenario]);
    const item = {
      observationId: observation?.id ?? `observations[${index}]`,
      metricPath: observation?.metricPath,
      scenario: observation?.scenario,
      status: 'not-comparable',
      reason: '',
    };
    if (!referencesValid) item.reason = 'Referências de manifesto/arquivo de projeção inválidas; comparação bloqueada.';
    else if (!metric) item.reason = 'Métrica projetada não está na lista suportada.';
    else if (!Number.isFinite(projected)) item.reason = 'A projeção não contém um valor finito para essa métrica.';
    else if (observation.unit !== metric.unit) item.reason = `Unidade precisa ser '${metric.unit}' para comparar com esta saída.`;
    else if (observation.status !== 'observed' || !Number.isFinite(observation.value)) item.reason = 'A observação não contém um valor medido finito.';
    else if (!['measured', 'derived'].includes(observation.quality)) item.reason = 'Qualidade estimada ou desconhecida não pode gerar comparação de desfecho medido.';
    else if (record?.subject?.level !== 'lot') item.reason = 'Esta projeção contém métricas agregadas do lote; observação individual ou da fazenda não está alinhada.';
    else if (observation.periodDays !== comparison.days) item.reason = `Horizonte observado (${observation.periodDays} dias) difere do horizonte projetado (${comparison.days} dias).`;
    else if (!observation.periodStart || !observation.periodEnd || !Number.isFinite(Date.parse(`${observation.periodStart}T00:00:00Z`)) || !Number.isFinite(Date.parse(`${observation.periodEnd}T00:00:00Z`))) item.reason = 'Informe uma janela de observação válida para comparar o desfecho.';
    else if (Date.parse(`${observation.periodEnd}T00:00:00Z`) - Date.parse(`${observation.periodStart}T00:00:00Z`) !== observation.periodDays * 86400000) item.reason = 'As datas de início e fim não correspondem à duração informada.';
    else if (record?.decision?.status !== 'implemented') item.reason = 'A intervenção registrada não foi executada integralmente.';
    else if (!['baseline', 'scenario'].includes(record?.decision?.executedScenario) || record.decision.executedScenario !== observation.scenario) item.reason = 'O cenário observado não corresponde ao cenário efetivamente executado.';
    else if (!Number.isFinite(Date.parse(record?.decision?.occurredAt ?? '')) || Date.parse(`${observation.periodStart}T00:00:00Z`) <= Date.parse(record.decision.occurredAt)) item.reason = 'A janela observada precisa começar depois da execução da decisão.';
    else if (!Number.isFinite(Date.parse(record?.decision?.occurredAt ?? '')) || !Number.isFinite(Date.parse(observation?.observedAt ?? '')) || Date.parse(observation.observedAt) <= Date.parse(record.decision.occurredAt)) item.reason = 'A medição precisa ocorrer depois da execução da decisão.';
    else if (Date.parse(observation.observedAt) < Date.parse(`${observation.periodEnd}T00:00:00Z`)) item.reason = 'A data da medição não pode anteceder o fim da janela observada.';
    else if (!['granted', 'not-required'].includes(record?.governance?.consentStatus)) item.reason = 'Uso de comparação bloqueado até haver consentimento autorizado.';
    else if (record?.governance?.consentStatus === 'not-required' && !record?.governance?.consentBasis?.trim()) item.reason = 'Justifique por que consentimento não é aplicável.';
    else if (!['public', 'authorized'].includes(record?.governance?.accessStatus)) item.reason = 'Acesso aos dados não foi autorizado.';
    else if (!record?.governance?.accessBasis?.trim()) item.reason = 'Informe a base de acesso aos dados.';
    else if (record?.review?.status !== 'approved') item.reason = 'Medição ainda não foi aprovada por revisão humana.';
    else if (observation.alignment?.status !== 'approved') item.reason = 'A equivalência entre desfecho observado e métrica projetada ainda não foi aprovada.';
    else {
      const difference = observation.value - projected;
      item.status = 'comparable-descriptive';
      item.projectedValue = projected;
      item.observedValue = observation.value;
      item.unit = metric.unit;
      item.difference = difference;
      item.relativeDifference = projected === 0 ? null : difference / Math.abs(projected);
      item.disclaimer = 'Diferença descritiva entre valores alinhados; não estima efeito causal nem autoriza recalibração.';
    }
    comparisons.push(item);
  }

  return {
    valid: errors.length === 0,
    errors,
    recordId: record?.outcomeId,
    archiveSha256: sha256Bytes(archiveRaw),
    manifestSha256: sha256Bytes(manifestRaw),
    snapshotSha256: sha256Bytes(snapshotRaw),
    engineSourceSha256: archive?.engineSourceSha256 ?? null,
    coverage: {
      totalObservations: comparisons.length,
      observedValues: (Array.isArray(record?.observations) ? record.observations : []).filter(observation => observation?.status === 'observed' && Number.isFinite(observation.value)).length,
      comparableValues: comparisons.filter(item => item.status === 'comparable-descriptive').length,
      unavailableOrBlocked: comparisons.filter(item => item.status !== 'comparable-descriptive').length,
      comparableFractionOfAll: comparisons.length ? comparisons.filter(item => item.status === 'comparable-descriptive').length / comparisons.length : 0,
    },
    comparisons,
  };
}

export function supportedOutcomeMetricPaths() {
  return Object.keys(projectedMetrics);
}
