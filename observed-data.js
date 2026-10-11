import {OBSERVED_GROUPS, compareObservedGroups, summarizeObservedData} from './observed-data-model.js';

const GROUPS = OBSERVED_GROUPS;
const MEASURES = {
  weight: {
    label: 'Peso corporal', unit: 'kg', field: 'weight_kg', source: 'weights',
    note: 'Pesagens por idade. A curva resume primeiro as medidas de cada animal por semana e depois calcula a média do grupo.',
  },
  grain: {
    label: 'Ingestão de grão', unit: 'g MS/dia', feed: 'grain',
    note: 'Consumo diário de grão em matéria seca. Valores ausentes são mantidos como ausentes.',
  },
  hay: {
    label: 'Ingestão de feno', unit: 'g MS/dia', feed: 'hay',
    note: 'Consumo diário de feno nos grupos Bucket e Pipe. O grupo Control não recebeu feno: ausência de linha não significa consumo zero.',
  },
  tmr: {
    label: 'Ingestão de TMR', unit: 'g MS/dia', feed: 'tmr',
    note: 'Consumo diário de TMR durante o desaleitamento (dias 50–60). Não há uma série de TMR para todo o período.',
  },
  water: {
    label: 'Consumo de água', unit: 'L/dia', feed: 'water',
    note: 'Consumo diário de água. A ingestão de água não é usada como proxy de ingestão de matéria seca ou estresse.',
  },
};

const chart = document.querySelector('#chart');
const measureSelect = document.querySelector('#measure');
const summary = document.querySelector('#group-summary');
const coverage = document.querySelector('#coverage');
const note = document.querySelector('#measure-note');
const referenceSelect = document.querySelector('#reference-group');
const comparisonSelect = document.querySelector('#comparison-group');
const contrastRows = document.querySelector('#contrast-rows');
const contrastNote = document.querySelector('#contrast-note');
let dataset;

for (const group of GROUPS) {
  const option = new Option(group.name, group.key);
  referenceSelect.add(option.cloneNode(true));
  comparisonSelect.add(option);
}
referenceSelect.value = 'Control';
comparisonSelect.value = 'Bucket';

function fmt(value, digits = 1) {
  return new Intl.NumberFormat('pt-BR', {maximumFractionDigits: digits, minimumFractionDigits: digits}).format(value);
}

function groupMean(groupRows) {
  return groupRows.reduce((sum, value) => sum + value, 0) / groupRows.length;
}

function renderSummary(measure, summaries) {
  summary.innerHTML = GROUPS.map(group => {
    const animals = summaries.animalsByGroup.get(group.key);
    const validRows = [...animals.values()].flat().filter(row => row.value !== null && row.value !== undefined);
    let figure = '—';
    let detail = 'Sem medições válidas nesta seleção.';
    if (validRows.length) {
      if (measure.source === 'weights') {
        const lastByAnimal = [...animals.values()].map(records => records.reduce((latest, row) => Number(row.age_days) > Number(latest.age_days) ? row : latest));
        const latestWeights = lastByAnimal.map(row => Number(row.weight_kg));
        figure = `${fmt(groupMean(latestWeights))} ${measure.unit}`;
        const minAge = Math.min(...lastByAnimal.map(row => Number(row.age_days)));
        const maxAge = Math.max(...lastByAnimal.map(row => Number(row.age_days)));
        detail = `Último peso disponível por animal · ${latestWeights.length} animais · idades ${minAge}–${maxAge} dias · valores ${fmt(Math.min(...latestWeights))}–${fmt(Math.max(...latestWeights))} kg.`;
      } else {
        const perAnimalMeans = [...animals.values()].map(records => records.map(row => row.value).filter(value => value !== null && value !== undefined).map(Number)).filter(values => values.length).map(groupMean);
        figure = `${fmt(groupMean(perAnimalMeans))} ${measure.unit}`;
        detail = `Média das médias individuais no período disponível · ${perAnimalMeans.length} animais · ${validRows.length} registros válidos.`;
      }
    } else if (measure.feed === 'hay' && group.key === 'Control') {
      detail = 'O grupo Control não recebeu feno; sem registros de ingestão deste alimento.';
    }
    return `<article class="group-card" style="--group:${group.color}"><h3>${group.name}</h3><strong>${figure}</strong><p>${detail}</p></article>`;
  }).join('');

  const available = summaries.rows.length - summaries.missing;
  coverage.textContent = `${measure.label}: ${available.toLocaleString('pt-BR')} registros numéricos de ${summaries.rows.length.toLocaleString('pt-BR')} linhas da fonte${summaries.missing ? `; ${summaries.missing.toLocaleString('pt-BR')} valores ausentes foram omitidos` : ''}. As linhas ausentes não são imputadas. A faixa do gráfico mostra mínimos e máximos entre médias por animal, não incerteza estatística.`;
}

function renderChart(measure, summaries) {
  const all = [...summaries.series.values()].flat().filter(Boolean);
  const minData = Math.min(...all.map(item => item.min));
  const maxData = Math.max(...all.map(item => item.max));
  const padding = Math.max((maxData - minData) * .1, Math.abs(maxData) * .05, .1);
  const low = Math.max(0, minData - padding);
  const high = maxData + padding;
  const left = 78, right = 875, top = 30, bottom = 314;
  const x = week => left + week / 8 * (right - left);
  const y = value => bottom - (value - low) / (high - low || 1) * (bottom - top);
  let svg = `<title>${measure.label} observado por grupo e semana</title><desc>${measure.note} O gráfico mostra média por animal e faixa mínima a máxima.</desc>`;

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = low + (high - low) * tick / 4;
    const yy = y(value);
    svg += `<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="#e2e8de"/>`;
    svg += `<text x="${left - 10}" y="${yy + 4}" text-anchor="end" font-family="monospace" font-size="10" fill="#8b9784">${fmt(value)}</text>`;
  }
  for (let week = 0; week <= 8; week += 1) {
    const xx = x(week);
    svg += `<line x1="${xx}" x2="${xx}" y1="${bottom}" y2="${bottom + 5}" stroke="#aab5a5"/>`;
    svg += `<text x="${xx}" y="${bottom + 23}" text-anchor="middle" font-family="monospace" font-size="10" fill="#8b9784">${week === 8 ? '60' : week * 7}</text>`;
  }
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#aab5a5"/><text x="${(left + right) / 2}" y="${bottom + 48}" text-anchor="middle" font-family="monospace" font-size="10" fill="#788579">IDADE (DIAS)</text>`;
  svg += `<text x="${left}" y="16" font-family="monospace" font-size="10" fill="#788579">${measure.unit}</text>`;

  for (const group of GROUPS) {
    const points = summaries.series.get(group.key);
    for (let week = 0; week < points.length - 1; week += 1) {
      const current = points[week], next = points[week + 1];
      if (!current || !next) continue;
      const x0 = x(current.week), x1 = x(next.week);
      const y0 = y(current.mean), y1 = y(next.mean);
      svg += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${group.color}" stroke-width="2.5"/>`;
    }
    for (const point of points.filter(Boolean)) {
      const xx = x(point.week), yy = y(point.mean);
      svg += `<line x1="${xx}" x2="${xx}" y1="${y(point.max)}" y2="${y(point.min)}" stroke="${group.color}" stroke-width="1.5" opacity=".75"/>`;
      svg += `<circle cx="${xx}" cy="${yy}" r="4.2" fill="${group.color}"><title>${group.name} · semana ${point.week} · média ${fmt(point.mean)} ${measure.unit} · n=${point.n} animais</title></circle>`;
    }
  }

  const legendStart = 305;
  GROUPS.forEach((group, index) => {
    const xx = legendStart + index * 180;
    svg += `<line x1="${xx}" x2="${xx + 23}" y1="366" y2="366" stroke="${group.color}" stroke-width="3"/><text x="${xx + 30}" y="370" font-family="monospace" font-size="10" fill="#687869">${group.name}</text>`;
  });
  chart.innerHTML = svg;
  chart.setAttribute('aria-label', `${measure.label} observado em ${measure.unit} por idade e grupo; médias por animal e faixa mínimo-máximo.`);
}

function renderContrast(measureId) {
  const measure = MEASURES[measureId];
  const reference = GROUPS.find(group => group.key === referenceSelect.value);
  const comparison = GROUPS.find(group => group.key === comparisonSelect.value);
  document.querySelector('#reference-heading').textContent = `${reference.name} · ${measure.unit}`;
  document.querySelector('#comparison-heading').textContent = `${comparison.name} · ${measure.unit}`;
  const rows = compareObservedGroups(dataset, measureId, reference.key, comparison.key);
  const available = rows.filter(row => row.difference !== null);
  contrastRows.innerHTML = rows.map(row => {
    if (row.difference === null) return `<tr><th scope="row">${row.week === 8 ? '56–60' : `${row.week * 7}–${row.week * 7 + 6}`} dias</th><td colspan="4">Sem observações válidas nos dois grupos nesta semana.</td></tr>`;
    const difference = `${row.difference > 0 ? '+' : ''}${fmt(row.difference)} ${measure.unit}`;
    const relative = row.percentDifference === null ? '—' : `${row.percentDifference > 0 ? '+' : ''}${fmt(row.percentDifference)}%`;
    const age = row.week === 8 ? '56–60' : `${row.week * 7}–${row.week * 7 + 6}`;
    return `<tr><th scope="row">${age} dias</th><td>${fmt(row.reference)} <small>n=${row.referenceN}</small></td><td>${fmt(row.comparison)} <small>n=${row.comparisonN}</small></td><td>${difference}</td><td>${relative}</td></tr>`;
  }).join('');
  contrastNote.textContent = available.length
    ? `Semanas com medidas nos dois grupos: ${available.length} de ${rows.length}. Cada média semanal dá o mesmo peso a cada animal com dado válido. Diferenças descrevem somente estas coortes e semanas; não são efeito de tratamento, previsão ou intervalo de confiança.`
    : `Não há semanas com observações válidas simultâneas para ${reference.name} e ${comparison.name} nesta medida. Registros ausentes não foram interpretados como zero.`;
}

function update() {
  const measure = MEASURES[measureSelect.value];
  note.textContent = measure.note;
  const summaries = summarizeObservedData(dataset, measureSelect.value);
  renderChart(measure, summaries);
  renderSummary(measure, summaries);
  renderContrast(measureSelect.value);
}

measureSelect.addEventListener('change', update);
referenceSelect.addEventListener('change', update);
comparisonSelect.addEventListener('change', update);
fetch('./data/observed-calves-zenodo-7251167.json')
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(data => {
    dataset = data;
    update();
  })
  .catch(error => {
    chart.innerHTML = `<text x="20" y="50" fill="#8b463c">Não foi possível carregar os dados observados (${error.message}). Sirva o projeto por HTTP e gere o JSON com o script documentado.</text>`;
    coverage.textContent = 'Dados não carregados.';
  });
