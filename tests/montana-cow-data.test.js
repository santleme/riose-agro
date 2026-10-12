import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from '../src/server/server.js';

test('Montana cow explorer derives period ADG from the article-reported 84-day grazing period', async t => {
  const report = JSON.parse(readFileSync(new URL('../docs/evidence/mdpi-angus-cow-grazing-audit.json', import.meta.url), 'utf8'));
  const rows = JSON.parse(readFileSync(new URL('../data/mdpi-angus-cow-grazing/weight-change-observations.json', import.meta.url), 'utf8'));
  const page = readFileSync(new URL('../montana-cow-data.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../src/client/montana-cow-data.js', import.meta.url), 'utf8');
  const gpsAssociation = JSON.parse(readFileSync(new URL('../docs/evidence/mdpi-angus-gps-adg-association.json', import.meta.url), 'utf8'));
  assert.equal(rows.length, 408);
  assert.equal(new Set(rows.map(row => row.animalId)).size, 241);
  assert.equal(rows.filter(row => row.weightChangeKg === null).length, 5);
  assert.equal(rows.filter(row => row.bcsChange === null).length, 3);
  assert.equal(report.interpretation.adgDerived, true);
  assert.equal(report.interpretation.adgDerivation.periodDays, 84);
  assert.equal(report.interpretation.adgDerivation.formula, 'Tot_Wt_Ch_kg / 84');
  assert.deepEqual(report.coverage.ageFourPlusSubset, {
    ageClasses: ['4', '5-7', '8+'],
    cowSeasonRows: 218,
    uniqueCowIds: 132,
    idsRepeatedAcrossIncludedSeasons: 86,
    missingWeightChange: 2,
    missingBcsChange: 2,
    gpsCowSeasonRows: 37,
    gpsUniqueCowIds: 37,
    gpsCowDayRows: 1657,
    gpsCoverageNote: 'Table S3 GPS measurements cover the final 45 days of the grazing period; these do not span the full 84-day derived ADG horizon.',
  });
  assert.ok(rows.filter(row => row.weightChangeKg !== null).every(row => Math.abs(row.adgDerivedKgPerDay - row.weightChangeKg / 84) < 1e-12));
  assert.ok(rows.filter(row => row.weightChangeKg === null).every(row => row.adgDerivedKgPerDay === null));
  assert.match(page, /ADG médio derivado = mudança de peso publicada ÷ 84 dias/);
  assert.match(page, /permanece separada do caso principal USDA\/CPER/);
  assert.match(page, /4 anos ou mais/);
  assert.match(page, /não uma definição clínica de maturidade/);
  assert.match(page, /IDs repetidos entre anos são mantidos, portanto as linhas não são animais independentes/);
  assert.match(page, /[Nn]ão é uma série diária/);
  assert.match(script, /row\.adgDerivedKgPerDay/);
  assert.match(script, /ageFilter\.value === '4\+'/);
  assert.match(page, /Este resumo fixo usa 37 vaca-estações/);
  assert.match(page, /não acompanha os filtros da tabela acima/);
  assert.match(script, /mdpi-angus-gps-adg-association\.json/);
  assert.equal(gpsAssociation.join.matchedCowSeasons, 37);
  assert.equal(gpsAssociation.interpretation.validatesEngine, false);

  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const htmlResponse = await fetch(`${base}/montana-cow-data.html`);
  assert.equal(htmlResponse.status, 200);
  assert.match(htmlResponse.headers.get('content-type'), /text\/html/);
  const dataResponse = await fetch(`${base}/data/mdpi-angus-cow-grazing/weight-change-observations.json`);
  assert.equal(dataResponse.status, 200);
  assert.equal((await dataResponse.json()).length, 408);
  const analysisResponse = await fetch(`${base}/docs/evidence/mdpi-angus-gps-adg-association.json`);
  assert.equal(analysisResponse.status, 200);
  assert.equal((await analysisResponse.json()).join.cowDays, 1657);
});
