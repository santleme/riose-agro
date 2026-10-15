# Evidence and data rights — initial inventory (2026-10-15)

This is a review of committed repository evidence, not an independent fresh download or a new validation run. Re-audit live source terms before using any dataset in a product.

| Source | Observations | Existing local evidence | Eligible use / limit |
| --- | --- | --- | --- |
| Perea v2 — [Figshare](https://doi.org/10.6084/m9.figshare.28801181.v2) | 9,222 raw rows; reviewed analysis uses 8,864 animal-minute rows from 24 cattle, four behaviors WA/GR/RE/RU | `data/perea-rangeland-behavior/`, `docs/evidence/perea-behavior-grouped-evaluation.md`, `experiments/behavior/perea-tree-models-development/` | CC BY 4.0 according to existing source audit. Usable for scoped *internal exploratory* behavior classification and sequence modeling, not evidence of full Riose engine validation. |
| Precision Beef — [Zenodo](https://doi.org/10.5281/zenodo.4064802) | 18 indoor steers; collar vs RumiWatch-derived labels in 90-second bins | `experiments/behavior/precision-beef-instrument-agreement/`, `docs/evidence/behavior-external-dataset-candidates-2026-10.md` | CC BY 4.0; only instrument-agreement/housed-behavior diagnostic. Cannot serve as direct pasture behavior validation. |
| XGain UC6 — [Zenodo](https://doi.org/10.5281/zenodo.15600573) | 10 dairy cows, hourly classifier-output summaries | `data/xgain-cattle-behavior/` | Conflicting CC BY vs CC BY-NC statements; no commercial training or external classifier validation. |
| Chile IoT Collar — [GitHub](https://github.com/WASP-lab/db-cow-walking) | 10 dairy cows, event-labelled walking/grazing/resting/other IMU sequences | `docs/evidence/behavior-external-dataset-candidates-2026-10.md` | No explicit repository data license identified; request permission before commercial training/evaluation. |
| Tabapuã ingestive behavior — [DOI 10.37496/rbz5520250201](https://doi.org/10.37496/rbz5520250201) | Nine heifers; timestamped visual transition records and synchronized 1 Hz sensors as described in the article; only about 29.28% of nominal merged points retained | `docs/evidence/behavioral-external-data-and-provider-audit-2026-10.md`; `13-external-data-and-access-plan.md` | High-priority request-only source. The article is open licensed; underlying microdata are not public and commercial reuse is not established. No data acquired or author contacted. |
| USDA Richmond grazing behavior — [Ag Data Commons](https://agdatacommons.nal.usda.gov/articles/dataset/Multi-Sensor_Integration_and_Machine_Learning_for_High-Resolution_Classification_of_Herbivore_Foraging_Behavior/28507400) | Record metadata says pasture cattle, 22 collars and visual ground truth for three focal cattle over three days | `docs/evidence/behavioral-external-data-and-provider-audit-2026-10.md`; `13-external-data-and-access-plan.md` | CC0 at catalog level; archive was inaccessible in this audit (403), so files, stable IDs, timestamps, and archive terms remain unverified. Do not mark pipeline-ready. |
| USDA CPER foraging records — [Ag Data Commons](https://catalog.data.gov/dataset/data-from-can-measurements-of-foraging-behaviour-predict-variation-in-weight-gains-of-free) | Yearling steer GPS/foraging metrics and weight gain, released as daily summaries | Same audit and access plan | Public-domain metadata; candidate for separate derived daily analyses after source-file checks, not a continuous human-labelled behavior-generation sequence.
| BR-CORTE, USDA/CPER, biomass, DMI | Different outcomes or populations | `docs/evidence/`, `scientific/` | Neither behavior labels nor proof that current activity rules or intervention responses are valid. Keep separate. |

## Perea-specific known data issues
- Labels: walking (WA), grazing (GR), resting (RE), ruminating (RU). Engine's current `drinking` and `feeding` are **not** Perea observed classes.
- Published labels are one minute; short (<30 s) events may carry a previous annotation. This inflates persistence; document bias in measured bout durations.
- A prior audit found duplicate animal-minute keys; exact same-label repeats are collapsed, conflicting labels excluded. Reproduce policy from existing frozen experiment.
- The 24 animals share two ranch contexts; breed is nested within ranch and ranch transfer is confounded. No broad external ranch-transfer claims.
- Motion index is an accelerometer-derived **observation feature**. A generative behavior policy must not require future or unavailable observed motion index at simulated inference time.
- Existing classification development: equal-animal RE/RU mean F1 roughly 0.470 for an expanded nested candidate, which is **not a generative metric**. Prior single-feature logistic four-class macro-F1 around 0.662 is also classification only.
- Inspect continuous coverage, gaps, session lengths, timezone and number of complete 24-hour observation windows BEFORE defining circadian or full-day sequence metrics. If absent, restrict claims to observed session lengths.

## External-validation readiness
**NOT READY.** No presently approved candidate directly validates free-range beef cattle behavior generation across ranches in the general Riose target population. Rights clearances and population/ontology fit must be independently verified. Do not recycle Perea animals from development as an external holdout.

## Current next evidence action
Request rights and de-identified transition-level data for the Tabapuã cohort only after human review and explicit authorization. If received, inspect exact files, licensing, coverage, stable identity, censoring, annotation rules and time-aligned management context before any model is proposed. No request was sent as part of this SDD work.
