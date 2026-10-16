# BEH-011/013 — External pasture data access and eligibility

**Status:** source screen complete; no external sequence source is currently cleared for the commercial behavior-generation pipeline. This is a scientific/data-rights gate, not a data acquisition task. No messages were sent.

## Priority source: Tabapuã visual-observation study

See the primary-source audit and unsent request draft in [`docs/evidence/behavioral-external-data-and-provider-audit-2026-10.md`](../../docs/evidence/behavioral-external-data-and-provider-audit-2026-10.md).

The article under DOI `10.37496/rbz5520250201` is promising for observed event timing and activity ontology: nine Tabapuã heifers, 96 daylight (about 06:00–18:00) observation periods over 48 non-consecutive days, two animals observed per day, with individual/date/time behavior transitions and synchronized 1 Hz accelerometers. The merged analysis contained 607,150 of 2,073,600 nominal points (29.28%). Those facts make it useful to investigate, not a ready sequence dataset. Its microdata are not deposited publicly, the reported article CC BY license does not grant commercial rights to unshared data, and missingness/continuous temporal coverage needs file-level inspection.

Before an import or model run, request and verify:

- stable anonymized animal ID; session/day, observer, study arm/treatment, and ID continuity;
- timestamped transitions or start/end intervals, original ethogram, event-level precision, activity rules, observer adjudication, carry-forward/imputation, and label disagreement if recorded;
- coverage boundaries, scheduled/actual observation periods, missed intervals, censoring at observation start/end and the reason 70.72% of nominal merged points are absent/mismatched;
- time-zone and source-clock details, sync/drift, alignment keys, timezone convention, daylight/date/season;
- measured pasture context, sward height, botanical composition, availability/nutritive values, water access, supplementation, weather and management events with units/methods, if collected;
- sensor files/dictionaries distinct from human visual observations/classifier output, 1 Hz axis units, calibration, mounting and merge logic;
- breed/age/body-weight date and method, ethics/consent and exclusions as allowed by de-identification;
- written authorization for commercial access, transformation, model training, derivative weights, retention/deletion, attribution, publication and redistribution restrictions.

The draft request is stored in the evidence audit; it must be reviewed by a human and sent only with explicit authorization. If authors provide only sensor classifiers or aggregated tables, keep those as an observation/classification or descriptive dataset, not ground-truth generated behavior.

## Other screened sources

| Dataset | Decision for commercial sequence work | Why |
|---|---|---|
| USDA Ag Data Commons Richmond grazing record, DOI `10.15482/USDA.ADC/28507400` | **Promising, pending archive inspection** | Catalog metadata states CC0. Companion report describes pasture cattle and visual ground-truth for three focal cows over three days, but the archive download returned 403 during this audit. Actual files, stable IDs, time coverage and archive-level terms remain unverified. |
| USDA CPER grazing/weight-gain records, DOI `10.15482/USDA.ADC/1524788` | **Allowed for separate derived daily analysis after file/provenance check; not sequence generation** | Public-domain catalog metadata, but the accessible released products are daily summaries/foraging metrics; the cohort is yearling steers. Directly observed behavior is not a released continuous sequence target. |
| Perea v2 | **Already evaluated; internal exploratory only** | CC BY 4.0 per existing record; 24 mature cows, two ranch contexts, four annotations, sampled windows/carry-forward. Not independent external validation. |
| Precision Beef | **Separate instrument-agreement diagnostic only** | CC BY 4.0; indoor housed Limousin-cross steers and sensor/halter label agreement, not pasture ground truth. |
| Chile IoT collar repository | **Exclude until written grant/license** | Useful pasture event clips, but repository has no explicit dataset license; paper copyright does not establish data/model commercial rights. |
| XGain UC6 | **Removed; redistribution and reuse blocked** | Repository record and embedded README have conflicting commercial/non-commercial licenses. Source and derived data are removed from this tree; retain the source reference for rights research only. Classifier-derived hourly summaries do not establish independent validation. |
| Japanese Black Zenodo sequence data | **Exclude from commercial training/derivatives** | CC BY-NC-ND 4.0 terms conflict with commercial reuse; one short mixed grass/pen recording context. |
| CSIRO CVB video clips | **Exclude until exact record terms are verified** | Visual clips/annotations may support perception research, but continuous stable individual activity history and training/commercial permissions were not established. |

## Experiment readiness decision

No source currently supports selection of an alternative generator. Tabapuã should be prioritized for a permission request and archive/provenance audit after the data owners respond. If accessible, preserve human observations, classifier outputs and latent/generated records as distinct stages. Recompute continuous coverage, censoring, population grouping and time-of-day identifiability before preregistering any new experiment. Never pool all minutes as independent animals.

No commercial data or model training may proceed from this note alone. The request draft is not sent, the USDA archive is not locally inspected, and the current semi-Markov remains NO-GO.
