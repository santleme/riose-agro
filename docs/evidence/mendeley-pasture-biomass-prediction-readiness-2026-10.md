# Mendeley pasture biomass prediction readiness

Source: [Mendeley Data 10.17632/nj72kmdj77.1](https://doi.org/10.17632/nj72kmdj77.1) (CC BY 4.0).

**Decision: NO_GO_FOR_GENERALIZABLE_PREDICTION** for generalized prediction. The source supports descriptive analysis of measured forage biomass; it does not support claims about DMI or ADG.

## Estimand and input audit

Use `dry_matter_yield_kg_dm_ha` (kg DM/ha) as the observed cut-quadrat dry forage mass scaled from 0.25 m². It is exactly equivalent, within the processing tolerance, to `dry_matter_weight_g × 40` and `dry_matter_yield_tonnes_ha × 1000`; neither alias may be included as a predictor.

Candidate inputs for a future local biomass model are management category, collection campaign, sward height, and cattle presence, after their availability at prediction time is established. Fresh weights come from the same clipped sample and are excluded as post-sampling proxies. Farm, field, pixel, point, and coordinates remain grouping/provenance variables, not model features.

The separate soil workbooks were not joined: the current processing pipeline does not establish an operationally valid, one-to-one pre-outcome feature table for them.

## Group and holdout audit

The processed table has 342 rows, 162 distinct `farm, field_code, pixel_id, sampling_point_id` groups, and 108 groups repeated across campaigns. 288 rows belong to groups with repeated observations. Random row splitting is prohibited.

There are 2 farms and only three campaigns. Management level 3 occurs at one farm only. Leave-one-farm-out has two descriptive folds: each trains on one farm and tests on the other, so it cannot establish farm-independent transportability.

| Farm held out | Train rows | Test rows | Management levels present only in test |
|---|---:|---:|---|
| Poderosa | 261 | 81 | none |
| Santa Clara | 81 | 261 | 3 |

## Internal grouped OOF diagnostic

A deterministic 5-fold `GroupKFold` diagnostic was run on 234 complete records from 2018-11, 2019-03; June 2018 is excluded because height is missing. Groups are the full spatial key above, so repeated visits to each point stay in one fold. The single predictor is sward height; each fold fits both the training-fold median baseline and ordinary least squares using height alone.

| OOF model | MAE (kg DM/ha) | RMSE (kg DM/ha) | Bias, predicted − observed (kg DM/ha) |
|---|---:|---:|---:|
| Training-fold median | 943.434 | 1268.270 | -311.506 |
| Linear regression on height | 634.005 | 871.162 | 1.090 |

Subgroup metrics by farm and campaign are in the JSON artifact. These scores describe only held-out sampling points within the same two farms and two campaigns. Nearby points may still be spatially correlated, and a third farm is still needed for external transfer claims. No DMI/ADG, calibration, uncertainty, or pasture-inventory conclusion follows from this biomass-only diagnostic.

The OOF table records fold assignments and predictions at `docs/evidence/mendeley-pasture-biomass-grouped-oof-2026-10.csv`.

## Scope and reproducibility

The reported MAE, RMSE, and bias are out-of-fold internal diagnostics for the two farms and two campaigns with height observations. They do not constitute external validation or establish performance on new farms, seasons, or regions. The JSON report records input checksums, target-equivalence checks, group counts, feature exclusions, holdout design, and diagnostic metrics. Rebuild the report and OOF table with:

```bash
uv run --python 3.12 --with-requirements requirements-data-processing.txt --with scikit-learn==1.5.2 -- python scripts/audit_mendeley_pasture_biomass_prediction_readiness.py
```
