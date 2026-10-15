# Frozen scientific ML reference before new candidate experiments

This reference captures the existing biomass, behavior, and ADG evaluations as they stood at commit `523982b7c5070c1f244bf8f7d2edca8a1b27b124`, before the new candidate protocols are run. It is a reproducibility checkpoint, not a scientific validation claim.

The machine-readable record in [`baseline-v1.json`](../../experiments/scientific-ml/baseline-v1.json) hashes the source files, scripts, dependency declarations, and reported artifacts. [`verify_scientific_ml_baseline.py`](../../scripts/science/evaluations/verify_scientific_ml_baseline.py) checks those hashes and independently recomputes metrics from the saved out-of-fold rows without fitting a model.

## Frozen evaluations

| Module | Frozen data and evaluation | Reference result | Limit |
|---|---|---|---|
| Pasture biomass | 234 clipped quadrat records, 135 spatial groups, 2 farms and 2 campaigns; five-fold grouped OOF | Height-only OLS MAE 634.0, RMSE 871.2, bias +1.1 kg DM/ha | Exact coordinate aliases cross folds; every held-out location has a training location within 100 m. Internal, spatially dependent evaluation; June is absent because height is missing. |
| Grazing behavior | 8,864 records from 24 animals in six fixed animal-group folds; 4 behavior classes | Logistic equal-animal macro-F1 0.664, balanced accuracy 0.720, accuracy 0.741 | RE F1 0.339 and recall 0.255; one scalar motion-index feature; repeated time-series observations; breed is nested in two ranches. |
| ADG transport diagnostic | 291 CGREC yearling-steer records, historically compared with CPER development data | CPER mean baseline MAE 0.242; frozen scaled engine MAE 0.222; default engine MAE 0.540 kg/head/day | CGREC has already been consulted and is not a new final holdout. This does not validate mature-cow DMI or the full engine. |

These old outputs are retained as a baseline only. Any new candidate comparison must use the pre-registered splits and selection rules in `experiments/diagnostics/`; the historical CGREC data cannot be used to choose an ADG model.

## Reproduction

```bash
python3 scripts/science/evaluations/verify_scientific_ml_baseline.py
uv run --python 3.12 --with-requirements requirements-data-processing.txt -- python scripts/audit_mendeley_pasture_biomass_prediction_readiness.py
python3 scripts/evaluate_perea_behavior_grouped.py
npm run audit:engine-adg-cgrec-transport
```

The verifier returns `status: valid`, 234 biomass OOF rows, 8,864 behavior OOF rows, 291 historical ADG rows, and `retrained: false`. The diagnostics are reproduced with their existing command-line scripts; their scope remains descriptive and does not revise the frozen estimates.

## Readiness boundary

| Module | What is supported now | What remains unsupported |
|---|---|---|
| Biomass | Study-local clipped quadrat yield association with measured pre-clip sward height | Independent farm transfer, standing biomass inventory, or herd intake |
| Behavior | Exploratory classification of four observed classes in the Perea cohort | Broad ranch transport, individual intake, or full-engine validation |
| ADG | Historical error diagnosis in yearling steers and a protocol for internal CPER development CV | New external ADG validation, mature cow prediction, or DMI validation |
| Mature-cow DMI | Published mechanistic equations can continue to drive scenario simulation within stated domains | Trustworthy individual predictions for Riose's target adult beef-cow pasture population |
