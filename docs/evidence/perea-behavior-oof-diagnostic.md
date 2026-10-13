# Diagnostic of the frozen Perea grouped OOF behavior predictions

**Diagnosis only:** this report summarizes existing out-of-fold rows. It does not fit or tune any model and does not change the historical baseline report or evaluation script.

## Class failure rates

| Class | Support | Errors | Error rate | Precision | Recall | F1 | Most common confusion |
|---|---:|---:|---:|---:|---:|---:|---|
| GR | 3828 | 657 | 0.172 | 0.921 | 0.828 | 0.872 | RE (347) |
| RE | 1898 | 1414 | 0.745 | 0.507 | 0.255 | 0.339 | RU (1258) |
| RU | 921 | 148 | 0.161 | 0.380 | 0.839 | 0.523 | RE (124) |
| WA | 2217 | 98 | 0.044 | 0.871 | 0.956 | 0.912 | GR (98) |

## Breed and animal variation

| Breed | Records | GR recall | RE recall | RU recall | WA recall |
|---|---:|---:|---:|---:|---:|
| AH | 2206 | 0.802 | 0.299 | 0.904 | 0.943 |
| BH | 1980 | 0.901 | 0.285 | 0.729 | 1.000 |
| BR | 2118 | 0.848 | 0.203 | 0.833 | 0.907 |
| RC | 2560 | 0.779 | 0.232 | 0.877 | 0.961 |

Per-animal record accuracy ranges from 0.584 to 0.836; median 0.759. The five lowest-accuracy animals are listed in the JSON artifact.

## Repeated timestamps and temporal dependence

The raw file has 290 repeated animal-minute keys, including 54 keys with conflicting behavior labels (121 rows). The frozen OOF file follows its documented policy of collapsing same-label repeats and excluding conflicting keys.

Among 7559 exact one-minute neighbor pairs, observed behavior persistence is 0.931; OOF prediction persistence is 0.750; correctness status persists at 0.794. The source label protocol carries previous labels forward for behaviors shorter than 30 seconds, so persistence is partly annotation-induced.

## Ranch provenance

Leave-one-ranch-out is possible from the Figshare record’s breed-to-site mapping: AH and RC are from Jornada Experimental Range (USDA); BR and BH are from Chihuahuan Desert Rangeland Research Center (NMSU). Ranch is not a CSV column, so this grouping is derived from the primary source description. With only two sites, and breed perfectly nested within site, a two-fold result confounds ranch and breed and cannot establish broad site transfer.

## Preregistered next evaluation (proposal only; not run)

Use the current six outer grouped-by-animal folds (one animal per breed per fold), and five inner grouped-by-animal folds within each outer training split (one animal per breed per inner fold). Compare only the predeclared univariate threshold rule, multinomial logistic, shallow CART, and causal temporal logistic families specified in the JSON. Fit all cutpoints, scaling, class weights, and hyperparameters inside inner training folds; temporal models use past MI only and reset at time gaps.

Select by equal-animal-weighted mean F1 for the weak RE and RU classes; tie-break by minimum RE/RU recall, four-class macro-F1, then lower complexity. Report all four classes and per-animal results. Also report a separate two-fold leave-one-ranch-out stress test without using it for model selection. If RE/RU remain weak, report the four-class task as not ready; do not merge labels after seeing the results.

The input is one scalar motion index, not the raw X/Y/Z signals. This behavior classification diagnostic does not validate DMI, ADG, BR-CORTE, or the Riose engine.

Machine-readable details: `docs/evidence/perea-behavior-oof-diagnostic.json`.

Primary source: [Figshare record](https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181); article DOI [10.1016/j.atech.2025.101002](https://doi.org/10.1016/j.atech.2025.101002).
