# Preregistration: Mendeley biomass transport stress

**Status:** registered before fitting; 2026-10-13. Machine-readable protocol: `preregister-transport-stress-2026-10.json`.

## Scope

This fixed OLS diagnostic uses only the existing 234 height-complete rows (filtered from 342 rows in the processed Mendeley parquet) of the Mendeley pasture biomass cohort. Outcomes in this cohort were already examined, so this is not independent validation and cannot promote a model. The experiment must not read Dryad data, predictions, or reports.

## Frozen analyses

1. Leave one farm out, holding each of the two farms out in turn. Interpret as two descriptive cases only.
2. Leave one campaign out. For each campaign, hold all its rows out and remove from training every observation at any test `(farm, latitude, longitude)` point. This prevents coordinates repeated between the November 2018 and March 2019 campaigns from crossing the split.
3. Refit the same one-feature OLS on the existing 13 leave-one-connected-component-out spatial folds at 0, 25, 100, 250, 500, and 1000 m exclusion distances. A training coordinate must be at least the registered distance from every test coordinate. Keep the held-out blocks fixed; do not select a buffer or model based on observed scores.
4. Report errors by farm, campaign, and management type, plus fold-specific feature ranges and the count/error of test rows outside the training height range.
5. For the 100 m scores, bootstrap the 13 whole spatial-block MAEs 10,000 times (seed 20261013). Never resample rows. These quantiles describe block-score stability only; blocks are nested in two farms and do not support population confidence intervals.

## Estimator and metrics

Use `sklearn.linear_model.LinearRegression(fit_intercept=True)` with `sward_height_cm` only and target `dry_matter_yield_kg_dm_ha` in kg DM/ha. Fit each fold from its training subset. Report row-weighted MAE, RMSE, signed bias, coverage, and equal-block MAE; include per-fold timings.

## Stop and interpretation rules

Stop for checksum, row/group-count, missing-value, or finite-value failures. Do not change group definitions, distances, estimator, or subgroups after seeing errors. Preserve unscored folds in coverage. The 13 blocks are nested in two farms; campaign and height-support effects are confounded with management/site/time. Height and biomass are recorded at the same points, with measurement order undocumented. No result establishes independent farm transport or operational pre-clipping prediction.
