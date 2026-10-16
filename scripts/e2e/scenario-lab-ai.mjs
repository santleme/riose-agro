import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  await page.addInitScript(() => {
    window.__scenarioWorkerPosts = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message, ...rest) {
        if (message?.type === 'replayScenarioSet') window.__scenarioWorkerPosts.push(message);
        return super.postMessage(message, ...rest);
      }
    };
  });
  const intent = {
    type: 'riose-scenario-lab-intent', version: 1, ready: true,
    population: {count: 8}, duration: {days: 3},
    supplementLevelsKgDMPerHeadPerDay: [0.5, 1, 1.5], weather: 'hot',
    assumptions: [
      {field: 'supplementLevelsKgDMPerHeadPerDay', origin: 'user prompt'},
      {field: 'weather', value: 'hot', origin: 'user prompt'},
    ], missingInputs: [], unsupportedRequests: [],
  };
  await page.route('**/api/interpret-scenario-lab', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({available: true, source: 'llm', provider: 'groq', model: 'fixture-model', intent}),
  }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8000/scenario-lab.html', {waitUntil: 'networkidle'});
  await page.locator('#scenario-prompt').fill('Compare 0.5, 1.0 and 1.5 kg DM/head/day for 8 cattle over 3 days in hot weather.');
  await page.getByRole('button', {name: 'Draft for review'}).click();
  await page.locator('#review-panel:not([hidden])').waitFor();
  assert.match(await page.locator('#prompt-result').textContent(), /groq · fixture-model/);
  assert.equal(await page.locator('#scenario-form [name="animalCount"]').inputValue(), '8');
  assert.equal(await page.locator('#results:not([hidden])').count(), 0);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 0, 'interpretation cannot start a Worker');

  await page.locator('#scenario-form [name="alternativeLevels"]').fill('1.25, 1.5');
  await page.getByRole('button', {name: /Review scenarios/}).click();
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 1, 'only explicit user confirmation starts the simulation');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', {name: /Export manifest \+ results/}).click(),
  ]);
  const filePath = await download.path();
  const archive = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(archive.version, 2);
  assert.equal(archive.request.relationship, 'manual-revision');
  assert.deepEqual(archive.request.interpretation, {source: 'llm', provider: 'groq', model: 'fixture-model'});
  assert.deepEqual(archive.request.intent, intent);
  assert.deepEqual(archive.provenance.interpreter, archive.request.interpretation);
  assert.equal(archive.manifest.scenarios[1].config.supplement, 1.25);
  assert.equal(archive.results.scenarios[0].config.supplement, 1.25);

  await page.locator('#manifest-file').setInputFiles(filePath);
  await page.locator('#review-panel:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 1, 'opening archive cannot execute');
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 2, 'archive replay is explicit');
  assert.deepEqual(errors, []);
  console.log('Product V4 AI UI E2E PASS: fixture interpretation → review → explicit run → v2 provenance export → no-run import → explicit replay. No provider was contacted.');
} finally {
  await browser.close();
}
