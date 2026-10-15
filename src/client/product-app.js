import {FarmEngine,compareConfiguredScenarios,createConfiguredComparisonManifest,replayConfiguredComparisonManifest} from './engine.js';
import {analyzeSensitivity} from './sensitivity-analysis.js';
import {createRunRecord,recordRun,listRuns,getRun,exportRunHistory,clearRunHistory,runCompatibility} from './run-history.js';
import {renderSimulationReport} from './simulation-report.js';
import {normalizeWorkerResponse,WORKER_PROTOCOL_VERSION} from './worker-protocol.js';

const $=id=>document.getElementById(id);
const labels={diet:{pasture:'Pasto',balanced:'Balanceada',concentrate:'Concentrado'},housing:{pasture:'Pasto',barn:'Confinamento'},weather:{normal:'Normal',hot:'Quente',rain:'Chuvoso'}};
const factors=['housing','diet','weather','supplement'];
let latest=null;
const workerUrl=new URL('./worker.js',import.meta.url);
if(new URLSearchParams(location.search).get('engine')==='wasm')workerUrl.searchParams.set('engine','wasm');
const comparisonWorker=typeof Worker==='function'?new Worker(workerUrl,{type:'module'}):null;
let workerRequestPending=false;
const number=(value,digits=2)=>Number(value).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const factorValue=(factor,value)=>factor==='supplement'?`${number(value,1)} kg MS/cabeça/dia`:labels[factor][value];

function referenceConfig(){return {diet:$('base-diet').value,housing:$('base-housing').value,weather:$('base-weather').value,supplement:Number($('base-supplement').value)};}
function renderInterventionControl(){
  const factor=$('factor').value,base=referenceConfig(),host=$('intervention-control');host.replaceChildren();
  let control;
  if(factor==='supplement'){
    control=document.createElement('input');control.id='intervention-value';control.type='number';control.min='0';control.max='4';control.step='0.1';control.value=String(Math.min(4,base.supplement+1));control.setAttribute('aria-label','Suplemento da intervenção em kg de matéria seca por cabeça por dia');
  }else{
    control=document.createElement('select');control.id='intervention-value';control.setAttribute('aria-label','Valor do fator na intervenção');
    for(const value of Object.keys(labels[factor])){const option=new Option(labels[factor][value],value);if(value===base[factor])option.disabled=true;control.add(option);}
    const alternative=Object.keys(labels[factor]).find(value=>value!==base[factor]);if(alternative)control.value=alternative;
  }
  host.append(control);
}
function alternativeConfig(base){const factor=$('factor').value,scenario={...base};scenario[factor]=factor==='supplement'?Number($('intervention-value').value):$('intervention-value').value;return scenario;}
function metricCard(label,reference,scenario,unit,digits=2){const delta=scenario-reference;return `<article class="metric-card"><span class="metric-label">${label}</span><strong class="metric-value">${number(scenario,digits)} <span class="metric-unit">${unit}</span></strong><span class="metric-delta">ref. ${number(reference,digits)} · Δ ${delta>=0?'+':''}${number(delta,digits)}</span></article>`;}
function renderChart(rows){
  const svg=$('weight-chart'),width=720,height=260,pad={l:48,r:18,t:16,b:34};
  const values=rows.flatMap(row=>[row.referenceWeight,row.scenarioWeight]),min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,1);
  const x=index=>pad.l+(width-pad.l-pad.r)*index/Math.max(1,rows.length-1),y=value=>height-pad.b-(value-min)/range*(height-pad.t-pad.b);
  const path=key=>rows.map((row,index)=>`${index?'L':'M'}${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' ');
  const axis=[];for(let tick=0;tick<4;tick++){const value=min+range*tick/3,py=y(value);axis.push(`<line x1="${pad.l}" y1="${py}" x2="${width-pad.r}" y2="${py}" stroke="#e3e5dd"/><text x="${pad.l-7}" y="${py+3}" text-anchor="end" fill="#74776e" font-size="9">${number(value,1)}</text>`);}
  const last=rows.at(-1);svg.innerHTML=`<g font-family="IBM Plex Mono,monospace">${axis.join('')}<path d="${path('referenceWeight')}" fill="none" stroke="#315f3b" stroke-width="2.5"/><path d="${path('scenarioWeight')}" fill="none" stroke="#a96c40" stroke-width="2.5"/><text x="${pad.l}" y="${height-8}" fill="#74776e" font-size="9">Dia 0</text><text x="${width-pad.r}" y="${height-8}" text-anchor="end" fill="#74776e" font-size="9">Dia ${last.day}</text></g>`;
}
function renderRows(rows){$('result-rows').innerHTML=rows.map(row=>`<tr><td>${row.day}</td><td>${number(row.referenceWeight)}</td><td>${number(row.scenarioWeight)}</td><td>${number(row.referenceConsumptionKgDM)}</td><td>${number(row.scenarioConsumptionKgDM)}</td><td>${number(row.referencePastureKgDM,0)}</td><td>${number(row.scenarioPastureKgDM,0)}</td><td>${number(row.referenceCost)}</td><td>${number(row.scenarioCost)}</td></tr>`).join('');}
function renderAssumptions(result,manifest){const ref=result.referenceConfig,alt=result.scenarioConfig;$('assumption-details').innerHTML=`<p>Seed ${manifest.seed}; lote de ${result.herdSize} animais; horizonte de ${result.days} dias; fator alterado: ${factorValue(manifest.factor,alt[manifest.factor])} (referência ${factorValue(manifest.factor,ref[manifest.factor])}).</p><ul><li>Os dois braços partem do mesmo snapshot e da mesma seed.</li><li>As demais entradas permanecem iguais: dieta ${labels.diet[ref.diet]}, alojamento ${labels.housing[ref.housing]}, clima ${labels.weather[ref.weather]}, suplemento ${number(ref.supplement,1)} kg MS/cabeça/dia.</li><li>Estoque de forragem é aproximação em kg MS por piquete, sem área ou medição de biomassa.</li><li>Custos usam preços e regras internas demonstrativas, sem representação de mercado.</li><li>Status: demonstrativo, não validado como previsão ou recomendação.</li></ul>`;}
function renderResult(result,manifest){
  latest={result,manifest};const last=result.rows.at(-1),factor=manifest.factor;
  $('empty-state').hidden=true;$('comparison-output').hidden=false;$('result-meta').textContent=`${result.days} dias · ${result.herdSize} animais · ${factorValue(factor,result.scenarioConfig[factor])}`;
  $('metric-cards').innerHTML=[metricCard('Peso médio',last.referenceWeight,last.scenarioWeight,'kg/animal'),metricCard('Consumo acumulado',last.referenceConsumptionKgDM,last.scenarioConsumptionKgDM,'kg MS',0),metricCard('Estoque de pasto',last.referencePastureKgDM,last.scenarioPastureKgDM,'kg MS',0),metricCard('Custo acumulado',last.referenceCost,last.scenarioCost,'unid.',0)].join('');
  renderChart(result.rows);renderRows(result.rows);renderAssumptions(result,manifest);
}
function executeComparison(snapshot,options){
  if(!comparisonWorker)return Promise.resolve({data:compareConfiguredScenarios(snapshot,options)});
  if(workerRequestPending)return Promise.reject(new Error('Já existe uma comparação em execução.'));
  workerRequestPending=true;
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{workerRequestPending=false;comparisonWorker.removeEventListener('message',onMessage);comparisonWorker.removeEventListener('error',onError);};
    const onMessage=event=>{cleanup();try{const response=normalizeWorkerResponse(event.data);if(response.type==='error')reject(new Error(response.error.message));else if(response.type==='comparison')resolve(response);else reject(new Error('Resposta inesperada do Worker.'));}catch(error){reject(error);}};
    const onError=event=>{cleanup();reject(new Error(event.message||'O Worker de simulação falhou.'));};
    comparisonWorker.addEventListener('message',onMessage,{once:true});comparisonWorker.addEventListener('error',onError,{once:true});
    try{comparisonWorker.postMessage({protocolVersion:WORKER_PROTOCOL_VERSION,type:'compareConfigured',snapshot,days:options.days,referenceConfig:options.referenceConfig,scenarioConfig:options.scenarioConfig});}catch(error){cleanup();reject(error);}
  });
}
function download(filename,text,type){const link=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
function csv(result){const columns=['day','referenceWeight','scenarioWeight','referenceConsumptionKgDM','scenarioConsumptionKgDM','referenceCost','scenarioCost','referencePastureKgDM','scenarioPastureKgDM'];return [columns.join(','),...result.rows.map(row=>columns.map(key=>row[key]).join(','))].join('\n');}
function refreshHistory(){
  const host=$('run-history');host.replaceChildren();
  let runs;try{runs=listRuns();}catch(error){host.textContent=error.message;return;}
  if(!runs.length){host.textContent='Nenhuma execução salva neste navegador.';return;}
  for(const run of runs.slice(0,8)){const row=document.createElement('div');row.className='history-item';const text=document.createElement('span');text.textContent=`${new Date(run.timestamp).toLocaleString('pt-BR')} · ${run.status} · ${run.scenario?.factor??'comparação'} · ${run.scenario?.periodDays??'—'} dias`;row.append(text);const replay=document.createElement('button');replay.type='button';replay.textContent='Reproduzir';replay.disabled=!runCompatibility(run).supported;replay.addEventListener('click',()=>{try{const stored=getRun(run.id);renderResult(replayConfiguredComparisonManifest(stored.manifest),stored.manifest);$('run-status').textContent='Manifesto reproduzido com o motor local atual.';}catch(error){$('run-status').textContent=`Não foi possível reproduzir: ${error.message}`;}});row.append(replay);host.append(row);}
}
function calculateSensitivity(event){event.preventDefault();const host=$('sensitivity-output');host.textContent='Calculando…';try{
  const factor=$('sensitivity-factor').value,days=Number($('days').value),config=referenceConfig(),engine=new FarmEngine(Number($('seed').value),Number($('herd-size').value));engine.configure(config);const snapshot=engine.snapshot();
  const values=factor==='supplement'?[0,1,2,3,4]:Object.keys(labels[factor]);const result=analyzeSensitivity({snapshot,targetVariable:factor,values,outputs:['weight','cost','pasture'],durationHours:days*24});
  if(result.status!=='supported'){host.textContent=result.reason;return;}
  const names={weight:'Peso (kg/animal)',cost:'Custo (unidades)',pasture:'Estoque de pasto (kg MS)'};host.innerHTML=`<p>OAT · ${days} dias · seed ${snapshot.seed} · status não validado e não causal.</p><div class="table-scroll"><table class="sensitivity-table"><thead><tr><th>${factor}</th><th>${names.weight}</th><th>${names.cost}</th><th>${names.pasture}</th></tr></thead><tbody>${result.results.map(row=>`<tr><td>${factorValue(factor,row.inputValue)}</td>${['weight','cost','pasture'].map(key=>`<td>${number(row.outputs[key])} · Δ ${number(row.deltaFromBaseline[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }catch(error){host.textContent=`Não foi possível calcular: ${error.message}`;}}

for(const id of ['factor','base-diet','base-housing','base-weather','base-supplement'])$(id).addEventListener('change',renderInterventionControl);
$('experiment-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;$('run-status').textContent='Executando os dois cenários…';try{
  const count=Number($('herd-size').value),seed=Number($('seed').value),days=Number($('days').value),reference=referenceConfig(),scenario=alternativeConfig(reference);
  const engine=new FarmEngine(seed,count);engine.configure(reference);const snapshot=engine.snapshot();const manifest=createConfiguredComparisonManifest(snapshot,{days,referenceConfig:reference,scenarioConfig:scenario});const execution=await executeComparison(snapshot,{days,referenceConfig:reference,scenarioConfig:scenario});const result=execution.data;renderResult(result,manifest);
  const run=createRunRecord({manifest,result,execution:execution.execution,engineImplementation:execution.engineImplementation});recordRun(run);refreshHistory();const backend=execution.execution?.backend==='local-rust'?'Rust nativo':'JavaScript';$('run-status').textContent=`Execução concluída via ${backend}. Resultado demonstrativo salvo no histórico local.`;
  }catch(error){$('run-status').textContent=`Não foi possível executar: ${error.message}`;}finally{button.disabled=false;}});
$('export-csv').addEventListener('click',()=>latest&&download('riose-comparacao.csv',csv(latest.result),'text/csv;charset=utf-8'));
$('export-manifest').addEventListener('click',()=>latest&&download('riose-manifesto.json',JSON.stringify(latest.manifest,null,2),'application/json'));
$('export-report').addEventListener('click',()=>latest&&download('riose-relatorio.md',renderSimulationReport(latest.result,latest.manifest),'text/markdown;charset=utf-8'));
$('sensitivity-form').addEventListener('submit',calculateSensitivity);
$('export-history').addEventListener('click',()=>{try{download('riose-historico.json',exportRunHistory(),'application/json');}catch(error){$('run-status').textContent=error.message;}});
$('clear-history').addEventListener('click',()=>{if(!confirm('Limpar todas as execuções locais salvas neste navegador?'))return;try{clearRunHistory();refreshHistory();}catch(error){$('run-status').textContent=error.message;}});
renderInterventionControl();refreshHistory();
