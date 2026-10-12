import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('public SDSU supplement audit derives individual DMI without treating it as CPER validation', () => {
  execFileSync('python3', ['scripts/audit_sdsu_individual_dmi.py'], {encoding: 'utf8'});
  const report = JSON.parse(readFileSync('docs/evidence/sdsu-individual-dmi-audit.json', 'utf8'));
  assert.equal(report.source.article_doi, '10.3389/fvets.2025.1625448');
  assert.equal(report.source.license, 'CC BY');
  assert.equal(report.coverage.intake_rows, 1480);
  assert.equal(report.coverage.forage_dm_samples, 18);
  assert.equal(report.coverage.dmi_derived_rows, 595);
  assert.equal(report.coverage.selected_complete_case_intake_rows, 742);
  assert.equal(report.coverage.selected_complete_case_rows_after_normalized_1_8_to_2_5_pct_bw_screen, 197);
  assert.deepEqual(report.coverage.article_complete_case_tags_found, ['167', '224', '235', '263', '313', '336', '387']);
  assert.equal(report.coverage.rows_by_record_class.aggregate_total, 106);
  assert.equal(report.coverage.rows_by_record_class.aggregate_unknown, 106);
  assert.equal(report.qualityChecks.selected_complete_case_intake_rows_without_matching_forage_period, 147);
  assert.equal(report.qualityChecks.intake_rows_with_zero_as_fed_intake, 101);
  assert.equal(report.qualityChecks.dmi_derived_zero_intake_rows, 16);
  assert.equal(report.coverage.identified_animal_rows_passing_1_8_to_2_5_pct_bw_screen_after_trimming_period_labels, 308);
  assert.equal(report.coverage.selected_complete_case_rows_passing_1_8_to_2_5_pct_bw_screen_after_trimming_period_labels, 197);
  assert.equal(report.coverage.identified_animal_rows_passing_1_8_to_2_5_pct_bw_screen_with_literal_period_labels, 259);
  assert.equal(report.coverage.selected_complete_case_rows_passing_1_8_to_2_5_pct_bw_screen_with_literal_period_labels, 160);
  assert.match(report.scope.use, /seven tags selected by the authors/);
  assert.equal(report.scope.not_valid_for.includes('validation of the USDA/CPER grazing ADG case'), true);

  const rows = readFileSync('data/sdsu-individual-dmi/individual-dmi-derived.csv', 'utf8').trim().split('\n');
  assert.equal(rows.length, 1481);
  assert.match(rows[0], /feed_type_raw,feed_period_normalized/);
  assert.equal(rows.slice(1).filter((row) => row.split(',')[4] === 'aggregate_total' || row.split(',')[4] === 'aggregate_unknown').filter((row) => row.split(',')[8].trim() !== '' || row.split(',')[12].trim() !== '').length, 0);
});
