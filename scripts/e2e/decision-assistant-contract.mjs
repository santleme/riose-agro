import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {emptyDecisionPlan} from '../../src/client/decision-plan.js';

const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__runs = 0;
    const WorkerBase = window.Worker;
    window.Worker = class extends WorkerBase {postMessage(message, ...args) {
      if (message?.type === 'replayScenarioSet') window.__runs++;
      super.postMessage(message, ...args);
    }};
  });
  const prompt = 'Compare 0.5, 1 and 1.5 kg DM/head/day for 8 cattle over 3 days with normal weather.';
  const plan = emptyDecisionPlan(prompt); plan.capability = 'farm_comparison';
  Object.assign(plan.parameters, {populationCount: 8, durationDays: 3, supplementLevels: [0.5, 1, 1.5], weather: 'normal'});
  const response = {type: 'riose-decision-response', version: 1, source: 'llm', provider: 'groq', model: 'explicit-fixture', metadata: {latencyMs: 1},
    executed: false, sourcePrompt: prompt, plan, message: 'Fixture proposal only; real engine execution still requires confirmation.'};
  let resolveFirst, receivedFirst;
  const firstReceived = new Promise(resolve => { receivedFirst = resolve; });
  const firstReleased = new Promise(resolve => { resolveFirst = resolve; });
  let calls = 0, outage = false, lastInput;
  await page.route('**/api/decision-assistant', async route => {
    calls++;
    lastInput = route.request().postDataJSON();
    if (calls === 1) { receivedFirst(); await firstReleased; }
    await route.fulfill({status: outage ? 503 : 200, contentType: 'application/json', body: JSON.stringify(outage ? {} : response)});
  });
  await page.goto('http://127.0.0.1:8000/scenario-lab.html', {waitUntil: 'networkidle'});
  await page.locator('#scenario-prompt').fill(prompt);
  await page.getByRole('button', {name: 'Ask Riose'}).click();
  await firstReceived;
  await page.locator('#scenario-prompt').fill('Changed request while the provider was running.');
  resolveFirst();
  await page.locator('#ask-riose:not([disabled])').waitFor();
  await page.locator('#assistant-conversation').focus();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'assistant-conversation', 'conversation history is keyboard focusable');
  assert.match(await page.locator('#prompt-result').textContent(), /Inputs changed during interpretation/);
  assert.equal(await page.locator('#review-panel:not([hidden])').count(), 0);
  assert.equal(await page.evaluate(() => window.__runs), 0);

  await page.locator('#scenario-prompt').fill(prompt);
  await page.getByRole('button', {name: 'Ask Riose'}).click();
  await page.locator('#review-panel:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__runs), 0);
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__runs), 1);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: /Export manifest \+ results/}).click()]);
  const filePath = await download.path();
  const archive = JSON.parse(await readFile(filePath, 'utf8'));
  outage = true;
  await page.locator('#scenario-prompt').fill('Explain the existing results.');
  await page.getByRole('button', {name: 'Ask Riose'}).click();
  await page.locator('#ask-riose:not([disabled])').waitFor();
  assert.equal(await page.locator('#results:not([hidden])').count(), 1);
  assert.equal(await page.evaluate(() => window.__runs), 1);
  assert.match(await page.locator('#assistant-conversation').textContent(), /Local parser/);
  archive.results.seed++;
  await page.locator('#manifest-file').setInputFiles({name: 'altered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive))});
  await page.getByText(/Could not open saved experiment/).waitFor();
  assert.equal(await page.locator('#results:not([hidden])').count(), 1, 'failed imports preserve completed outputs');
  assert.equal(await page.evaluate(() => window.__runs), 1);
  await page.locator('#scenario-prompt').fill('Compare 0.5 kg DM/head/day, 1 kg DM/head/day, and 1.5 kg DM/head/day for 8 cattle over 3 days.');
  await page.getByRole('button', {name: 'Ask Riose'}).click();
  await page.locator('#review-panel:not([hidden])').waitFor();
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  const [offlineDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: /Export manifest \+ results/}).click()]);
  const offlineArchive = JSON.parse(await readFile(await offlineDownload.path(), 'utf8'));
  assert.equal(offlineArchive.request.relationship, 'validated-prompt-draft');
  assert.equal(offlineArchive.request.intent.assumptions.find(x => x.field === 'weather').origin, 'scenario-lab default');
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.locator('#fill-br-corte-example').click();
  await page.locator('#br-corte-form [name=supplementPrice]').fill('2');
  await page.locator('#br-corte-form [name=currency]').fill('BRL');
  await page.getByRole('button', {name: 'Review BR-CORTE scenarios'}).click();
  await page.getByRole('button', {name: 'Calculate conditional estimates'}).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'scientific provenance hashes wrap without page overflow');
  await page.getByRole('button', {name: 'Review sensitivity', exact: true}).click();
  await page.getByRole('button', {name: 'Calculate sensitivity', exact: true}).click();
  await page.locator('#scenario-prompt').fill('Inspect the completed sensitivity results.');
  await page.getByRole('button', {name: 'Ask Riose'}).click();
  await page.locator('#ask-riose:not([disabled])').waitFor();
  assert.equal(lastInput.resultSummary.kind, 'sensitivity');
  assert.equal(lastInput.resultSummary.totalPoints, 7);
  assert.equal(lastInput.resultSummary.scenarios.length, 7);
  assert.equal(lastInput.resultSummary.model, 'br-corte-2023-eq-2.6');
  assert.deepEqual(errors, []);
  console.log('Decision UI contract E2E PASS: stale response discarded; review only; explicit actual Worker run; outage and tampered import preserve results; mobile/reduced motion. Provider fixture only, no external calls.');
} finally { await browser.close(); }
