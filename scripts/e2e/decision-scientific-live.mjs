import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
if (process.env.RIOSE_LIVE_AI !== '1') throw new Error('Manual authorized real-provider test requires RIOSE_LIVE_AI=1.');
const browser = await chromium.launch({headless: true});
const evidence = {type: 'riose-live-scientific-ui', version: 1, requests: [], checks: {}};
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8000/scenario-lab.html',{waitUntil:'networkidle'});
 let lastCall=0;
 async function ask(prompt) {
  const pause=Math.max(0,7000-(Date.now()-lastCall));if(pause)await new Promise(r=>setTimeout(r,pause));
  await page.locator('#scenario-prompt').fill(prompt);
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/decision-assistant'));lastCall=Date.now();
  await page.getByRole('button',{name:'Ask Riose'}).click();
  const http=await pending;const response=await http.json();
  evidence.requests.push({prompt,source:response.source,model:response.model,metadata:response.metadata,fallbackReason:response.fallbackReason,plan:response.plan});
  assert.equal(response.source,'llm',`Real provider required: ${response.fallbackReason}`);
  assert.equal(response.executed,false);await page.locator('#ask-riose:not([disabled])').waitFor();return response;
 }
 for(const prompt of ['Compare três estratégias de suplementação utilizando os modelos disponíveis.','Quero melhorar o desempenho do meu rebanho.','Como a estimativa condicional de CMS muda quando altero a suplementação, mantendo o GMD constante?']) {
  const result=await ask(prompt);assert.ok(result.plan.missingInputs.length||result.plan.capability==='none');
  assert.equal(await page.locator('#results:not([hidden])').count(),0);
 }
 const sweep=await ask('Faça uma análise de sensibilidade BR-CORTE para 200 zebuínos em crescimento a pasto tropical por 30 dias: peso 400 kg, GMD informado de 0,5 kg/dia; suplemento de 0,5 a 2 kg MS/animal/dia com passo 0,25 kg MS/animal/dia.');
 assert.equal(sweep.plan.capability,'br_corte_sensitivity');assert.deepEqual(sweep.plan.missingInputs,[]);
 await page.locator('#br-corte-sensitivity-review:not([hidden])').waitFor();
 assert.equal(await page.locator('#br-corte-sensitivity-results:not([hidden])').count(),0);
 await page.getByRole('button',{name:'Calculate sensitivity',exact:true}).click();
 await page.locator('#br-corte-sensitivity-results:not([hidden])').waitFor();
 assert.equal(await page.locator('#br-corte-sensitivity-table-body tr').count(),7);
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export sensitivity archive'}).click()]);
 await page.locator('#br-corte-file').setInputFiles(await download.path());
 await page.getByText(/Nothing was calculated; review and explicitly replay/).waitFor();
 assert.equal(await page.locator('#br-corte-sensitivity-results:not([hidden])').count(),0);
 await page.getByRole('button',{name:'Calculate sensitivity',exact:true}).click();
 await page.getByText(/Sensitivity replay matches the saved results exactly/).waitFor();
 evidence.checks.sensitivityExplicitReplay=true;
 const cost=await ask('Compare BR-CORTE para 200 zebuínos em crescimento a pasto tropical por 30 dias, peso 400 kg, GMD informado de 0,5 kg/dia; suplemento 0,5, 1 e 1,5 kg MS/animal/dia, preço BRL 2 por kg MS.');
 assert.equal(cost.plan.capability,'br_corte_scenarios');assert.deepEqual(cost.plan.missingInputs,[]);
 await page.locator('#br-corte-review:not([hidden])').waitFor();
 assert.equal(await page.locator('#br-corte-results:not([hidden])').count(),0);
 assert.equal(await page.locator('#br-corte-form [name=supplementPrice]').inputValue(),'2');
 await page.getByRole('button',{name:'Calculate conditional estimates'}).click();
 await page.locator('#br-corte-results:not([hidden])').waitFor();
 assert.equal(await page.locator('#br-corte-table-body tr').count(),3);
 assert.match(await page.locator('#br-corte-provenance').textContent(),/not predicted|input/i);
 evidence.checks.conditionalCostExplicit=true;
 await page.screenshot({path:'docs/evidence/product-v4-live-scientific-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
 await page.screenshot({path:'docs/evidence/product-v4-live-scientific-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);evidence.checks.pageErrors=errors;evidence.status='passed';
 console.log('Real Groq scientific UI PASS: incomplete/ambiguous asks → clarification; sensitivity review/confirm/export/replay; conditional BR-CORTE and supplied supplement costs; desktop/mobile.');
} catch(error) {evidence.status='failed';evidence.failure=error.message;throw error;}
finally {await writeFile('docs/evidence/product-v4-live-scientific-v1.json',JSON.stringify(evidence,null,2)+'\n');await browser.close();}
