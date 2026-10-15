import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer, validateSnapshotReviewRequest} from '../src/server/server.js';
import {FarmEngine, createComparisonManifest} from '../src/client/engine.js';
import {linkFarmSnapshotToManifest} from '../src/client/snapshot-manifest-link.js';

const snapshotExample = JSON.parse(readFileSync(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json', import.meta.url), 'utf8'));

test('snapshot review distinguishes a valid observed slice from simulation eligibility', () => {
  const report = validateSnapshotReviewRequest({snapshot: snapshotExample});
  assert.equal(report.status, 200);
  assert.equal(report.body.schemaValid, true);
  assert.equal(report.body.semanticValid, true);
  assert.equal(report.body.valid, true);
  assert.equal(report.body.simulationEligible, false);
  assert.equal(report.body.eligibilityStatus, 'not-applicable');
  assert.equal(report.body.coverage.animalCount, 1);
  assert.equal(report.body.coverage.paddockCount, 1);
  assert.ok(report.body.coverage.evidenceFieldsByStatus.observed > 0);
  assert.equal(report.body.coverage.sources.length, 2);
  assert.match(report.body.blockers.join(' '), /recorte observacional/i);
  assert.deepEqual(report.body.missingRequiredFields, []);
});

test('snapshot review checks the exact linked manifest bytes and never upgrades eligibility', () => {
  const source = structuredClone(snapshotExample);
  source.snapshotKind = 'farm-baseline';
  source.simulationEligibility.status = 'review-pending';
  const manifestBytes = Buffer.from(JSON.stringify(createComparisonManifest(new FarmEngine(17, 5).snapshot(), 30)));
  const linked = linkFarmSnapshotToManifest(source, manifestBytes);
  const report = validateSnapshotReviewRequest({snapshot: linked, manifestBase64: manifestBytes.toString('base64')});
  assert.equal(report.body.manifestReferenceChecked, true);
  assert.equal(report.body.manifestReferenceValid, true);
  assert.equal(report.body.valid, true);
  assert.equal(report.body.simulationEligible, false);

  const changedBytes = Buffer.concat([manifestBytes, Buffer.from(' ')]);
  const mismatch = validateSnapshotReviewRequest({snapshot: linked, manifestBase64: changedBytes.toString('base64')});
  assert.equal(mismatch.body.manifestReferenceValid, false);
  assert.equal(mismatch.body.valid, false);
  assert.ok(mismatch.body.errors.some(error => error.includes('SHA-256')));
  assert.equal(linked.manifestReference.sha256, createHash('sha256').update(manifestBytes).digest('hex'));
});

test('CLI and API both reject a digest-matching but invalid comparison manifest', () => {
  const snapshot = structuredClone(snapshotExample);
  snapshot.snapshotKind = 'farm-baseline';
  snapshot.simulationEligibility.status = 'review-pending';
  const invalidManifest = createComparisonManifest(new FarmEngine(17, 5).snapshot(), 30);
  invalidManifest.periodDays = 0;
  const manifestBytes = Buffer.from(JSON.stringify(invalidManifest));
  snapshot.manifestReference = {
    status: 'linked',
    type: invalidManifest.type,
    version: invalidManifest.version,
    sha256: createHash('sha256').update(manifestBytes).digest('hex'),
  };

  const apiReport = validateSnapshotReviewRequest({snapshot, manifestBase64: manifestBytes.toString('base64')}).body;
  assert.equal(apiReport.manifestReferenceChecked, true);
  assert.equal(apiReport.manifestReferenceValid, false);
  assert.ok(apiReport.errors.some(error => error.includes('Manifesto de comparação inválido')));

  const directory = mkdtempSync(join(tmpdir(), 'agroville-invalid-manifest-'));
  try {
    const snapshotPath = join(directory, 'snapshot.json');
    const manifestPath = join(directory, 'manifest.json');
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
    writeFileSync(manifestPath, manifestBytes);
    const scriptPath = new URL('../scripts/validation/validate-farm-snapshot.js', import.meta.url);
    const run = spawnSync(process.execPath, [scriptPath.pathname, snapshotPath, '--manifest', manifestPath], {encoding: 'utf8'});
    assert.equal(run.status, 1, run.stderr);
    const cliReport = JSON.parse(run.stdout);
    assert.equal(cliReport.manifestReferenceChecked, true);
    assert.equal(cliReport.manifestReferenceValid, false);
    assert.ok(cliReport.errors.some(error => error.includes('Manifesto de comparação inválido')));
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('snapshot review endpoint validates locally and review assets are served', async t => {
  const server = createServer({env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(`${root}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Revisar snapshot da fazenda/);
  const reviewScript = await fetch(`${root}/src/client/snapshot-review.js`);
  assert.equal(reviewScript.status, 200);
  const schema = await fetch(`${root}/schemas/farm-snapshot.schema.json`);
  assert.equal(schema.status, 200);
  const invalidContentType = await fetch(`${root}/api/validate-snapshot`, {method: 'POST', body: JSON.stringify({snapshot: snapshotExample})});
  assert.equal(invalidContentType.status, 415);

  const response = await fetch(`${root}/api/validate-snapshot`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({snapshot: snapshotExample}),
  });
  const report = await response.json();
  assert.equal(response.status, 200);
  assert.equal(report.valid, true);
  assert.equal(report.simulationEligible, false);
  assert.equal(report.coverage.sources.length, 2);
});

test('outcome record page is served as a local-only flow from the map', async t => {
  const server = createServer({env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(`${root}/outcome-review.html`);
  assert.equal(page.status, 200);
  const pageText = await page.text();
  assert.match(pageText, /Vincule uma medição posterior/);
  assert.match(pageText, /Sem calibração suficiente/);
  assert.match(pageText, /não valida nem recalibra o motor/);
  assert.match(pageText, /id="snapshot-file"/);
  assert.match(pageText, /Lote do snapshot/);
  assert.match(pageText, /Adicionar outra métrica/);
  assert.match(pageText, /data-field="periodDays" type="number"/);
  assert.doesNotMatch(pageText, /data-field="periodDays"[^>]*readonly/i);
  assert.doesNotMatch(pageText, /<form[^>]+action=/i);
  const map = await fetch(`${root}/`);
  assert.match(await map.text(), /Registrar resultado/);

  const script = await fetch(`${root}/src/client/outcome-review.js`);
  assert.equal(script.status, 200);
  const scriptText = await script.text();
  assert.doesNotMatch(scriptText, /\/api\//);
  assert.doesNotMatch(scriptText, /localStorage|sessionStorage/);
  assert.match(scriptText, /archive\.comparison\?\.validated !== false/);
  assert.equal((await fetch(`${root}/src/client/outcome-review.css`)).status, 200);
  assert.equal((await fetch(`${root}/src/client/snapshot-validator.js`)).status, 200);
  assert.equal((await fetch(`${root}/schemas/outcome-record.schema.json`)).status, 200);
});

test('snapshot review rejects malformed payloads and oversize uploads', async t => {
  const server = createServer({env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/validate-snapshot`;

  const invalid = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{'});
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {error: 'invalid_request'});
  const tooLarge = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({snapshot: snapshotExample, padding: 'x'.repeat(4 * 1024 * 1024)}),
  });
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(await tooLarge.json(), {error: 'request_too_large'});
});
