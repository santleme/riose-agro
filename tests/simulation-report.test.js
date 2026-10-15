import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FarmEngine, compare, createComparisonManifest} from '../src/client/engine.js';
import {renderSimulationReport} from '../src/client/simulation-report.js';
import {createServer} from '../src/server/server.js';
import {BR_CORTE_PASTURE_DMI_MODEL} from '../scientific/br_corte_dmi_adapter.js';
import {runRegisteredScientificModel} from '../scientific/model-contract.js';

test('renders a deterministic report using the engine result and manifest',()=>{
  const snapshot=new FarmEngine(42,2).snapshot();
  const manifest=createComparisonManifest(snapshot,2);
  const result=compare(snapshot,2);
  const report=renderSimulationReport(result,manifest);
  const final=result.rows.at(-1);

  assert.equal(renderSimulationReport(result,manifest),report);
  assert.match(report,/## Cenário/);
  assert.match(report,/## Entradas registradas/);
  assert.match(report,/## Principais resultados e diferenças/);
  assert.match(report,/## Limitações/);
  assert.match(report,/## Fontes e proveniência disponíveis/);
  assert.match(report,/Alojamento: pasture/);
  assert.match(report,/Alojamento: barn/);
  assert.match(report,new RegExp(`referência ${String(final.baselineWeight)}; intervenção ${String(final.scenarioWeight)}`));
  assert.match(report,new RegExp(`referência ${String(final.baselineCost)}; intervenção ${String(final.scenarioCost)}`));
  assert.match(report,/demonstrativo; não validado/);
  assert.match(report,/não constitui recomendação, prescrição ou previsão validada/);
  assert.doesNotMatch(report,/diferença alternativa|%|NaN|Infinity|undefined/);
});

test('renders registered scientific model identity, units, evidence status, and implementation hash',()=>{
  const snapshot=new FarmEngine(42,2).snapshot();
  const manifest=createComparisonManifest(snapshot,1);
  const modelResult=runRegisteredScientificModel({
    id:BR_CORTE_PASTURE_DMI_MODEL.id,
    version:BR_CORTE_PASTURE_DMI_MODEL.version,
    inputs:{bodyWeightKg:400,adgKgPerDay:0.5,supplementKgDMPerDay:1.6}
  });
  const result={...compare(snapshot,1),scientificProvenance:modelResult.scientificProvenance};
  const report=renderSimulationReport(result,manifest);

  assert.match(report,/## Proveniência de modelos científicos/);
  assert.match(report,/Modelo: br-corte-2023-eq-2\.6@2023/);
  assert.match(report,/bodyWeightKg=400 kg/);
  assert.match(report,/supplementKgDMPerDay=1\.6 kg DM\/day/);
  assert.match(report,/https:\/\/brcorte\.com\.br\/assets\/book2023\/br\/02\.pdf \[demonstrative\]; estado: demonstrative/);
  assert.match(report,/Hash da implementação: sha256:[a-f0-9]{64}/);
  assert.match(report,/a resolução não promove evidência nem valida o modelo/);
});

test('demo lot provenance stays attached to the portable comparison report',()=>{
  const result={days:1,herdSize:2,startWeight:340,validated:false,rows:[{day:1}],assumptions:{}};
  const report=renderSimulationReport(result,{}, {lotContext:{lotId:'demo-paddock-2',animalIds:[2,6],
    model:{id:'riose-registered-demo-lot',version:'1.0.0',status:'demonstrative_unvalidated',evidenceStatus:'no_empirical_validation',evidenceReferences:[{id:'src/client/engine.js',status:'registered_demo_implementation'}]},
    intervention:{factor:'diet',referenceValue:'pasture',scenarioValue:'balanced'}}});
  assert.match(report,/ID estável: demo-paddock-2/);
  assert.match(report,/IDs de animais simulados: 2, 6/);
  assert.match(report,/Evidência do modelo: no_empirical_validation; referência: src\/client\/engine\.js \(registered_demo_implementation\)/);
  assert.match(report,/Dados de snapshots observados não foram usados/);
});

test('keeps missing and non-finite values explicit without substituting zero',()=>{
  const snapshot=new FarmEngine(42,2).snapshot();
  const result=compare(snapshot,1);
  result.rows[1].scenarioWeight=undefined;
  result.rows[1].baselineCost=Infinity;
  result.startWeight=undefined;
  const manifest=createComparisonManifest(snapshot,1);
  manifest.scenarios.reference.supplement=undefined;
  const report=renderSimulationReport(result,manifest);

  assert.match(report,/Peso médio inicial \(kg\/animal\): não informado/);
  assert.match(report,/intervenção não informado/);
  assert.match(report,/referência não informado; intervenção/);
  assert.match(report,/Suplemento \(kg MS\/animal\/dia\): não informado/);
  assert.match(report,/Campos ausentes ou não finitos são apresentados como “não informado”/);
  assert.doesNotMatch(report,/base 0;|intervenção 0;/);
});

test('explains invalid report inputs',()=>{
  assert.throws(()=>renderSimulationReport(null,{}),/Resultado inválido: informe um resultado de comparação do motor/);
  assert.throws(()=>renderSimulationReport({rows:[],days:0},{}),/horizonte deve ser um número inteiro/);
});

test('experiment dashboard offers the portable Markdown report export', async () => {
  const app = await readFile(new URL('../src/client/product-app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../experiments.html', import.meta.url), 'utf8');
  assert.match(html, /id="export-report"[^>]*>Baixar relatório/);
  assert.match(app, /renderSimulationReport\(latest\.result,latest\.manifest\)/);
  assert.match(app, /riose-relatorio\.md/);
});

test('local app server exposes imported browser modules',async t=>{
  const server=createServer({env:{}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));

  const response=await fetch(`http://127.0.0.1:${server.address().port}/src/client/simulation-report.js`);
  assert.equal(response.status,200);
  assert.match(await response.text(),/export function renderSimulationReport/);
  const historyResponse=await fetch(`http://127.0.0.1:${server.address().port}/src/client/run-history.js`);
  assert.equal(historyResponse.status,200);
  assert.match(await historyResponse.text(),/export function recordRun/);
});
