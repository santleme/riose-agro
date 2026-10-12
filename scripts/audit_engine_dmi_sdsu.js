#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {predictDefaultBarnDmiKgPerDay} from './audit_engine_dmi_mendeley.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const INPUT = resolve(ROOT, 'data/sdsu-individual-dmi/individual-dmi-derived.csv');
const REPORT = resolve(ROOT, 'docs/evidence/sdsu-engine-dmi-check.json');
const LB_TO_KG = 0.45359237;

function readRows() {
  const [headerLine, ...lines] = readFileSync(INPUT, 'utf8').trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.map(line => Object.fromEntries(line.split(',').map((value, index) => [headers[index], value.trim()])));
}

function summarize(rows) {
  if (!rows.length) throw new Error('No observed DMI/weight pairs for this subset');
  const errors = rows.map(row => row.predictedDmiKgPerDay - row.observedDmiKgPerDay);
  return {
    nAnimalDays: rows.length,
    animals: new Set(rows.map(row => row.animalTag)).size,
    dates: new Set(rows.map(row => row.date)).size,
    meanLiveweightKg: mean(rows.map(row => row.liveweightKg)),
    meanObservedDmiKgPerDay: mean(rows.map(row => row.observedDmiKgPerDay)),
    meanPredictedDmiKgPerDay: mean(rows.map(row => row.predictedDmiKgPerDay)),
    maeKgPerDay: mean(errors.map(Math.abs)),
    rmseKgPerDay: Math.sqrt(mean(errors.map(error => error ** 2))),
    biasPredictedMinusObservedKgPerDay: mean(errors),
  };
}

export function auditSdsuDmi() {
  const sourceRows = readRows();
  const selected = sourceRows.filter(row =>
    row.record_class === 'selected_article_complete_case_animal' &&
    row.derived_dmi_kg_day !== '' &&
    row.body_weight_lb_same_day !== '' &&
    Number(row.body_weight_lb_same_day) > 0,
  );
  const screenSelected = selected.filter(row => row.derived_dmi_kg_day_after_screen !== '');
  const observedRows = selected.map(row => ({
    animalTag: row.animal_tag,
    date: row.date,
    period: row.feed_period_normalized,
    liveweightKg: Number(row.body_weight_lb_same_day) * LB_TO_KG,
    observedDmiKgPerDay: Number(row.derived_dmi_kg_day),
    predictedDmiKgPerDay: predictDefaultBarnDmiKgPerDay(Number(row.body_weight_lb_same_day) * LB_TO_KG),
  }));
  const screenedRows = new Set(screenSelected.map(row => `${row.animal_tag}|${row.date}`));
  const duplicates = new Set();
  const seen = new Set();
  for (const row of observedRows) {
    const key = `${row.animalTag}|${row.date}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  const periods = [...new Set(observedRows.map(row => row.period))].sort();

  return {
    classification: 'fixed_default_dmi_component_diagnostic_out_of_approved_cper_domain_not_full_engine_validation',
    source: {
      articleDoi: '10.3389/fvets.2025.1625448',
      pmcid: 'PMC12411203',
      license: 'CC BY',
      file: 'data/sdsu-individual-dmi/individual-dmi-derived.csv',
      selectedCompleteCaseTags: [...new Set(observedRows.map(row => row.animalTag))].sort(),
      sourceRowsForSelectedCohortWithDerivedDmiAndWeight: observedRows.length,
      selectedRowsPassingPublishedDmiPercentBodyweightScreen: screenedRows.size,
      dmiDerivation: 'As-fed intake (lb/day) × period mean forage DM (%) × 0.45359237; period labels are trimmed for this derivation.',
      populationAndSetting: 'Seven non-lactating Angus cows in a South Dakota hay-feeding study; this is not the USDA/CPER grazing cohort.',
      measurementCaveat: 'Observed DMI is locally derived from the supplement spreadsheet and a period-average DM sample, not an independently curated individual DMI table.',
    },
    model: {
      engineSha256: createHash('sha256').update(readFileSync(resolve(ROOT, 'src/client/engine.js'))).digest('hex'),
      configuration: 'One engine animal, same-day observed weight as starting weight, default feed assumptions, barn housing, normal weather, 24-hour run.',
      calibrationOrParameterFitting: false,
      targetOutput: 'Total modeled dry matter intake over 24 hours (kg MS/animal/day).',
    },
    overallUnfiltered: summarize(observedRows),
    byPeriodUnfiltered: Object.fromEntries(periods.map(period => [
      period,
      summarize(observedRows.filter(row => row.period === period)),
    ])),
    authorScreenedSubset: summarize(observedRows.filter(row => screenedRows.has(`${row.animalTag}|${row.date}`))),
    dataChecks: {
      duplicateAnimalDatePairs: duplicates.size,
      screenedObservationFilterUsesObservedDmiPctBodyweight: true,
      screenedSubsetIsSecondaryAndNotAnIndependentSelection: true,
      dmiLabelWhitespaceDiscrepancyAffectsPublishedRmdReproduction: true,
    },
    limitations: [
      'This diagnostic assesses only the fixed default DMI component in a hay-feeding study; it is not validation of the approved USDA/CPER grazing case, ADG, costs, pasture stock, housing effects, or the full engine.',
      'The seven cows are repeated across study dates. Metrics are descriptive; no inferential interval is reported for this small cohort.',
      'The unfiltered subset contains zero and atypical DMI values. The author-screened metrics are secondary because the screen uses observed DMI as a percentage of body weight and selects on the outcome.',
      'The DMI target is derived using period-average forage dry matter. Trailing whitespace in published period labels creates different counts under literal versus trimmed matching; the full author pipeline is not reproduced.',
      'No parameters were fitted or selected on these data, and no confidence or prediction intervals are implied.',
    ],
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditSdsuDmi();
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report.overallUnfiltered, null, 2)}\n`);
}
