import {parseAdultCperCsv, parseDailyCperCsv} from './adult-data-model.js';

const SVG = document.querySelector('#chart');
const predictor = document.querySelector('#predictor');
const summary = document.querySelector('#summary');
const recordsBody = document.querySelector('#records');
const dailySVG = document.querySelector('#daily-chart');
const animalSelect = document.querySelector('#animal-select');
const dailyMeasure = document.querySelector('#daily-measure');
const dailyRecordsBody = document.querySelector('#daily-records');
const dailyFacts = document.querySelector('#daily-facts');
const fmt = (value, digits = 2) => new Intl.NumberFormat('pt-BR', {maximumFractionDigits: digits, minimumFractionDigits: digits}).format(value);
const fmtObserved = value => Number.isFinite(value) ? fmt(value) : '—';
const safe = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {
  GBD_5min: {title: 'Duração média do bout de pastejo', unit: 'min/dia'},
  MeanVelo: {title: 'Velocidade média ao pastejar', unit: 'm/min'},
  GrazeHrs_5min: {title: 'Horas de pastejo', unit: 'h/dia'},
};

function renderChart(rows) {
  const key = predictor.value;
  const label = labels[key];
  const points = rows.map(row => ({x: key === 'GBD_5min' ? row.bout : key === 'MeanVelo' ? row.velocity : row.hours, y: row.adg, row})).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!points.length) { SVG.innerHTML = '<text x="25" y="50">Sem dados para esta medida.</text>'; return; }
  const left = 82, right = 865, top = 32, bottom = 320;
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const padX = (maxX - minX) * .08 || 1, padY = (maxY - minY) * .12 || .1;
  const lowX = minX - padX, highX = maxX + padX, lowY = Math.max(0, minY - padY), highY = maxY + padY;
  const x = value => left + (value - lowX) / (highX - lowX) * (right - left);
  const y = value => bottom - (value - lowY) / (highY - lowY) * (bottom - top);
  let svg = `<title>ADG observado por ${label.title}</title><desc>Cada ponto é um registro animal-período, não uma observação independente por animal.</desc>`;
  for (let tick=0;tick<=4;tick++) {
    const vx=lowX+(highX-lowX)*tick/4, vy=lowY+(highY-lowY)*tick/4;
    svg += `<line x1="${left}" x2="${right}" y1="${y(vy)}" y2="${y(vy)}" stroke="#e2e8de"/><text x="${left-10}" y="${y(vy)+4}" text-anchor="end" font-size="10" fill="#788579">${fmt(vy,1)}</text>`;
    svg += `<line x1="${x(vx)}" x2="${x(vx)}" y1="${bottom}" y2="${bottom+5}" stroke="#aab5a5"/><text x="${x(vx)}" y="${bottom+22}" text-anchor="middle" font-size="10" fill="#788579">${fmt(vx,1)}</text>`;
  }
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#aab5a5"/><text x="${(left+right)/2}" y="${bottom+48}" text-anchor="middle" font-size="11" fill="#657365">${label.title.toUpperCase()} (${label.unit})</text><text transform="translate(20 ${(top+bottom)/2}) rotate(-90)" text-anchor="middle" font-size="11" fill="#657365">ADG OBSERVADO (KG/NOVILHO/DIA)</text>`;
  for (const point of points) {
    const color = point.row.year === 2019 ? '#3f7852' : '#c2793d';
    svg += `<circle cx="${x(point.x)}" cy="${y(point.y)}" r="5" fill="${color}" fill-opacity=".78"><title>${point.row.year}, período ${point.row.period}, piquete ${point.row.paddock}, brinco ${point.row.eartag}: ${fmt(point.x)} ${label.unit}, ADG ${fmt(point.y)} kg/d</title></circle>`;
  }
  svg += `<circle cx="330" cy="370" r="5" fill="#3f7852"/><text x="341" y="374" font-size="10" fill="#657365">2019</text><circle cx="407" cy="370" r="5" fill="#c2793d"/><text x="418" y="374" font-size="10" fill="#657365">2020</text>`;
  SVG.innerHTML = svg;
  SVG.setAttribute('aria-label', `Relação descritiva entre ${label.title} e ADG observado em ${points.length} registros animal-período.`);
}

function render(rows) {
  const avg = key => rows.reduce((total,row)=>total+row[key],0)/rows.length;
  const animals = new Set(rows.map(row=>row.eartag));
  const paddocks = new Set(rows.map(row=>row.paddock));
  document.querySelector('#study-facts').innerHTML = `<span><strong>${rows.length}</strong> registros animal-período</span><span><strong>${animals.size}</strong> brincos únicos</span><span><strong>${paddocks.size}</strong> piquetes</span><span><strong>2019–2020</strong> períodos</span>`;
  summary.innerHTML = [
    ['ADG médio', `${fmt(avg('adg'))} kg/novilho/dia`, 'Média simples dos registros animal-período'],
    ['Bout médio', `${fmt(avg('bout'))} min/dia`, 'Média dos registros; resolução do sensor: 5 min'],
    ['Velocidade média', `${fmt(avg('velocity'))} m/min`, 'Média dos registros animal-período'],
  ].map(([title,value,detail])=>`<article class="adult-metric"><span>${title}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
  recordsBody.innerHTML = rows.map(row=>`<tr><td>${row.year}</td><td>${row.period}</td><td>${row.paddock}</td><td>${row.eartag}</td><td>${fmt(row.adg,3)}</td><td>${fmt(row.bout,2)}</td><td>${fmt(row.hours,2)}</td><td>${fmt(row.velocity,2)}</td></tr>`).join('');
  document.querySelector('#row-count').textContent = `${rows.length} LINHAS`;
  renderChart(rows);
}

predictor.addEventListener('change', () => render(rowsCache));
let rowsCache = [];
fetch('./data/usda-cper/period.csv').then(response=>{if(!response.ok) throw new Error(`HTTP ${response.status}`); return response.text();}).then(text=>{rowsCache=parseAdultCperCsv(text);render(rowsCache);}).catch(error=>{
  document.querySelector('#study-facts').textContent = `Não foi possível carregar a tabela USDA (${error.message}).`;
  SVG.innerHTML = '<text x="20" y="50" fill="#8b463c">Dados não carregados. Sirva o projeto por HTTP.</text>';
});

const dailyLabels = {
  grazingHours: {title:'Horas de pastejo por dia', unit:'h/dia', field:'grazingHours'},
  bout: {title:'Duração média do bout', unit:'min/dia', field:'bout'},
  velocity: {title:'Velocidade média ao pastejar', unit:'m/min', field:'velocity'},
  biomass: {title:'Biomassa estimada no piquete', unit:'kg MS/ha', field:'biomass'},
};

function renderDailyChart(rows) {
  const measure = dailyLabels[dailyMeasure.value];
  const points = rows.map(row => ({row, x: Date.parse(`${row.date}T00:00:00Z`), y: row[measure.field]})).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!points.length) { dailySVG.innerHTML = '<text x="24" y="45" fill="#788579">Sem valores válidos para esta medida.</text>'; return; }
  const left=78,right=868,top=24,bottom=254;
  const minX=Math.min(...points.map(point=>point.x)),maxX=Math.max(...points.map(point=>point.x));
  const minY=Math.min(...points.map(point=>point.y)),maxY=Math.max(...points.map(point=>point.y));
  const padY=(maxY-minY)*.12||1, lowY=Math.max(0,minY-padY), highY=maxY+padY;
  const x=value=>left+(maxX===minX?0.5:(value-minX)/(maxX-minX))*(right-left);
  const y=value=>bottom-(value-lowY)/(highY-lowY)*(bottom-top);
  let svg=`<title>${measure.title}, animal ${safe(points[0].row.eartag)}</title><desc>${points.length} medições diárias observadas. Pontos sem continuidade assumida.</desc>`;
  for(let tick=0;tick<=4;tick++){
    const vy=lowY+(highY-lowY)*tick/4;
    svg+=`<line x1="${left}" x2="${right}" y1="${y(vy)}" y2="${y(vy)}" stroke="#e2e8de"/><text x="${left-10}" y="${y(vy)+4}" text-anchor="end" font-size="10" fill="#788579">${fmt(vy,1)}</text>`;
  }
  const first=new Date(minX).toLocaleDateString('pt-BR',{timeZone:'UTC'}),last=new Date(maxX).toLocaleDateString('pt-BR',{timeZone:'UTC'});
  svg+=`<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#aab5a5"/><text x="${left}" y="${bottom+22}" text-anchor="start" font-size="10" fill="#788579">${first}</text><text x="${right}" y="${bottom+22}" text-anchor="end" font-size="10" fill="#788579">${last}</text><text x="${(left+right)/2}" y="${bottom+48}" text-anchor="middle" font-size="11" fill="#657365">DATA DA MEDIÇÃO</text><text transform="translate(18 ${(top+bottom)/2}) rotate(-90)" text-anchor="middle" font-size="11" fill="#657365">${safe(measure.title.toUpperCase())} (${safe(measure.unit)})</text>`;
  for(const point of points){
    const color=point.row.year===2019?'#3f7852':'#c2793d';
    svg+=`<circle cx="${x(point.x)}" cy="${y(point.y)}" r="4.5" fill="${color}" fill-opacity=".78"><title>${safe(point.row.date)} · piquete ${safe(point.row.paddock)} · ${safe(measure.title)}: ${fmt(point.y)} ${safe(measure.unit)}</title></circle>`;
  }
  dailySVG.innerHTML=svg;
  dailySVG.setAttribute('aria-label',`${measure.title}: ${points.length} pontos diários observados para o animal ${points[0].row.eartag}.`);
}

function renderDaily(rows) {
  const animalRows=rows.filter(row=>row.eartag===animalSelect.value).sort((a,b)=>a.date.localeCompare(b.date));
  const paddocks=new Set(animalRows.map(row=>row.paddock));
  const complete=animalRows.filter(row=>row.complete).length;
  const first=animalRows[0]?.date, last=animalRows.at(-1)?.date;
  dailyFacts.innerHTML=`<span><strong>${animalRows.length}</strong> dias-animal no arquivo</span><span><strong>${complete}</strong> com cobertura de 24 h ±5%</span><span><strong>${paddocks.size}</strong> piquete(s)</span><span><strong>${first||'—'} → ${last||'—'}</strong> período observado</span>`;
  dailyRecordsBody.innerHTML=animalRows.map(row=>`<tr><td>${safe(row.date)}</td><td>${safe(row.paddock)}</td><td>${fmtObserved(row.bout)}</td><td>${fmtObserved(row.grazingHours)}</td><td>${fmtObserved(row.velocity)}</td><td>${fmtObserved(row.biomass)}</td><td>${row.complete?'Sim':'Não'}</td></tr>`).join('');
  renderDailyChart(animalRows);
}

let dailyRowsCache=[];
animalSelect.addEventListener('change',()=>renderDaily(dailyRowsCache));
dailyMeasure.addEventListener('change',()=>renderDaily(dailyRowsCache));
fetch('./data/usda-cper/daily.csv').then(response=>{if(!response.ok) throw new Error(`HTTP ${response.status}`); return response.text();}).then(text=>{
  dailyRowsCache=parseDailyCperCsv(text);
  const animals=[...new Set(dailyRowsCache.map(row=>row.eartag))].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
  for(const id of animals){const option=document.createElement('option');option.value=id;option.textContent=`Brinco ${id}`;animalSelect.append(option);}
  renderDaily(dailyRowsCache);
}).catch(error=>{
  dailyFacts.textContent=`Não foi possível carregar a série diária USDA (${error.message}).`;
  dailySVG.innerHTML='<text x="20" y="50" fill="#8b463c">Dados diários não carregados. Sirva o projeto por HTTP.</text>';
});
