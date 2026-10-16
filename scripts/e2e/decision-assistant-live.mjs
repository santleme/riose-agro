import assert from 'node:assert/strict';
import {readFile, writeFile, appendFile} from 'node:fs/promises';
import {chromium} from 'playwright';
if (process.env.RIOSE_LIVE_AI !== '1') throw new Error('This manual test calls a real provider. Set RIOSE_LIVE_AI=1 only for an authorized run.');
const root = process.env.RIOSE_BASE_URL ?? 'http://127.0.0.1:8000';
const browser = await chromium.launch({headless: true});
const evidence = {type: 'riose-live-ai-browser-evaluation', version: 1, requests: [], checks: {}, credentialsRecorded: false};
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__scenarioWorkerPosts = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {postMessage(message, ...args) {
      if (message?.type === 'replayScenarioSet') window.__scenarioWorkerPosts.push(message);
      return super.postMessage(message, ...args);
    }};
  });
  await page.goto(`${root}/scenario-lab.html`, {waitUntil: 'networkidle'});
  await page.screenshot({path: 'docs/evidence/product-v4-live-initial.png', fullPage: true});
  let lastCall = 0;
  async function ask(prompt) {
    const pause = Math.max(0, 6500 - (Date.now() - lastCall));
    if (pause) await new Promise(resolve => setTimeout(resolve, pause));
    await page.locator('#scenario-prompt').fill(prompt);
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/decision-assistant'));
    lastCall = Date.now();
    await page.getByRole('button', {name: 'Ask Riose'}).click();
    const response = await responsePromise;
    const body = await response.json();
    evidence.requests.push({prompt, httpStatus: response.status(), source: body.source, provider: body.provider,
      model: body.model, metadata: body.metadata, fallbackReason: body.fallbackReason,
      intent: body.plan?.intent, capability: body.plan?.capability, missingInputs: body.plan?.missingInputs});
    assert.equal(body.source, 'llm', `Real provider required; got ${body.fallbackReason}`);
    assert.equal(body.executed, false);
    await page.locator('#ask-riose:not([disabled])').waitFor();
    return body;
  }
  const clarification = await ask('Compare 200 bovinos durante 30 dias com diferentes níveis de suplementação.');
  assert.ok(clarification.plan.missingInputs.length);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 0);
  const complete = await ask('Compare 0.5, 1 and 1.5 kg DM/head/day for 200 cattle over 30 days with normal weather.');
  assert.deepEqual(complete.plan.missingInputs, []);
  await page.locator('#review-panel:not([hidden])').waitFor();
  assert.equal(await page.locator('#scenario-form [name=animalCount]').inputValue(), '200');
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 0);
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 1);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: /Export manifest \+ results/}).click()]);
  const filePath = await download.path();
  const archive = JSON.parse(await readFile(filePath, 'utf8'));
  evidence.checks.archiveBytes = (await readFile(filePath)).length;
  assert.equal(archive.request.interpretation.provider, 'groq');
  assert.equal(archive.request.interpretation.model, complete.model);
  evidence.checks.exportManifestSha256 = archive.provenance.confirmedManifestSha256;
  evidence.checks.exportResultsSha256 = archive.provenance.resultsSha256;
  await page.locator('#manifest-file').setInputFiles(filePath);
  await page.locator('#review-panel:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 1);
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 2);
  evidence.checks.exportReplay = true;
  const inspected = await ask('Mostre os resultados já calculados e a diferença entre os cenários.');
  assert.equal(inspected.plan.capability, 'results');
  assert.match(await page.locator('#assistant-conversation').textContent(), /browser-supplied|browser-run/);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 2);
  await page.screenshot({path: 'docs/evidence/product-v4-live-workspace.png', fullPage: true});
  const revision = await ask('Change the highest supplement level to 1.25 kg DM/head/day. Keep the other inputs unchanged.');
  assert.deepEqual(revision.plan.parameters.supplementLevels, [0.5, 1, 1.25]);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 2);
  assert.equal(await page.locator('#scenario-form [name=alternativeLevels]').inputValue(), '1, 1.25');
  const single = await ask('Calcule o CMS condicional pelo BR-CORTE para um zebuíno em crescimento a pasto tropical de 400 kg, com GMD informado de 0,5 kg/dia e suplemento de 1,6 kg de matéria seca por animal por dia.');
  assert.equal(single.plan.capability, 'br_corte_single');
  assert.deepEqual(single.plan.missingInputs, []);
  await page.locator('#single-review:not([hidden])').waitFor();
  assert.match(await page.locator('#single-result').textContent(), /No estimate/);
  await page.getByRole('button', {name: 'Calculate reviewed estimate'}).click();
  assert.match(await page.locator('#single-result').textContent(), /kg DM\/head\/day/);
  const [singleDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Export single calculation'}).click()]);
  const singlePath = await singleDownload.path();
  const singleReport = JSON.parse(await readFile(singlePath, 'utf8'));
  const {evaluateSingleInputs} = await import('../../src/client/decision-single-report.js');
  assert.deepEqual(singleReport.result, evaluateSingleInputs(singleReport.inputs));
  await page.locator('#single-file').setInputFiles(singlePath);
  await page.locator('#single-result').getByText(/No estimate/).waitFor();
  await page.getByRole('button', {name: 'Calculate reviewed estimate'}).click();
  assert.match(await page.locator('#single-result').textContent(), /Replay matches exactly/);
  evidence.checks.singleScientificReplay = true;
  const science = await ask('O BR-CORTE consegue prever automaticamente o ganho de peso?');
  assert.equal(science.plan.capability, 'evidence');
  assert.match(science.message, /ADG is an input, never a predicted output/);
  const behavioral = await ask('Preveja quando cada bovino vai ruminar amanhã.');
  assert.equal(behavioral.plan.intent, 'unsupported_request'); assert.match(behavioral.message, /NO-GO/);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 2);
  const currentCalculatedText = await page.locator('#single-result').textContent();
  await page.route('**/api/decision-assistant', route => route.fulfill({status: 503, contentType: 'application/json', body: '{}'}));
  await page.locator('#scenario-prompt').fill('Qual cenário produz maior ganho de peso real?');
  await page.getByRole('button', {name: 'Ask Riose'}).click();
  await page.locator('#ask-riose:not([disabled])').waitFor();
  assert.match(await page.locator('#assistant-conversation').textContent(), /Local parser/);
  assert.equal(await page.locator('#single-result').textContent(), currentCalculatedText, 'provider outage must retain the most recent computed scientific result');
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 2);
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.screenshot({path: 'docs/evidence/product-v4-live-mobile.png', fullPage: true});
  assert.deepEqual(errors, []);
  evidence.checks = {...evidence.checks, liveReview: true, explicitExecution: true, exportReplay: true,
    singleScientificResultMatchesModule: true, singleExplicitReplay: true, groundedExplanation: true,
    revisionDoesNotExecute: true, unsupportedNoGo: true, outagePreservesResults: true,
    desktop: [1440, 1000], mobile: [390, 844], reducedMotion: true, pageErrors: errors};
  evidence.status = 'passed';
  console.log('Live Groq Product E2E PASS: clarification → real intent → review → explicit execution → results → grounded AI selection → export/replay; revision, conditional BR-CORTE, NO-GO and provider outage.');
} catch (error) {
  evidence.status = 'failed'; evidence.failure = error.message;
  throw error;
} finally {
  await writeFile('docs/evidence/product-v4-live-ai-e2e-v1.json', JSON.stringify(evidence, null, 2) + '\n');
  await appendFile('docs/evidence/product-v4-live-ai-browser-attempts-v1.jsonl', JSON.stringify(evidence) + '\n');
  await browser.close();
}
