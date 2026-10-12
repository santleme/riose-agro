const ageOrder = ['1', '2', '3', '4', '5-7', '8+'];
const yearLabels = {Y1: '2018/19', Y2: '2019/20'};
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const fmt = (value, digits = 1) => new Intl.NumberFormat('pt-BR', {minimumFractionDigits: digits, maximumFractionDigits: digits}).format(value);
const fmtMaybe = value => Number.isFinite(value) ? fmt(value) : '—';

const facts = document.querySelector('#facts');
const yearFilter = document.querySelector('#year-filter');
const ageFilter = document.querySelector('#age-filter');
const chart = document.querySelector('#chart');
const summary = document.querySelector('#summary');
const rowCount = document.querySelector('#row-count');
const records = document.querySelector('#records');
const gpsAssociationRows = document.querySelector('#gps-association-rows');
const gpsAssociationNote = document.querySelector('#gps-association-note');
let observations = [];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function drawChart(rows) {
  const left = 74, right = 870, top = 22, bottom = 272;
  const values = rows.map(row => row.adgDerivedKgPerDay).filter(Number.isFinite);
  const extent = Math.max(0.1, ...values.map(Math.abs));
  const y = value => top + ((extent - value) / (2 * extent)) * (bottom - top);
  const visibleAgeOrder = ageFilter.value === '4+'
    ? ageOrder.filter(age => ['4', '5-7', '8+'].includes(age))
    : ageOrder;
  const groups = visibleAgeOrder.map(age => {
    const subset = rows.filter(row => row.ageClass === age).map(row => row.adgDerivedKgPerDay).filter(Number.isFinite);
    return {age, subset, mid: median(subset), min: subset.length ? Math.min(...subset) : null, max: subset.length ? Math.max(...subset) : null};
  });
  const slot = (right - left) / groups.length;
  let svg = `<line x1="${left}" y1="${y(0)}" x2="${right}" y2="${y(0)}" stroke="#aeb8aa" stroke-dasharray="4 4"/><text x="14" y="${y(0) + 4}" font-size="10" fill="#778675">0 kg/d</text>`;
  svg += `<text x="${left}" y="14" font-size="10" fill="#778675">+${fmt(extent, 1)} kg/d</text><text x="${left}" y="${bottom + 27}" font-size="10" fill="#778675">−${fmt(extent, 1)} kg/d</text>`;
  for (const [index, group] of groups.entries()) {
    const cx = left + slot * (index + 0.5);
    if (group.subset.length) {
      svg += `<line x1="${cx}" y1="${y(group.min)}" x2="${cx}" y2="${y(group.max)}" stroke="#7e9a79" stroke-width="3"/><line x1="${cx - 7}" y1="${y(group.min)}" x2="${cx + 7}" y2="${y(group.min)}" stroke="#7e9a79"/><line x1="${cx - 7}" y1="${y(group.max)}" x2="${cx + 7}" y2="${y(group.max)}" stroke="#7e9a79"/><circle cx="${cx}" cy="${y(group.mid)}" r="6" fill="#c58040"><title>Classe ${escapeHtml(group.age)}: mediana ${fmt(group.mid, 3)} kg/d; mínimo ${fmt(group.min, 3)}; máximo ${fmt(group.max, 3)}; n=${group.subset.length}</title></circle>`;
      svg += `<text x="${cx}" y="${bottom + 12}" text-anchor="middle" font-size="11" fill="#49604c">${escapeHtml(group.age)} anos</text><text x="${cx}" y="${bottom + 27}" text-anchor="middle" font-size="10" fill="#778675">n=${group.subset.length}</text>`;
    } else {
      svg += `<text x="${cx}" y="${bottom + 12}" text-anchor="middle" font-size="11" fill="#49604c">${escapeHtml(group.age)} anos</text><text x="${cx}" y="${bottom + 27}" text-anchor="middle" font-size="10" fill="#778675">sem dados</text>`;
    }
  }
  chart.innerHTML = svg;
  chart.setAttribute('aria-label', `ADG médio derivado do período de 84 dias por classe etária, ${rows.length} registros de vaca-estação.`);
}

function render() {
  const selected = observations.filter(row =>
    (yearFilter.value === 'all' || row.year === yearFilter.value)
    && (ageFilter.value === 'all'
      || (ageFilter.value === '4+' && ['4', '5-7', '8+'].includes(row.ageClass))
      || row.ageClass === ageFilter.value));
  const availableAdg = selected.map(row => row.adgDerivedKgPerDay).filter(Number.isFinite);
  const availableBcs = selected.map(row => row.bcsChange).filter(Number.isFinite);
  const missingWeight = selected.filter(row => !Number.isFinite(row.weightChangeKg)).length;
  const missingBcs = selected.filter(row => !Number.isFinite(row.bcsChange)).length;
  const uniqueIds = new Set(selected.map(row => row.animalId));
  drawChart(selected);
  summary.innerHTML = [
    ['Registros vaca-estação', `${selected.length}`, 'Linhas publicadas após os filtros.'],
    ['IDs únicos nesta seleção', `${uniqueIds.size}`, 'Um mesmo ID pode aparecer em dois anos.'],
    ['ADG / BCS disponíveis', `${availableAdg.length} / ${availableBcs.length}`, `${missingWeight} mudanças de peso e ${missingBcs} BCS ausentes nesta seleção.`],
  ].map(([label, value, note]) => `<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
  rowCount.textContent = `${selected.length} DE ${observations.length} REGISTROS`;
  const sorted = [...selected].sort((a, b) => ageOrder.indexOf(a.ageClass) - ageOrder.indexOf(b.ageClass) || a.year.localeCompare(b.year) || a.animalId.localeCompare(b.animalId));
  records.innerHTML = sorted.map(row => `<tr><td>${escapeHtml(yearLabels[row.year] ?? row.year)}</td><td>${escapeHtml(row.animalId)}</td><td>${escapeHtml(row.ageClass)}</td><td>${escapeHtml(row.rfiClass)}</td><td>${fmtMaybe(row.weightChangeKg)}</td><td>${fmtMaybe(row.adgDerivedKgPerDay)}</td><td>${fmtMaybe(row.bcsChange)}</td></tr>`).join('');
}

function formatRho(value) {
  return Number(value).toLocaleString('pt-BR', {signDisplay: 'always', minimumFractionDigits: 3, maximumFractionDigits: 3});
}

fetch('./docs/evidence/mdpi-angus-gps-adg-association.json')
  .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
  .then(report => {
    const rows = [
      ['Horas diárias de pastejo', report.association.pooled.grazingHours, report.association.byYear['2018'].grazingHours, report.association.byYear['2019'].grazingHours],
      ['Distância diária (km)', report.association.pooled.distanceKm, report.association.byYear['2018'].distanceKm, report.association.byYear['2019'].distanceKm],
    ];
    gpsAssociationRows.innerHTML = rows.map(([label, pooled, y2018, y2019]) =>
      `<tr><td>${label}</td><td>ρ=${formatRho(pooled.spearmanRho)}</td><td>ρ=${formatRho(y2018.spearmanRho)}</td><td>ρ=${formatRho(y2019.spearmanRho)}</td></tr>`
    ).join('');
    gpsAssociationNote.textContent = `Spearman descritivo; p-valores não calculados. As estimativas por ano ficam próximas de zero. Fonte: ${report.join.matchedCowSeasons} vaca-estações pareadas, ${report.join.cowDays} vaca-dias GPS; não inferir causalidade, previsão ou validade do motor.`;
  })
  .catch(error => {
    gpsAssociationRows.innerHTML = '<tr><td colspan="4">Análise pareada indisponível.</td></tr>';
    gpsAssociationNote.textContent = `Não foi possível carregar o relatório local (${error.message}).`;
  });

yearFilter.addEventListener('change', render);
ageFilter.addEventListener('change', render);
fetch('./data/mdpi-angus-cow-grazing/weight-change-observations.json')
  .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
  .then(rows => {
    if (!Array.isArray(rows) || rows.length !== 408) throw new Error('Tabela S1 incompatível com a auditoria local.');
    observations = rows;
    const ids = new Map();
    for (const row of rows) ids.set(row.animalId, (ids.get(row.animalId) ?? 0) + 1);
    const repeatedIds = [...ids.values()].filter(count => count > 1).length;
    facts.innerHTML = `<span><strong>${rows.length}</strong> registros vaca-estação</span><span><strong>${ids.size}</strong> IDs · ${repeatedIds} em ambos os anos</span><span><strong>84 dias</strong> duração reportada</span><span><strong>1–10 anos</strong> faixas do estudo</span>`;
    render();
  })
  .catch(error => {
    facts.textContent = `Não foi possível carregar a tabela local (${error.message}).`;
    records.innerHTML = '<tr><td colspan="7">Dados indisponíveis.</td></tr>';
    chart.innerHTML = '<text x="24" y="50" fill="#8b463c">Tabela não carregada. Sirva o projeto por HTTP.</text>';
  });
