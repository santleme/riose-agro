import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterAdultCperRows, parseAdultCperCsv, parseCgrecCsv, parseHpgrsCsv, parseRothamstedCattleCsv, parseRothamstedHerbageCsv, summarizeAdultCperRows} from '../adult-data-model.js';
import {createServer} from '../server.js';

const csv = readFileSync(new URL('../data/usda-cper/period.csv', import.meta.url), 'utf8');

test('USDA adult explorer parses every animal-period row with observed ADG and grazing measures', async () => {
  const rows = parseAdultCperCsv(csv);
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map(row => row.eartag)).size, 33);
  assert.deepEqual([...new Set(rows.map(row => row.year))].sort(), [2019, 2020]);
  assert.ok(rows.every(row => Number.isFinite(row.adg) && Number.isFinite(row.bout) && Number.isFinite(row.hours) && Number.isFinite(row.turnAngle) && Number.isFinite(row.velocity)));
  assert.equal(rows[0].adg, 1.25745098);
  assert.equal(rows[0].paddock, '19N');
  assert.equal(rows[0].turnAngle, 32.74462376);
  assert.equal(filterAdultCperRows(rows).length, 36);
  const periodOne = filterAdultCperRows(rows, {period: 1});
  assert.equal(periodOne.length, 9);
  assert.equal(new Set(periodOne.map(row => row.eartag)).size, 9);
  assert.deepEqual(summarizeAdultCperRows(periodOne), {
    records: 9, uniqueAnimals: 9, uniquePaddocks: ['19N', '22W', '23E'], years: [2019], periods: [1],
  });
  const paddock15E = filterAdultCperRows(rows, {paddock: '15E'});
  assert.equal(paddock15E.length, 6);
  assert.equal(new Set(paddock15E.map(row => row.eartag)).size, 5);
  assert.equal(filterAdultCperRows(rows, {period: '1', paddock: '15E'}).length, 0);

  const dailyText = readFileSync(new URL('../data/usda-cper/daily.csv', import.meta.url), 'utf8');
  const {parseDailyCperCsv} = await import('../adult-data-model.js');
  const daily = parseDailyCperCsv(dailyText);
  assert.equal(daily.length, 644);
  assert.ok(daily.every(row => Number.isFinite(row.turnAngle)));
  assert.equal(daily[0].turnAngle, 49.29458395);
  const page = readFileSync(new URL('../adult-data.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../adult-data.js', import.meta.url), 'utf8');
  const association = JSON.parse(readFileSync(new URL('../docs/evidence/usda-cper-association.json', import.meta.url), 'utf8'));
  const caseSpec = readFileSync(new URL('../docs/caso-zootecnico-demonstrativo.md', import.meta.url), 'utf8');
  const reviewBrief = readFileSync(new URL('../docs/revisao-independente-caso.md', import.meta.url), 'utf8');
  assert.match(page, /Ângulo médio de giro/);
  assert.match(page, /MeanTA/);
  assert.match(page, /Associação observada neste estudo/);
  assert.match(page, /ρ parcial ajustado/);
  assert.match(page, /id="association-takeaway"/);
  assert.match(page, /id="period-filter"/);
  assert.match(page, /id="paddock-filter"/);
  assert.match(page, /a equivalência da categoria <em>yearling<\/em>.*aguarda parecer zootécnico independente/);
  assert.match(page, /href="docs\/revisao-independente-caso\.md"/);
  assert.match(page, /efeitos aditivos de período e piquete/);
  assert.match(page, /totais de registros animal-período\/animais únicos/);
  assert.match(script, /turnAngle/);
  assert.match(script, /usda-cper-association\.json/);
  assert.match(script, /groupedEstimate/);
  assert.match(script, /intervalsIncludeZero/);
  assert.match(script, /populateFilterOptions/);
  assert.match(script, /não um efeito causal nem uma faixa de previsão do motor/);
  assert.ok(association.features.MeanVelo.withinPastureDescriptiveAssociations['15E'].nAnimalPeriods === 6);
  assert.ok(association.features.MeanVelo.withinPastureDescriptiveAssociations['15E'].nUniqueAnimals === 5);
  assert.ok(association.features.GBD_5min.spearmanRho < 0);
  assert.ok(association.features.MeanVelo.spearmanRho > 0);
  for (const feature of Object.values(association.features)) {
    const sensitivity = feature.adjustedFixedEffectsRankSensitivity;
    assert.equal(sensitivity.bootstrapReplicates, 5000);
    assert.equal(sensitivity.adjustment, 'Additive fixed effects for 60dADG_INT and Pasture, applied to within-sample average ranks');
    assert.ok(sensitivity.animalClusterBootstrap95PercentileInterval[0] < 0);
    assert.ok(sensitivity.animalClusterBootstrap95PercentileInterval[1] > 0);
  }
  assert.match(caseSpec, /MeanTA.*indicadores adicionais, não novas hipóteses primárias/);
  assert.match(reviewBrief, /MeanTA.*graus/);
  assert.match(caseSpec, /Fatores mantidos constantes por desenho.*Nenhum fator foi controlado experimentalmente/s);
  assert.match(caseSpec, /Fatores variáveis e confundimento potencial/);
  assert.match(caseSpec, /Covariáveis não disponíveis para ajuste individual/);
  assert.match(reviewBrief, /Nenhum fator foi mantido constante por atribuição experimental/);
  assert.match(reviewBrief, /não identifica efeito causal/);
});

test('adult observed-data explorer is linked from project pages and served with its local dataset', () => {
  for (const path of ['../adult-data.html', '../adult-data.js', '../adult-data.css', '../adult-data-model.js']) {
    assert.ok(readFileSync(new URL(path, import.meta.url), 'utf8').length > 0);
  }
  const home = readFileSync(new URL('../home.html', import.meta.url), 'utf8');
  const calves = readFileSync(new URL('../observed-data.html', import.meta.url), 'utf8');
  const farm = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(home, /adult-data\.html/);
  assert.match(calves, /adult-data\.html/);
  assert.match(farm, /adult-data\.html/);
  const adultPage = readFileSync(new URL('../adult-data.html', import.meta.url), 'utf8');
  assert.match(adultPage, /novilhos de um ano/);
  assert.match(adultPage, /yearlings/);
});

test('USDA CGREC parser preserves observed animal-season IDs, missing ADG, and converts pounds to kg', () => {
  const bytes = readFileSync(new URL('../data/usda-cgrec-longterm/Streeter-ND_1989-2015_compiled.csv', import.meta.url));
  const rows = parseCgrecCsv(bytes.toString('latin1'));
  assert.equal(rows.length, 4705);
  assert.equal(rows.filter(row => Number.isFinite(row.adgKg)).length, 4610);
  assert.equal(rows.filter(row => !Number.isFinite(row.adgKg)).length, 95);
  assert.equal(rows[0].recordId, '25');
  assert.equal(rows[0].year, 1989);
  assert.equal(rows[0].treatment, 'Light');
  assert.ok(Math.abs(rows[0].adgKg - (2.28 / 2.2046226218)) < 1e-12);
  const duplicateTag = rows.filter(row => row.year === 1999 && row.tag === '8473');
  assert.deepEqual(duplicateTag.map(row => row.recordId), ['1666', '1667']);
  assert.notEqual(duplicateTag[0].initialWeightKg, duplicateTag[1].initialWeightKg);
  assert.ok(Number.isNaN(rows.find(row => !Number.isFinite(row.adgKg)).adgKg));
  const page = readFileSync(new URL('../cgrec-data.html', import.meta.url), 'utf8');
  assert.match(page, /diferenças brutas entre manejos como estimativa causal/);
  assert.match(page, /manifesto local com checksums/);
});

test('USDA HPGRS parser preserves missing tags and derives ADG from kg gain and days', () => {
  const text = readFileSync(new URL('../data/usda-hpgrs-1982-2022/EastUnit_LTGI.csv', import.meta.url), 'utf8');
  const rows = parseHpgrsCsv(text);
  assert.equal(rows.length, 1018);
  assert.equal(new Set(rows.map(row => row.year)).size, 38);
  assert.equal(rows.filter(row => !row.tag).length, 495);
  assert.equal(rows.filter(row => Number.isFinite(row.adgKgPerDay)).length, 1018);
  assert.equal(rows[0].treatment, 'CH');
  assert.equal(rows[0].stockingRateAuDaysHa, 39.6);
  assert.ok(Math.abs(rows[0].adgKgPerDay - 69.916 / 117) < 1e-12);
  const page = readFileSync(new URL('../hpgrs-data.html', import.meta.url), 'utf8');
  assert.match(page, /BOVINOS DE UM ANO/);
  assert.match(page, /não representa vacas adultas/);
  assert.match(page, /brinco está ausente em 495 linhas/);
  assert.match(page, /[Nn]ão valida as saídas/);
});

test('Rothamsted explorer parses public animal-period and plot-level forage files separately', () => {
  const cattleText = readFileSync(new URL('../data/rothamsted/Cattle_LWt_collated_2018-2025.csv', import.meta.url), 'utf8');
  const forageText = readFileSync(new URL('../data/rothamsted/2018-2025_Pasture_DM_herbage_mass.csv', import.meta.url), 'utf8');
  const cattle = parseRothamstedCattleCsv(cattleText);
  const forage = parseRothamstedHerbageCsv(forageText);

  assert.equal(cattle.length, 2362);
  assert.equal(new Set(cattle.map(row => row.animal)).size, 248);
  assert.ok(cattle.every(row => row.elapsedDays > 0 && row.ageAtStartDays >= 0 && Number.isFinite(row.adg) && Number.isFinite(row.startWeight) && Number.isFinite(row.endWeight)));
  assert.equal(cattle[0].weightChange, 24);
  assert.equal(cattle[0].ageAtStartDays, 243);
  assert.equal(cattle[0].adg, 0.96);
  assert.ok(forage.length > 1000);
  assert.deepEqual(new Set(forage.map(row => row.plot)), new Set(['C1','C2','C3','T1','T2','T3']));
  const incompleteCattle = parseRothamstedCattleCsv(cattleText.replace(',0.96', ','));
  const incompleteForage = parseRothamstedHerbageCsv(forageText.replace(',2787', ','));
  assert.ok(Number.isNaN(incompleteCattle[0].adg));
  assert.ok(Number.isNaN(incompleteForage[0].biomass));

  const page = readFileSync(new URL('../rothamsted-data.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../rothamsted-data.js', import.meta.url), 'utf8');
  assert.match(page, /CC BY 4\.0/);
  assert.match(page, /a coorte não representa vacas adultas maduras/);
  assert.match(page, /USDA \/ CPER/);
  assert.match(page, /não valida/);
  assert.match(script, /parseRothamstedCattleCsv/);
  assert.match(script, /parseRothamstedHerbageCsv/);
});

test('the local app server serves the adult explorers and their approved public CSV snapshots', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, contentType] of [
    ['/adult-data.html', 'text/html'], ['/adult-data.css', 'text/css'], ['/observed-data.css', 'text/css'],
    ['/observed-data.html', 'text/html'], ['/observed-data.js', 'text/javascript'],
    ['/observed-data-model.js', 'text/javascript'], ['/data/observed-calves-zenodo-7251167.json', 'application/json'],
    ['/favicon.svg', 'image/svg\\+xml'],
    ['/rothamsted-data.html', 'text/html'],
    ['/adult-data-model.js', 'text/javascript'], ['/rothamsted-data.js', 'text/javascript'],
    ['/cgrec-data.html', 'text/html'], ['/cgrec-data.js', 'text/javascript'],
    ['/hpgrs-data.html', 'text/html'], ['/hpgrs-data.js', 'text/javascript'],
    ['/data/usda-cper/daily.csv', 'text/csv'],
    ['/docs/evidence/usda-cper-association.json', 'application/json'],
    ['/docs/evidence/engine-adg-usda-cper-ltgi-check.json', 'application/json'],
    ['/docs/evidence/engine-adg-usda-cgrec-transport-check.json', 'application/json'],
    ['/docs/evidence/engine-adg-zenodo-cows-check.json', 'application/json'],
    ['/data/usda-cgrec-longterm/Streeter-ND_1989-2015_compiled.csv', 'text/csv'],
    ['/data/usda-cgrec-longterm/manifest.json', 'application/json'],
    ['/data/usda-hpgrs-1982-2022/EastUnit_LTGI.csv', 'text/csv'],
    ['/data/usda-hpgrs-1982-2022/EastUnit_LTGI_DataDictionary.csv', 'text/csv'],
    ['/data/usda-hpgrs-1982-2022/manifest.json', 'application/json'],
    ['/data/rothamsted/Cattle_LWt_collated_2018-2025.csv', 'text/csv'],
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(contentType));
    assert.ok((await response.text()).length > 0, path);
  }
});
