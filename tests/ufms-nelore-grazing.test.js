import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';

test('UFMS Nelore v1 audit preserves coverage and flags ADG incompatibility', () => {
  const report = JSON.parse(execFileSync('python3', ['scripts/audit_ufms_nelore_grazing.py'], {encoding: 'utf8'}));
  assert.equal(report.source.doi, '10.17632/3wdjvxmvsp.1');
  assert.equal(report.source.articleDoi, '10.1016/j.dib.2024.110520');
  assert.equal(report.source.license, 'CC BY 4.0');
  assert.equal(report.source.sha256Verified, true);
  assert.equal(report.coverage.rows, 390);
  assert.equal(report.coverage.animals, 26);
  assert.equal(report.coverage.intervals, 15);
  assert.equal(report.coverage.animalIntervalKeys, 390);
  assert.equal(report.qualityChecks.reportedGmdVsWeightDeltaMismatches, 154);
  assert.equal(report.qualityChecks.intervalsWithAnyGmdMismatch, 6);
  assert.equal(report.qualityChecks.gemiAllNegativeAndExtreme, true);
  assert.equal(report.interpretation.engineValidation, false);
  assert.match(report.interpretation.primaryUse, /growing male Nelore/);
  assert.match(report.interpretation.releaseNote, /pinned to v1/);
});

test('UFMS frozen ADG transfer diagnostic is reproducible, animal-clustered, and kept separate from adult validation', () => {
  const path = 'docs/evidence/engine-adg-ufms-check.json';
  const before = readFileSync(path, 'utf8');
  try {
    execFileSync('node', ['scripts/audit_engine_adg_ufms.js'], {encoding: 'utf8'});
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const archived = JSON.parse(before);
    const withoutEngineProvenance = value => {
      const copy = structuredClone(value);
      delete copy.engine.sourceFiles;
      delete copy.engine.sha256;
      return copy;
    };
    assert.deepEqual(withoutEngineProvenance(report), withoutEngineProvenance(archived));
    assert.deepEqual(report.engine.sourceFiles, ['engine.js', 'feeding-model.js', 'environment-model.js', 'metabolism-wasm.js']);
    assert.notEqual(report.engine.sha256, archived.engine.sha256);
    assert.equal(report.source.license, 'CC BY 4.0');
    assert.equal(report.overall.records, 390);
    assert.equal(report.overall.animals, 26);
    assert.equal(report.engine.fitted, false);
    assert.equal(report.protocol.bootstrapReplicates, 5000);
    assert.deepEqual(report.animalClusterBootstrap95Percent.maeKgPerDay.length, 2);
    assert.equal(report.comparisonCaveats.some(item => /not mature adult cows/.test(item)), true);
    assert.equal(report.comparisonCaveats.some(item => /not calibration/.test(item)), true);
    assert.match(report.decision, /separate growing-male ADG transfer diagnostic/);
  } finally {
    writeFileSync(path, before);
  }
});
