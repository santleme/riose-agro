import {parseHpgrsCsv} from './adult-data-model.js';
const yearSelect=document.querySelector('#year');
const treatmentSelect=document.querySelector('#treatment');
const recordsBody=document.querySelector('#records');
const summary=document.querySelector('#summary');
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value,digits=2)=>Number.isFinite(value)?value.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const treatmentNames={CL:'Contínua leve',CM:'Contínua moderada',CH:'Contínua intensa'};
let allRows=[];
function render(){
 const year=yearSelect.value,treatment=treatmentSelect.value;
 const rows=allRows.filter(row=>(year==='all'||String(row.year)===year)&&(treatment==='all'||row.treatment===treatment));
 const adg=rows.map(row=>row.adgKgPerDay).filter(Number.isFinite);
 const mean=adg.length?adg.reduce((sum,value)=>sum+value,0)/adg.length:Number.NaN;
 const years=new Set(rows.map(row=>row.year));
 const tagged=rows.filter(row=>row.tag).length;
 document.querySelector('#facts').innerHTML=`<span><strong>${allRows.length.toLocaleString('pt-BR')}</strong> registros</span><span><strong>${new Set(allRows.map(row=>row.year)).size}</strong> anos com dados</span><span><strong>${allRows.filter(row=>row.tag).length.toLocaleString('pt-BR')}</strong> linhas com brinco</span><span><strong>1982–2022</strong> período do catálogo</span>`;
 summary.innerHTML=[
  ['ADG médio observado',`${fmt(mean,3)} kg/animal/dia`,'Média simples das linhas filtradas'],
  ['Registros',rows.length.toLocaleString('pt-BR'),'Linhas por animal/temporada'],
  ['Anos',years.size.toLocaleString('pt-BR'),'Temporadas com registros após o filtro'],
  ['Brincos ausentes',`${(rows.length-tagged).toLocaleString('pt-BR')} / ${rows.length.toLocaleString('pt-BR')}`,'Não presumir identidade animal quando vazio'],
 ].map(([title,value,detail])=>`<article class="adult-metric"><span>${title}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
 recordsBody.innerHTML=rows.map(row=>`<tr><td>${row.year}</td><td>${row.tag?safe(row.tag):'Ausente'}</td><td>${safe(row.gender)}</td><td>${safe(treatmentNames[row.treatment]??row.treatment)}</td><td>${fmt(row.stockingRateAuDaysHa)}</td><td>${fmt(row.days,0)}</td><td>${fmt(row.initialWeightKg)}</td><td>${fmt(row.finalWeightKg)}</td><td>${fmt(row.adgKgPerDay,3)}</td></tr>`).join('');
 document.querySelector('#row-count').textContent=`${rows.length.toLocaleString('pt-BR')} linhas. A média é descritiva e não ajusta fatores nem mede efeito causal.`;
}
yearSelect.addEventListener('change',render);treatmentSelect.addEventListener('change',render);
fetch('./data/usda-hpgrs-1982-2022/EastUnit_LTGI.csv').then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.text();}).then(text=>{
 allRows=parseHpgrsCsv(text).filter(row=>Number.isFinite(row.year));
 [...new Set(allRows.map(row=>row.year))].sort((a,b)=>a-b).forEach(value=>yearSelect.add(new Option(String(value),String(value))));
 ['CL','CM','CH'].forEach(value=>treatmentSelect.add(new Option(treatmentNames[value],value)));
 render();
}).catch(error=>{document.querySelector('#facts').textContent=`Não foi possível carregar o arquivo USDA (${error.message}).`;recordsBody.innerHTML='<tr><td colspan="9">Sirva o projeto por HTTP e recarregue a página.</td></tr>';});
