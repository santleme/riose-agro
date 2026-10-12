import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createServer} from '../server.js';
import {parseAllometryTsv, summarizeAllometryRows} from '../adult-cow-data-model.js';

test('Zenodo allometry audit reproduces adult-cow ADG summaries and stays exploratory', () => {
  execFileSync('npm', ['run', 'audit:zenodo-grazing-allometry'], {stdio: 'ignore'});
  const report = JSON.parse(readFileSync(new URL('../docs/evidence/zenodo-grazing-allometry-audit.json', import.meta.url), 'utf8'));
  assert.equal(report.classification, 'public_adult_cow_grazing_observations_derived_adg_exploratory_not_engine_validation');
  assert.equal(report.source.datasetDoi, '10.5281/zenodo.3707638');
  assert.equal(report.source.license, 'CC-BY-4.0');
  assert.equal(report.source.licenseSourceField, 'metadata.license.id');
  assert.equal(report.source.licenseAssessment, 'record_metadata_declares_cc_by_4_0; rendered_record_license_field_is_empty; no_independent_legal_review');
  assert.equal(report.source.recordPageLicenseDisplay, 'empty');
  assert.equal(report.source.metadataApiUrl, 'https://zenodo.org/api/records/3707638');
  assert.equal(report.data.rows, 27);
  assert.equal(report.data.columns, 45);
  assert.equal(report.data.individualIdentifierAvailable, false);
  assert.deepEqual(Object.fromEntries(Object.entries(report.data.breeds).map(([breed, value]) => [breed, value.nCows])), {AH: 9, HC: 9, OB: 9});
  assert.ok(Math.abs(report.data.breeds.AH.meanAdgKgPerCowDayDerived - (-0.5619047619)) < 1e-9);
  assert.ok(Math.abs(report.data.breeds.OB.meanAdgKgPerCowDayDerived - (-0.3063492063)) < 1e-9);
  assert.ok(Math.abs(report.data.breeds.HC.meanAdgKgPerCowDayDerived - 0.0777777778) < 1e-9);
  assert.ok(report.limitations.some(limit => /exact per-animal weighing dates are not in the file/.test(limit)));
  assert.ok(report.limitations.some(limit => /does not validate or calibrate the engine/.test(limit)));
});

test('adult-cow ADG/foraging association audit preserves missingness and breed confounding', () => {
  execFileSync('npm', ['run', 'analyze:zenodo-grazing-allometry'], {stdio: 'ignore'});
  const report = JSON.parse(readFileSync(new URL('../docs/evidence/zenodo-grazing-allometry-association.json', import.meta.url), 'utf8'));
  assert.equal(report.classification, 'exploratory_adult_cow_domain_evidence_not_engine_validation');
  assert.equal(report.population.nCows, 27);
  assert.deepEqual(report.population.nPerBreed, {AH: 9, HC: 9, OB: 9});
  assert.equal(report.outcome.horizonDaysAssumed, 70);
  assert.equal(report.associations.Speed_mean.nComplete, 24);
  assert.equal(report.associations.Speed_mean.nMissing, 3);
  assert.ok(Math.abs(report.associations.Speed_mean.pooledSpearman - (-0.4865100548)) < 1e-9);
  assert.ok(Math.abs(report.associations.Speed_mean.withinBreedCenteredRankCorrelation - 0.1868144401) < 1e-9);
  assert.equal(report.associations.Steps_mean.nComplete, 17);
  assert.equal(report.associations.Sel_evenness_mean.nMissing, 0);
  assert.ok(Math.abs(report.associations.Sel_evenness_mean.pooledSpearman - 0.6452028002) < 1e-9);
  assert.ok(Math.abs(report.associations.Sel_evenness_mean.withinBreedCenteredRankCorrelation - (-0.0056821851)) < 1e-9);
  assert.match(report.method.uncertainty, /No inferential p-values or confidence intervals/);
  assert.ok(report.limits.some(limit => /does not validate the Agroville engine/.test(limit)));
});

test('adult cow explorer preserves observed weights, explicit 70-day ADG derivation, and breed boundaries', async t => {
  const text = readFileSync(new URL('../data/zenodo-grazing-allometry/Zenodo_Data_Allometry.txt', import.meta.url), 'utf8');
  const rows = parseAllometryTsv(text);
  assert.equal(rows.length, 27);
  assert.deepEqual(Object.fromEntries(Object.entries(summarizeAllometryRows(rows)).map(([breed, summary]) => [breed, summary.n])), {AH: 9, OB: 9, HC: 9});
  assert.equal(Math.min(...rows.map(row => row.ageMonths)), 34);
  assert.equal(Math.max(...rows.map(row => row.ageMonths)), 124);
  assert.equal(rows[0].derivedAdgKgPerDay, (634 - 670) / 70);
  assert.equal(rows[0].speedMetersPerHour, null);
  assert.equal(rows[0].stepsPerHour, null);
  assert.equal(rows[0].lyingRatio, null);
  assert.equal(rows[0].spaceUseEvenness, null);
  assert.equal(rows[0].forageSelectionEvenness, 0.78);
  assert.equal(rows[0].stableAnimalId, undefined);
  const summary = summarizeAllometryRows(rows);
  assert.ok(Math.abs(summary.AH.meanDerivedAdgKgPerDay - (-0.5619047619)) < 1e-9);
  assert.ok(Math.abs(summary.OB.meanDerivedAdgKgPerDay - (-0.3063492063)) < 1e-9);
  assert.ok(Math.abs(summary.HC.meanDerivedAdgKgPerDay - 0.0777777778) < 1e-9);
  assert.deepEqual(Object.fromEntries(Object.entries(summary).map(([breed, value]) => [breed, value.publishedRoundedMeanKgPerDay])), {AH: -0.6, OB: -0.3, HC: 0.08});
  assert.ok(Math.abs(summary.AH.absoluteDifferenceFromPublishedRoundedMeanKgPerDay - 0.0380952381) < 1e-9);

  const page = readFileSync(new URL('../adult-cow-data.html', import.meta.url), 'utf8');
  const pageScript = readFileSync(new URL('../adult-cow-data.js', import.meta.url), 'utf8');
  assert.match(page, /ADG é calculado com a suposição de 70 dias/);
  assert.match(page, /não substituem o caso USDA\/CPER/);
  assert.match(page, /API do registro declara CC BY 4\.0 em <code>metadata\.license\.id<\/code>/);
  assert.match(page, /sem análise jurídica independente/);
  assert.match(page, /Não há DMI individual, custo/);
  assert.match(page, /reconciliação da média calculada com a média do artigo/);
  assert.match(page, /Pastejo e ADG derivado/);
  assert.match(page, /Uniformidade da seleção de forragem/);
  assert.match(pageScript, /ADG assume \$\{dayHorizon\} dias/);
  const reaCapture = JSON.parse(readFileSync(new URL('../docs/evidence/rea-adult-cow-browser-capture.json', import.meta.url), 'utf8'));
  assert.equal(reaCapture.authority, 'controlled-replay');
  assert.equal(reaCapture.scenario.completeness.status, 'complete');
  assert.equal(reaCapture.observed.dataRendered.rows, 27);
  assert.equal(reaCapture.observed.dom.sha256, '30adc03793816460ea0c318b6dcde244b8b178beaefcdbc2aa9d8d0922f3abf7');
  assert.equal(reaCapture.observed.dataRendered.associationCompleteRows, 24);
  assert.equal(reaCapture.observed.dataRendered.associationMissingRows, 3);
  assert.equal(reaCapture.observed.eventsCaptured, false);
  assert.equal(reaCapture.observed.dataRendered.breedMeans[0].articleRoundedKgPerDay, -0.6);
  const staticCapture = JSON.parse(readFileSync(new URL('../docs/evidence/rea-agroville-2026-10-12-static-summary.json', import.meta.url), 'utf8'));
  assert.equal(staticCapture.coverage.applicationGraph, 'complete');
  assert.equal(staticCapture.coverage.semanticGraph, 'partial');
  assert.equal(staticCapture.statistics.parseFailures, 0);
  const coreStatic = JSON.parse(readFileSync(new URL('../docs/evidence/rea-agroville-core-2026-10-12-static-summary.json', import.meta.url), 'utf8'));
  assert.equal(coreStatic.authority, 'shipped-artifact');
  assert.equal(coreStatic.graph.nodes, 13);
  assert.equal(coreStatic.graph.edges, 16);
  assert.equal(coreStatic.statistics.parseFailures, 0);
  assert.match(coreStatic.limitations.join(' '), /did not execute the worker or engine/);
  for (const [path, expected] of Object.entries(coreStatic.subject.fileSha256)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex'), expected);
  }

  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, contentType] of [
    ['/adult-cow-data.html', 'text/html'],
    ['/adult-cow-data.css', 'text/css'],
    ['/adult-cow-data.js', 'text/javascript'],
    ['/adult-cow-data-model.js', 'text/javascript'],
    ['/docs/evidence/zenodo-grazing-allometry-association.json', 'application/json'],
    ['/data/zenodo-grazing-allometry/Zenodo_Data_Allometry.txt', 'text/plain'],
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(contentType.replace('+', '\\+')));
    assert.ok((await response.text()).length > 0, path);
  }
});
