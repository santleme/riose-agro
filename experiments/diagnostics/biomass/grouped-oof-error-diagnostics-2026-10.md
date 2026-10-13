# Biomass OOF error and spatial-support diagnosis

**Scope:** diagnosis of the existing GroupKFold predictions only. This artifact did not fit, tune, or change any model or prediction.

## Input checksums

| Input | Bytes | SHA-256 |
|---|---:|---|
| `docs/evidence/mendeley-pasture-biomass-grouped-oof-2026-10.csv` | 23657 | `925704dfee357e0d9d268301e63bd32c3c0a5096d85d25df2d096938219e6244` |
| `data/mendeley-pasture-biomass/processed/pasture-biomass-samples-v1.parquet` | 25476 | `ccc626011de7445769efc72a1168fea99a7b1db6e2c4d87b8fdd9f2f987e4fc7` |
| `docs/evidence/mendeley-pasture-biomass-prediction-readiness-2026-10.json` | 18806 | `0ebe38662da06f918ac692102518d8ab3d55a9cd8b1f9c614195bf707fcbc79b` |

## OOF residual patterns

### By farm

| Group | Model | n | MAE | RMSE | Bias | Median error | P90 absolute error |
|---|---|---:|---:|---:|---:|---:|---:|
| farm=Poderosa | trainingMedian | 54 | 1559.2 | 1964.6 | -1510.3 | -1338.6 | 3080.5 |
| farm=Poderosa | heightLinearRegression | 54 | 945.5 | 1235.5 | -578.8 | -549.0 | 1896.4 |
| farm=Santa Clara | trainingMedian | 180 | 758.7 | 966.0 | 48.1 | 252.0 | 1406.7 |
| farm=Santa Clara | heightLinearRegression | 180 | 540.6 | 727.1 | 175.0 | 223.2 | 1143.5 |
### By campaign

| Group | Model | n | MAE | RMSE | Bias | Median error | P90 absolute error |
|---|---|---:|---:|---:|---:|---:|---:|
| campaign=2018-11 | trainingMedian | 117 | 987.1 | 1290.3 | -361.7 | -124.0 | 1919.8 |
| campaign=2018-11 | heightLinearRegression | 117 | 554.2 | 779.8 | -97.2 | 21.6 | 1218.6 |
| campaign=2019-03 | trainingMedian | 117 | 899.7 | 1245.9 | -261.3 | 42.4 | 1808.2 |
| campaign=2019-03 | heightLinearRegression | 117 | 713.8 | 953.9 | 99.4 | 255.6 | 1342.5 |
### By farm and campaign

| Group | Model | n | MAE | RMSE | Bias | Median error | P90 absolute error |
|---|---|---:|---:|---:|---:|---:|---:|
| farm=Poderosa, campaign=2018-11 | trainingMedian | 27 | 1543.0 | 1854.3 | -1451.6 | -1346.4 | 3046.9 |
| farm=Poderosa, campaign=2018-11 | heightLinearRegression | 27 | 867.2 | 1041.0 | -167.3 | -319.4 | 1720.1 |
| farm=Poderosa, campaign=2019-03 | trainingMedian | 27 | 1575.5 | 2069.0 | -1569.0 | -1330.8 | 3137.8 |
| farm=Poderosa, campaign=2019-03 | heightLinearRegression | 27 | 1023.8 | 1403.3 | -990.2 | -661.7 | 2022.6 |
| farm=Santa Clara, campaign=2018-11 | trainingMedian | 90 | 820.4 | 1064.3 | -34.8 | 246.4 | 1382.2 |
| farm=Santa Clara, campaign=2018-11 | heightLinearRegression | 90 | 460.3 | 682.1 | -76.2 | 43.9 | 993.9 |
| farm=Santa Clara, campaign=2019-03 | trainingMedian | 90 | 697.0 | 856.5 | 131.0 | 273.4 | 1409.8 |
| farm=Santa Clara, campaign=2019-03 | heightLinearRegression | 90 | 620.8 | 769.4 | 426.3 | 412.4 | 1173.8 |
### By management class

| Group | Model | n | MAE | RMSE | Bias | Median error | P90 absolute error |
|---|---|---:|---:|---:|---:|---:|---:|
| management_type=1 | trainingMedian | 108 | 1028.3 | 1402.2 | -91.0 | 456.2 | 2167.5 |
| management_type=1 | heightLinearRegression | 108 | 657.3 | 992.1 | -9.1 | 179.6 | 1828.0 |
| management_type=2 | trainingMedian | 126 | 870.7 | 1141.0 | -500.5 | -451.0 | 1717.0 |
| management_type=2 | heightLinearRegression | 126 | 614.0 | 752.2 | 9.8 | 36.7 | 1182.9 |
### By farm and management class

| Group | Model | n | MAE | RMSE | Bias | Median error | P90 absolute error |
|---|---|---:|---:|---:|---:|---:|---:|
| farm=Poderosa, management_type=1 | trainingMedian | 18 | 2600.8 | 2861.5 | -2600.8 | -2623.2 | 3926.6 |
| farm=Poderosa, management_type=1 | heightLinearRegression | 18 | 1537.9 | 1851.1 | -824.4 | -956.0 | 2555.0 |
| farm=Poderosa, management_type=2 | trainingMedian | 36 | 1038.4 | 1302.0 | -965.0 | -834.8 | 1900.2 |
| farm=Poderosa, management_type=2 | heightLinearRegression | 36 | 649.3 | 759.2 | -456.0 | -541.6 | 1112.7 |
| farm=Santa Clara, management_type=1 | trainingMedian | 90 | 713.8 | 849.5 | 411.0 | 585.8 | 1241.6 |
| farm=Santa Clara, management_type=1 | heightLinearRegression | 90 | 481.2 | 704.0 | 154.0 | 223.2 | 1106.4 |
| farm=Santa Clara, management_type=2 | trainingMedian | 90 | 803.5 | 1069.9 | -314.7 | -326.6 | 1474.1 |
| farm=Santa Clara, management_type=2 | heightLinearRegression | 90 | 599.9 | 749.4 | 196.1 | 244.7 | 1199.9 |

### Equal-weight spatial-group view

| Model | Groups | MAE | RMSE | Bias |
|---|---:|---:|---:|---:|
| trainingMedian | 135 | 870.7 | 1173.9 | -308.6 |
| heightLinearRegression | 135 | 473.2 | 638.3 | 33.2 |

Largest absolute group-mean residuals for the height-only regression:

| Farm | Spatial group | Campaign rows | Mean residual (kg DM/ha) |
|---|---|---:|---:|
| Poderosa | `Poderosa|A2_T1_P1|1|1` | 2 | -2668.5 |
| Santa Clara | `Santa Clara|A1a_T3_P17|17|1` | 1 | -2376.5 |
| Poderosa | `Poderosa|A2_T1_P1|1|3` | 2 | -1484.9 |
| Santa Clara | `Santa Clara|A1b_T8_P1|1|8` | 2 | 1336.1 |
| Poderosa | `Poderosa|A2_T3_P1|1|2` | 2 | -1328.9 |
| Santa Clara | `Santa Clara|A1b_T3_P17|17|8` | 1 | 1276.2 |
| Poderosa | `Poderosa|A2_T3_P2|2|2` | 2 | -1194.4 |
| Poderosa | `Poderosa|A2_T1_P1|1|4` | 2 | -1190.7 |
| Santa Clara | `Santa Clara|A1b_T3_P17|17|1` | 1 | 1168.2 |
| Santa Clara | `Santa Clara|A1b_T2_P2|2|9` | 2 | 1126.8 |

## Spatial leakage and distance support

The full farm/field/pixel/point key had 0 cross-fold overlap. However, 18 exact coordinate pairs have multiple group IDs; 15 of those coordinate pairs (30 group IDs) span folds.

Nearest training-location distances for held-out groups:

| Search scope | n | Median m | P90 m | <25 m | <50 m | <100 m | <250 m |
|---|---:|---:|---:|---:|---:|---:|---:|
| all_train | 135 | 59.79 | 59.80 | 30 | 30 | 135 | 135 |
| same_farm | 135 | 59.79 | 59.80 | 30 | 30 | 135 | 135 |
| same_field | 135 | 59.79 | 59.80 | 12 | 12 | 135 | 135 |
| same_pixel | 135 | 59.79 | 59.80 | 0 | 0 | 135 | 135 |

The full farm/field/pixel/point key stays in one fold, but distinct keys share exact coordinates: several coordinate pairs are divided across folds. Additionally, all held-out locations have a training location within 100 m. Thus the existing OOF has no full-key overlap but does not provide spatially independent validation; error estimates may be optimistic under spatial autocorrelation.

The OOF split prevents repeat-key leakage but not exact-coordinate aliasing or neighbor dependence. Consequently the existing internal metrics are useful for diagnosis, not an independent estimate of spatial transfer performance.

## Proposed preregistered protocol (not run)

Before model comparison, block by contiguous field/spatial region; unite exact-coordinate aliases and preserve all campaigns per location in one block. Use a predeclared 100 m training exclusion buffer around held-out blocks (chosen above the observed ~60 m nearest-neighbor spacing). Report scored coverage. Require at least 70% of eligible observations and at least four independent held-out blocks; otherwise issue NO-GO for model ranking. A third farm remains necessary for external transfer claims.

**Estimand and input boundary:** dry_matter_yield_kg_dm_ha for clipped quadrat forage biomass, using sward_height_cm recorded before clipping; no DMI, ADG, standing inventory, or farm-level transport claim. First comparison uses height alone, measured at prediction time. Exclude target aliases, all clipped-sample weights, coordinates/IDs as predictors, and fields whose timing relative to outcome is undocumented.

| Candidate | Fixed specification |
|---|---|
| training-median baseline | median target in training data only |
| OLS height-only | ordinary least squares with intercept; current diagnostic reference |
| Ridge height-only | standardize height using training fold only; Ridge alpha=1.0 fixed in advance |
| Huber height-only | HuberRegressor epsilon=1.35, alpha=0.0, max_iter=1000; fixed in advance |
| quadratic height-only (optional, single nonlinear candidate) | degree-2 polynomial in centered/scaled height, scaling learned within training fold; included only as a fixed curvature check, no degree or knot search |

**Primary metric:** spatial-block-macro MAE: average absolute error across observations in each held-out contiguous block (after joining exact-coordinate aliases and repeated visits), then average equally over held-out blocks.

**Secondary metrics:** row-weighted MAE, row-weighted RMSE, signed bias, farm/campaign/management subgroup MAE and bias, coverage and scored-group counts.

**Retention rule:** Retain a challenger only if it reduces primary spatial-group-macro MAE by at least 10% versus OLS on identical held-out groups, row-weighted RMSE does not worsen by more than 5%, and no farm or campaign subgroup with at least 20 scored groups has MAE worsened by more than 10%. Otherwise retain OLS as reference or report no demonstrated improvement. These are practical preregistered thresholds, not significance tests; do not tune on these folds.

## Interpretation

- Poderosa errors and negative bias are substantially larger than Santa Clara; the height-only OOF model underpredicts Poderosa by an average of about 579 kg DM/ha.
- March errors exceed November errors for the height-only model, with positive bias in March; campaign differences remain visible despite both campaigns appearing in every fold.
- Management class 3 is absent from OOF because all its observations are from June, where height is missing. OOF cannot support claims for that management level.
- Point-weighted rows include repeated locations. The macro summary averaged over spatial groups is included to show the effect of giving each location equal weight.
- The evaluation remains internal to two farms and two campaigns; exact-coordinate aliases across folds and close neighbors further limit its independence.
