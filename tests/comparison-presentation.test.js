import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {FarmEngine, compare, createComparisonManifest, replayComparisonManifest, validateComparisonManifest} from '../src/client/engine.js';
import {SCENARIO_PRESETS,getScenarioPreset} from '../src/client/scenario-presets.js';
import {createServer} from '../src/server/server.js';
import {calculateThi,THI_SOURCE} from '../src/client/thermal-index.js';
import {environmentDiffRows,initialEnvironmentState} from '../src/client/environment-inputs.js';
import {bundleEngineSources,ENGINE_SOURCE_FILES} from '../src/client/engine-provenance.js';
import {engineSourceSha256} from '../scripts/engine-source-hash.js';
import {WORKER_PROTOCOL_VERSION} from '../src/client/worker-protocol.js';

const source=await readFile(new URL('../src/client/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function presentation(snapshot=new FarmEngine(42,2).snapshot()){
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',attributes:{},setAttribute(key,value){this.attributes[key]=value;},replaceChildren(...children){this.children=children;},showModal(){this.open=true;}});
    return elements.get(id);
  };
  const context=vm.createContext({
    $:element,comparisonSnapshot:snapshot,comparisonManifest:undefined,comparison:undefined,comparisonLotContext:null,comparisonEnvironmentState:initialEnvironmentState(null),environmentState:initialEnvironmentState(null),requestCompare:false,loadingScenario:false,pendingComparison:undefined,
    state:new FarmEngine(9,24).snapshot(),structuredClone,validateComparisonManifest,SCENARIO_PRESETS,getScenarioPreset,document:{createElement(){return {value:'',textContent:''};}},
    dietNames:{pasture:'Volumoso / pasto',balanced:'Balanceada',concentrate:'Mais concentrado'},
    scenarioNames:{pasture:'Pasto',barn:'Confinamento',normal:'Ameno',hot:'Calor',rain:'Chuvoso'},calculateThi,THI_SOURCE,environmentDiffRows,
    comparisonFactorName:factor=>({housing:'alojamento',diet:'dieta',weather:'clima',supplement:'suplemento'}[factor]??'configuração'),
    comparisonValueName:(factor,value)=>value==null?'Não informado':factor==='supplement'&&Number.isFinite(Number(value))?Number(value).toFixed(1).replace('.',','):({housing:{pasture:'pasto',barn:'confinamento'},diet:{pasture:'volumoso / pasto',balanced:'balanceada',concentrate:'mais concentrado'},weather:{normal:'ameno',hot:'calor',rain:'chuvoso'}}[factor]??{})[value]??String(value),
    escapeHtml:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
    compareBusy(){},setRunning(){},notify(){},persistRun(){},worker:{postMessage(message){context.lastMessage=message;}},
    postWorkerMessage(message){context.worker.postMessage({...message,protocolVersion:WORKER_PROTOCOL_VERSION});}
  });
  // Execute the existing presentation and import handlers without booting the canvas/worker UI.
  vm.runInContext(source.slice(source.indexOf('const currency='),source.indexOf('const actionNames=')),context);
  vm.runInContext(source.slice(source.indexOf('function renderScenarioVariables()'),source.indexOf('function comparisonNumber(')),context);
  vm.runInContext(source.slice(source.indexOf('function comparisonNumber('),source.indexOf('let noticeTimer')),context);
  vm.runInContext(source.slice(source.indexOf("$('manifest-file').onchange="),source.indexOf('function downloadFile(')),context);
  return {context,element,markup:()=>[...elements.values()].map(item=>item.innerHTML+' '+item.textContent).join('\n')};
}

test('comparison renders derived metadata, periods, units, assumptions and real-data gaps',()=>{
  const snapshot=new FarmEngine(42,2).snapshot(),ui=presentation(snapshot);
  ui.context.showComparison(compare(snapshot,2));
  assert.equal(ui.element('comparison').open,true);
  assert.equal((ui.element('results').innerHTML.match(/Derivado · demonstrativo · não validado/g)??[]).length,4);
  for(const id of ['results','intake-summary','pasture-summary','chart-note']){
    assert.match(ui.element(id).innerHTML,/Período:/);
    assert.match(ui.element(id).innerHTML,/href="\/src\/client\/engine\.js"/);
    assert.match(ui.element(id).innerHTML,/Regra:/);
  }
  assert.match(ui.element('results').innerHTML,/kg\/animal|kg MS\/lote|R\$\/lote/);
  assert.match(ui.element('intake-summary').innerHTML,/KG MS\/LOTE/);
  assert.match(ui.element('pasture-summary').innerHTML,/KG MS\/PIQUETE/);
  assert.match(ui.element('comparison-coverage').innerHTML,/Observações reais · nenhuma conectada/);
  assert.match(ui.element('comparison-coverage').innerHTML,/issue #12/);
  assert.match(ui.element('comparison-coverage').innerHTML,/explorador separado e não está conectado a esta comparação/);
  assert.doesNotMatch(ui.element('comparison-coverage').innerHTML,/não está disponível neste checkout/);
  assert.match(ui.element('comparison-assumptions').innerHTML,/Hipóteses usadas/);
  assert.match(ui.element('comparison-assumptions').innerHTML,/8,00 kg MS\/animal\/dia/);
  assert.match(ui.element('comparison-assumptions').innerHTML,/Não há calibração nem intervalo de confiança/);
  assert.match(ui.element('comparison-assumptions').innerHTML,/mesma demanda-base de matéria seca/);
  assert.match(ui.element('comparison-assumptions').innerHTML,/não são uma resposta biológica medida/);
  for(const id of ['comparison-coverage','comparison-assumptions','chart-note'])assert.match(html,new RegExp('id="'+id+'"'));
});

test('finite zero stays zero while missing, invalid and nonfinite metrics stay unavailable',()=>{
  const ui=presentation();
  for(const value of [undefined,null,NaN,Infinity,-Infinity,'0',false,{}]){
    assert.equal(ui.context.comparisonNumber(value),'Indisponível');
    assert.equal(ui.context.comparisonCurrency(value),'Indisponível');
    assert.match(ui.context.resultDifference(value,4,'kg'),/Indisponível/);
  }
  assert.equal(ui.context.comparisonNumber(0),'0,0');
  assert.match(ui.context.resultDifference(0,1,'kg'),/base zero/);
  assert.match(ui.context.resultDifference(0,0,'kg'),/\+0,0 kg/);
  ui.context.showComparison({days:1,rows:[{day:1,baselineWeight:0,scenarioWeight:null,baselineCost:0,scenarioCost:Infinity}]});
  assert.match(ui.element('results').innerHTML,/Indisponível kg\/animal/);
  assert.match(ui.element('results').innerHTML,/R\$\s*0/);
  assert.match(ui.element('pasture-summary').innerHTML,/Indisponível/);
  assert.doesNotMatch(ui.markup(),/NaN|Infinity|undefined/);
  assert.match(ui.element('comparison-coverage').innerHTML,/métricas finais ausentes ou inválidas/);
});

test('missing arrays, rows and initial ledgers never crash or become zero consumption',()=>{
  const snapshot=new FarmEngine(42,2).snapshot();delete snapshot.intake;
  const ui=presentation(snapshot);
  ui.context.showComparison(compare(snapshot,1));
  assert.match(ui.element('results').innerHTML,/Indisponível kg MS\/lote/);
  assert.match(ui.element('comparison-coverage').innerHTML,/Registro inicial de consumo incompleto/);
  assert.match(ui.element('intake-summary').innerHTML,/Indisponível/);
  assert.doesNotThrow(()=>ui.context.showComparison({days:1}));
  assert.match(ui.element('chart').innerHTML,/Indisponível/);
  assert.match(ui.element('comparison-coverage').innerHTML,/Série diária ausente/);
  assert.doesNotThrow(()=>ui.context.comparisonCSV({}));
});

test('missing final day cannot be presented as a result for that day; chart gaps split lines',()=>{
  const snapshot=new FarmEngine(42,2).snapshot(),ui=presentation(snapshot),data=compare(snapshot,3);
  data.rows[1].scenarioWeight=null;
  ui.context.showComparison(data);
  assert.equal((ui.element('chart').innerHTML.match(/<polyline/g)??[]).length,3);
  assert.match(ui.element('comparison-coverage').innerHTML,/gráfico interrompe/);
  data.rows.pop();
  ui.context.showComparison(data);
  assert.match(ui.element('results').innerHTML,/Indisponível kg\/animal/);
  assert.match(ui.element('comparison-coverage').innerHTML,/Série diária incompleta/);
});

test('import keeps its own population, config and snapshot; validated true cannot upgrade evidence',async()=>{
  const snapshot=new FarmEngine(41,2).snapshot();snapshot.config={diet:'balanced',supplement:1.5,weather:'hot',housing:'barn'};snapshot.hour=54;
  const manifest=createComparisonManifest(snapshot,2);
  assert.throws(()=>validateComparisonManifest({...manifest,validated:true}),/não validado/);
  const ui=presentation();
  await ui.element('manifest-file').onchange({target:{files:[{text:async()=>JSON.stringify(manifest)}],value:'import'}});
  const replaySnapshot=ui.context.pendingComparison?.snapshot??ui.context.comparisonSnapshot;
  const replayManifest=ui.context.pendingComparison?.manifest??ui.context.comparisonManifest;
  assert.deepEqual(replaySnapshot,snapshot);
  assert.equal(ui.context.lastMessage.type,'replayComparison');
  const data=replayComparisonManifest(ui.context.lastMessage.manifest);
  // The presentation stays tied to the imported manifest's snapshot and population.
  ui.context.comparisonSnapshot=replaySnapshot;
  ui.context.comparisonManifest=replayManifest;
  // Even a payload claiming validation never changes the presentation's authoritative label.
  ui.context.showComparison({...data,validated:true});
  assert.match(ui.element('compareconfig').textContent,/2 animais/);
  assert.match(ui.element('compareconfig').textContent,/dia 3 às 06:00/);
  assert.match(ui.element('compareconfig').textContent,/Balanceada, 1,5 kg MS.*calor/);
  assert.match(ui.element('compareconfig').textContent,/demonstrativo · não validado/);
  assert.match(ui.element('comparison-assumptions').innerHTML,/Suplemento efetivamente usado: 1,50/);
  assert.equal(ui.context.comparisonPerAnimal(10),5);
  const metricCsvLines=ui.context.comparisonCSV(data).split('\n'),headers=metricCsvLines[0].split(','),csv=metricCsvLines.at(-1).split(',');
  assert.equal(csv[headers.indexOf('consumo_ref_kgMS_animal')],(data.rows.at(-1).baselineConsumptionKgDM/2).toFixed(4));
  assert.equal(csv[headers.indexOf('consumo_alternativa_kgMS_animal')],(data.rows.at(-1).scenarioConsumptionKgDM/2).toFixed(4));
  assert.notEqual(csv[headers.indexOf('consumo_alternativa_kgMS_animal')],(data.rows.at(-1).scenarioConsumptionKgDM/24).toFixed(4));
  const historyCsvLines=ui.context.comparisonCSV(data).split('\n'),historyHeaders=historyCsvLines[0].split(','),statusIndex=historyHeaders.indexOf('status_modelo'),intervalIndex=historyHeaders.indexOf('intervalo_probabilistico');
  for(const line of historyCsvLines.slice(1)){
    const row=line.split(',');
    assert.equal(row[statusIndex],'demonstrativo_nao_validado');
    assert.equal(row[intervalIndex],'nao_disponivel_sem_calibracao');
  }
  assert.match(ui.element('results').innerHTML,/Derivado · demonstrativo · não validado/);
});

test('all presentation provenance and public ADG diagnostic links resolve through the existing static server',async t=>{
  const snapshot=new FarmEngine(42,2).snapshot(),ui=presentation(snapshot);
  ui.context.showComparison(compare(snapshot,1));
  const links=[...new Set([...ui.markup().matchAll(/href="([^"]+)"/g)].map(match=>match[1]))];
  assert.deepEqual(links.sort(),[
    '/docs/evidence/engine-adg-usda-cgrec-transport-check.json',
    '/docs/evidence/engine-adg-usda-cper-ltgi-check.json',
    '/docs/evidence/engine-adg-zenodo-cows-check.json',
    '/src/client/engine.js','/src/client/worker.js','https://doi.org/10.2527/2006.843712x',
  ]);
  const server=createServer({env:{}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  for(const link of links){
    if(link.startsWith('https://'))continue;
    const response=await fetch('http://127.0.0.1:'+server.address().port+link);
    assert.equal(response.status,200);
    const body=await response.text();
    if(link==='/src/client/engine.js')assert.match(body,/ASSUMPTIONS|function compare/);
    else if(link==='/src/client/worker.js')assert.match(body,/replayComparison/);
    else assert.doesNotThrow(()=>JSON.parse(body));
  }
  const environmentResponse=await fetch('http://127.0.0.1:'+server.address().port+'/environment-model.js');
  assert.equal(environmentResponse.status,200);
  assert.match(await environmentResponse.text(),/getWeatherRules/);
  const feedingResponse=await fetch('http://127.0.0.1:'+server.address().port+'/feeding-model.js');
  assert.equal(feedingResponse.status,200);
  assert.match(await feedingResponse.text(),/calculateFeeding/);
  const provenanceResponse=await fetch('http://127.0.0.1:'+server.address().port+'/engine-provenance.js');
  assert.equal(provenanceResponse.status,200);
  assert.match(await provenanceResponse.text(),/bundleEngineSources/);
  const sourceEntries=await Promise.all(ENGINE_SOURCE_FILES.map(async filename=>{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/'+filename);
    assert.equal(response.status,200);
    return [filename,new Uint8Array(await response.arrayBuffer())];
  }));
  assert.equal(createHash('sha256').update(bundleEngineSources(new Map(sourceEntries))).digest('hex'),engineSourceSha256());
});

test('invalid initial pasture values cannot become apparently available trajectories or CSV values',()=>{
  const variants=[
    [null,1800,1800,1800],
    [undefined,1800,1800,1800],
    [NaN,1800,1800,1800],
    [Infinity,1800,1800,1800],
    [-Infinity,1800,1800,1800],
    [1800,,1800,1800]
  ];
  for(const pastures of variants){
    const snapshot=new FarmEngine(42,2).snapshot();snapshot.pastures=pastures;
    const ui=presentation(snapshot),data=compare(snapshot,3);
    ui.context.showComparison(data);
    for(const id of ['results','intake-summary','pasture-summary','chart']){
      assert.match(ui.element(id).innerHTML,/Indisponível/);
    }
    assert.equal((ui.element('results').innerHTML.match(/<strong>Indisponível/g)??[]).length,4);
    assert.match(ui.element('comparison-coverage').innerHTML,/Estoque inicial do snapshot incompleto ou inválido/);
    assert.doesNotMatch(ui.markup(),/NaN|Infinity|undefined|5\.820/);
    const csv=ui.context.comparisonCSV(data).split('\n').at(-1).split(',');
    assert.equal(csv[0],'3');
    assert.deepEqual(csv.slice(1,5),['alojamento','pasture','barn','Indisponível']);
    assert.ok(csv.slice(5,-2).every(value=>value==='Indisponível'));
    assert.deepEqual(csv.slice(-2),['demonstrativo_nao_validado','nao_disponivel_sem_calibracao']);
  }
  const validSnapshot=new FarmEngine(42,2).snapshot();validSnapshot.pastures=[0,1800,1800,1800];
  const valid=presentation(validSnapshot);
  valid.context.showComparison(compare(validSnapshot,3));
  assert.doesNotMatch(valid.element('comparison-coverage').innerHTML,/Estoque inicial do snapshot incompleto ou inválido/);
  assert.match(valid.element('pasture-summary').innerHTML,/<td>0<\/td>/);
});

test('replayed null pasture stock remains unavailable after JSON import and engine coercion',async()=>{
  const snapshot=new FarmEngine(42,2).snapshot(),manifest=createComparisonManifest(snapshot,3);
  manifest.initialSnapshot.pastures[0]=null;
  const ui=presentation();
  await ui.element('manifest-file').onchange({target:{files:[{text:async()=>JSON.stringify(manifest)}],value:'import'}});
  assert.equal(ui.context.lastMessage.type,'replayComparison');
  const replaySnapshot=ui.context.pendingComparison?.snapshot??ui.context.comparisonSnapshot;
  const replayManifest=ui.context.pendingComparison?.manifest??ui.context.comparisonManifest;
  assert.deepEqual(replaySnapshot,manifest.initialSnapshot);
  ui.context.comparisonSnapshot=replaySnapshot;
  ui.context.comparisonManifest=replayManifest;
  ui.context.pendingComparison=undefined;
  ui.context.showComparison(replayComparisonManifest(ui.context.lastMessage.manifest));
  assert.match(ui.element('comparison-coverage').innerHTML,/Estoque inicial do snapshot incompleto ou inválido/);
  assert.equal((ui.element('results').innerHTML.match(/<strong>Indisponível/g)??[]).length,4);
  assert.match(ui.element('chart').innerHTML,/Indisponível/);
});

test('a missing intermediate day splits both otherwise finite chart trajectories',()=>{
  const snapshot=new FarmEngine(42,2).snapshot(),ui=presentation(snapshot),data=compare(snapshot,4);
  data.rows.splice(2,1);
  ui.context.showComparison(data);
  assert.equal((ui.element('chart').innerHTML.match(/<polyline/g)??[]).length,4);
  assert.match(ui.element('comparison-coverage').innerHTML,/Série diária incompleta/);
  assert.doesNotMatch(ui.element('results').innerHTML,/<strong>Indisponível/);
});

