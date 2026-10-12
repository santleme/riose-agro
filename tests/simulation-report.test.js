import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {FarmEngine, compare, createComparisonManifest} from '../engine.js';
import {renderSimulationReport} from '../simulation-report.js';
import {createServer} from '../server.js';

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
  assert.match(report,new RegExp(`base ${String(final.baselineWeight)}; intervenção ${String(final.scenarioWeight)}`));
  assert.match(report,new RegExp(`base ${String(final.baselineCost)}; intervenção ${String(final.scenarioCost)}`));
  assert.match(report,/demonstrativo; não validado/);
  assert.match(report,/não constitui recomendação, prescrição ou previsão validada/);
  assert.doesNotMatch(report,/diferença alternativa|%|NaN|Infinity|undefined/);
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
  assert.match(report,/base não informado; intervenção/);
  assert.match(report,/Suplemento \(kg MS\/animal\/dia\): não informado/);
  assert.match(report,/Campos ausentes ou não finitos são apresentados como “não informado”/);
  assert.doesNotMatch(report,/base 0;|intervenção 0;/);
});

test('explains invalid report inputs',()=>{
  assert.throws(()=>renderSimulationReport(null,{}),/Resultado inválido: informe um resultado de comparação do motor/);
  assert.throws(()=>renderSimulationReport({rows:[],days:0},{}),/horizonte deve ser um número inteiro/);
});

test('comparison dialog exports the generated Markdown report',async()=>{
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const binding=app.split('\n').find(line=>line.startsWith("$('report-export').onclick="));
  assert.ok(binding);
  assert.match(html,/<button id="report-export"[^>]*>Exportar relatório Markdown/);

  const snapshot=new FarmEngine(42,2).snapshot(),manifest=createComparisonManifest(snapshot,1),result=compare(snapshot,1);
  const downloads=[],button={};
  const context=vm.createContext({
    comparison:result,comparisonManifest:manifest,requestCompare:false,loadingScenario:false,
    renderSimulationReport,downloadFile:(...args)=>downloads.push(args),notify:()=>{},$:()=>button
  });
  vm.runInContext(binding,context);
  assert.equal(downloads.length,0);
  button.onclick();
  assert.equal(downloads[0][0],'agroville-relatorio-demonstrativo.md');
  assert.match(downloads[0][1],/^# Relatório da simulação/);
  assert.equal(downloads[0][2],'text/markdown;charset=utf-8');
});

test('local app server exposes the imported report module',async t=>{
  const server=createServer({env:{}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));

  const response=await fetch(`http://127.0.0.1:${server.address().port}/simulation-report.js`);
  assert.equal(response.status,200);
  assert.match(await response.text(),/export function renderSimulationReport/);
});
