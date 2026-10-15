import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin = process.env.RIOSE_URL ?? 'http://127.0.0.1:8000/';
const evidenceDir = 'docs/evidence/product-v3-review-2026-10-15';
await mkdir(evidenceDir, {recursive: true});
const browser = await chromium.launch({headless: true});
const consoleErrors = [];
const captures = [];

async function capture(page, filename, step) {
  await page.screenshot({path: `${evidenceDir}/${filename}`, fullPage: true});
  captures.push({filename, step, viewport: await page.evaluate(() => ({width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth, documentWidth: document.documentElement.clientWidth}))});
}

try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(new URL('/scenario-lab.html', origin).toString(), {waitUntil: 'networkidle'});
  assert.match(await page.locator('h1').innerText(), /Compare the conditions/);
  await capture(page, '01-initial-desktop.png', 'Initial page with prefilled editable values and explicit demonstration labels');

  await page.locator('#scenario-prompt').fill('Predict weight gain for 8 cattle over 3 days.');
  await page.getByRole('button', {name: 'Draft for review'}).click();
  await page.locator('#prompt-result').waitFor();
  assert.match(await page.locator('#prompt-result').innerText(), /Please specify:|Unsupported/);
  await capture(page, '02-unsupported-request.png', 'Unsupported request error and recovery prompt');

  await page.locator('#scenario-prompt').fill('Compare supplement levels 0.5 kg DM/head/day, 1 kg DM/head/day, and 1.5 kg DM/head/day for 8 cattle over 3 days in hot weather.');
  await page.getByRole('button', {name: 'Draft for review'}).click();
  await page.locator('#scenario-form [name="animalCount"]').fill('8');
  await page.locator('#scenario-form [name="durationDays"]').fill('3');
  await page.locator('[name="alternativeLevels"]').fill('1, 1.5');
  await page.getByRole('button', {name: /Review scenarios/}).click();
  await page.locator('#review-panel:not([hidden])').waitFor();
  assert.match(await page.locator('#review-state').innerText(), /Requires confirmation/);
  await capture(page, '03-farmengine-review.png', 'Three-arm review with seed, units and illustrative warnings');
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.equal(await page.locator('#scenario-legend span').count(), 3);
  assert.equal(await page.locator('#scenario-population [role="gridcell"]').count(), 8);
  await capture(page, '04-farmengine-results.png', 'Executed demonstrative comparison and population observations');

  await page.locator('#br-corte-form [name="bodyWeightKg"]').fill('400');
  await page.locator('#br-corte-form [name="adgKgPerDay"]').fill('0.5');
  await page.locator('#br-corte-form [name="animalCount"]').fill('200');
  await page.locator('#br-corte-form [name="durationDays"]').fill('30');
  await page.locator('#br-corte-form [name="supplementLevels"]').fill('0.5, 1, 1.5');
  await page.locator('#br-corte-form [name="supplementPrice"]').fill('4');
  await page.locator('#br-corte-form [name="currency"]').fill('BRL');
  await page.getByRole('button', {name: /Review BR-CORTE scenarios/}).click();
  await page.locator('#br-corte-review:not([hidden])').waitFor();
  await capture(page, '05-br-corte-review.png', 'Conditional equation inputs and assumptions before calculation');
  await page.getByRole('button', {name: 'Calculate conditional estimates'}).click();
  await page.locator('#br-corte-results:not([hidden])').waitFor();
  assert.match(await page.locator('#br-corte-provenance').innerText(), /no Riose-specific calibration/);
  assert.doesNotMatch(await page.locator('#br-corte-provenance').innerText(), /registry evidence status demonstrative/);
  await capture(page, '06-br-corte-results.png', 'Conditional DMI results, evidence classification and exclusions');

  const mobile = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 1});
  mobile.on('pageerror', error => consoleErrors.push(error.message));
  mobile.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await mobile.goto(new URL('/scenario-lab.html', origin).toString(), {waitUntil: 'networkidle'});
  const navHeights = await mobile.locator('.topbar nav a').evaluateAll(links => links.map(link => link.getBoundingClientRect().height));
  assert.ok(navHeights.every(height => height <= 28), `mobile navigation wraps: ${JSON.stringify(navHeights)}`);
  await capture(mobile, '07-initial-mobile.png', 'Responsive initial state and mobile navigation');
  await mobile.locator('#scenario-prompt').fill('Compare supplement levels 0.5 kg DM/head/day, 1 kg DM/head/day, and 1.5 kg DM/head/day for 8 cattle over 3 days in hot weather.');
  await mobile.getByRole('button', {name: 'Draft for review'}).click();
  await mobile.locator('#scenario-form [name="animalCount"]').fill('8');
  await mobile.locator('#scenario-form [name="durationDays"]').fill('3');
  await mobile.locator('[name="alternativeLevels"]').fill('1, 1.5');
  await mobile.getByRole('button', {name: /Review scenarios/}).click();
  await mobile.getByRole('button', {name: 'Run scenarios'}).click();
  await mobile.locator('#results:not([hidden])').waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
  await capture(mobile, '08-farmengine-results-mobile.png', 'Mobile comparison results and inspectable population');
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({origin, captures, consoleErrors}, null, 2));
} finally {
  await browser.close();
}
