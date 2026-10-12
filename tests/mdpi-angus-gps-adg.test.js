import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('Montana GPS and derived ADG association is reproducible and year-stratified', () => {
  const output = JSON.parse(execFileSync('python3', ['scripts/analyze_mdpi_angus_gps_adg.py'], {encoding: 'utf8'}));
  const saved = JSON.parse(readFileSync(new URL('../docs/evidence/mdpi-angus-gps-adg-association.json', import.meta.url), 'utf8'));
  const reviewBrief = readFileSync(new URL('../docs/revisao-independente-caso.md', import.meta.url), 'utf8');
  assert.deepEqual(output, saved);
  assert.equal(output.source.supplementSha256Verified, true);
  assert.equal(output.join.matchedCowSeasons, 37);
  assert.equal(output.join.uniqueCowIds, 37);
  assert.equal(output.join.cowDays, 1657);
  assert.deepEqual(output.join.rowsByYear, {2018: 18, 2019: 19});
  assert.deepEqual(output.join.gpsDaysPerCowSeason, {min: 30, mean: 44.784, max: 49});
  assert.equal(output.association.pooled.grazingHours.spearmanRho, 0.178821);
  assert.equal(output.association.pooled.distanceKm.spearmanRho, 0.123325);
  assert.equal(output.association.byYear['2018'].grazingHours.spearmanRho, -0.06615);
  assert.equal(output.association.byYear['2019'].grazingHours.spearmanRho, 0.014925);
  assert.equal(output.association.byYear['2018'].distanceKm.spearmanRho, 0.143669);
  assert.equal(output.association.byYear['2019'].distanceKm.spearmanRho, -0.000878);
  assert.equal(output.method.pValues, 'Not calculated or reported.');
  assert.equal(output.interpretation.causalInference, false);
  assert.equal(output.interpretation.validatesEngine, false);
  assert.equal(output.interpretation.uncertaintyCalibration, false);
  assert.match(reviewBrief, /Checagem exploratória de ADG derivada e GPS na coorte Montana/);
  assert.match(reviewBrief, /não inferir causalidade, previsão, validade do motor/);
});
