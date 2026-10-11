import {replayComparisonManifest, validateComparisonManifest} from './engine.js';
import {validateFarmSnapshot} from './snapshot-validator.js';

const $ = id => document.getElementById(id);
const form = $('outcome-form');
const metricDefinitions = {
  weight: {unit: 'kg/animal', read: metrics => metrics.weight},
  gain: {unit: 'kg/animal', read: metrics => metrics.gain},
  cost: {unit: 'BRL/lot', read: metrics => metrics.cost},
  pasture: {unit: 'kg_DM/all_paddocks', read: metrics => metrics.pasture},
  stress: {unit: 'index', read: metrics => metrics.stress},
  'intake.totalKgDM': {unit: 'kg_DM/lot', read: metrics => metrics.intake?.totalKgDM},
  'intake.pastureKgDM': {unit: 'kg_DM/lot', read: metrics => metrics.intake?.pastureKgDM},
  'intake.barnBaseKgDM': {unit: 'kg_DM/lot', read: metrics => metrics.intake?.barnBaseKgDM},
  'intake.supplementKgDM': {unit: 'kg_DM/lot', read: metrics => metrics.intake?.supplementKgDM},
  'intake.dietExtraKgDM': {unit: 'kg_DM/lot', read: metrics => metrics.intake?.dietExtraKgDM},
};

let manifestBytes;
let manifest;
let archive;
let archiveBytes;
let farmSnapshot;
let farmSnapshotBytes;
let farmSnapshotHash;
let projectionHash;
let manifestHash;

function resetArchiveView() {
  archive = undefined;
  archiveBytes = undefined;
  projectionHash = undefined;
  $('archive-summary').hidden = true;
  $('archive-summary').replaceChildren();
  $('archive-download').hidden = true;
  form.hidden = true;
}

function showStatus(id, message, state = 'info') {
  const node = $(id);
  node.textContent = message;
  node.dataset.state = state;
}

function formatHash(hash) {
  return `${hash.slice(0, 16)}…${hash.slice(-12)}`;
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function download(name, bytes, type = 'application/json;charset=utf-8') {
  const blob = new Blob([bytes], {type});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isoDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Data/hora inválida.');
  return date.toISOString();
}

function fillProjectionSummary() {
  const reference = archive.comparison.baseline;
  const scenario = archive.comparison.scenario;
  const metrics = [
    ['Peso médio', reference.weight, scenario.weight, 'kg/animal'],
    ['Ganho médio', reference.gain, scenario.gain, 'kg/animal'],
    ['Custo', reference.cost, scenario.cost, 'BRL/lot'],
    ['Forragem', reference.pasture, scenario.pasture, 'kg MS/all paddocks'],
  ];
  const summary = $('archive-summary');
  summary.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = `Manifesto v${manifest.version} · ${archive.comparison.days} dias · fonte do motor ${formatHash(archive.engineSourceSha256)}`;
  summary.append(title);
  const hashes = document.createElement('p');
  hashes.textContent = `SHA-256 manifesto ${formatHash(manifestHash)} · projeção ${formatHash(projectionHash)} · snapshot ${formatHash(farmSnapshotHash)}`;
  summary.append(hashes);
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Métrica</th><th>Referência</th><th>Alternativa</th><th>Unidade</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const [label, baseline, alternative, unit] of metrics) {
    const row = document.createElement('tr');
    for (const value of [label, Number.isFinite(baseline) ? baseline.toFixed(2) : 'indisponível', Number.isFinite(alternative) ? alternative.toFixed(2) : 'indisponível', unit]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    tbody.append(row);
  }
  table.append(tbody);
  summary.append(table);
  summary.hidden = false;
  form.hidden = !farmSnapshot;
  $('observation-list').replaceChildren();
  if (!form.hidden) addObservationRow();
}

function downloadArchive() {
  if (archiveBytes) download('agroville-comparison-result.json', archiveBytes);
}

function updateUnit(row) {
  const definition = metricDefinitions[row.querySelector('[data-field="metricPath"]').value];
  row.querySelector('[data-field="unit"]').value = definition?.unit ?? '';
}

function selectedProjectedValue(observation) {
  const definition = metricDefinitions[observation.metricPath];
  return definition?.read(archive?.comparison?.[observation.scenario]);
}

function field(row, name) {
  return row.querySelector(`[data-field="${name}"]`).value;
}

function buildObservation(row, outcomeId, index) {
  const status = field(row, 'status');
  return {
    id: `${outcomeId}-measurement-${index + 1}`,
    metricPath: field(row, 'metricPath'),
    scenario: field(row, 'scenario'),
    status,
    value: status === 'observed' ? Number(field(row, 'value')) : null,
    unit: field(row, 'unit'),
    observedAt: status === 'observed' ? isoDateTime(field(row, 'observedAt')) : null,
    periodStart: field(row, 'periodStart') || null,
    periodEnd: field(row, 'periodEnd') || null,
    periodDays: Number(field(row, 'periodDays')),
    method: field(row, 'method').trim(),
    sourceId: field(row, 'sourceId').trim(),
    sourceTitle: field(row, 'sourceTitle').trim(),
    sourceVersion: field(row, 'sourceVersion').trim(),
    sourceLocator: field(row, 'sourceLocator').trim(),
    quality: field(row, 'quality'),
    ...(status === 'missing' ? {missingReason: field(row, 'missingReason').trim()} : {}),
    alignment: {
      status: field(row, 'alignmentStatus'),
      basis: field(row, 'alignmentBasis').trim(),
      ...(field(row, 'alignmentReviewerId') ? {reviewerId: field(row, 'alignmentReviewerId').trim()} : {}),
      ...(field(row, 'alignmentReviewedAt') ? {reviewedAt: isoDateTime(field(row, 'alignmentReviewedAt'))} : {}),
    },
  };
}

function buildRecord() {
  const data = new FormData(form);
  const outcomeId = data.get('outcomeId').trim();
  const record = {
    type: 'agroville-outcome-record',
    version: 1,
    outcomeId,
    createdAt: new Date().toISOString(),
    decision: {
      status: data.get('decisionStatus'),
      occurredAt: isoDateTime(data.get('decisionAt')),
      executedScenario: data.get('executedScenario'),
    },
    governance: {
      consentStatus: data.get('consentStatus'),
      consentBasis: data.get('consentBasis').trim(),
      accessStatus: data.get('accessStatus'),
      accessBasis: data.get('accessBasis').trim(),
      retentionPolicy: data.get('retentionPolicy').trim(),
    },
    review: {status: data.get('reviewStatus')},
    projection: {archiveSha256: projectionHash, manifestSha256: manifestHash},
    subject: {
      entityId: data.get('entityId').trim(),
      level: data.get('entityLevel'),
      populationDescription: data.get('populationDescription').trim(),
      snapshotSha256: farmSnapshotHash,
    },
    observations: [...$('observation-list').querySelectorAll('.observation-card')]
      .map((row, index) => buildObservation(row, outcomeId, index)),
  };
  if (data.get('reviewerId')) record.review.reviewerId = data.get('reviewerId').trim();
  if (data.get('reviewedAt')) record.review.reviewedAt = isoDateTime(data.get('reviewedAt'));
  if (data.get('reviewNote')) record.review.note = data.get('reviewNote').trim();
  return record;
}

function comparisonReadiness(record, observation) {
  const definition = metricDefinitions[observation.metricPath];
  const projected = selectedProjectedValue(observation);
  if (!definition) return {reason: 'Métrica sem correspondência suportada.'};
  if (observation.status !== 'observed' || !Number.isFinite(observation.value)) return {reason: 'Não há valor observado finito.'};
  if (observation.unit !== definition.unit) return {reason: `Unidade incompatível; use ${definition.unit}.`};
  if (!Number.isFinite(projected)) return {reason: 'A projeção selecionada não tem valor finito.'};
  if (observation.periodDays !== archive.comparison.days) return {reason: 'Horizonte observado difere do projetado.'};
  if (!['measured', 'derived'].includes(observation.quality)) return {reason: 'Qualidade estimada ou desconhecida não pode gerar comparação de desfecho medido.'};
  if (record.subject.level !== 'lot') return {reason: 'A projeção atual contém métricas agregadas do lote.'};
  if (!observation.periodStart || !observation.periodEnd) return {reason: 'Informe as datas de início e fim do período observado.'};
  const start = Date.parse(`${observation.periodStart}T00:00:00Z`);
  const end = Date.parse(`${observation.periodEnd}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== observation.periodDays * 86400000) return {reason: 'Datas de início/fim não correspondem à duração informada.'};
  if (record.decision.status !== 'implemented') return {reason: 'A intervenção não foi executada integralmente.'};
  if (!['baseline', 'scenario'].includes(record.decision.executedScenario) || record.decision.executedScenario !== observation.scenario) return {reason: 'O cenário observado não corresponde ao que foi executado.'};
  const decisionTime = Date.parse(record.decision.occurredAt ?? '');
  const observedTime = Date.parse(observation.observedAt ?? '');
  if (!Number.isFinite(decisionTime) || start <= decisionTime) return {reason: 'A janela observada precisa começar depois da execução da decisão.'};
  if (!Number.isFinite(observedTime) || observedTime <= decisionTime) return {reason: 'A medição precisa ocorrer depois da execução da decisão.'};
  if (Date.parse(observation.observedAt) < end) return {reason: 'A data da medição não pode anteceder o fim da janela observada.'};
  if (!['granted', 'not-required'].includes(record.governance.consentStatus)) return {reason: 'Consentimento não aprovado.'};
  if (record.governance.consentStatus === 'not-required' && !record.governance.consentBasis?.trim()) return {reason: 'Justifique por que consentimento não é aplicável.'};
  if (!['public', 'authorized'].includes(record.governance.accessStatus)) return {reason: 'Acesso aos dados não aprovado.'};
  if (!record.governance.accessBasis?.trim()) return {reason: 'Informe a base de acesso aos dados.'};
  if (!record.governance.retentionPolicy?.trim()) return {reason: 'Informe a política de retenção dos dados.'};
  if (record.review.status !== 'approved' || !record.review.reviewerId || !record.review.reviewedAt) return {reason: 'Revisão humana pendente.'};
  if (observation.alignment.status !== 'approved' || !observation.alignment.reviewerId || !observation.alignment.reviewedAt) return {reason: 'Equivalência do desfecho pendente de revisão.'};
  return {projected};
}

function updateDifferencePreview(record) {
  const results = record.observations.map(observation => ({observation, ...comparisonReadiness(record, observation)}));
  const comparable = results.filter(result => !result.reason);
  const preview = $('difference-preview');
  preview.replaceChildren();
  const coverage = `${comparable.length}/${record.observations.length} medições comparáveis`;
  for (const result of results) {
    const line = document.createElement('p');
    if (result.reason) {
      line.textContent = `${result.observation.metricPath} · ${result.observation.scenario}: sem comparação — ${result.reason}`;
    } else {
      const difference = result.observation.value - result.projected;
      line.textContent = `${result.observation.metricPath} · ${result.observation.scenario}: observado ${result.observation.value} ${result.observation.unit}; projetado ${result.projected.toFixed(3)}; diferença ${difference.toFixed(3)}.`;
    }
    preview.append(line);
  }
  if (comparable.length) {
    const note = document.createElement('p');
    note.textContent = 'Diferenças descritivas não demonstram causalidade, validação do motor nem recomendação de manejo.';
    preview.append(note);
  }
  preview.hidden = false;
  showStatus('outcome-status', `Cobertura ${coverage}. ${comparable.length ? 'Diferenças descritivas disponíveis nas medições alinhadas.' : 'Nenhuma medição pode ser comparada ainda.'} Valide o JSON exportado pela CLI.`, comparable.length ? 'success' : 'info');
  return {comparableCount: comparable.length, total: results.length};
}

function setObservationConditionalFields(row) {
  const observationMissing = field(row, 'status') === 'missing';
  const value = row.querySelector('[data-field="value"]');
  const observedAt = row.querySelector('[data-field="observedAt"]');
  const missingReason = row.querySelector('[data-field="missingReason"]');
  const periodStart = row.querySelector('[data-field="periodStart"]');
  const periodEnd = row.querySelector('[data-field="periodEnd"]');
  value.disabled = observationMissing;
  value.required = !observationMissing;
  observedAt.disabled = observationMissing;
  observedAt.required = !observationMissing;
  periodStart.required = !observationMissing;
  periodEnd.required = !observationMissing;
  missingReason.disabled = !observationMissing;
  missingReason.required = observationMissing;
  const alignmentRequired = field(row, 'alignmentStatus') === 'approved';
  row.querySelector('[data-field="alignmentReviewerId"]').required = alignmentRequired;
  row.querySelector('[data-field="alignmentReviewedAt"]').required = alignmentRequired;
}

function setConditionalFields() {
  const reviewRequired = ['approved', 'rejected'].includes(form.elements.reviewStatus.value);
  form.elements.reviewerId.required = reviewRequired;
  form.elements.reviewedAt.required = reviewRequired;
  form.elements.decisionAt.required = form.elements.decisionStatus.value === 'implemented';
  for (const row of $('observation-list').querySelectorAll('.observation-card')) setObservationConditionalFields(row);
}

function addObservationRow() {
  const row = $('observation-template').content.firstElementChild.cloneNode(true);
  const select = row.querySelector('[data-field="metricPath"]');
  for (const path of Object.keys(metricDefinitions)) {
    const option = document.createElement('option');
    option.value = path;
    option.textContent = path;
    select.append(option);
  }
  select.addEventListener('change', () => updateUnit(row));
  row.querySelector('[data-field="status"]').addEventListener('change', () => setObservationConditionalFields(row));
  row.querySelector('[data-field="alignmentStatus"]').addEventListener('change', () => setObservationConditionalFields(row));
  row.querySelector('[data-remove-observation]').addEventListener('click', () => {
    row.remove();
    renumberObservationRows();
  });
  $('observation-list').append(row);
  updateUnit(row);
  setObservationConditionalFields(row);
  renumberObservationRows();
}

function renumberObservationRows() {
  const rows = [...$('observation-list').querySelectorAll('.observation-card')];
  rows.forEach((row, index) => {
    row.querySelector('[data-row-number]').textContent = String(index + 1);
    row.querySelector('[data-remove-observation]').disabled = rows.length === 1;
  });
}

async function readManifest(file) {
  if (!file) throw new Error('Selecione o manifesto original.');
  manifestBytes = await file.arrayBuffer();
  manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  validateComparisonManifest(manifest);
  manifestHash = await digestHex(manifestBytes);
}

async function readFarmSnapshot(file) {
  if (!file) throw new Error('Selecione o snapshot ligado ao cenário.');
  farmSnapshotBytes = await file.arrayBuffer();
  farmSnapshot = JSON.parse(new TextDecoder().decode(farmSnapshotBytes));
  farmSnapshotHash = await digestHex(farmSnapshotBytes);
  if (!manifest) throw new Error('Carregue primeiro o manifesto da projeção.');
  if (farmSnapshot.snapshotKind === 'observed-study-slice') throw new Error('Recortes de estudo não podem ser usados como baseline de fazenda.');
  const validation = validateFarmSnapshot(farmSnapshot);
  if (!validation.semanticValid || !validation.simulationEligible) throw new Error(`Snapshot não está elegível: ${validation.blockers.join(' ') || validation.errors.join(' ')}`);
  if (!Array.isArray(farmSnapshot.caseDefinition?.requiredFields) || farmSnapshot.caseDefinition.requiredFields.length === 0) throw new Error('O caso do snapshot precisa declarar os campos obrigatórios revisados.');
  if (farmSnapshot.manifestReference?.status !== 'linked' || farmSnapshot.manifestReference.sha256 !== manifestHash || farmSnapshot.manifestReference.type !== manifest.type || farmSnapshot.manifestReference.version !== manifest.version) throw new Error('Snapshot não está ligado aos bytes exatos do manifesto selecionado.');
  const matchingLots = farmSnapshot.lots.filter(lot => lot.animalIds.length === manifest.initialSnapshot.animals.length);
  if (!matchingLots.length) throw new Error('Nenhum lote do snapshot tem o mesmo número de animais da projeção.');
  const select = form.elements.entityId;
  const previous = select.value;
  select.replaceChildren(new Option('Selecione o lote', ''));
  for (const lot of matchingLots) select.append(new Option(`${lot.id} · ${lot.animalIds.length} animais`, lot.id));
  if (matchingLots.some(lot => lot.id === previous)) select.value = previous;
  $('snapshot-status').textContent = `Snapshot elegível e ligado ao manifesto · ${matchingLots.length} lote(s) com tamanho compatível · SHA-256 ${formatHash(farmSnapshotHash)}.`;
  $('snapshot-status').dataset.state = 'success';
  return true;
}

function readyToCreateArchive() {
  $('archive-create').disabled = !manifest || !farmSnapshot;
  $('archive-load').disabled = !manifest || !farmSnapshot || !$('archive-file').files[0];
}

$('manifest-file').addEventListener('change', async event => {
  resetArchiveView();
  farmSnapshot = undefined;
  try {
    await readManifest(event.target.files[0]);
    if ($('snapshot-file').files[0]) await readFarmSnapshot($('snapshot-file').files[0]);
    showStatus('archive-status', `Manifesto válido: ${manifest.periodDays} dias. SHA-256 ${formatHash(manifestHash)}.`, 'success');
  } catch (error) {
    manifest = undefined;
    manifestBytes = undefined;
    farmSnapshot = undefined;
    farmSnapshotBytes = undefined;
    farmSnapshotHash = undefined;
    showStatus('archive-status', `Não foi possível usar o manifesto: ${error.message}`, 'error');
  }
  readyToCreateArchive();
});

$('snapshot-file').addEventListener('change', async event => {
  resetArchiveView();
  farmSnapshot = undefined;
  try {
    await readFarmSnapshot(event.target.files[0]);
  } catch (error) {
    farmSnapshot = undefined;
    farmSnapshotBytes = undefined;
    farmSnapshotHash = undefined;
    $('snapshot-status').textContent = `Snapshot não aceito: ${error.message}`;
    $('snapshot-status').dataset.state = 'error';
  }
  readyToCreateArchive();
});

$('archive-file').addEventListener('change', () => {
  resetArchiveView();
  readyToCreateArchive();
});

$('archive-create').addEventListener('click', async () => {
  try {
    showStatus('archive-status', 'Reproduzindo a comparação e calculando hashes localmente…');
    const sourceResponse = await fetch(new URL('./engine.js', import.meta.url));
    if (!sourceResponse.ok) throw new Error('Não foi possível ler o código do motor servido localmente.');
    const sourceBytes = await sourceResponse.arrayBuffer();
    const comparison = replayComparisonManifest(manifest);
    archive = {
      type: 'agroville-comparison-result',
      version: 1,
      capturedAt: new Date().toISOString(),
      manifestReference: {type: manifest.type, version: manifest.version, sha256: manifestHash},
      engineSourceSha256: await digestHex(sourceBytes),
      comparison,
    };
    const archiveText = `${JSON.stringify(archive, null, 2)}\n`;
    archiveBytes = new TextEncoder().encode(archiveText);
    projectionHash = await digestHex(archiveBytes);
    $('archive-download').hidden = false;
    fillProjectionSummary();
    showStatus('archive-status', 'Projeção reproduzida e arquivada. Baixe o arquivo e mantenha-o junto do manifesto.', 'success');
  } catch (error) {
    archive = undefined;
    archiveBytes = undefined;
    resetArchiveView();
    showStatus('archive-status', `Não foi possível arquivar a projeção: ${error.message}`, 'error');
  }
});

$('archive-load').addEventListener('click', async () => {
  try {
    const file = $('archive-file').files[0];
    if (!file) throw new Error('Selecione um arquivo de projeção.');
    archiveBytes = await file.arrayBuffer();
    archive = JSON.parse(new TextDecoder().decode(archiveBytes));
    if (archive.type !== 'agroville-comparison-result' || archive.version !== 1) throw new Error('Tipo/versão de arquivo de projeção não suportado.');
    if (archive.manifestReference?.sha256 !== manifestHash || archive.manifestReference?.type !== manifest.type || archive.manifestReference?.version !== manifest.version) throw new Error('O arquivo de projeção não referencia os bytes deste manifesto.');
    if (!/^[a-f0-9]{64}$/.test(archive.engineSourceSha256 ?? '')) throw new Error('Hash do código do motor ausente ou inválido.');
    if (archive.comparison?.days !== manifest.periodDays || !archive.comparison.baseline || !archive.comparison.scenario) throw new Error('Resultados do arquivo não correspondem ao horizonte/base/alternativa do manifesto.');
    projectionHash = await digestHex(archiveBytes);
    $('archive-download').hidden = true;
    fillProjectionSummary();
    showStatus('archive-status', 'Arquivo de projeção vinculado ao manifesto selecionado.', 'success');
  } catch (error) {
    archive = undefined;
    archiveBytes = undefined;
    resetArchiveView();
    showStatus('archive-status', `Arquivo não aceito: ${error.message}`, 'error');
  }
});

$('archive-download').addEventListener('click', downloadArchive);

for (const name of ['reviewStatus', 'decisionStatus']) {
  form.elements[name].addEventListener('change', setConditionalFields);
}
$('add-observation').addEventListener('click', addObservationRow);

form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const record = buildRecord();
    const readiness = updateDifferencePreview(record);
    const recordText = `${JSON.stringify(record, null, 2)}\n`;
    download(`${record.outcomeId.replace(/[^a-z0-9_-]/gi, '-')}.json`, new TextEncoder().encode(recordText));
    if (readiness.reason) showStatus('outcome-status', `Registro baixado, sem comparação: ${readiness.reason} Valide o JSON exportado pela CLI.`);
    else showStatus('outcome-status', 'Registro baixado. Execute validate:outcome para validar o JSON contra o schema e os arquivos vinculados.', 'success');
  } catch (error) {
    showStatus('outcome-status', `Não foi possível gerar o registro: ${error.message}`, 'error');
  }
});

setConditionalFields();
readyToCreateArchive();
