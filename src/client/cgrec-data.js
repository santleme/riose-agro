import {parseCgrecCsv} from './adult-data-model.js';

const yearSelect = document.querySelector('#year');
const treatmentSelect = document.querySelector('#treatment');
const recordsBody = document.querySelector('#records');
const summary = document.querySelector('#summary');
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = (value, digits=2) => Number.isFinite(value) ? value.toLocaleString('pt-BR', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
let allRows = [];

function render() {
  const selectedYear = yearSelect.value;
  const selectedTreatment = treatmentSelect.value;
  const rows = allRows.filter(row => (selectedYear === 'all' || String(row.year) === selectedYear) && (selectedTreatment === 'all' || row.treatment === selectedTreatment));
  const adg = rows.map(row => row.adgKg).filter(Number.isFinite);
  const mean = adg.length ? adg.reduce((sum, value) => sum + value, 0) / adg.length : Number.NaN;
  const animals = new Set(rows.map(row => row.tag));
  const pastures = new Set(rows.map(row => row.pasture).filter(value => value && value !== 'NA'));
  const years = new Set(rows.map(row => row.year).filter(Number.isFinite));
  document.querySelector('#facts').innerHTML = `<span><strong>${allRows.length.toLocaleString('pt-BR')}</strong> animal-seasons</span><span><strong>${new Set(allRows.map(row => row.year)).size}</strong> anos</span><span><strong>${new Set(allRows.map(row => row.pasture).filter(x => x && x !== 'NA')).size}</strong> piquetes</span><span><strong>1989–2015</strong> período</span>`;
  summary.innerHTML = [
    ['ADG médio observado', `${fmt(mean)} kg/animal/dia`, 'Média simples das linhas filtradas; sem ajuste'],
    ['Registros', rows.length.toLocaleString('pt-BR'), 'Animal por temporada'],
    ['Brincos distintos', animals.size.toLocaleString('pt-BR'), 'Textos de ID presentes; não são contagem de animais independentes'],
    ['Cobertura', `${years.size} anos · ${pastures.size} piquetes`, 'Ambientes e temporadas compartilhados'],
  ].map(([title,value,detail]) => `<article class="adult-metric"><span>${title}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
  recordsBody.innerHTML = rows.map(row => `<tr><td>${row.year}</td><td>${safe(row.tag)} <small>#${safe(row.recordId)}</small></td><td>${safe(row.sex)}</td><td>${safe(row.pasture)}</td><td>${safe(row.treatment)}</td><td>${fmt(row.initialWeightKg)}</td><td>${fmt(row.finalWeightKg)}</td><td>${fmt(row.days,0)}</td><td>${fmt(row.adgKg,3)}</td><td>${fmt(row.grossReturnUsd)}</td></tr>`).join('');
  document.querySelector('#row-count').textContent = `${rows.length.toLocaleString('pt-BR')} linhas · filtros descritivos; nenhum modelo ou teste inferencial foi aplicado.`;
}

yearSelect.addEventListener('change', render);
treatmentSelect.addEventListener('change', render);
fetch('./data/usda-cgrec-longterm/Streeter-ND_1989-2015_compiled.csv').then(response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
}).then(buffer => {
  const text = new TextDecoder('windows-1252').decode(buffer);
  allRows = parseCgrecCsv(text).filter(row => Number.isFinite(row.year) && row.tag);
  [...new Set(allRows.map(row => row.year))].sort((a,b) => a-b).forEach(value => yearSelect.add(new Option(String(value), String(value))));
  [...new Set(allRows.map(row => row.treatment).filter(value => value && value !== 'NA'))].sort().forEach(value => treatmentSelect.add(new Option(value, value)));
  render();
}).catch(error => {
  document.querySelector('#facts').textContent = `Não foi possível carregar a tabela USDA (${error.message}).`;
  recordsBody.innerHTML = '<tr><td colspan="10">Sirva o projeto por HTTP e recarregue a página.</td></tr>';
});
