import {ALLOMETRY_BREED_NAMES as breedNames, ALLOMETRY_HORIZON_DAYS as dayHorizon, parseAllometryTsv, summarizeAllometryRows} from './adult-cow-data-model.js';

const fileUrl = './data/zenodo-grazing-allometry/Zenodo_Data_Allometry.txt';
const colors = {AH: '#b86140', OB: '#3f7852', HC: '#5475a5'};
const fmt = (value, digits = 2) => new Intl.NumberFormat('pt-BR', {minimumFractionDigits: digits, maximumFractionDigits: digits}).format(value);
const fmtValue = (value, digits = 2) => Number.isFinite(value) ? fmt(value, digits) : '—';

const filter = document.querySelector('#breed-filter');
const behaviorFilter = document.querySelector('#behavior-filter');
const chart = document.querySelector('#chart');
const associationChart = document.querySelector('#association-chart');
const associationSummary = document.querySelector('#association-summary');
const facts = document.querySelector('#facts');
const summary = document.querySelector('#summary');
const records = document.querySelector('#records');
const rowCount = document.querySelector('#row-count');
let rows = [];
let associationReport = null;
const behaviorMetrics = {
  speedMetersPerHour: {field: 'Speed_mean', label: 'DISTÂNCIA MÉDIA POR HORA (M/H)'},
  stepsPerHour: {field: 'Steps_mean', label: 'PASSOS POR HORA'},
  lyingRatio: {field: 'Lying_mean', label: 'PROPORÇÃO DO TEMPO DEITADA'},
  spaceUseEvenness: {field: 'Space_evenness_mean', label: 'UNIFORMIDADE DO USO DO ESPAÇO'},
  forageSelectionEvenness: {field: 'Sel_evenness_mean', label: 'UNIFORMIDADE DA SELEÇÃO DE FORRAGEM'},
  selectedForageQuality: {field: 'Sel_quality_mean', label: 'QUALIDADE INDICADORA DA FORRAGEM SELECIONADA'},
};

function renderChart(selected) {
  if (!selected.length) { chart.innerHTML = '<text x="24" y="50">Sem vacas para este filtro.</text>'; return; }
  const left = 78, right = 858, top = 28, bottom = 278;
  const minX = Math.min(...selected.map(row => row.ageMonths));
  const maxX = Math.max(...selected.map(row => row.ageMonths));
  const minY = Math.min(...selected.map(row => row.derivedAdgKgPerDay));
  const maxY = Math.max(...selected.map(row => row.derivedAdgKgPerDay));
  const padX = (maxX - minX) * .08 || 1;
  const padY = (maxY - minY) * .12 || .05;
  const lowX = minX - padX, highX = maxX + padX, lowY = minY - padY, highY = maxY + padY;
  const x = value => left + (value - lowX) / (highX - lowX) * (right - left);
  const y = value => bottom - (value - lowY) / (highY - lowY) * (bottom - top);
  let svg = '<title>ADG derivado por idade</title><desc>Um ponto por linha publicada; ADG dividido por 70 dias assumidos para dez semanas.</desc>';
  for (let tick = 0; tick <= 4; tick++) {
    const vx = lowX + (highX - lowX) * tick / 4;
    const vy = lowY + (highY - lowY) * tick / 4;
    svg += `<line x1="${left}" x2="${right}" y1="${y(vy)}" y2="${y(vy)}" stroke="#e2e8de"/><text x="${left - 9}" y="${y(vy) + 4}" text-anchor="end" font-size="10" fill="#788579">${fmt(vy, 2)}</text>`;
    svg += `<line x1="${x(vx)}" x2="${x(vx)}" y1="${bottom}" y2="${bottom + 5}" stroke="#aab5a5"/><text x="${x(vx)}" y="${bottom + 20}" text-anchor="middle" font-size="10" fill="#788579">${fmt(vx, 0)}</text>`;
  }
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#aab5a5"/><text x="${(left + right) / 2}" y="${bottom + 44}" text-anchor="middle" font-size="11" fill="#657365">IDADE (MESES)</text><text transform="translate(18 ${(top + bottom) / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="#657365">ADG DERIVADO (KG/CABEÇA/DIA)</text>`;
  for (const row of selected) {
    svg += `<circle cx="${x(row.ageMonths)}" cy="${y(row.derivedAdgKgPerDay)}" r="5" fill="${colors[row.breed]}" fill-opacity=".82"><title>${breedNames[row.breed]}, linha ${row.rowNumber}: ${row.ageMonths} meses; ADG derivado ${fmt(row.derivedAdgKgPerDay, 3)} kg/cabeça/dia</title></circle>`;
  }
  let offset = left;
  for (const breed of Object.keys(breedNames).filter(key => filter.value === 'all' || key === filter.value)) {
    svg += `<circle cx="${offset + 6}" cy="344" r="5" fill="${colors[breed]}"/><text x="${offset + 17}" y="348" font-size="10" fill="#657365">${breedNames[breed]}</text>`;
    offset += 190;
  }
  chart.innerHTML = svg;
}

function renderAssociation(selected) {
  const metric = behaviorMetrics[behaviorFilter.value];
  const complete = selected.filter(row => Number.isFinite(row[behaviorFilter.value]));
  if (!complete.length) {
    associationChart.innerHTML = '<text x="24" y="50" fill="#8b463c">Sem observações completas para este indicador.</text>';
    associationSummary.innerHTML = '';
    return;
  }
  const left = 78, right = 858, top = 28, bottom = 278;
  const xValues = complete.map(row => row[behaviorFilter.value]);
  const yValues = complete.map(row => row.derivedAdgKgPerDay);
  const minX = Math.min(...xValues), maxX = Math.max(...xValues);
  const minY = Math.min(...yValues), maxY = Math.max(...yValues);
  const padX = (maxX - minX) * .1 || Math.abs(minX) * .08 || 1;
  const padY = (maxY - minY) * .12 || Math.abs(minY) * .08 || .05;
  const lowX = minX - padX, highX = maxX + padX, lowY = minY - padY, highY = maxY + padY;
  const x = value => left + (value - lowX) / (highX - lowX) * (right - left);
  const y = value => bottom - (value - lowY) / (highY - lowY) * (bottom - top);
  let svg = `<title>${metric.label} versus ADG derivado</title><desc>${complete.length} linhas completas; ADG calculado com o horizonte assumido de ${dayHorizon} dias.</desc>`;
  for (let tick = 0; tick <= 4; tick++) {
    const vx = lowX + (highX - lowX) * tick / 4;
    const vy = lowY + (highY - lowY) * tick / 4;
    svg += `<line x1="${left}" x2="${right}" y1="${y(vy)}" y2="${y(vy)}" stroke="#e2e8de"/><text x="${left - 9}" y="${y(vy) + 4}" text-anchor="end" font-size="10" fill="#788579">${fmt(vy, 2)}</text>`;
    svg += `<line x1="${x(vx)}" x2="${x(vx)}" y1="${bottom}" y2="${bottom + 5}" stroke="#aab5a5"/><text x="${x(vx)}" y="${bottom + 20}" text-anchor="middle" font-size="10" fill="#788579">${fmt(vx, 2)}</text>`;
  }
  if (lowY < 0 && highY > 0) svg += `<line x1="${left}" x2="${right}" y1="${y(0)}" y2="${y(0)}" stroke="#718070" stroke-dasharray="4 4"/>`;
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#aab5a5"/><text x="${(left + right) / 2}" y="${bottom + 44}" text-anchor="middle" font-size="11" fill="#657365">${metric.label}</text><text transform="translate(18 ${(top + bottom) / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="#657365">ADG DERIVADO (KG/CABEÇA/DIA)</text>`;
  for (const row of complete) {
    svg += `<circle cx="${x(row[behaviorFilter.value])}" cy="${y(row.derivedAdgKgPerDay)}" r="5" fill="${colors[row.breed]}" fill-opacity=".82"><title>${breedNames[row.breed]}, linha ${row.rowNumber}: ${fmt(row[behaviorFilter.value], 2)}; ADG derivado ${fmt(row.derivedAdgKgPerDay, 3)} kg/cabeça/dia</title></circle>`;
  }
  let offset = left;
  for (const breed of Object.keys(breedNames).filter(key => filter.value === 'all' || key === filter.value)) {
    svg += `<circle cx="${offset + 6}" cy="344" r="5" fill="${colors[breed]}"/><text x="${offset + 17}" y="348" font-size="10" fill="#657365">${breedNames[breed]}</text>`;
    offset += 190;
  }
  associationChart.innerHTML = svg;
  associationChart.setAttribute('aria-label', `${metric.label} versus ADG derivado; ${complete.length} vacas com dados completos.`);

  const result = associationReport?.associations?.[metric.field];
  const missing = selected.length - complete.length;
  let stats = '';
  if (filter.value === 'all' && result) {
    stats = `<article><span>Spearman agrupado</span><strong>ρ = ${fmtValue(result.pooledSpearman, 3)}</strong><small>Associação descritiva entre raças.</small></article><article><span>Dentro de raça</span><strong>r = ${fmtValue(result.withinBreedCenteredRankCorrelation, 3)}</strong><small>Correlação de postos centrados por raça; n pequeno.</small></article>`;
  } else if (filter.value !== 'all' && result?.byBreedSpearman?.[filter.value]) {
    stats = `<article><span>Spearman · ${breedNames[filter.value]}</span><strong>ρ = ${fmtValue(result.byBreedSpearman[filter.value].spearman, 3)}</strong><small>Descritivo; grupo pequeno, sem inferência.</small></article>`;
  }
  associationSummary.innerHTML = `<article><span>Dados visíveis</span><strong>${complete.length} de ${selected.length} vacas</strong><small>${missing} sem valor deste indicador.</small></article>${stats}<article><span>Leitura</span><strong>Sem efeito causal</strong><small>ADG assume ${dayHorizon} dias; comportamento observado por janela mais curta.</small></article>`;
}

function render() {
  const selected = rows.filter(row => filter.value === 'all' || row.breed === filter.value);
  renderChart(selected);
  renderAssociation(selected);
  rowCount.textContent = `${selected.length} DE ${rows.length} LINHAS`;
  records.innerHTML = selected.map(row => `<tr><td>${breedNames[row.breed]}</td><td>${fmtValue(row.ageMonths, 0)}</td><td>${fmtValue(row.startWeightKg, 0)}</td><td>${fmtValue(row.endWeightKg, 0)}</td><td>${fmtValue(row.derivedAdgKgPerDay, 3)}</td><td>${fmtValue(row.stepsPerHour, 1)}</td><td>${fmtValue(row.speedMetersPerHour, 1)}</td><td>${fmtValue(row.selectedForageQuality, 2)}</td></tr>`).join('');
  const groups = summarizeAllometryRows(selected);
  summary.innerHTML = Object.entries(groups).filter(([, value]) => value.n).map(([breed, value]) => `<article class="cow-metric"><span>${breedNames[breed]} · ${value.n} vacas</span><strong>${fmt(value.meanDerivedAdgKgPerDay, 3)} kg/cabeça/dia</strong><small>ADG médio derivado; idade ${value.ageMinMonths}–${value.ageMaxMonths} meses.</small><small>Artigo (arredondado): ${fmt(value.publishedRoundedMeanKgPerDay, 2)} kg/d · diferença absoluta: ${fmt(value.absoluteDifferenceFromPublishedRoundedMeanKgPerDay, 3)} kg/d.</small></article>`).join('');
  chart.setAttribute('aria-label', `ADG calculado com 70 dias assumidos por idade em ${selected.length} linhas de vacas adultas.`);
}

filter.addEventListener('change', render);
behaviorFilter.addEventListener('change', () => renderAssociation(rows.filter(row => filter.value === 'all' || row.breed === filter.value)));
Promise.all([
  fetch(fileUrl).then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.text(); }),
  fetch('./docs/evidence/zenodo-grazing-allometry-association.json').then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
]).then(([text, report]) => {
  associationReport = report;
  rows = parseAllometryTsv(text);
  for (const breed of [...new Set(rows.map(row => row.breed))]) {
    const option = document.createElement('option'); option.value = breed; option.textContent = breedNames[breed]; filter.append(option);
  }
  facts.innerHTML = `<span><strong>${rows.length}</strong> linhas · vacas conforme desenho publicado</span><span><strong>${new Set(rows.map(row => row.breed)).size}</strong> raças</span><span><strong>${Math.min(...rows.map(row => row.ageMonths))}–${Math.max(...rows.map(row => row.ageMonths))}</strong> meses de idade</span><span><strong>${dayHorizon} dias</strong> assumidos do período de dez semanas</span>`;
  render();
}).catch(error => {
  facts.textContent = `Não foi possível carregar os dados do Zenodo (${error.message}).`;
  records.innerHTML = '<tr><td colspan="8">Dados indisponíveis.</td></tr>';
  chart.innerHTML = '<text x="24" y="50" fill="#8b463c">Dados não carregados. Sirva o projeto por HTTP.</text>';
  associationChart.innerHTML = '<text x="24" y="50" fill="#8b463c">Dados de associação indisponíveis.</text>';
});
