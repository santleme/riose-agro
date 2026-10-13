# Mendeley biomass transport stress diagnostics

**Status:** exploratory diagnostics only; not independent validation or model promotion.

## Fixed OLS spatial-buffer sensitivity

| Buffer | Rows | Coverage | MAE kg DM/ha | RMSE | Bias | Equal-block MAE | Outside training-height support |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 m | 234 | 100.0% | 647.8 | 883.9 | -0.2 | 647.8 | 5 |
| 25 m | 234 | 100.0% | 647.8 | 883.9 | -0.2 | 647.8 | 5 |
| 100 m | 234 | 100.0% | 649.7 | 885.7 | -3.3 | 649.7 | 5 |
| 250 m | 234 | 100.0% | 649.0 | 887.6 | -4.4 | 649.0 | 5 |
| 500 m | 234 | 100.0% | 651.6 | 890.3 | +3.2 | 651.6 | 5 |
| 1000 m | 234 | 100.0% | 676.8 | 929.4 | +3.9 | 676.8 | 5 |

## Leave-one-farm-out

Only two farms are available; these are descriptive farm cases, not farm-population estimates.

{
  "folds": [
    {
      "fold": "farm=Poderosa",
      "status": "scored",
      "trainRows": 180,
      "testRows": 54,
      "rows": 54,
      "maeKgDmHa": 1039.160396860857,
      "rmseKgDmHa": 1348.8152637663413,
      "biasPredictedMinusObservedKgDmHa": -840.6808127004588,
      "trainHeightRangeCm": [
        2.0,
        48.0
      ],
      "testOutsideTrainRangeRows": 2
    },
    {
      "fold": "farm=Santa Clara",
      "status": "scored",
      "trainRows": 54,
      "testRows": 180,
      "rows": 180,
      "maeKgDmHa": 1078.6815984612103,
      "rmseKgDmHa": 1204.3267795269196,
      "biasPredictedMinusObservedKgDmHa": 977.1704183731283,
      "trainHeightRangeCm": [
        7.0,
        56.0
      ],
      "testOutsideTrainRangeRows": 35
    }
  ],
  "scoredRows": 234,
  "coverage": 1.0,
  "pooledMetrics": {
    "rows": 234,
    "maeKgDmHa": 1069.5613211688215,
    "rmseKgDmHa": 1239.1665240476395,
    "biasPredictedMinusObservedKgDmHa": 557.6662881253775
  }
}

## Leave-one-campaign-out

Repeated exact farm-coordinate identities are removed from campaign training. Empty training sets are left unscored rather than relaxing the split.

{
  "folds": [
    {
      "fold": "campaign=2018-11",
      "status": "unscored_no_nonoverlap_training_points",
      "trainRows": 0,
      "testRows": 117,
      "testCoordinateGroups": 117,
      "removedOverlappingTrainingRows": 117,
      "overlapCoordinateGroups": 0
    },
    {
      "fold": "campaign=2019-03",
      "status": "unscored_no_nonoverlap_training_points",
      "trainRows": 0,
      "testRows": 117,
      "testCoordinateGroups": 117,
      "removedOverlappingTrainingRows": 117,
      "overlapCoordinateGroups": 0
    }
  ],
  "scoredRows": 0,
  "coverage": 0.0,
  "pooledMetrics": null
}

## 100 m subgroup diagnostics

By-farm rows:

- Poderosa: n=54, blocks=3, MAE=963.6, RMSE=1258.1, bias=-660.2 kg DM/ha.
- Santa Clara: n=180, blocks=10, MAE=555.5, RMSE=738.2, bias=+193.8 kg DM/ha.

Campaign, management, support-stratified, and per-block errors are in the JSON report and prediction CSV.

## Block bootstrap

Equal-block MAE=649.7 kg DM/ha. The 10,000 whole-block bootstrap quantiles (2.5%, median, 97.5%) are [497.86293818840716, 642.969400189824, 839.9752150284377]. Descriptive stability only; the 13 blocks are nested within two farms.

## Grouping, support, and timing

At 100 m, 234/234 unique rows were scored over 13 blocks. Every buffer split checked coordinate disjointness and geodesic distance. The 100 m OOF fold assignments, farm/campaign labels, observed values, and OLS predictions also reconcile with the frozen Mendeley OOF artifact. The JSON records train-height ranges and timings per split.

## Limits

- Mendeley outcomes were already reviewed; none of these results are pristine validation.
- The 13 spatial components are nested in two farms and the two campaigns; no population-level uncertainty is claimed.
- Height and biomass are observed at the same sampling points, and measurement order relative to clipping is undocumented.
- A train-range support flag does not isolate extrapolation from farm, campaign, or management shifts.
- No Dryad rows, predictions, metrics, or outcomes may be read by this experiment.
