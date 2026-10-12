const fmt = (value, digits = 2) => new Intl.NumberFormat('pt-BR', {minimumFractionDigits: digits, maximumFractionDigits: digits}).format(value);
const fmtN = value => new Intl.NumberFormat('pt-BR').format(value);
const rowsEl = document.querySelector('#records');
const yearFilter = document.querySelector('#year');
const ageFilter = document.querySelector('#age');
const treatmentFilter = document.querySelector('#treatment');
const metricsEl = document.querySelector('#metrics');
const summaryEl = document.querySelector('#summary');
const plot = document.querySelector('#plot');
let rows = [];

function renderPlot(selected) {
  if (!selected.length) {
    plot.innerHTML = '<text x="25" y="55" fill="#7b8578">Não há registros para estes filtros.</text>';
    return;
  }
  const left = 82, right = 866, top = 30, bottom = 310;
  const xs = selected.map(row => row.cowAdgKgPerDay);
  const ys = selected.map(row => row.calfAdgKgPerDay);
  const minX = Math.min(0, ...xs), maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys);
  const padX = (maxX - minX) * .06 || .1, padY = (maxY - minY) * .06 || .1;
  const lowX = minX - padX, highX = maxX + padX, lowY = minY - padY, highY = maxY + padY;
  const x = value => left + (value - lowX) / (highX - lowX) * (right - left);
  const y = value => bottom - (value - lowY) / (highY - lowY) * (bottom - top);
  let svg = '<title>ADG observado de cada vaca e de seu bezerro</title><desc>Uma marca por par e ano de estudo filtrados; as vacas podem aparecer em anos diferentes.</desc>';
  for (let i = 0; i <= 4; i++) {
    const vx = lowX + (highX - lowX) * i / 4;
    const vy = lowY + (highY - lowY) * i / 4;
    svg += `<line x1="${left}" x2="${right}" y1="${y(vy)}" y2="${y(vy)}" stroke="#e7ebe3"/><text x="${left - 10}" y="${y(vy) + 4}" text-anchor="end" font-size="10" fill="#798579">${fmt(vy, 2)}</text>`;
    svg += `<line x1="${x(vx)}" x2="${x(vx)}" y1="${bottom}" y2="${bottom + 5}" stroke="#abb6a9"/><text x="${x(vx)}" y="${bottom + 20}" text-anchor="middle" font-size="10" fill="#798579">${fmt(vx, 2)}</text>`;
  }
  if (lowX < 0 && highX > 0) svg += `<line x1="${x(0)}" x2="${x(0)}" y1="${top}" y2="${bottom}" stroke="#798879" stroke-dasharray="4 4"/>`;
  if (lowY < 0 && highY > 0) svg += `<line x1="${left}" x2="${right}" y1="${y(0)}" y2="${y(0)}" stroke="#798879" stroke-dasharray="4 4"/>`;
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#abb6a9"/><text x="${(left + right) / 2}" y="${bottom + 43}" text-anchor="middle" font-size="11" fill="#637263">ADG DA VACA (KG/CABEÇA/DIA)</text><text transform="translate(18 ${(top + bottom) / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="#637263">ADG DO BEZERRO (KG/CABEÇA/DIA)</text>`;
  const colors = {Continuous: '#527a56', 'Patch-burn': '#b76b45', Rotational: '#5678a5'};
  for (const row of selected) {
    svg += `<circle cx="${x(row.cowAdgKgPerDay)}" cy="${y(row.calfAdgKgPerDay)}" r="4" fill="${colors[row.treatment]}" fill-opacity=".58"><title>${row.year}, ${row.treatment}, ${row.ageClass}, pastagem ${row.pasture}, vaca ${row.cowId}, bezerro ${row.calfId}</title></circle>`;
  }
  let legendX = left;
  for (const [name, color] of Object.entries(colors)) {
    if (treatmentFilter.value !== 'all' && treatmentFilter.value !== name) continue;
    svg += `<circle cx="${legendX + 5}" cy="374" r="5" fill="${color}"/><text x="${legendX + 15}" y="378" font-size="10" fill="#637263">${name}</text>`;
    legendX += 190;
  }
  plot.innerHTML = svg;
  plot.setAttribute('aria-label', `ADG observado de vacas e bezerros; ${selected.length} pares-ano, descrição sem inferência causal.`);
}

function render() {
  const selected = rows.filter(row => (yearFilter.value === 'all' || String(row.year) === yearFilter.value)
    && (ageFilter.value === 'all' || row.ageClass === ageFilter.value)
    && (treatmentFilter.value === 'all' || row.treatment === treatmentFilter.value));
  const uniqueCows = new Set(selected.map(row => row.cowId)).size;
  const meanCow = selected.length ? selected.reduce((sum, row) => sum + row.cowAdgKgPerDay, 0) / selected.length : NaN;
  const meanCalf = selected.length ? selected.reduce((sum, row) => sum + row.calfAdgKgPerDay, 0) / selected.length : NaN;
  metricsEl.innerHTML = `<article class="metric"><span>Pares-ano</span><strong>${fmtN(selected.length)}</strong><small>linhas observadas após os filtros</small></article><article class="metric"><span>Vacas identificadas</span><strong>${fmtN(uniqueCows)}</strong><small>IDs únicos no filtro; repetição entre anos possível</small></article><article class="metric"><span>ADG médio das vacas</span><strong>${Number.isFinite(meanCow) ? `${fmt(meanCow, 3)} kg/d` : '—'}</strong><small>média simples por linha, descritiva</small></article><article class="metric"><span>ADG médio dos bezerros</span><strong>${Number.isFinite(meanCalf) ? `${fmt(meanCalf, 3)} kg/d` : '—'}</strong><small>média simples por linha, descritiva</small></article>`;
  summaryEl.innerHTML = ['Continuous', 'Patch-burn', 'Rotational'].filter(name => treatmentFilter.value === 'all' || treatmentFilter.value === name).map(name => {
    const group = selected.filter(row => row.treatment === name);
    if (!group.length) return `<article><span>${name}</span><strong>Sem linhas</strong><small>para o filtro escolhido.</small></article>`;
    const cowMean = group.reduce((sum, row) => sum + row.cowAdgKgPerDay, 0) / group.length;
    const calfMean = group.reduce((sum, row) => sum + row.calfAdgKgPerDay, 0) / group.length;
    return `<article><span>${name} · ${group.length} pares-ano</span><strong>Vaca ${fmt(cowMean, 3)} · bezerro ${fmt(calfMean, 3)} kg/d</strong><small>Médias descritivas; não são contrastes causais.</small></article>`;
  }).join('');
  rowsEl.innerHTML = selected.map(row => `<tr><td>${row.year}</td><td>${row.treatment}</td><td>${row.ageClass === 'Old' ? 'Madura' : 'Jovem'}</td><td>${row.pasture}</td><td>${row.cowId}</td><td>${row.calfId}</td><td>${fmt(row.cowAdgKgPerDay, 3)}</td><td>${fmt(row.calfAdgKgPerDay, 3)}</td></tr>`).join('');
  document.querySelector('#row-count').textContent = `${fmtN(selected.length)} LINHAS`;
  renderPlot(selected);
}

for (const filter of [yearFilter, ageFilter, treatmentFilter]) filter.addEventListener('change', render);
fetch('./data/usda-cgrec-cow-calf/cow-calf-observations.json').then(response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then(data => {
  rows = data.records;
  for (const value of [...new Set(rows.map(row => row.year))].sort()) {
    const option = document.createElement('option'); option.value = String(value); option.textContent = String(value); yearFilter.append(option);
  }
  for (const value of [...new Set(rows.map(row => row.treatment))].sort()) {
    const option = document.createElement('option'); option.value = value; option.textContent = value; treatmentFilter.append(option);
  }
  render();
}).catch(error => {
  metricsEl.innerHTML = `<article class="metric"><span>Dados indisponíveis</span><strong>${error.message}</strong><small>Sirva o projeto por HTTP e tente novamente.</small></article>`;
  plot.innerHTML = '<text x="25" y="55" fill="#8b463c">Não foi possível carregar a fonte local auditada.</text>';
});
