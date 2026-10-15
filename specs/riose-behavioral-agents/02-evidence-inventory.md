# Evidence and data rights — initial inventory (2026-10-15)

This is a review of committed repository evidence, not an independent fresh download or a new validation run. Re-audit live source terms before using any dataset in a product.

| Source | Observations | Existing local evidence | Eligible use / limit |
| --- | --- | --- | --- |
| Perea v2 — [Figshare](https://doi.org/10.6084/m9.figshare.28801181.v2) | 9,222 raw rows; reviewed analysis uses 8,864 animal-minute rows from 24 cattle, four behaviors WA/GR/RE/RU | `data/perea-rangeland-behavior/`, `docs/evidence/perea-behavior-grouped-evaluation.md`, `experiments/behavior/perea-tree-models-development/` | CC BY 4.0 according to existing source audit. Usable for scoped *internal exploratory* behavior classification and sequence modeling, not evidence of full Riose engine validation. |
| Precision Beef — [Zenodo](https://doi.org/10.5281/zenodo.4064802) | 18 indoor steers; collar vs RumiWatch-derived labels in 90-second bins | `experiments/behavior/precision-beef-instrument-agreement/`, `docs/evidence/behavior-external-dataset-candidates-2026-10.md` | CC BY 4.0; only instrument-agreement/housed-behavior diagnostic. Cannot serve as direct pasture behavior validation. |
| XGain UC6 — [Zenodo](https://doi.org/10.5281/zenodo.15600573) | 10 dairy cows, hourly classifier-output summaries | `data/xgain-cattle-behavior/` | Conflicting CC BY vs CC BY-NC statements; no commercial training or external classifier validation. |
| Chile IoT Collar — [GitHub](https://github.com/WASP-lab/db-cow-walking) | 10 dairy cows, event-labelled walking/grazing/resting/other IMU sequences | `docs/evidence/behavior-external-dataset-candidates-2026-10.md` | No explicit repository data license identified; request permission before commercial training/evaluation. |
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

## Immediate next evidence action
Implement an audited, deterministic Perea time-series loader and a machine-readable readiness report: number of eligible animals, sessions, discontinuities, duration distributions, class coverage and duplicated keys. Freeze those findings BEFORE implementing/tuning a generator.
