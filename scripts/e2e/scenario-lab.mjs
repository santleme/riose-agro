import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
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
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:8000/scenario-lab.html', {waitUntil: 'networkidle'});
  for (const name of ['animalCount', 'durationDays', 'baselineSupplement', 'alternativeLevels']) {
    assert.equal(await page.locator(`#scenario-form [name="${name}"]`).inputValue(), '', `${name} must not look like user-provided data on first load`);
  }
  assert.equal(await page.locator('#scenario-form [name="weather"]').inputValue(), '', 'demonstrative weather rule must be explicitly selected');
  assert.equal(await page.locator('#scenario-form [name="animalCount"]').evaluate(input => input.checkValidity()), false);
  assert.equal(await page.locator('#review-panel:not([hidden])').count(), 0);
  await page.getByRole('button', {name: 'Use example'}).click();
  assert.match(await page.locator('#prompt-result').textContent(), /Example loaded/);
  assert.equal(await page.locator('#review-panel:not([hidden])').count(), 0);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 0);
  await page.locator('#scenario-prompt').fill('');
  for (const name of ['bodyWeightKg', 'adgKgPerDay', 'animalCount', 'durationDays', 'supplementLevels', 'supplementPrice', 'currency']) {
    assert.equal(await page.locator(`#br-corte-form [name="${name}"]`).inputValue(), '', `${name} must start empty instead of implying recorded cattle data`);
  }
  for (const name of ['minimumSupplement', 'maximumSupplement', 'sweepStep']) {
    assert.equal(await page.locator(`#br-corte-sensitivity-form [name="${name}"]`).inputValue(), '');
  }
  assert.equal(await page.locator('#br-corte-form [name="bodyWeightKg"]').evaluate(input => input.checkValidity()), false);
  await page.screenshot({path: 'docs/evidence/product-v4-empty-state.png', fullPage: true});
  await page.getByRole('button', {name: 'Load BR-CORTE example'}).click();
  assert.equal(await page.locator('#br-corte-form [name="bodyWeightKg"]').inputValue(), '400');
  assert.match(await page.locator('#br-corte-example-status').textContent(), /not observations/);
  assert.equal(await page.locator('#br-corte-review:not([hidden])').count(), 0);
  assert.equal(await page.locator('#br-corte-results:not([hidden])').count(), 0);
  assert.equal(await page.locator('#br-corte-sensitivity-results:not([hidden])').count(), 0);
  await page.screenshot({path: 'docs/evidence/product-v4-empty-and-example-state.png', fullPage: true});
  await page.locator('#br-corte-form [name="bodyWeightKg"]').fill('400');
  await page.screenshot({path: 'docs/evidence/product-v3-scenario-lab-initial.png', fullPage: true});

  await page.locator('#scenario-prompt').fill('Compare supplement levels 0.5 kg DM/head/day, 1 kg DM/head/day, and 1.5 kg DM/head/day for cattle.');
  await page.getByRole('button', {name: 'Draft for review'}).click();
  assert.match(await page.locator('#prompt-result').textContent(), /population count, duration/);
  assert.equal(await page.locator('#review-panel:not([hidden])').count(), 0);
  await page.locator('#scenario-prompt').fill('8 cattle over 3 days in hot weather.');
  await page.getByRole('button', {name: 'Draft for review'}).click();
  assert.match(await page.locator('#prompt-result').textContent(), /Draft prepared from the request/);
  assert.match(await page.locator('#review-meta').textContent(), /3 days · 8 generated engine animals/);
  assert.equal(await page.locator('#results:not([hidden])').count(), 0);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 0);
  await page.locator('#scenario-prompt').fill('Compare supplement levels 0.5 kg DM/head/day, 1 kg DM/head/day, and 1.5 kg DM/head/day for 9 cattle over 3 days in hot weather.');
  assert.equal(await page.locator('#review-panel:not([hidden])').count(), 0);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 0);
  await page.locator('#scenario-prompt').fill('Compare supplement levels 0.5 kg DM/head/day, 1 kg DM/head/day, and 1.5 kg DM/head/day for 8 cattle over 3 days in hot weather.');
  await page.getByRole('button', {name: 'Draft for review'}).click();
  await page.locator('#review-state').getByText(/Requires confirmation/).waitFor();

  await page.locator('#scenario-form [name="animalCount"]').fill('8');
  await page.locator('#scenario-form [name="durationDays"]').fill('3');
  await page.locator('[name="alternativeLevels"]').fill('1.0, 1.5');
  assert.equal(await page.locator('#review-panel:not([hidden])').count(), 0);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 0);
  await page.getByRole('button', {name: /Review scenarios/}).click();
  assert.equal(await page.locator('#scenario-list article').count(), 3);
  assert.match(await page.locator('#resource-budget').textContent(), /Estimated result JSON .* KiB/);
  assert.match(await page.locator('#review-meta').textContent(), /3 days · 8 generated engine animals/);
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 1);
  assert.match(await page.locator('#review-state').textContent(), /Completed · reproducible/);
  assert.match(await page.locator('#prompt-result').textContent(), /illustrative FarmEngine outputs/);
  assert.match(await page.locator('#run-meta').textContent(), /3 scenarios/);
  assert.equal(await page.locator('#scenario-legend span').count(), 3);
  assert.equal(await page.locator('#scenario-population [role="gridcell"]').count(), 8);
  await page.locator('#result-day').fill('1');
  await page.locator('#population-scenario').selectOption('alternative-2');
  await page.locator('#scenario-population [role="gridcell"]').first().click();
  assert.match(await page.locator('#animal-detail').textContent(), /Animal 1/);
  await page.locator('#scenario-population [role="gridcell"]').first().focus();
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('#animal-detail').textContent(), /Animal 2/);
  assert.equal(await page.locator('#scenario-population [aria-selected="true"]').count(), 1);
  await page.emulateMedia({reducedMotion: 'reduce'});
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  assert.equal(await page.locator('#scenario-population [role="gridcell"]').first().evaluate(cell => getComputedStyle(cell).transitionDuration), '0s');
  await page.screenshot({path: 'docs/evidence/product-v3-scenario-lab-results.png', fullPage: true});
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', {name: /Export manifest \+ results/}).click(),
  ]);
  const downloadedPath = await download.path();
  const downloadedArchive = JSON.parse(await (await import('node:fs/promises')).readFile(downloadedPath, 'utf8'));
  assert.equal(downloadedArchive.type, 'riose-scenario-lab-archive');
  assert.equal(downloadedArchive.provenance.confirmedManifestSha256, downloadedArchive.provenance.executedManifestSha256);
  assert.equal(downloadedArchive.provenance.scientificModel.status, 'not-used');
  assert.equal(downloadedArchive.request.relationship, 'manual-revision');
  await page.locator('#manifest-file').setInputFiles({name: 'tampered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({...downloadedArchive, results: {...downloadedArchive.results, seed: downloadedArchive.results.seed + 1}}))});
  await page.locator('#lab-status').getByText(/Could not open saved experiment/).waitFor();
  assert.match(await page.locator('#review-state').textContent(), /Import rejected/);
  assert.equal(await page.locator('#review-panel:not([hidden])').count(), 0);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 1);
  const legacyArchive = {manifest: downloadedArchive.manifest, results: downloadedArchive.results};
  await page.locator('#manifest-file').setInputFiles({name: 'legacy-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacyArchive))});
  await page.locator('#lab-status').getByText(/Saved manifest loaded/).waitFor();
  assert.equal(await page.locator('#results:not([hidden])').count(), 0);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 1);
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 2);
  await page.locator('#manifest-file').setInputFiles(downloadedPath);
  await page.locator('#lab-status').getByText(/Archive hashes verified/).waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 2);
  assert.equal(await page.locator('#results:not([hidden])').count(), 0);
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 3);
  assert.match(await page.locator('#run-meta').textContent(), /3 scenarios/);
  const [replayDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', {name: /Export manifest \+ results/}).click(),
  ]);
  const replayedArchive = JSON.parse(await (await import('node:fs/promises')).readFile(await replayDownload.path(), 'utf8'));
  assert.equal(replayedArchive.provenance.resultsSha256, downloadedArchive.provenance.resultsSha256);
  assert.equal(await page.evaluate(() => window.__scenarioWorkerPosts.length), 3);

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
  assert.match(await page.locator('#br-corte-provenance').textContent(), /published-equation-with-external-validation; no Riose-specific calibration/);
  assert.doesNotMatch(await page.locator('#br-corte-provenance').textContent(), /registry evidence status demonstrative/);
  await page.locator('#br-corte-sensitivity-form [name="minimumSupplement"]').fill('0.5');
  await page.locator('#br-corte-sensitivity-form [name="maximumSupplement"]').fill('2');
  await page.locator('#br-corte-sensitivity-form [name="sweepStep"]').fill('0.25');
  await page.getByRole('button', {name: 'Review sensitivity'}).click();
  assert.equal(await page.locator('#br-corte-sensitivity-review:not([hidden])').count(), 1);
  assert.equal(await page.locator('#br-corte-sensitivity-review-list article').count(), 4);
  assert.equal(await page.locator('#br-corte-sensitivity-results:not([hidden])').count(), 0);
  await page.getByRole('button', {name: 'Calculate sensitivity'}).click();
  await page.locator('#br-corte-sensitivity-results:not([hidden])').waitFor();
  assert.equal(await page.locator('#br-corte-sensitivity-table-body tr').count(), 7);
  assert.match(await page.locator('#br-corte-sensitivity-table-body tr').first().textContent(), /0\.50.*6\.726/);
  assert.match(await page.locator('#br-corte-sensitivity-provenance').textContent(), /not a causal effect/);
  assert.match(await page.locator('#br-corte-sensitivity-chart').getAttribute('aria-label'), /total DMI/);
  const [sensitivityDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', {name: /Export sensitivity archive/}).click(),
  ]);
  const sensitivityArchivePath = await sensitivityDownload.path();
  const sensitivityArchive = JSON.parse(await (await import('node:fs/promises')).readFile(sensitivityArchivePath, 'utf8'));
  assert.equal(sensitivityArchive.type, 'riose-br-corte-dmi-sensitivity-archive');
  assert.equal(sensitivityArchive.provenance.seed, null);
  assert.equal(sensitivityArchive.provenance.modelId, 'br-corte-2023-eq-2.6');
  assert.equal(sensitivityArchive.provenance.resultsSha256.length, 64);
  const alteredSensitivity = structuredClone(sensitivityArchive);
  alteredSensitivity.results.rows[0].totalDmiKgDMPerHeadPerDay += 1;
  await page.locator('#br-corte-file').setInputFiles({name: 'altered-sensitivity.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(alteredSensitivity))});
  await page.getByText(/Could not open saved BR-CORTE experiment/).waitFor();
  assert.equal(await page.locator('#br-corte-sensitivity-table-body tr').count(), 7, 'invalid archive must not replace the already calculated result');
  await page.locator('#br-corte-file').setInputFiles(sensitivityArchivePath);
  await page.getByText(/Nothing was calculated; review and explicitly replay/).waitFor();
  assert.equal(await page.locator('#br-corte-sensitivity-review:not([hidden])').count(), 1);
  assert.equal(await page.locator('#br-corte-sensitivity-results:not([hidden])').count(), 0);
  await page.getByRole('button', {name: 'Calculate sensitivity'}).click();
  await page.locator('#br-corte-sensitivity-results:not([hidden])').waitFor();
  await page.getByText(/Sensitivity replay matches the saved results exactly/).waitFor();
  await page.waitForTimeout(5100);
  await page.screenshot({path: 'docs/evidence/product-v4-br-corte-sensitivity-desktop.png', fullPage: true});
  await page.locator('#br-corte-sensitivity-form [name="minimumSupplement"]').fill('0.75');
  assert.equal(await page.locator('#br-corte-sensitivity-review:not([hidden])').count(), 0);
  assert.equal(await page.locator('#br-corte-sensitivity-results:not([hidden])').count(), 0);
  await page.getByRole('button', {name: 'Review sensitivity'}).click();
  assert.equal(await page.locator('#br-corte-sensitivity-results:not([hidden])').count(), 0);
  await page.getByRole('button', {name: 'Calculate sensitivity'}).click();
  await page.locator('#br-corte-sensitivity-results:not([hidden])').waitFor();
  await page.getByRole('button', {name: /Review BR-CORTE scenarios/}).click();
  await page.getByRole('button', {name: 'Calculate conditional estimates'}).click();
  await page.locator('#br-corte-results:not([hidden])').waitFor();
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
  await page.locator('#lab-status').getByText(/Scenario run cancelled/).waitFor();
  assert.equal(await page.locator('#results:not([hidden])').count(), 0);
  assert.deepEqual(errors, []);
  const mobile = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 1});
  await mobile.goto('http://127.0.0.1:8000/scenario-lab.html', {waitUntil: 'networkidle'});
  const dimensions = await mobile.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
  assert.ok(dimensions.scroll <= dimensions.client, `mobile horizontal overflow: ${JSON.stringify(dimensions)}`);
  const navLinkHeights = await mobile.locator('.topbar nav a').evaluateAll(links => links.map(link => Math.round(link.getBoundingClientRect().height)));
  assert.ok(navLinkHeights.every(height => height <= 28), `mobile navigation links should stay on one line: ${JSON.stringify(navLinkHeights)}`);
  await mobile.locator('[name="bodyWeightKg"]').fill('400');
  await mobile.locator('[name="adgKgPerDay"]').fill('0.5');
  await mobile.locator('[name="animalCount"]').last().fill('200');
  await mobile.locator('[name="durationDays"]').last().fill('30');
  await mobile.locator('#br-corte-sensitivity-form [name="minimumSupplement"]').fill('0.5');
  await mobile.locator('#br-corte-sensitivity-form [name="maximumSupplement"]').fill('2');
  await mobile.locator('#br-corte-sensitivity-form [name="sweepStep"]').fill('0.25');
  await mobile.getByRole('button', {name: 'Review sensitivity'}).click();
  await mobile.getByRole('button', {name: 'Calculate sensitivity'}).click();
  await mobile.locator('#br-corte-sensitivity-results:not([hidden])').waitFor();
  const sensitivityFormColumns = await mobile.locator('.sensitivity-fields').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  assert.equal(sensitivityFormColumns, 1);
  const sensitivityMobileControls = await mobile.locator('#br-corte-sensitivity-form button').evaluate(button => ({height: button.getBoundingClientRect().height, labelFont: parseFloat(getComputedStyle(button.closest('form').querySelector('label')).fontSize)}));
  assert.ok(sensitivityMobileControls.height >= 42, `mobile sensitivity button target is too small: ${JSON.stringify(sensitivityMobileControls)}`);
  assert.ok(sensitivityMobileControls.labelFont >= 12, `mobile sensitivity labels are too small: ${JSON.stringify(sensitivityMobileControls)}`);
  const resultDimensions = await mobile.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
  assert.ok(resultDimensions.scroll <= resultDimensions.client, `mobile sensitivity overflow: ${JSON.stringify(resultDimensions)}`);
  await mobile.waitForTimeout(5100);
  await mobile.screenshot({path: 'docs/evidence/product-v4-br-corte-sensitivity-mobile.png', fullPage: true});
  await mkdir('docs/evidence', {recursive: true});
  console.log(JSON.stringify({scenarioCount: 3, animalCount: 8, selectedDay: 1, cancellation: 'passed', sensitivityPoints: 7, mobile: dimensions, mobileSensitivity: resultDimensions, sensitivityFormColumns, consoleErrors: errors}));
} finally {
  await browser.close();
}
