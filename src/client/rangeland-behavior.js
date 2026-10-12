const behaviorLabels = {GR: 'Pastejo', WA: 'Caminhada', RE: 'Repouso', RU: 'Ruminação'};
const colors = {GR: '#6d9a62', WA: '#d29a56', RE: '#7392a0', RU: '#9b83a6'};
const order = ['GR', 'WA', 'RE', 'RU'];
const parseDate = value => {
  const [date, time] = value.split(' ');
  const [month, day, year] = date.split('/').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
};
const fmt = value => new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1}).format(value);
const facts = document.querySelector('#facts');
const selector = document.querySelector('#animal-select');
const chart = document.querySelector('#chart');
const summary = document.querySelector('#summary');
const chartNote = document.querySelector('#chart-note');
let data = [];

function render() {
  const [breed, id] = selector.value.split(':');
  const rows = data.filter(row => row.breed === breed && row.id === id);
  const byDay = new Map();
  const behaviorCounts = Object.fromEntries(order.map(code => [code, 0]));
  const motion = Object.fromEntries(order.map(code => [code, []]));
  for (const row of rows) {
    const day = row.time.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? {counts: Object.fromEntries(order.map(code => [code, 0])), total: 0};
    bucket.counts[row.behavior] += 1;
    bucket.total += 1;
    byDay.set(day, bucket);
    behaviorCounts[row.behavior] += 1;
    motion[row.behavior].push(row.mi);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const left = 62, right = 880, top = 24, bottom = 255;
  const width = right - left;
  const slot = width / Math.max(1, days.length);
  let svg = `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#c8cec2"/><text x="8" y="${top + 4}" font-size="11" fill="#75806f">100%</text><text x="20" y="${bottom + 4}" font-size="11" fill="#75806f">0%</text>`;
  days.forEach(([day, bin], index) => {
    const x = left + slot * index + slot * .18;
    const barWidth = Math.max(4, slot * .62);
    let y = bottom;
    for (const code of order) {
      const segment = bin.counts[code] / bin.total * (bottom - top);
      y -= segment;
      svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${segment}" fill="${colors[code]}"><title>${day}: ${behaviorLabels[code]} ${fmt(bin.counts[code] / bin.total * 100)}% (${bin.counts[code]} de ${bin.total} registros)</title></rect>`;
    }
    if (days.length <= 18 || index % Math.ceil(days.length / 18) === 0) {
      const label = day.slice(5);
      svg += `<text x="${x + barWidth / 2}" y="${bottom + 19}" text-anchor="middle" font-size="9" fill="#75806f">${label}</text>`;
    }
  });
  chart.innerHTML = svg;
  chartNote.textContent = `${rows.length.toLocaleString('pt-BR')} registros em ${days.length} dias observados. Cada barra soma 100% das linhas publicadas daquele dia; a janela diária não é completa nem necessariamente igual entre dias. O arquivo contém timestamps repetidos para o mesmo animal; as linhas foram preservadas.`;
  const timestampCounts = new Map();
  rows.forEach(row => {
    const key = row.time.toISOString().slice(0, 16);
    timestampCounts.set(key, (timestampCounts.get(key) ?? 0) + 1);
  });
  const uniqueTimestamps = timestampCounts.size;
  const duplicateRows = [...timestampCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const duplicateKeys = [...timestampCounts.values()].filter(count => count > 1).length;
  document.querySelector('#integrity-note').textContent = `${rows.length.toLocaleString('pt-BR')} linhas publicadas; ${uniqueTimestamps.toLocaleString('pt-BR')} timestamps distintos; ${duplicateRows.toLocaleString('pt-BR')} linhas excedentes em ${duplicateKeys.toLocaleString('pt-BR')} chaves de timestamp repetidas. Os rótulos duplicados foram mantidos e entram nas proporções como linhas distintas.`;
  const total = rows.length;
  const body = order.map(code => {
    const count = behaviorCounts[code];
    const mean = motion[code].length ? motion[code].reduce((sum, value) => sum + value, 0) / motion[code].length : null;
    return `<tr><td>${behaviorLabels[code]}</td><td>${count.toLocaleString('pt-BR')}</td><td>${total ? fmt(count / total * 100) : '0'}%</td><td>${mean === null ? '—' : fmt(mean)}</td></tr>`;
  }).join('');
  summary.innerHTML = `<table><thead><tr><th>Rótulo anotado</th><th>Minutos</th><th>% dos registros</th><th>Índice de movimento médio</th></tr></thead><tbody>${body}</tbody></table>`;
}

fetch('./data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv')
  .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.text(); })
  .then(csv => {
    const lines = csv.trim().split(/\r?\n/);
    const headers = lines.shift().split(',');
    const index = Object.fromEntries(headers.map((name, position) => [name, position]));
    const needed = ['Breed', 'ID', 'Time.MTD', 'MI', 'State', 'Behavior'];
    if (needed.some(name => index[name] === undefined)) throw new Error('colunas inesperadas no CSV');
    data = lines.map(line => {
      const columns = line.split(',');
      return {breed: columns[index.Breed], id: columns[index.ID], time: parseDate(columns[index['Time.MTD']]), mi: Number(columns[index.MI]), state: columns[index.State], behavior: columns[index.Behavior]};
    }).filter(row => row.time instanceof Date && Number.isFinite(row.mi) && behaviorLabels[row.behavior]);
    const animals = [...new Map(data.map(row => [`${row.breed}:${row.id}`, {breed: row.breed, id: row.id}])).values()].sort((a, b) => a.breed.localeCompare(b.breed) || a.id.localeCompare(b.id, undefined, {numeric: true}));
    selector.innerHTML = animals.map(animal => `<option value="${animal.breed}:${animal.id}">${animal.breed} · ${animal.id}</option>`).join('');
    const behaviors = Object.fromEntries(order.map(code => [code, data.filter(row => row.behavior === code).length]));
    facts.innerHTML = [
      ['Observações', data.length.toLocaleString('pt-BR')],
      ['Vacas adultas', animals.length],
      ['Raças', new Set(animals.map(animal => animal.breed)).size],
      ['Rótulo mais frequente', `${behaviorLabels[Object.keys(behaviors).sort((a, b) => behaviors[b] - behaviors[a])[0]]}`],
    ].map(([label, value]) => `<article class="fact"><span>${label}</span><strong>${value}</strong></article>`).join('');
    selector.addEventListener('change', render);
    render();
  })
  .catch(error => {
    facts.textContent = `A amostra local não carregou (${error.message}). Sirva o projeto por HTTP.`;
    chartNote.textContent = 'Gráfico indisponível.';
  });
