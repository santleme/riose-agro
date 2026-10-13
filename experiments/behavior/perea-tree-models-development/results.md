# Perea tree-model development comparison

Exploratory post-baseline development on the Perea within-source animal-group folds. Candidate families were chosen after previous Perea results had been inspected. These results are neither confirmatory nor independent validation, and do not establish ranch transfer, DMI, ADG, or engine validity.

Source: [Figshare Perea dataset](https://doi.org/10.6084/m9.figshare.28801181.v2) (CC BY 4.0); CSV MD5 `7cd143e8cccc79a5e159eaa83428529f`. Protocol: `preregistration.json` (written before fitting).

## Paired nested comparison

| Procedure | Equal-animal mean F1, RE/RU | RE recall | RU recall | 4-class macro-F1 | Balanced accuracy | Accuracy |
|---|---:|---:|---:|---:|---:|---:|
| Prior frozen nested selection | 0.403 | 0.308 | 0.727 | 0.666 | 0.723 | 0.814 |
| Expanded fixed-family nested selection | 0.470 | 0.391 | 0.740 | 0.704 | 0.750 | 0.835 |

Expanded-minus-prior primary difference: +0.068; 95% paired animal-bootstrap percentile interval [+0.046, +0.091] from 10,000 resamples of 24 animals. This is a descriptive within-cohort sensitivity interval, not prediction uncertainty or calibration.

## Fixed candidate outer OOF diagnostics

| Candidate | RE F1 | RU F1 | Primary RE/RU F1 | RE recall | RU recall | Macro-F1 | Balanced accuracy | Accuracy |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| static_logistic | 0.283 | 0.468 | 0.375 | 0.237 | 0.785 | 0.642 | 0.707 | 0.786 |
| temporal_logistic_c_0_1 | 0.160 | 0.468 | 0.314 | 0.124 | 0.885 | 0.567 | 0.670 | 0.690 |
| temporal_logistic_c_1 | 0.291 | 0.504 | 0.397 | 0.229 | 0.856 | 0.650 | 0.720 | 0.782 |
| temporal_logistic_c_10 | 0.354 | 0.520 | 0.437 | 0.294 | 0.844 | 0.677 | 0.739 | 0.805 |
| cart_depth_2 | 0.000 | 0.452 | 0.226 | 0.000 | 0.934 | 0.571 | 0.694 | 0.769 |
| cart_depth_3 | 0.366 | 0.483 | 0.425 | 0.312 | 0.780 | 0.674 | 0.728 | 0.810 |
| cart_depth_4 | 0.370 | 0.459 | 0.414 | 0.321 | 0.723 | 0.672 | 0.725 | 0.813 |
| random_forest | 0.436 | 0.500 | 0.468 | 0.381 | 0.747 | 0.703 | 0.749 | 0.836 |
| hist_gradient_boosting | 0.445 | 0.498 | 0.471 | 0.390 | 0.747 | 0.705 | 0.752 | 0.834 |

No candidate-level outer score was used for tuning; inner animal-group OOF predictions selected the model separately in each outer fold. Per-animal, per-fold, per-breed, and confusion-matrix details are in `results.json`.

## Limits and interpretation

The expanded nested result advances only if it exceeds the already inspected prior result and the paired group-bootstrap lower percentile is above zero. If that gate fails, retain the prior result as the better development reference; no ML improvement is established. The outer folds reuse all sampled breeds and the same two ranches. Ranch is confounded with breed and absent from the model CSV, so ranch-specific effects and ranch transport cannot be separated. Labels are repeated minute annotations, and temporal history may benefit from label persistence.

CPU time is measured with `process_time` during fitting and held-out prediction; values characterize this small tabular experiment only.
