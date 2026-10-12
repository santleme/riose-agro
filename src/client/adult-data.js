import {filterAdultCperRows, parseAdultCperCsv, parseDailyCperCsv, summarizeAdultCperRows} from './adult-data-model.js';

const SVG = document.querySelector('#chart');
const predictor = document.querySelector('#predictor');
const periodFilter = document.querySelector('#period-filter');
const paddockFilter = document.querySelector('#paddock-filter');
const filterSummary = document.querySelector('#filter-summary');
const summary = document.querySelector('#summary');
const associationResults = document.querySelector('#association-results');
const associationTakeaway = document.querySelector('#association-takeaway');
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
  GBD_5min: {title: 'Duração média do bout de pastejo', unit: 'min/dia', field: 'bout'},
  MeanVelo: {title: 'Velocidade média ao pastejar', unit: 'm/min', field: 'velocity'},
  GrazeHrs_5min: {title: 'Horas de pastejo', unit: 'h/dia', field: 'hours'},
  MeanTA: {title: 'Ângulo médio de giro durante pastejo', unit: 'graus', field: 'turnAngle'},
};

function renderChart(rows) {
  const key = predictor.value;
  const label = labels[key];
  const points = rows.map(row => ({x: row[label.field], y: row.adg, row})).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
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
  if (!rows.length) {
    document.querySelector('#study-facts').textContent = 'Nenhum registro animal-período corresponde ao recorte selecionado.';
    summary.innerHTML = '';
    recordsBody.innerHTML = '<tr><td colspan="9">Não há registros para essa combinação de período e piquete.</td></tr>';
    document.querySelector('#row-count').textContent = '0 LINHAS';
    filterSummary.textContent = 'Recorte vazio. Selecione outro período ou piquete.';
    renderChart(rows);
    return;
  }
  const avg = key => rows.reduce((total,row)=>total+row[key],0)/rows.length;
  const coverage = summarizeAdultCperRows(rows);
  const yearLabel = coverage.years.length > 1 ? `${coverage.years[0]}–${coverage.years.at(-1)}` : String(coverage.years[0]);
  document.querySelector('#study-facts').innerHTML = `<span><strong>${coverage.records}</strong> registros animal-período</span><span><strong>${coverage.uniqueAnimals}</strong> brincos únicos</span><span><strong>${coverage.uniquePaddocks.length}</strong> piquetes</span><span><strong>${yearLabel}</strong> · ${coverage.periods.length} períodos representados</span>`;
  summary.innerHTML = [
    ['ADG médio', `${fmt(avg('adg'))} kg/novilho/dia`, 'Média simples dos registros animal-período'],
    ['Bout médio', `${fmt(avg('bout'))} min/dia`, 'Média dos registros; resolução do sensor: 5 min'],
    ['Velocidade média', `${fmt(avg('velocity'))} m/min`, 'Média dos registros animal-período'],
    ['Ângulo médio de giro', `${fmt(avg('turnAngle'))}°`, 'Média dos registros; medida de movimento durante pastejo'],
  ].map(([title,value,detail])=>`<article class="adult-metric"><span>${title}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
  recordsBody.innerHTML = rows.map(row=>`<tr><td>${row.year}</td><td>${row.period}</td><td>${row.paddock}</td><td>${row.eartag}</td><td>${fmt(row.adg,3)}</td><td>${fmt(row.bout,2)}</td><td>${fmt(row.hours,2)}</td><td>${fmt(row.velocity,2)}</td><td>${fmtObserved(row.turnAngle)}</td></tr>`).join('');
  document.querySelector('#row-count').textContent = `${rows.length} LINHAS`;
  const periodLabel = periodFilter.value === 'all' ? 'todos os períodos' : `período ${periodFilter.value}`;
  const paddockLabel = paddockFilter.value === 'all' ? 'todos os piquetes' : `piquete ${paddockFilter.value}`;
  filterSummary.textContent = `Recorte do gráfico, resumo e tabela: ${periodLabel}; ${paddockLabel}. ${coverage.records} registros animal-período, ${coverage.uniqueAnimals} brincos únicos.`;
  renderChart(rows);
}

function filteredRows(rows) {
  return filterAdultCperRows(rows, {period: periodFilter.value, paddock: paddockFilter.value});
}

function populateFilterOptions(rows) {
  const periods = [...new Set(rows.map(row => row.period))].sort((a, b) => Number(a) - Number(b));
  const paddocks = [...new Set(rows.map(row => row.paddock))].sort();
  periodFilter.innerHTML = '<option value="all">Todos os períodos</option>'
    + periods.map(period => `<option value="${safe(period)}">Período ${safe(period)}</option>`).join('');
  paddockFilter.innerHTML = '<option value="all">Todos os piquetes</option>'
    + paddocks.map(paddock => `<option value="${safe(paddock)}">Piquete ${safe(paddock)}</option>`).join('');
}

function renderAssociation(report) {
  const definitions = [
    ['GBD_5min', 'Duração média do bout (min/dia)'],
    ['MeanVelo', 'Velocidade média ao pastejar (m/min)'],
  ];
  const signed = value => `${value > 0 ? '+' : ''}${fmt(value, 3)}`;
  const groupedEstimate = estimate => `${signed(estimate.spearmanRho)} (${estimate.nAnimalPeriods} linhas / ${estimate.nUniqueAnimals} animais)`;
  associationResults.innerHTML = definitions.map(([key, title]) => {
    const feature = report.features[key];
    const [low, high] = feature.animalClusterBootstrap95PercentileInterval;
    const adjusted = feature.adjustedFixedEffectsRankSensitivity;
    const [adjustedLow, adjustedHigh] = adjusted.animalClusterBootstrap95PercentileInterval;
    const periodRhos = ['1', '2', '3'].map(period => groupedEstimate(feature.withinPeriodDescriptiveAssociations[period])).join(' · ');
    const pastureRhos = ['15E', '19N', '22W', '23E'].map(pasture => groupedEstimate(feature.withinPastureDescriptiveAssociations[pasture])).join(' · ');
    const leaveOnePeriodOutRhos = ['1', '2', '3'].map(period => groupedEstimate(feature.leaveOnePeriodOutSensitivity[period])).join(' · ');
    return `<tr><th scope="row">${title}</th><td>${signed(feature.spearmanRho)}</td><td>[${signed(low)}; ${signed(high)}]</td><td>${signed(adjusted.partialSpearmanRho)}</td><td>[${signed(adjustedLow)}; ${signed(adjustedHigh)}]</td><td>${periodRhos}</td><td>${pastureRhos}</td><td>${leaveOnePeriodOutRhos}</td></tr>`;
  }).join('');
  const bout = report.features.GBD_5min;
  const velocity = report.features.MeanVelo;
  const boutAdjusted = bout.adjustedFixedEffectsRankSensitivity;
  const velocityAdjusted = velocity.adjustedFixedEffectsRankSensitivity;
  const [boutLow, boutHigh] = boutAdjusted.animalClusterBootstrap95PercentileInterval;
  const [velocityLow, velocityHigh] = velocityAdjusted.animalClusterBootstrap95PercentileInterval;
  const intervalsIncludeZero = boutLow <= 0 && boutHigh >= 0 && velocityLow <= 0 && velocityHigh >= 0;
  const precisionNote = intervalsIncludeZero
    ? 'Os dois intervalos percentis incluem zero; os padrões agrupados são sensíveis ao contexto e a associação residual não é estimada com precisão neste conjunto.'
    : 'Os intervalos percentis variam com os dados; esta sensibilidade continua descritiva e não confirma causalidade.';
  associationTakeaway.textContent = `Leitura deste recorte: as associações agrupadas são ρ=${signed(bout.spearmanRho)} para duração do bout e ρ=${signed(velocity.spearmanRho)} para velocidade. Na sensibilidade que remove efeitos aditivos de período e piquete dos postos, passam a ρ=${signed(boutAdjusted.partialSpearmanRho)} [${signed(boutLow)}; ${signed(boutHigh)}] e ρ=${signed(velocityAdjusted.partialSpearmanRho)} [${signed(velocityLow)}; ${signed(velocityHigh)}]. ${precisionNote} Isto descreve esta amostra, não um efeito causal nem uma faixa de previsão do motor.`;
}

fetch('./docs/evidence/usda-cper-association.json').then(response=>{if(!response.ok) throw new Error(`HTTP ${response.status}`); return response.json();}).then(renderAssociation).catch(error=>{
  associationResults.innerHTML = `<tr><td colspan="8">Análise agrupada indisponível (${safe(error.message)}).</td></tr>`;
  associationTakeaway.textContent = 'A síntese interpretativa não está disponível sem o relatório de análise.';
});

predictor.addEventListener('change', () => render(filteredRows(rowsCache)));
periodFilter.addEventListener('change', () => render(filteredRows(rowsCache)));
paddockFilter.addEventListener('change', () => render(filteredRows(rowsCache)));
let rowsCache = [];
fetch('./data/usda-cper/period.csv').then(response=>{if(!response.ok) throw new Error(`HTTP ${response.status}`); return response.text();}).then(text=>{rowsCache=parseAdultCperCsv(text);populateFilterOptions(rowsCache);render(filteredRows(rowsCache));}).catch(error=>{
  document.querySelector('#study-facts').textContent = `Não foi possível carregar a tabela USDA (${error.message}).`;
  filterSummary.textContent = 'Filtros indisponíveis enquanto os registros USDA não forem carregados.';
  SVG.innerHTML = '<text x="20" y="50" fill="#8b463c">Dados não carregados. Sirva o projeto por HTTP.</text>';
});

const dailyLabels = {
  grazingHours: {title:'Horas de pastejo por dia', unit:'h/dia', field:'grazingHours'},
  bout: {title:'Duração média do bout', unit:'min/dia', field:'bout'},
  turnAngle: {title:'Ângulo médio de giro durante pastejo', unit:'graus', field:'turnAngle'},
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
  dailyRecordsBody.innerHTML=animalRows.map(row=>`<tr><td>${safe(row.date)}</td><td>${safe(row.paddock)}</td><td>${fmtObserved(row.bout)}</td><td>${fmtObserved(row.grazingHours)}</td><td>${fmtObserved(row.turnAngle)}</td><td>${fmtObserved(row.velocity)}</td><td>${fmtObserved(row.biomass)}</td><td>${row.complete?'Sim':'Não'}</td></tr>`).join('');
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
