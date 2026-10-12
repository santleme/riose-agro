import {parseRothamstedCattleCsv, parseRothamstedHerbageCsv} from './adult-data-model.js';

const $ = selector => document.querySelector(selector);
const safe = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = (value, digits = 2) => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', {maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value) : '—';
const cattleUrl = './data/rothamsted/Cattle_LWt_collated_2018-2025.csv';
const forageUrl = './data/rothamsted/2018-2025_Pasture_DM_herbage_mass.csv';

function axisChart(svg, points, {title, yLabel, xLabel, colorBy = () => '#3f7852', radius = 4.5}) {
  if (!points.length) { svg.innerHTML = '<text x="24" y="48" fill="#788579">Sem registros válidos para esta seleção.</text>'; return; }
  const left=82,right=865,top=28,bottom=250;
  const minX=Math.min(...points.map(point=>point.x)),maxX=Math.max(...points.map(point=>point.x));
  const minY=Math.min(...points.map(point=>point.y)),maxY=Math.max(...points.map(point=>point.y));
  const padY=(maxY-minY)*.1||1,lowY=Math.max(0,minY-padY),highY=maxY+padY;
  const x=value=>left+(maxX===minX?0.5:(value-minX)/(maxX-minX))*(right-left);
  const y=value=>bottom-(value-lowY)/(highY-lowY)*(bottom-top);
  let markup=`<title>${safe(title)}</title><desc>${points.length} medidas observadas; pontos não conectados.</desc>`;
  for(let tick=0;tick<=4;tick++){
    const vy=lowY+(highY-lowY)*tick/4;
    markup+=`<line x1="${left}" x2="${right}" y1="${y(vy)}" y2="${y(vy)}" stroke="#e2e8de"/><text x="${left-10}" y="${y(vy)+4}" text-anchor="end" font-size="10" fill="#788579">${fmt(vy,0)}</text>`;
  }
  const first=new Date(minX).toLocaleDateString('pt-BR',{timeZone:'UTC'}),last=new Date(maxX).toLocaleDateString('pt-BR',{timeZone:'UTC'});
  markup+=`<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#aab5a5"/><text x="${left}" y="${bottom+22}" font-size="10" fill="#788579">${first}</text><text x="${right}" y="${bottom+22}" text-anchor="end" font-size="10" fill="#788579">${last}</text><text x="${(left+right)/2}" y="${bottom+49}" text-anchor="middle" font-size="11" fill="#657365">${safe(xLabel.toUpperCase())}</text><text transform="translate(20 ${(top+bottom)/2}) rotate(-90)" text-anchor="middle" font-size="11" fill="#657365">${safe(yLabel.toUpperCase())}</text>`;
  for(const point of points){
    const color=colorBy(point);
    markup+=`<circle cx="${x(point.x)}" cy="${y(point.y)}" r="${radius}" fill="${color}" fill-opacity=".78"><title>${safe(point.label)}: ${fmt(point.y)} ${safe(yLabel)}</title></circle>`;
  }
  svg.innerHTML=markup;
  svg.setAttribute('aria-label',`${title}: ${points.length} medidas observadas.`);
}

function dateEpoch(date){return Date.parse(`${date}T00:00:00Z`);}

const facts=$('#study-facts');
const animalSelect=$('#animal-select');
const plotSelect=$('#plot-select');
const weightChart=$('#weight-chart');
const forageChart=$('#forage-chart');
let cattleRows=[];
let forageRows=[];

function renderAnimal(){
  const rows=cattleRows.filter(row=>row.animal===animalSelect.value).sort((a,b)=>a.dateTo.localeCompare(b.dateTo));
  const points=rows.filter(row=>Number.isFinite(row.endWeight)).map(row=>({x:dateEpoch(row.dateTo),y:row.endWeight,label:`${row.dateTo} · ${row.plot} · peso final`,row}));
  axisChart(weightChart,points,{title:`Pesagens observadas · ${animalSelect.value}`,yLabel:'Peso vivo (kg)',xLabel:'Data da pesagem final'});
  const plots=new Set(rows.map(row=>row.plot));
  const cohorts=new Set(rows.map(row=>row.cohort));
  $('#animal-facts').innerHTML=`<span><strong>${rows.length}</strong> intervalos animal-período</span><span><strong>${plots.size? [...plots].map(safe).join(', '):'—'}</strong> piquete(s)</span><span><strong>${cohorts.size? [...cohorts].join(', '):'—'}</strong> coorte(s)</span>`;
  $('#animal-records').innerHTML=rows.map(row=>`<tr><td>${safe(row.dateFrom)} → ${safe(row.dateTo)}</td><td>${safe(row.plot)}</td><td>${safe(row.breed)}</td><td>${fmt(row.ageAtStartDays,0)}</td><td>${fmt(row.startWeight,0)}</td><td>${fmt(row.endWeight,0)}</td><td>${fmt(row.elapsedDays,0)}</td><td>${fmt(row.adg,3)}</td></tr>`).join('');
}

function renderForage(){
  const plot=plotSelect.value;
  const rows=forageRows.filter(row=>row.plot===plot).sort((a,b)=>a.date.localeCompare(b.date));
  const points=rows.filter(row=>Number.isFinite(row.biomass)).map(row=>({x:dateEpoch(row.date),y:row.biomass,label:`${row.date} · ${row.plot} · massa`,row}));
  axisChart(forageChart,points,{title:`Massa de forragem observada · ${plot}`,yLabel:'Massa de forragem (kg MS/ha)',xLabel:'Data da avaliação',colorBy:()=>plot.startsWith('T')?'#c2793d':'#3f7852',radius:3.5});
  const treatment=plot.startsWith('T')?'Cell-grazed':'Set-stocked';
  $('#forage-facts').innerHTML=`<span><strong>${rows.length}</strong> avaliações no piquete ${safe(plot)}</span><span><strong>${treatment}</strong> manejo registrado</span><span><strong>${rows[0]?.date||'—'} → ${rows.at(-1)?.date||'—'}</strong> janela disponível</span>`;
  $('#forage-records').innerHTML=rows.map(row=>`<tr><td>${safe(row.date)}</td><td>${safe(row.plot)}</td><td>${fmt(row.biomass,0)}</td><td>${treatment}</td></tr>`).join('');
}

animalSelect.addEventListener('change',renderAnimal);
plotSelect.addEventListener('change',renderForage);

Promise.all([fetch(cattleUrl),fetch(forageUrl)]).then(async responses=>{
  for(const response of responses) if(!response.ok) throw new Error(`HTTP ${response.status}`);
  return Promise.all(responses.map(response=>response.text()));
}).then(([cattleText,forageText])=>{
  cattleRows=parseRothamstedCattleCsv(cattleText);
  forageRows=parseRothamstedHerbageCsv(forageText);
  const animals=[...new Set(cattleRows.map(row=>row.animal))].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
  const plots=[...new Set(forageRows.map(row=>row.plot))].sort();
  for(const id of animals){const option=document.createElement('option');option.value=id;option.textContent=id;animalSelect.append(option);}
  for(const id of plots){const option=document.createElement('option');option.value=id;option.textContent=`${id} · ${id.startsWith('T')?'cell-grazed':'set-stocked'}`;plotSelect.append(option);}
  const years=[...new Set(cattleRows.map(row=>row.year))].sort();
  const firstObservationByAnimal=new Map();
  for(const row of cattleRows){const previous=firstObservationByAnimal.get(row.animal);if(!previous||row.dateFrom<previous.dateFrom)firstObservationByAnimal.set(row.animal,row);}
  const firstAges=[...firstObservationByAnimal.values()].map(row=>row.ageAtStartDays).filter(Number.isFinite);
  const ageMin=Math.min(...firstAges),ageMax=Math.max(...firstAges);
  const ageMonths=days=>Math.round(days/30.4375);
  facts.innerHTML=`<span><strong>${cattleRows.length.toLocaleString('pt-BR')}</strong> intervalos animal-período</span><span><strong>${animals.length}</strong> brincos oficiais</span><span><strong>${ageMonths(ageMin)}–${ageMonths(ageMax)} meses</strong> idade na primeira pesagem · n=${firstAges.length}</span><span><strong>${forageRows.length.toLocaleString('pt-BR')}</strong> medidas de forragem · ${years[0]}–${years.at(-1)}</span>`;
  renderAnimal();
  renderForage();
}).catch(error=>{
  facts.textContent=`Não foi possível carregar os arquivos Rothamsted (${error.message}).`;
  weightChart.innerHTML='<text x="20" y="50" fill="#8b463c">Dados não carregados. Sirva o projeto por HTTP.</text>';
  forageChart.innerHTML=weightChart.innerHTML;
});
