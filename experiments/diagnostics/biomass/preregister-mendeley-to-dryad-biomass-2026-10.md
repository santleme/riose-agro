# Mendeley to Dryad pasture biomass evaluation

**State:** preregistered; no model fitting or outcome-based candidate selection has occurred.

## Target and scope

Estimate pre-grazing dry forage mass in kg DM/ha from pre-grazing mean sward height in cm. This protocol covers clipped-quadrat forage biomass only. It does not evaluate animal DMI, ADG, standing inventory, the full Riose engine, or tropical-pasture transport.

## Development cohort and validation

Use the 234 Brazilian pasture sample rows in `data/mendeley-pasture-biomass/processed/pasture-biomass-samples-v1.parquet` (source DOI `10.17632/nj72kmdj77.1`). Development validation uses the 13 fixed connected farm/field components from `experiments/diagnostics/biomass/buffered-cv-feasibility-2026-10.json`. Components sharing exact-coordinate aliases remain together. Each fold holds out one component, then removes training coordinates within 100 m of any held-out coordinate. Fit preprocessing on each training fold only.

The structural feasibility check used feature and grouping columns only: all 234 rows are scoreable, 13 blocks are available, and buffered training folds retain 210–216 rows. Stop before model fitting if realized scoring coverage is below 70% or fewer than four blocks have non-empty test sets; do not reduce the buffer based on performance.

Compare only the frozen candidates in the JSON protocol: training-fold target median, OLS, standardized Ridge (alpha 1), fixed Huber, and centered/scaled quadratic OLS. The primary score is equal-weight mean of per-block MAE. Secondary scores are pooled MAE, RMSE, signed bias, scored coverage, and prespecified farm/campaign/management groups. A challenger replaces OLS for the final external evaluation only if it lowers primary MAE by at least 10%, worsens pooled RMSE by no more than 5%, and does not worsen a subgroup with at least 20 scored spatial groups by more than 10%. Otherwise retain OLS as the fixed reference and report that no challenger met the rule. Do not search additional models or hyperparameters.

Thirteen blocks are nested within two farms. Report block-level errors and avoid population-level confidence intervals or calibration claims.

## External cohort

Use the publicly downloadable, CC0 Dryad source `10.5061/dryad.79cnp5ht4`, downloaded as `data/raw/dryad-79cnp5ht4/version-6.zip` (SHA-256 `45b972894f876a653b0205d01959861bdc4e4ff7c14eacc8b8fa4bc893c161d6`). Evaluate the fixed candidate once on 64 matched treatment × replicate × study-year × Julian-day rows from `data/dryad-mob-rotational-biomass/processed/dryad-paddock-biomass-height-v1.parquet`. The target is the mean of available plot-level pre-grazing forage-mass quadrat values at that key; missing quadrats are not imputed. The predictor is the published pre-grazing mean height at the same key. Keep all repeated observations from each of the eight paddock groups together for reporting; do not pool this cohort with Mendeley.

Select the candidate and transformations using Mendeley buffered spatial CV only. Refit once on all 234 Mendeley rows and evaluate once on all 64 Dryad rows. Dryad outcomes cannot influence candidate, transform, or threshold selection. Report row-weighted MAE, RMSE, signed bias, paddock-macro MAE, each paddock group's error, and metrics by treatment, year, Julian day, and support status.

Mendeley's observed height support is 2–56 cm. All Dryad rows are the primary external test; report in-support and above-support strata separately and mark the latter as extrapolation. Do not filter cases or clip features after seeing residuals. Eight paddock groups do not support a narrow confidence interval or calibrated prediction interval.

This is an independent temperate pasture biomass evaluation. It cannot validate Brazilian tropical pasture performance, DMI, ADG, or the full engine.

## Leakage controls and outputs

Never use clipped weights, biomass aliases, sample/plot identifiers, coordinates, future measurements, or external outcomes as predictors. Preserve coordinate aliases, spatial blocks, campaigns, and paddock identities. Store development and external predictions and reports separately under `experiments/biomass/mendeley-spatial-cv/` and `experiments/biomass/dryad-external/`.
