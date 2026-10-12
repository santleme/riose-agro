import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createServer} from '../server.js';

test('public Grass-Cast audit verifies provenance and keeps aggregate tables separate', () => {
  execFileSync('npm', ['run', 'audit:usda-grasscast'], {stdio: 'ignore'});
  const report = JSON.parse(readFileSync(new URL('../docs/evidence/usda-grasscast-audit.json', import.meta.url), 'utf8'));
  assert.equal(report.classification, 'public_observational_group_and_site_level_context_only_not_engine_validation');
  assert.equal(report.cattleWeightGains.rows, 942);
  assert.equal(report.cattleWeightGains.missingMeanDailyGainRows, 195);
  assert.equal(report.cattleWeightGains.hasIndividualAnimalIdentifier, false);
  assert.equal(report.cattleWeightGains.cper.rows, 243);
  assert.equal(report.cattleWeightGains.cper.nonmissingMeanDailyGainRows, 219);
  assert.equal(report.anpp.cperRows, 243);
  assert.equal(report.ndvi.cperRows, 55);
  assert.deepEqual(report.cperGroupJoin.key, ['site=CPER', 'year', 'grazing.treatment']);
  assert.equal(report.cperGroupJoin.matchedGroupKeys, 243);
  assert.equal(report.cperGroupJoin.weightKeysWithoutAnpp, 0);
  assert.equal(report.cperGroupJoin.anppKeysWithoutWeight, 0);
  assert.equal(report.cperGroupJoin.matchedRowsWithBothAdgAndAnpp, 136);
  assert.equal(report.cperGroupJoin.individualAnimalRecords, false);
  assert.equal(Object.keys(report.source.files).length, 4);
  assert.ok(report.interpretation.some(text => text.includes('cannot validate individual engine outputs')));
});

test('Grass-Cast group association is reproducible and absorbs year and treatment', () => {
  execFileSync('npm', ['run', 'analyze:usda-grasscast-association'], {stdio: 'ignore'});
  const report = JSON.parse(readFileSync(new URL('../docs/evidence/usda-grasscast-cper-association.json', import.meta.url), 'utf8'));
  assert.equal(report.classification, 'public_observational_group_level_association_not_causal_not_engine_validation');
  assert.equal(report.completeCases.n, 136);
  assert.equal(report.completeCases.years, 48);
  assert.equal(report.completeCases.yearsWithThreeTreatments, 43);
  assert.equal(report.descriptiveResults.pValue, null);
  assert.equal(report.descriptiveResults.confidenceInterval, null);
  assert.ok(Math.abs(report.descriptiveResults.rawPearsonR - 0.4136208416) < 1e-9);
  assert.ok(Math.abs(report.descriptiveResults.fixedEffects.residualPearsonR - (-0.0879196096)) < 1e-9);
  assert.match(report.interpretation.join(' '), /not validation|not validation/i);
});

test('Grass-Cast explorer and its normalized CPER data are served locally', async t => {
  const server = createServer({env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, type] of [
    ['/grasscast-data.html', 'text/html'],
    ['/grasscast-data.js', 'text/javascript'],
    ['/grasscast-data.css', 'text/css'],
    ['/data/usda-grasscast/manifest.json', 'application/json'],
    ['/data/usda-grasscast/cper-grouped-observations.json', 'application/json'],
    ['/docs/evidence/usda-grasscast-cper-association.json', 'application/json'],
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(type));
  }
  const page = await (await fetch(`${base}/grasscast-data.html`)).text();
  const adult = await (await fetch(`${base}/adult-data.html`)).text();
  const data = await (await fetch(`${base}/data/usda-grasscast/cper-grouped-observations.json`)).json();
  assert.match(page, /136 têm ambos os valores numéricos/);
  assert.match(page, /não estima efeito causal/);
  assert.match(page, /adjusted-summary/);
  assert.match(adult, /grasscast-data\.html/);
  assert.equal(data.observations.length, 243);
  assert.equal(data.ndviObservations.length, 55);
  const association = await (await fetch(`${base}/docs/evidence/usda-grasscast-cper-association.json`)).json();
  assert.equal(association.completeCases.n, 136);
});
