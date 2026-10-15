import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:8000/scenario-lab.html', {waitUntil: 'networkidle'});
  await page.screenshot({path: 'docs/evidence/product-v3-scenario-lab-initial.png', fullPage: true});

  await page.locator('#scenario-form [name="animalCount"]').fill('8');
  await page.locator('#scenario-form [name="durationDays"]').fill('3');
  await page.locator('[name="alternativeLevels"]').fill('1.0, 1.5');
  await page.getByRole('button', {name: /Review scenarios/}).click();
  assert.equal(await page.locator('#scenario-list article').count(), 3);
  assert.match(await page.locator('#review-meta').textContent(), /3 days · 8 generated engine animals/);
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.match(await page.locator('#run-meta').textContent(), /3 scenarios/);
  assert.equal(await page.locator('#scenario-legend span').count(), 3);
  assert.equal(await page.locator('#scenario-population [role="gridcell"]').count(), 8);
  await page.locator('#result-day').fill('1');
  await page.locator('#population-scenario').selectOption('alternative-2');
  await page.locator('#scenario-population [role="gridcell"]').first().click();
  assert.match(await page.locator('#animal-detail').textContent(), /Animal 1/);
  await page.screenshot({path: 'docs/evidence/product-v3-scenario-lab-results.png', fullPage: true});
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', {name: /Export manifest \+ results/}).click(),
  ]);
  await page.locator('#manifest-file').setInputFiles(await download.path());
  await page.getByText(/Saved manifest loaded/).waitFor();
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.match(await page.locator('#run-meta').textContent(), /3 scenarios/);

  await page.locator('[name="bodyWeightKg"]').fill('400');
  await page.locator('[name="adgKgPerDay"]').fill('0.5');
  await page.locator('[name="animalCount"]').last().fill('200');
  await page.locator('[name="durationDays"]').last().fill('30');
  await page.locator('[name="supplementLevels"]').fill('0.5, 1.0, 1.5');
  await page.locator('[name="supplementPrice"]').fill('4');
  await page.locator('[name="currency"]').fill('brl');
  await page.getByRole('button', {name: /Review BR-CORTE scenarios/}).click();
  assert.equal(await page.locator('#br-corte-review-list article').count(), 3);
  assert.match(await page.locator('#br-corte-review-meta').textContent(), /supplied ADG 0.5 kg\/day/);
  await page.getByRole('button', {name: 'Calculate conditional estimates'}).click();
  await page.locator('#br-corte-results:not([hidden])').waitFor();
  assert.equal(await page.locator('#br-corte-table-body tr').count(), 3);
  assert.match(await page.locator('#br-corte-table-body tr').first().textContent(), /6\.726/);
  assert.match(await page.locator('#br-corte-table-body tr').first().textContent(), /BRL 12000\.00/);
  assert.match(await page.locator('#br-corte-provenance').textContent(), /does not forecast gain/);
  await page.screenshot({path: 'docs/evidence/product-v3-scenario-lab-results.png', fullPage: true});
  const [brCorteDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', {name: /Export inputs \+ results/}).click(),
  ]);
  const savedBrCorte = JSON.parse(await (await import('node:fs/promises')).readFile(await brCorteDownload.path(), 'utf8'));
  assert.equal(savedBrCorte.manifest.modelId, 'br-corte-2023-eq-2.6');
  assert.equal(savedBrCorte.results.scenarios.length, 3);
  await page.locator('#br-corte-file').setInputFiles(await brCorteDownload.path());
  await page.getByText(/Saved BR-CORTE inputs loaded and validated/).waitFor();
  await page.getByRole('button', {name: 'Calculate conditional estimates'}).click();
  assert.match(await page.locator('#br-corte-table-body tr').first().textContent(), /BRL 12000\.00/);
  await page.locator('[name="bodyWeightKg"]').fill('500');
  assert.equal(await page.locator('[name="bodyWeightKg"]').evaluate(input => input.checkValidity()), false);
  assert.equal(await page.locator('#br-corte-review:not([hidden])').count(), 0);
  await page.locator('[name="bodyWeightKg"]').fill('400');
  await page.locator('[name="supplementPrice"]').fill('');
  await page.locator('[name="currency"]').fill('');
  await page.getByRole('button', {name: /Review BR-CORTE scenarios/}).click();
  await page.getByRole('button', {name: 'Calculate conditional estimates'}).click();
  assert.doesNotMatch(await page.locator('#br-corte-table-head').textContent(), /cost/i);
  assert.match(await page.locator('#br-corte-provenance').textContent(), /not a cohort distribution/);
  await page.locator('#scenario-form [name="animalCount"]').fill('10000');
  await page.locator('#scenario-form [name="durationDays"]').fill('15');
  await page.getByRole('button', {name: /Review scenarios/}).click();
  assert.equal(await page.locator('#run-scenarios').isDisabled(), true);
  assert.match(await page.locator('#resource-budget').textContent(), /planning limit/);
  await page.locator('#scenario-form [name="durationDays"]').fill('7');
  await page.getByRole('button', {name: /Review scenarios/}).click();
  assert.equal(await page.locator('#run-scenarios').isDisabled(), false);
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.getByRole('button', {name: 'Cancel run'}).waitFor();
  await page.getByRole('button', {name: 'Cancel run'}).click();
  await page.getByText(/Scenario run cancelled/).waitFor();
  assert.equal(await page.locator('#results:not([hidden])').count(), 0);
  assert.deepEqual(errors, []);
  const mobile = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 1});
  await mobile.goto('http://127.0.0.1:8000/scenario-lab.html', {waitUntil: 'networkidle'});
  const dimensions = await mobile.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
  assert.ok(dimensions.scroll <= dimensions.client, `mobile horizontal overflow: ${JSON.stringify(dimensions)}`);
  await mkdir('docs/evidence', {recursive: true});
  console.log(JSON.stringify({scenarioCount: 3, animalCount: 8, selectedDay: 1, cancellation: 'passed', mobile: dimensions, consoleErrors: errors}));
} finally {
  await browser.close();
}
