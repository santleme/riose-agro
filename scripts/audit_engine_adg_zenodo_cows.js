/**
 * Frozen, no-fit ADG component comparison against the public mature-cow
 * Zenodo cohort. This is a narrow diagnostic, not full engine validation.
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {FarmEngine, metrics} from '../engine.js';

const dataDir = new URL('../data/zenodo-grazing-allometry/', import.meta.url);
const reportPath = new URL('../docs/evidence/engine-adg-zenodo-cows-check.json', import.meta.url);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dataDir), 'utf8'));
const api = JSON.parse(readFileSync(new URL('zenodo-record-api-metadata.json', dataDir), 'utf8'));
const sourceFile = manifest.files.find(file => file.path === 'Zenodo_Data_Allometry.txt');
if (manifest.source.doi !== '10.5281/zenodo.3707638' || api.doi !== manifest.source.doi || !sourceFile) {
  throw new Error('Unexpected Zenodo record or missing source file');
}
if (manifest.source.license !== 'CC-BY-4.0' || api.metadataLicenseFieldPath !== 'metadata.license.id' || api.license?.id !== 'cc-by-4.0') {
  throw new Error('Zenodo license metadata differs from the audited declaration');
}
const bytes = readFileSync(new URL(sourceFile.path, dataDir));
if (bytes.length !== sourceFile.bytes || sha256(bytes) !== sourceFile.sha256) {
  throw new Error('Zenodo allometry file integrity check failed');
}

const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
const headers = lines.shift().split('\t');
const rows = lines.map((line, index) => {
  const values = line.split('\t');
  if (values.length !== headers.length) throw new Error(`Malformed TSV row ${index + 2}`);
  const raw = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  const row = {breed: raw.Breed, ageMonths: Number(raw.Age), startWeightKg: Number(raw.Weight_1), endWeightKg: Number(raw.Weight_2)};
  if (!row.breed || ![row.ageMonths, row.startWeightKg, row.endWeightKg].every(Number.isFinite)) {
    throw new Error(`Invalid cow record at TSV row ${index + 2}`);
  }
  return row;
});
if (rows.length !== 27 || new Set(rows.map(row => row.breed)).size !== 3) {
  throw new Error(`Expected 27 cows across three breeds, found ${rows.length}`);
}

const assumedDays = 70;
const evaluated = rows.map((row, index) => {
  const engine = new FarmEngine(20261012 + index, 1);
  const animal = engine.state.animals[0];
  animal.weight = row.startWeightKg;
  animal.initialWeight = row.startWeightKg;
  engine.configure({housing: 'pasture', diet: 'pasture', weather: 'normal', supplement: 0});
  engine.tick(assumedDays * 24);
  const predictedAdgKgPerCowDay = (metrics(engine.state).weight - row.startWeightKg) / assumedDays;
  const observedAdgKgPerCowDay = (row.endWeightKg - row.startWeightKg) / assumedDays;
  return {...row, observedAdgKgPerCowDay, predictedAdgKgPerCowDay, errorKgPerCowDay: predictedAdgKgPerCowDay - observedAdgKgPerCowDay};
});

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function summarize(selected) {
  const errors = selected.map(row => row.errorKgPerCowDay);
  return {
    nCowsByStudyDesign: selected.length,
    ageMonths: {minimum: Math.min(...selected.map(row => row.ageMonths)), maximum: Math.max(...selected.map(row => row.ageMonths))},
    meanObservedAdgKgPerCowDay: mean(selected.map(row => row.observedAdgKgPerCowDay)),
    meanFrozenEngineAdgKgPerCowDay: mean(selected.map(row => row.predictedAdgKgPerCowDay)),
    maeKgPerCowDay: mean(errors.map(Math.abs)),
    rmseKgPerCowDay: Math.sqrt(mean(errors.map(error => error ** 2))),
    biasEngineMinusObservedKgPerCowDay: mean(errors),
    observedAdgRangeKgPerCowDay: {minimum: Math.min(...selected.map(row => row.observedAdgKgPerCowDay)), maximum: Math.max(...selected.map(row => row.observedAdgKgPerCowDay))},
  };
}

const byBreed = Object.fromEntries([...new Set(evaluated.map(row => row.breed))].sort().map(breed => [breed, summarize(evaluated.filter(row => row.breed === breed))]));
const report = {
  classification: 'frozen_no_fit_mature_cow_adg_component_diagnostic_not_validation',
  source: {
    title: manifest.source.title,
    datasetDoi: manifest.source.doi,
    datasetUrl: manifest.source.recordUrl,
    articleDoi: manifest.source.articleDoi,
    licenseDeclaration: manifest.source.license,
    licenseEvidence: manifest.source.licenseEvidence,
    licenseCaveat: 'Zenodo API metadata declares CC BY 4.0 at metadata.license.id; the rendered record page has an empty license field; no independent legal review.',
    file: sourceFile.path,
    sha256: sha256(bytes),
    attribution: 'Pauler, C. M. et al. (2020). Data on anatomy, movement, and foraging behaviour of three cattle breeds of different productivity. Frontiers in Veterinary Science. https://doi.org/10.3389/fvets.2020.00494. Dataset: https://doi.org/10.5281/zenodo.3707638.',
  },
  evaluation: {
    nCows: evaluated.length,
    nBreeds: Object.keys(byBreed).length,
    horizonDays: assumedDays,
    horizonBasis: 'Article describes a 10-week grazing experiment; exact individual weighing dates are absent from the deposited file.',
    observedAdgFormula: '(Weight_2 - Weight_1) / 70; both endpoints are recorded in kg.',
    engineInputs: 'Observed initial weight only; 1 simulated animal; default initial pasture ledger and default pasture/diet/normal-weather/no-supplement configuration. No cow-specific forage, intake, supplementation, weather, or measured pasture state is supplied.',
    engineParameterFitting: 'none; engine.js is unchanged by this diagnostic.',
    allCows: summarize(evaluated),
    byBreed,
    interpretation: 'This compares one frozen engine component with derived endpoint ADG in a small, separate mature-cow grazing cohort. It has no animal identifiers or exact interval dates and does not align management/forage inputs. It is not an independent full-engine validation, calibration, prediction-interval assessment, causal estimate, or evidence to mix into the approved USDA/CPER yearling-steer case.',
  },
  limits: [
    'Twenty-seven cows at one Swiss alpine research setting, nine per breed, are not representative of Brazilian farms or the USDA/CPER yearling-steer cohort.',
    'The 70-day horizon is inferred from the article; exact per-cow weighing dates are not deposited.',
    'The input file lacks a stable individual identifier, so metrics are descriptive and no animal-cluster bootstrap is claimed.',
    'The engine scenario uses default pasture state and does not receive measured forage quality, pasture mass, weather, DMI, or cow management inputs.',
    'The result measures only ADG component discrepancy; it cannot validate weight trajectories, DMI, cost, forage inventory, treatment effects, or uncertainty coverage.',
  ],
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
