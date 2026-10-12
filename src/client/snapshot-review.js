const $ = id => document.getElementById(id);
const dialog = $('snapshot-review');
const form = $('snapshot-review-form');
const status = $('snapshot-review-status');
const result = $('snapshot-review-result');

function toBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  }
  return btoa(binary);
}

function list(title, values) {
  if (!values?.length) return null;
  const section = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.append(heading);
  const ul = document.createElement('ul');
  for (const value of values) {
    const li = document.createElement('li');
    li.textContent = value;
    ul.append(li);
  }
  section.append(ul);
  return section;
}

function renderReport(report) {
  result.replaceChildren();
  const badge = document.createElement('p');
  badge.className = report.simulationEligible ? 'snapshot-badge is-eligible' : 'snapshot-badge is-ineligible';
  badge.textContent = report.simulationEligible
    ? 'Elegível segundo o contrato atual; aprovação e compatibilidade de domínio ainda precisam ser confirmadas.'
    : 'Não elegível para alimentar o motor atual.';
  result.append(badge);

  const summary = document.createElement('dl');
  summary.className = 'snapshot-summary';
  for (const [label, value] of [
    ['ID', report.snapshotId ?? 'Ausente'],
    ['Tipo', report.snapshotKind ?? 'Ausente'],
    ['Estado de elegibilidade', report.eligibilityStatus ?? 'Ausente'],
    ['Schema', report.schemaValid ? 'Válido' : 'Inválido'],
    ['Semântica', report.semanticValid ? 'Válida' : 'Inválida'],
    ['Vínculo ao manifesto', report.manifestReferenceChecked ? (report.manifestReferenceValid ? 'Conferido' : 'Inválido') : 'Não conferido'],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    summary.append(dt, dd);
  }
  result.append(summary);
  const coverage = document.createElement('section');
  const coverageHeading = document.createElement('h3');
  coverageHeading.textContent = 'Cobertura e procedência';
  coverage.append(coverageHeading);
  const coverageList = document.createElement('ul');
  for (const [label, value] of Object.entries(report.coverage ?? {}).filter(([key]) => key !== 'sources' && key !== 'evidenceFieldsByStatus')) {
    const item = document.createElement('li');
    item.textContent = `${label}: ${value}`;
    coverageList.append(item);
  }
  for (const [status, count] of Object.entries(report.coverage?.evidenceFieldsByStatus ?? {})) {
    const item = document.createElement('li');
    item.textContent = `Campos ${status}: ${count}`;
    coverageList.append(item);
  }
  coverage.append(coverageList);
  if (report.coverage?.sources?.length) {
    const sourceHeading = document.createElement('h3');
    sourceHeading.textContent = 'Fontes declaradas no snapshot';
    coverage.append(sourceHeading);
    const sourceList = document.createElement('ul');
    for (const source of report.coverage.sources) {
      const item = document.createElement('li');
      item.textContent = [source.title, source.version, source.license, source.url].filter(Boolean).join(' · ');
      sourceList.append(item);
    }
    coverage.append(sourceList);
  }
  result.append(coverage);
  result.append(list('Erros de validação', report.errors));
  result.append(list('Bloqueios e lacunas', report.blockers));
  result.append(list('Campos obrigatórios ausentes', report.missingRequiredFields));
}

$('snapshot-review-open').addEventListener('click', () => dialog.showModal());
$('snapshot-review-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const snapshotFile = $('snapshot-review-file').files[0];
  const manifestFile = $('snapshot-review-manifest').files[0];
  if (!snapshotFile) return;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  status.textContent = 'Validando no servidor local…';
  result.replaceChildren();
  try {
    const snapshot = JSON.parse(await snapshotFile.text());
    const payload = {snapshot};
    if (manifestFile) payload.manifestBase64 = toBase64(new Uint8Array(await manifestFile.arrayBuffer()));
    const response = await fetch('/api/validate-snapshot', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error ?? 'validation_failed');
    renderReport(report);
    status.textContent = report.valid ? 'Snapshot validado.' : 'Validação concluída com erros ou lacunas.';
  } catch (error) {
    status.textContent = error instanceof SyntaxError
      ? 'O arquivo do snapshot não contém JSON válido.'
      : 'Não foi possível validar. Inicie com npm start e confira os arquivos selecionados.';
  } finally {
    submit.disabled = false;
  }
});
