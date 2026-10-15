# CPER pre-outcome ADG candidate development v1

**Status:** internal development only; not external or prospective validation.

Protocol SHA-256: `f87839a234328d5380d0789ad3865622555b5095f3f895ad887290d246a745e0`  
Source SHA-256: `533929668b59bc9b6f67bf202c87a746634871419972db126e6c94b2f83eac14`  
Outer OOF predictions: 320 across 5 held-out years.

## Feature and alias audit

Initial weight is the only model feature. Realized season duration is excluded because it may not be known before prediction. Treatment and pasture are excluded because each treatment maps to exactly one pasture in this dataset.

## Nested year-held-out results

All tuning of the Ridge alpha occurs in inner leave-one-year-out folds inside the outer training years. These OOF scores are descriptive internal development results.

| Model | Pooled MAE | Pooled RMSE | Pooled bias | Year-macro MAE |
|---|---:|---:|---:|---:|
| Training mean | 0.221 | 0.298 | +0.001 | 0.220 |
| OLS: initial weight | 0.234 | 0.309 | +0.021 | 0.233 |
| Ridge: initial weight (inner-year alpha) | 0.233 | 0.308 | +0.020 | 0.232 |

## Fold details

| Held-out year | Train n | Test n | Purged ID proxies | Ridge alpha | M0 MAE | OLS MAE | Ridge MAE |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2009 | 254 | 62 | 4 | 10 | 0.130 | 0.161 | 0.158 |
| 2010 | 255 | 65 | 0 | 10 | 0.123 | 0.128 | 0.128 |
| 2011 | 256 | 64 | 0 | 10 | 0.120 | 0.124 | 0.124 |
| 2012 | 248 | 65 | 7 | 10 | 0.436 | 0.444 | 0.443 |
| 2013 | 251 | 64 | 5 | 10 | 0.290 | 0.307 | 0.306 |

## Limits

- This is internal model development within one CPER site and five annual blocks, not external or prospective validation.
- The model feature set contains initial weight only; realized season duration, treatment and pasture are excluded.
- Treatment and pasture are perfectly aliased in this cohort; a treatment coefficient cannot be separated from a pasture effect, and transport to unseen pastures is unsupported.
- Only five outer year blocks are available, so no inferential confidence interval or robust stability claim is made.
- The small univariate candidate set did not use CGREC or any previously reported external metrics for fitting, tuning or selection.
- Results do not validate mature cows, DMI, causal treatment effects, new sites, or the complete simulator.

Reproduce with `python3 scripts/science/evaluations/evaluate_cper_preoutcome_adg_candidates.py`. The JSON report and OOF predictions are stored beside this report.
