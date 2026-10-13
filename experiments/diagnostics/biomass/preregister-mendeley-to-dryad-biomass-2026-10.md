# Mendeley to Dryad pasture biomass evaluation

**State:** preregistered and evaluated. The evaluation is in `experiments/biomass/`. Source wording was amended on 2026-10-13 after checking the Mendeley repository description. A later audit corrected a support-count wording error: all 234 Mendeley heights lie in `[2,56]` cm; the count 51 refers to the narrower `[23.533,56]` cm overlap from the minimum Dryad height to the maximum Mendeley height. Neither amendment changed any candidate, threshold, fold, prediction, metric, or result.

## Target and scope

Estimate measured dry forage yield in kg DM/ha from grass height in cm. The Mendeley source describes height and biomass collection at the same sample points in the November 2018 and March 2019 campaigns, but does not document their measurement sequence relative to clipping. Therefore the Brazilian development target is not labelled pre-grazing. The Dryad external source measures pre-grazing forage mass and height, making it a related but not strictly identical sampling estimand. This protocol covers clipped-quadrat forage biomass only. It does not evaluate animal DMI, ADG, standing inventory, the full Riose engine, or tropical-pasture transport.

## Development cohort and validation

Use the 234 Brazilian pasture sample rows in `data/mendeley-pasture-biomass/processed/pasture-biomass-samples-v1.parquet` (source DOI `10.17632/nj72kmdj77.1`). Development validation uses the 13 fixed connected farm/field components from `experiments/diagnostics/biomass/buffered-cv-feasibility-2026-10.json`. Components sharing exact-coordinate aliases remain together. Each fold holds out one component, then removes training coordinates within 100 m of any held-out coordinate. Fit preprocessing on each training fold only.

The structural feasibility check used feature and grouping columns only: all 234 rows are scoreable, 13 blocks are available, and buffered training folds retain 210–216 rows. Stop before model fitting if realized scoring coverage is below 70% or fewer than four blocks have non-empty test sets; do not reduce the buffer based on performance.

Compare only the frozen candidates in the JSON protocol: training-fold target median, OLS, standardized Ridge (alpha 1), fixed Huber, and centered/scaled quadratic OLS. The primary score is equal-weight mean of per-block MAE. Secondary scores are pooled MAE, RMSE, signed bias, scored coverage, and prespecified farm/campaign/management groups. A challenger replaces OLS for the final external evaluation only if it lowers primary MAE by at least 10%, worsens pooled RMSE by no more than 5%, and does not worsen a subgroup with at least 20 scored spatial groups by more than 10%. Otherwise retain OLS as the fixed reference and report that no challenger met the rule. The quadratic candidate is development-only: applying a nonlinear function to mean paddock height is not equivalent to averaging its point-level predictions, so it cannot be selected for this mean-height external cohort. Do not search additional models or hyperparameters.

Thirteen blocks are nested within two farms. Report block-level errors and avoid population-level confidence intervals or calibration claims.

## External cohort

Use the publicly downloadable, CC0 Dryad source `10.5061/dryad.79cnp5ht4`, downloaded as `data/raw/dryad-79cnp5ht4/version-6.zip` (SHA-256 `45b972894f876a653b0205d01959861bdc4e4ff7c14eacc8b8fa4bc893c161d6`). Evaluate the fixed candidate once on 64 matched treatment × replicate × study-year × Julian-day rows from `data/dryad-mob-rotational-biomass/processed/dryad-paddock-biomass-height-v1.parquet`. The target is the mean of available plot-level pre-grazing forage-mass quadrat values at that key; missing quadrats are not imputed. The predictor is the published pre-grazing mean height at the same key. Keep all repeated observations from each of the eight paddock groups together for reporting; do not pool this cohort with Mendeley.

Select the candidate and transformations using Mendeley buffered spatial CV only. Refit once on all 234 Mendeley rows and evaluate once on all 64 Dryad rows. Dryad outcomes cannot influence candidate, transform, or threshold selection. Report row-weighted MAE, RMSE, signed bias, paddock-macro MAE, each paddock group's error, and metrics by treatment, year, Julian day, and support status.

Mendeley's observed height support is 2–56 cm; all 234/234 development rows lie within it. All Dryad rows are the primary external test; report in-support and above-support strata separately and mark the latter as extrapolation. Forty of 64 Dryad rows fall within the Mendeley support. The narrower overlap from the minimum Dryad height (23.533 cm) through the Mendeley maximum (56 cm) contains only 51/234 Mendeley rows, showing that the in-support Dryad observations occupy the sparse upper part of Mendeley height coverage. All 24 above-support Dryad rows are MOB treatment, so support status is confounded with management and year; do not interpret the strata as a balanced transport comparison. Do not filter cases or clip features after seeing residuals. Eight paddock groups do not support a narrow confidence interval or calibrated prediction interval.

This is an independent temperate pasture biomass evaluation. It cannot validate Brazilian tropical pasture performance, DMI, ADG, or the full engine.

## Leakage controls and outputs

Never use clipped weights, biomass aliases, sample/plot identifiers, coordinates, future measurements, or external outcomes as predictors. Preserve coordinate aliases, spatial blocks, campaigns, and paddock identities. Store development and external predictions and reports separately under `experiments/biomass/mendeley-spatial-cv/` and `experiments/biomass/dryad-external/`.
