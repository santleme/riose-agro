import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createServer} from '../src/server/server.js';

test('public USDA CGREC cow-calf cohort is reproducible, age-aware, and separate from engine validation', () => {
  execFileSync('npm', ['run', 'audit:usda-cgrec-cow-calf'], {stdio: 'ignore'});
  const report = JSON.parse(readFileSync(new URL('../docs/evidence/usda-cgrec-cow-calf-audit.json', import.meta.url), 'utf8'));
  const data = JSON.parse(readFileSync(new URL('../data/usda-cgrec-cow-calf/cow-calf-observations.json', import.meta.url), 'utf8'));
  const page = readFileSync(new URL('../usda-cgrec-cow-calf.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../src/client/usda-cgrec-cow-calf.js', import.meta.url), 'utf8');

  assert.equal(report.classification, 'public_usda_cgrec_mature_and_young_cow_grazing_observations_exploratory_not_engine_validation');
  assert.equal(report.source.doi, '10.15482/USDA.ADC/25464097');
  assert.equal(report.source.license.declared, 'CC BY-SA 4.0');
  assert.match(report.source.intendedUse, /non-commercial/i);
  assert.equal(report.files.sha256, 'f0c317adb513984ecb73499383a7d306805700cbaa4418bf8357490645f33750');
  assert.equal(report.data.records, 859);
  assert.deepEqual(report.data.years, {2018: 240, 2019: 296, 2020: 323});
  assert.deepEqual(report.data.ageClassRows, {Old: 471, Young: 388});
  assert.deepEqual(report.data.treatmentRows, {Continuous: 246, 'Patch-burn': 319, Rotational: 294});
  assert.equal(report.data.uniqueCows, 471);
  assert.equal(report.data.cowsRepeatedAcrossYears, 275);
  assert.deepEqual(report.data.pasturesByTreatment, {Continuous: 4, 'Patch-burn': 4, Rotational: 4});
  assert.equal(report.data.missingValues, 0);
  assert.equal(report.data.duplicateCowYearRows, 0);
  assert.equal(data.records.length, 859);
  assert.equal(data.sourceLicense, 'CC BY-SA 4.0');
  assert.equal(data.sourceCitation, report.source.citation);
  assert.equal(data.unit, 'cow-calf pair by study year; cows may recur across years');
  assert.equal(data.records[0].cowAdgKgPerDay, 0.3035491905354919);
  assert.equal(data.records[0].calfAdgKgPerDay, 0.9806973848069738);
  assert.ok(report.limitations.some(limit => /not the approved primary USDA\/CPER case/.test(limit)));
  assert.ok(report.limitations.some(limit => /not independent treatment replicates/.test(limit)));
  assert.ok(report.limitations.some(limit => /for validating the engine/.test(limit)));
  assert.match(page, /quatro ou mais safras de bezerros/);
  assert.match(page, /não estimam efeito causal/);
  assert.match(page, /CC BY-SA 4\.0/);
  assert.match(script, /média simples por linha, descritiva/);
});

test('server exposes the cow-calf explorer and its attributed, normalized public data', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, contentType] of [
    ['/usda-cgrec-cow-calf.html', 'text/html'],
    ['/usda-cgrec-cow-calf.css', 'text/css'],
    ['/usda-cgrec-cow-calf.js', 'text/javascript'],
    ['/data/usda-cgrec-cow-calf/cow-calf-observations.json', 'application/json'],
    ['/data/usda-cgrec-cow-calf/manifest.json', 'application/json'],
    ['/docs/evidence/usda-cgrec-cow-calf-audit.json', 'application/json'],
    ['/data/usda-cgrec-cow-calf/CentralGrasslandsFireForageNAL.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(contentType.replaceAll('+', '\\+')));
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
});
