# Exploratory nested development: height-only pasture biomass

**Status:** post-baseline exploratory development; not independent validation. The candidate family was selected after earlier Mendeley and Dryad outcomes had already been reviewed. Dryad outcomes were not used by this experiment.

Development rows: 234; outer blocks: 13; coverage: 100.0%.

## Outer OOF metrics on the same rows

| Candidate | MAE | Equal-block MAE | RMSE | Bias |
|---|---:|---:|---:|---:|
| M0_median | 996.7 | 996.7 | 1314.3 | -308.1 |
| M1_ols | 649.7 | 649.7 | 885.7 | -3.3 |
| M5_isotonic | 719.9 | 719.9 | 1017.7 | 52.0 |
| M6_rf_monotone | 679.9 | 679.9 | 940.4 | -14.3 |
| M7_hgb_monotone | 686.0 | 686.0 | 949.8 | -9.2 |
| Nested-selected per block | 649.7 | 649.7 | 885.7 | -3.3 |

## Selection and advancement

Nested selection frequency: `{"M1_ols": 13}`.

Decision: **NO_ADVANCEMENT_RETAIN_OLS_AS_DEVELOPMENT_REFERENCE**. Relative equal-block MAE reduction vs OLS: 0.0%; relative RMSE change: 0.0%; bias gate: True; farm gate: True; campaign gate: True.

## Scope

- The candidate family was selected after the prior Mendeley and Dryad results had been reviewed; nested validation does not make the reviewed cohort outcomes pristine.
- This run uses only two Brazilian farms and two campaigns, and its 13 spatial blocks are clustered within those farms; the OOF scores are development diagnostics, not external validation or confidence intervals.
- Dryad outcomes were not read by this script and were not used for candidate selection, threshold selection, or tuning; its previously reported evaluation is not a new holdout for this post-baseline candidate family.
- Height measurement order relative to clipping is undocumented in Mendeley, limiting any operational pre-measurement interpretation.
- The outcome is clipped-quadrat forage mass only; results do not validate standing inventory, DMI, ADG, behavior, or the full Riose engine.

## Reproduction

```bash
uv run --python 3.12 --with-requirements requirements-data-processing.txt -- python scripts/evaluate_biomass_nested_development.py
uv run --python 3.12 --with-requirements requirements-data-processing.txt -- python -m unittest tests.test_biomass_nested_development -v
```
