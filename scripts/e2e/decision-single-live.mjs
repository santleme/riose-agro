import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {evaluateSingleInputs,validateSingleReport} from '../../src/client/decision-single-report.js';
if(process.env.RIOSE_LIVE_AI!=='1')throw new Error('Manual real-provider test requires RIOSE_LIVE_AI=1.');
const browser=await chromium.launch({headless:true});
const evidence={type:'riose-live-single-report-validation',version:1,status:'running'};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await page.goto('http://127.0.0.1:8000/scenario-lab.html',{waitUntil:'networkidle'});
 const prompt='Calcule o CMS condicional pelo BR-CORTE para um zebuíno em crescimento a pasto tropical de 400 kg, com GMD informado de 0,5 kg/dia e suplemento de 1,6 kg de matéria seca por animal por dia.';
 await page.locator('#scenario-prompt').fill(prompt);
 const pending=page.waitForResponse(r=>r.url().endsWith('/api/decision-assistant'));
 await page.getByRole('button',{name:'Ask Riose'}).click();
 const http=await pending;const response=await http.json();
 Object.assign(evidence,{prompt,httpStatus:http.status(),source:response.source,model:response.model,metadata:response.metadata,fallbackReason:response.fallbackReason});
 assert.equal(response.source,'llm');assert.equal(response.executed,false);assert.deepEqual(response.plan.missingInputs,[]);
 await page.locator('#single-review:not([hidden])').waitFor();assert.match(await page.locator('#single-result').textContent(),/No estimate/);
 await page.getByRole('button',{name:'Calculate reviewed estimate'}).click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export single calculation'}).click()]);
 assert.equal(download.suggestedFilename(),'riose-br-corte-single-report-v2.json');
 const file=await download.path();const report=JSON.parse(await readFile(file,'utf8'));
 await validateSingleReport(report);assert.equal(report.version,2);assert.equal(report.units.totalDmiKgDMPerDay,'kg DM/head/day');
 assert.deepEqual(report.result,evaluateSingleInputs(report.inputs));
 await page.locator('#single-file').setInputFiles(file);
 await page.locator('#single-result').getByText(/No estimate/).waitFor();
 await page.getByRole('button',{name:'Calculate reviewed estimate'}).click();
 await page.locator('#single-result').getByText(/Replay matches exactly/).waitFor();
 Object.assign(evidence,{status:'passed',reportVersion:report.version,units:report.units,reportSha256:report.sha256,
   inputOnlyInterpretation:true,explicitCalculation:true,moduleOutputEquality:true,noExecutionOnImport:true,explicitExactReplay:true});
 console.log('Real Groq single report v2 PASS: strict draft → review → confirmation → registered module → explicit units → export/open → exact replay.');
} catch(error){evidence.status='failed';evidence.failure=error.message;throw error;}
finally {await writeFile('docs/evidence/product-v4-live-single-report-v2.json',JSON.stringify(evidence,null,2)+'\n');await browser.close();}
