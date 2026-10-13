# Mendeley spatial CV and Dryad external biomass evaluation

**Status:** evaluation complete under the frozen protocol. Dryad outcomes were used once for reporting and not for model selection.

Selected model: **M1_ols**. Buffered development CV: 13 blocks, 100.0% row coverage.

## Buffered development CV

| Candidate | Pooled MAE | Block macro MAE | RMSE | Bias |
|---|---:|---:|---:|---:|
| M0_median | 996.7 | 996.7 | 1314.3 | -308.1 |
| M1_ols | 649.7 | 649.7 | 885.7 | -3.3 |
| M2_ridge | 649.8 | 649.8 | 885.8 | -3.3 |
| M3_huber | 646.0 | 646.0 | 887.8 | -81.1 |
| M4_quadratic | 655.1 | 655.1 | 900.7 | 4.9 |

## One-time Dryad external evaluation

Selected model: **M1_ols**; source DOI `10.5061/dryad.79cnp5ht4`; rows 64; paddock groups 8.

| Stratum | Rows | MAE | RMSE | Bias |
|---|---:|---:|---:|---:|
| All rows | 64 | 2507.1 | 2986.4 | 2094.7 |
| In support | 40 | 1659.2 | 1894.5 | 1231.6 |
| Above support (extrapolation) | 24 | 3920.2 | 4219.1 | 3533.2 |

Paddock-macro MAE: **2507.1 kg DM/ha**.

The 13 spatial blocks belong to two farms; the independent Dryad cohort has only eight repeated paddocks and a temperate US forage system. These results concern biomass alone and do not establish new-farm generalization, DMI, ADG, behavior, inventory, or full-engine validity. No calibrated interval or population-level confidence interval is claimed.
