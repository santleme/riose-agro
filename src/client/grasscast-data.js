const dataUrl = './data/usda-grasscast/cper-grouped-observations.json';
const associationUrl = './docs/evidence/usda-grasscast-cper-association.json';
const colors = {Light: '#2e7d58', Moderate: '#d08a26', Heavy: '#9b4a39'};
const startInput = document.querySelector('#start-year');
const endInput = document.querySelector('#end-year');
const treatmentSelect = document.querySelector('#treatment');
const ndviSelect = document.querySelector('#ndvi-measure');
const number = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2});
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = value => Number.isFinite(value) ? number.format(value) : '—';
const svgNs = 'http://www.w3.org/2000/svg';
let dataset;

function svgNode(parent, tag, attrs = {}, text = '') {
  const node = document.createElementNS(svgNs, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}

function resetSvg(svg) {
  while (svg.firstChild) svg.firstChild.remove();
}

function bounds() {
  const first = Number(startInput.value);
  const last = Number(endInput.value);
  const valid = Number.isInteger(first) && Number.isInteger(last) && first <= last && first >= 1939 && last <= 2020;
  document.querySelector('#filter-note').textContent = valid
    ? `Filtro ativo: ${first}–${last}; pontos mantidos por grupo/ano/tratamento, sem interpolação.`
    : 'Informe anos inteiros entre 1939 e 2020, com o ano inicial menor ou igual ao final.';
  return valid ? {first, last} : null;
}

function filteredGroups(range) {
  const selectedTreatment = treatmentSelect.value;
  return dataset.observations.filter(row => row.year >= range.first && row.year <= range.last
    && (selectedTreatment === 'all' || row.treatment === selectedTreatment));
}

function makeFrame(svg, values, xStart, xEnd, yTitle, formatY = fmt) {
  resetSvg(svg);
  const width = 900;
  const height = 340;
  const margin = {left: 78, right: 28, top: 24, bottom: 54};
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    svgNode(svg, 'text', {x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty'}, 'Sem valores disponíveis neste filtro');
    return null;
  }
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (yTitle.includes('ADG')) min = Math.min(0, min);
  if (max === min) { max += 1; min -= 1; }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const x = year => margin.left + ((year - xStart) / Math.max(1, xEnd - xStart)) * plotWidth;
  const y = value => margin.top + ((max - value) / (max - min)) * plotHeight;
  for (let i = 0; i <= 4; i += 1) {
    const value = min + (max - min) * i / 4;
    const yy = y(value);
    svgNode(svg, 'line', {x1: margin.left, x2: width - margin.right, y1: yy, y2: yy, class: 'chart-grid'});
    svgNode(svg, 'text', {x: margin.left - 10, y: yy + 4, 'text-anchor': 'end', class: 'chart-tick'}, formatY(value));
  }
  for (let i = 0; i <= 4; i += 1) {
    const year = Math.round(xStart + (xEnd - xStart) * i / 4);
    const xx = x(year);
    svgNode(svg, 'line', {x1: xx, x2: xx, y1: margin.top, y2: height - margin.bottom, class: 'chart-grid chart-grid-vertical'});
    svgNode(svg, 'text', {x: xx, y: height - margin.bottom + 22, 'text-anchor': 'middle', class: 'chart-tick'}, String(year));
  }
  svgNode(svg, 'line', {x1: margin.left, x2: width - margin.right, y1: height - margin.bottom, y2: height - margin.bottom, class: 'chart-axis'});
  svgNode(svg, 'text', {x: margin.left + plotWidth / 2, y: height - 8, 'text-anchor': 'middle', class: 'chart-label'}, 'Ano');
  svgNode(svg, 'text', {x: 18, y: margin.top + plotHeight / 2, 'text-anchor': 'middle', class: 'chart-label', transform: `rotate(-90 18 ${margin.top + plotHeight / 2})`}, yTitle);
  if (min <= 0 && max >= 0) {
    svgNode(svg, 'line', {x1: margin.left, x2: width - margin.right, y1: y(0), y2: y(0), class: 'chart-zero'});
  }
  return {x, y, margin, width, height, plotWidth, plotHeight};
}

function renderLines(svgId, rows, key, yTitle, xStart, xEnd) {
  const svg = document.querySelector(`#${svgId}`);
  const frame = makeFrame(svg, rows.map(row => row[key]), xStart, xEnd, yTitle);
  if (!frame) return;
  const treatments = [...new Set(rows.map(row => row.treatment))].sort((a, b) => ['Light', 'Moderate', 'Heavy'].indexOf(a) - ['Light', 'Moderate', 'Heavy'].indexOf(b));
  treatments.forEach((treatment, index) => {
    const series = rows.filter(row => row.treatment === treatment).sort((a, b) => a.year - b.year);
    let segment = [];
    let previousYear = null;
    const flush = () => {
      if (segment.length > 1) svgNode(svg, 'path', {d: segment.map((point, i) => `${i ? 'L' : 'M'} ${frame.x(point.year)} ${frame.y(point.value)}`).join(' '), class: 'data-line', stroke: colors[treatment] || '#52616b'});
      for (const point of segment) {
        const circle = svgNode(svg, 'circle', {cx: frame.x(point.year), cy: frame.y(point.value), r: 3, class: 'data-dot', fill: colors[treatment] || '#52616b'});
        svgNode(circle, 'title', {}, `${point.year} · ${treatment}: ${fmt(point.value)}`);
      }
      segment = [];
    };
    for (const row of series) {
      const value = row[key];
      if (!Number.isFinite(value)) { flush(); previousYear = row.year; continue; }
      if (previousYear !== null && row.year !== previousYear + 1) flush();
      segment.push({year: row.year, value});
      previousYear = row.year;
    }
    flush();
    const legendX = frame.margin.left + index * 150;
    svgNode(svg, 'line', {x1: legendX, x2: legendX + 24, y1: 14, y2: 14, stroke: colors[treatment], class: 'data-line'});
    svgNode(svg, 'text', {x: legendX + 30, y: 18, class: 'chart-legend'}, treatment);
  });
}

function renderScatter(rows, xKey, yKey, xLabel, yLabel, xStart, xEnd) {
  const svg = document.querySelector('#scatter-chart');
  const selected = rows.filter(row => Number.isFinite(row[xKey]) && Number.isFinite(row[yKey]));
  document.querySelector('#scatter-count').textContent = `${selected.length} grupos com ambas as medidas`;
  resetSvg(svg);
  const width = 900, height = 340, margin = {left: 78, right: 28, top: 24, bottom: 54};
  if (!selected.length) {
    svgNode(svg, 'text', {x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty'}, 'Sem pares completos neste filtro');
    return;
  }
  const xv = selected.map(row => row[xKey]);
  const yv = selected.map(row => row[yKey]);
  let xmin = Math.min(...xv), xmax = Math.max(...xv), ymin = Math.min(...yv), ymax = Math.max(...yv);
  if (xmax === xmin) xmax = xmin + 1;
  if (ymax === ymin) ymax = ymin + 1;
  const xpad = (xmax - xmin) * 0.08, ypad = (ymax - ymin) * 0.08;
  xmin -= xpad; xmax += xpad; ymin -= ypad; ymax += ypad;
  const px = value => margin.left + (value - xmin) / (xmax - xmin) * (width - margin.left - margin.right);
  const py = value => margin.top + (ymax - value) / (ymax - ymin) * (height - margin.top - margin.bottom);
  for (let i = 0; i <= 4; i += 1) {
    const frac = i / 4;
    const xval = xmin + frac * (xmax - xmin), yval = ymin + frac * (ymax - ymin);
    const xx = px(xval), yy = py(yval);
    svgNode(svg, 'line', {x1: xx, x2: xx, y1: margin.top, y2: height - margin.bottom, class: 'chart-grid chart-grid-vertical'});
    svgNode(svg, 'line', {x1: margin.left, x2: width - margin.right, y1: yy, y2: yy, class: 'chart-grid'});
    svgNode(svg, 'text', {x: xx, y: height - margin.bottom + 22, 'text-anchor': 'middle', class: 'chart-tick'}, fmt(xval));
    svgNode(svg, 'text', {x: margin.left - 10, y: yy + 4, 'text-anchor': 'end', class: 'chart-tick'}, fmt(yval));
  }
  svgNode(svg, 'line', {x1: margin.left, x2: width - margin.right, y1: height - margin.bottom, y2: height - margin.bottom, class: 'chart-axis'});
  svgNode(svg, 'text', {x: margin.left + (width - margin.left - margin.right) / 2, y: height - 8, 'text-anchor': 'middle', class: 'chart-label'}, xLabel);
  svgNode(svg, 'text', {x: 18, y: margin.top + (height - margin.top - margin.bottom) / 2, 'text-anchor': 'middle', class: 'chart-label', transform: `rotate(-90 18 ${margin.top + (height - margin.top - margin.bottom) / 2})`}, yLabel);
  for (const row of selected) {
    const dot = svgNode(svg, 'circle', {cx: px(row[xKey]), cy: py(row[yKey]), r: 4, class: 'scatter-dot', fill: colors[row.treatment] || '#52616b'});
    svgNode(dot, 'title', {}, `${row.year} · ${row.treatment} · ANPP ${fmt(row[xKey])} · ADG ${fmt(row[yKey])}`);
  }
}

function renderTable(rows) {
  const body = document.querySelector('#records');
  body.innerHTML = rows.slice().sort((a, b) => b.year - a.year || a.treatment.localeCompare(b.treatment)).map(row => `<tr><td>${row.year}</td><td>${safe(row.treatment)}</td><td>${fmt(row.grazingDays)}</td><td>${fmt(row.head)}</td><td>${fmt(row.meanAdgKgPerAnimalDay)}</td><td>${fmt(row.anppKgDMPerHectare)}</td><td>${fmt(row.aumPerAcre)}</td></tr>`).join('');
  document.querySelector('#row-count').textContent = `${rows.length} grupos ano × tratamento · valores ausentes permanecem indisponíveis.`;
}

function renderAdjustedSummary(report) {
  const target = document.querySelector('#adjusted-summary');
  const results = report.descriptiveResults;
  const sample = report.completeCases;
  target.innerHTML = [
    '<div class="adjusted-metrics">',
    `<span>Associação bruta r = <strong>${fmt(results.rawPearsonR)}</strong></span>`,
    `<span>Correlação residual após efeitos de ano e tratamento = <strong>${fmt(results.fixedEffects.residualPearsonR)}</strong></span>`,
    `<span>Inclinação ajustada = <strong>${fmt(results.fixedEffects.slopeKgAdgPerKgAnppPerHectare)}</strong> ${safe(results.fixedEffects.slopeUnit)}</span>`,
    `<span>n = ${sample.n} grupos · ${sample.years} anos (${sample.yearRange[0]}–${sample.yearRange[1]})</span>`,
    '</div>',
    '<p>Resumo descritivo sem p-valor ou intervalo: grupos anuais repetidos, sem ponderação por precisão e sem ajuste de dependência temporal. A diferença entre bruto e ajustado não é efeito causal; esta análise não valida o motor.</p>',
  ].join('');
}

function renderNdvi(range) {
  const measure = ndviSelect.value;
  const rows = dataset.ndviObservations.filter(row => row.year >= range.first && row.year <= range.last);
  const svg = document.querySelector('#ndvi-chart');
  const ndviStart = rows.length ? Math.min(...rows.map(row => row.year)) : range.first;
  const ndviEnd = rows.length ? Math.max(...rows.map(row => row.year)) : range.last;
  const frame = makeFrame(svg, rows.map(row => row[measure]), ndviStart, ndviEnd, 'Soma do NDVI');
  if (!frame) return;
  const seriesNames = [...new Set(rows.map(row => row.satellite))].sort();
  const palette = {AVHRR: '#596ab1', MODIS: '#178779'};
  seriesNames.forEach((satellite, index) => {
    const points = rows.filter(row => row.satellite === satellite).sort((a, b) => a.year - b.year);
    let segment = [];
    let previousYear = null;
    const flush = () => {
      if (segment.length > 1) svgNode(svg, 'path', {d: segment.map((point, i) => `${i ? 'L' : 'M'} ${frame.x(point.year)} ${frame.y(point[measure])}`).join(' '), class: 'data-line', stroke: palette[satellite] || '#52616b'});
      segment = [];
    };
    for (const point of points) {
      if (!Number.isFinite(point[measure])) { flush(); previousYear = point.year; continue; }
      if (previousYear !== null && point.year !== previousYear + 1) flush();
      segment.push(point);
      previousYear = point.year;
      const dot = svgNode(svg, 'circle', {cx: frame.x(point.year), cy: frame.y(point[measure]), r: 3.5, class: 'data-dot', fill: palette[satellite] || '#52616b'});
      svgNode(dot, 'title', {}, `${point.year} · ${satellite}: ${fmt(point[measure])}`);
    }
    flush();
    const legendX = frame.margin.left + index * 150;
    svgNode(svg, 'line', {x1: legendX, x2: legendX + 24, y1: 14, y2: 14, stroke: palette[satellite], class: 'data-line'});
    svgNode(svg, 'text', {x: legendX + 30, y: 18, class: 'chart-legend'}, satellite);
  });
}

function render() {
  if (!dataset) return;
  const range = bounds();
  if (!range) {
    for (const id of ['adg-chart', 'anpp-chart', 'scatter-chart', 'ndvi-chart']) resetSvg(document.querySelector(`#${id}`));
    document.querySelector('#facts').textContent = 'Corrija o intervalo de anos para ver as observações.';
    document.querySelector('#records').innerHTML = '';
    document.querySelector('#row-count').textContent = '';
    return;
  }
  const rows = filteredGroups(range);
  const adgN = rows.filter(row => Number.isFinite(row.meanAdgKgPerAnimalDay)).length;
  const anppN = rows.filter(row => Number.isFinite(row.anppKgDMPerHectare)).length;
  const pairedN = rows.filter(row => Number.isFinite(row.meanAdgKgPerAnimalDay) && Number.isFinite(row.anppKgDMPerHectare)).length;
  document.querySelector('#facts').innerHTML = [
    `<span><strong>${rows.length}</strong> grupos ano × tratamento</span>`,
    `<span><strong>${adgN}</strong> com ADG médio</span>`,
    `<span><strong>${anppN}</strong> com ANPP</span>`,
    `<span><strong>${pairedN}</strong> pares completos</span>`,
  ].join('');
  renderLines('adg-chart', rows, 'meanAdgKgPerAnimalDay', 'ADG (kg/animal/dia)', range.first, range.last);
  renderLines('anpp-chart', rows, 'anppKgDMPerHectare', 'ANPP (kg MS/ha/ano)', range.first, range.last);
  renderScatter(rows, 'anppKgDMPerHectare', 'meanAdgKgPerAnimalDay', 'ANPP (kg MS/ha/ano)', 'ADG (kg/animal/dia)', range.first, range.last);
  renderNdvi(range);
  renderTable(rows);
}

for (const input of [startInput, endInput, treatmentSelect, ndviSelect]) input.addEventListener('input', render);
treatmentSelect.addEventListener('change', render);
ndviSelect.addEventListener('change', render);

fetch(dataUrl).then(response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then(data => {
  dataset = data;
  [...new Set(dataset.observations.map(row => row.treatment))].sort().forEach(value => treatmentSelect.add(new Option(value, value)));
  render();
}).catch(error => {
  document.querySelector('#facts').textContent = `Não foi possível carregar o resumo local (${error.message}).`;
  document.querySelector('#filter-note').textContent = 'Sirva o projeto por HTTP e recarregue a página.';
});

fetch(associationUrl).then(response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then(renderAdjustedSummary).catch(error => {
  document.querySelector('#adjusted-summary').textContent = `Não foi possível carregar a análise ajustada local (${error.message}).`;
});
