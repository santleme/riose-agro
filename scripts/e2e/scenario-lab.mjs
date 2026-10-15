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

  await page.locator('[name="animalCount"]').fill('8');
  await page.locator('[name="durationDays"]').fill('3');
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

  await page.locator('[name="animalCount"]').fill('10000');
  await page.locator('[name="durationDays"]').fill('365');
  await page.getByRole('button', {name: /Review scenarios/}).click();
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
