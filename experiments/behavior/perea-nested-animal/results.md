# Perea nested behavior evaluation

Preregistered nested evaluation of video-reviewed pasture behavior labels from Perea et al. This is a within-source held-out-animal diagnostic; it does not validate DMI, ADG, BR-CORTE, lameness, or the Riose engine.

Source: [Figshare dataset](https://doi.org/10.6084/m9.figshare.28801181.v2), license CC BY 4.0; source checksum `7cd143e8cccc79a5e159eaa83428529f`.

## Protocol

The audit retained 8,864 unique animal-minute rows from 24 animals after same-label duplicate collapse and conflicting-label exclusion. The common temporal analysis contains 5,582 rows; 3,282 rows without four consecutive prior minutes are omitted from every candidate comparison.

Features are `[MI_t, MI_t-1, MI_t-2, MI_t-3, MI_t-4]`, generated within animal and reset at every timestamp gap. No future MI, behavior history, site, breed, or animal identifier is a model feature. Six outer folds use the already frozen animal assignments. In each outer training set, the five remaining animals per breed are sorted by ID and assigned one per inner fold. Each inner split holds four animals (one per breed); the other 16 animals train the candidate.

Seven fixed candidates were compared using identical temporal-complete rows: static MI logistic, three lagged logistic settings (`C=0.1, 1, 10`), and lagged CART (`max_depth=2, 3, 4`, `min_samples_leaf=20`). Scaling and class/animal weights are fit inside each training split. The inner score is the equal-animal mean of per-animal RE/RU F1, followed by minimum RE/RU recall, equal-animal macro-F1, and preregistered complexity order. Outer labels were used only for post-selection reporting.

## Nested selected OOF results

Selected candidate counts across six outer folds: `{"cart_depth_4": 4, "temporal_logistic_c_10": 2}`.

| Metric | Value |
|---|---:|
| Equal-animal mean F1, RE/RU (primary) | 0.403 |
| Equal-animal RE recall | 0.308 |
| Equal-animal RU recall | 0.727 |
| Equal-animal four-class macro-F1 | 0.666 |
| Observation-weighted accuracy | 0.814 |

## Fixed candidate OOF comparison

Candidate outer scores are descriptive only; they did not participate in selection.

| Candidate | RE F1 | RU F1 | Primary RE/RU F1 | RE recall | RU recall | Macro-F1 | Accuracy |
|---|---:|---:|---:|---:|---:|---:|---:|
| static_logistic | 0.283 | 0.468 | 0.375 | 0.237 | 0.785 | 0.642 | 0.786 |
| temporal_logistic_c_0_1 | 0.160 | 0.468 | 0.314 | 0.124 | 0.885 | 0.567 | 0.690 |
| temporal_logistic_c_1 | 0.291 | 0.504 | 0.397 | 0.229 | 0.856 | 0.650 | 0.782 |
| temporal_logistic_c_10 | 0.354 | 0.520 | 0.437 | 0.294 | 0.844 | 0.677 | 0.805 |
| cart_depth_2 | 0.000 | 0.452 | 0.226 | 0.000 | 0.934 | 0.571 | 0.769 |
| cart_depth_3 | 0.366 | 0.483 | 0.425 | 0.312 | 0.780 | 0.674 | 0.810 |
| cart_depth_4 | 0.370 | 0.459 | 0.414 | 0.321 | 0.723 | 0.672 | 0.813 |
| training-fold majority (reference) | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.159 | 0.485 |

## Frozen static baseline on all rows

This existing result uses all 8,864 audited rows and is provided for context only; it is not an apples-to-apples score against the temporally complete 5,582-row set.

| Reference | Observation-weighted accuracy | Observation-weighted macro-F1 | Equal-animal accuracy | Equal-animal macro-F1 |
|---|---:|---:|---:|---:|
| MI logistic, 6-fold grouped OOF | 0.739 | 0.662 | 0.741 | 0.664 |

## Per-fold selection and outcome

| Outer fold | Selected candidate | Primary RE/RU F1 | RE recall | RU recall | Macro-F1 | Test animals |
|---:|---|---:|---:|---:|---:|---|
| 0 | cart_depth_4 | 0.447 | 0.248 | 0.938 | 0.683 | AH:2003, BH:4085, BR:8073, RC:2024 |
| 1 | temporal_logistic_c_10 | 0.301 | 0.108 | 0.969 | 0.630 | AH:2019, BH:5111, BR:8065, RC:2061 |
| 2 | temporal_logistic_c_10 | 0.361 | 0.279 | 0.536 | 0.652 | AH:2008, BH:4511, BR:8071, RC:35 |
| 3 | cart_depth_4 | 0.427 | 0.578 | 0.345 | 0.690 | AH:2004, BH:6495, BR:7001, RC:1067 |
| 4 | cart_depth_4 | 0.475 | 0.334 | 0.817 | 0.678 | AH:2009, BH:4071, BR:8063, RC:6 |
| 5 | cart_depth_4 | 0.404 | 0.301 | 0.754 | 0.662 | AH:2013, BH:4589, BR:8089, RC:9012 |

## Limits

The outer folds hold out animals but reuse the same two ranches and all breeds, so these numbers do not establish ranch transfer. The source has only one scalar motion index, 24 animals, and repeated minute-level labels; short behaviors may inherit labels from adjacent minutes, so a temporal model can benefit from annotation persistence. The frozen static baseline on all 8,864 rows is reported separately in the JSON and is not directly comparable with this 5,582-row common temporal subset.

The JSON report includes per-animal scores, actual-by-predicted confusion matrices, complete outer fold assignments, inner rankings, and each fold's selected candidate.

Reproduce with `python3 experiments/behavior/perea-nested-animal/run_perea_nested_evaluation.py`. Machine-readable results: `experiments/behavior/perea-nested-animal/results.json`; OOF rows: `experiments/behavior/perea-nested-animal/predictions.csv`.
