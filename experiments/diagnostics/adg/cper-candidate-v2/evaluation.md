# CPER ADG candidate comparison v2

**Classification:** internal development diagnostic only; not external/prospective validation.

Protocol SHA-256: `1aa0df305d5ea08261e96ef97983f619ee02c6964860f6a519288d04c95692b4`  
Source SHA-256: `533929668b59bc9b6f67bf202c87a746634871419972db126e6c94b2f83eac14`  
Outer OOF rows: 320 across five years.

## Results

| Candidate | pooled MAE | pooled RMSE | pooled bias | year-macro MAE | nested selection improved over M0? |
|---|---:|---:|---:|---:|:---:|
| M0 — training mean | 0.221 | 0.298 | +0.001 | 0.220 | — |
| M1 — OLS | 0.234 | 0.309 | +0.021 | 0.233 | False |
| M2 — Ridge | 0.233 | 0.308 | +0.020 | 0.232 | False |
| M3 — Huber | 0.220 | 0.296 | +0.038 | 0.220 | True |
| M4 — shallow random forest | 0.221 | 0.302 | +0.017 | 0.220 | False |
| M5 — shallow histogram gradient boosting | 0.220 | 0.301 | +0.015 | 0.220 | True |

## Mechanistic reference

The default engine and train-scaled engine use each animal's realized season duration. Their scores are duration-conditioned descriptive benchmarks only; they were excluded from model tuning and selection.

| Benchmark | pooled MAE | pooled RMSE | pooled bias |
|---|---:|---:|---:|
| FarmEngine default | 0.459 | 0.508 | -0.422 |
| FarmEngine × outer-training scale | 0.265 | 0.350 | -0.012 |

## Per-year metrics

MAE in kg/head/day; all candidates share the exact same test rows per year.

| Year | n | M0 | OLS | Ridge | Huber | RF | HGB |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2009 | 62 | 0.130 | 0.161 | 0.158 | 0.145 | 0.117 | 0.119 |
| 2010 | 65 | 0.123 | 0.128 | 0.128 | 0.122 | 0.122 | 0.119 |
| 2011 | 64 | 0.120 | 0.124 | 0.124 | 0.121 | 0.121 | 0.118 |
| 2012 | 65 | 0.436 | 0.444 | 0.443 | 0.437 | 0.432 | 0.434 |
| 2013 | 64 | 0.290 | 0.307 | 0.306 | 0.272 | 0.309 | 0.308 |

## Descriptive subgroup MAE

Use.Flag and treatment are reported as subgroups only; they were not used as predictors or selection variables.

| Candidate | Use.Flag 0 | Use.Flag outlier | Treatment heavy | moderate | light |
|---|---:|---:|---:|---:|---:|
| M0 | 0.215 | 0.399 | 0.232 | 0.211 | 0.212 |
| M1 | 0.228 | 0.392 | 0.248 | 0.219 | 0.223 |
| M2 | 0.227 | 0.392 | 0.247 | 0.219 | 0.223 |
| M3 | 0.215 | 0.384 | 0.235 | 0.211 | 0.202 |
| M4 | 0.215 | 0.390 | 0.233 | 0.213 | 0.209 |
| M5 | 0.215 | 0.387 | 0.232 | 0.213 | 0.206 |

## Interpretation and limits

- Hyperparameters are selected only within the four available inner years of each outer fold. The same five outer years were examined in earlier CPER work, so these nested OOF results are development diagnostics, not an untouched validation set.
- Identity purging uses Owner|Tag.Color|Tag as a proxy; a permanent ID was not verified. Treatment and pasture are aliased and excluded.
- Realized season duration is excluded from all learned models. Engine results condition on that observed duration, so cannot be compared as pre-season predictions or selected for advancement.
- One site and five years do not support transport claims. These results do not validate mature cows, DMI, causal treatment effects, or the full simulator.
- No CGREC outcomes were read or used.

## Runtime

Cumulative nested-search and outer-refit costs (CPU seconds; environment-dependent):

| Candidate | Fit calls | Fit seconds | Predict rows | Predict seconds | Predict µs/row |
|---|---:|---:|---:|---:|---:|
| M1 | 5 | 0.002936 | 320 | 0.000401 | 1.25 |
| M2 | 85 | 0.034203 | 5376 | 0.005439 | 1.01 |
| M3 | 125 | 0.152470 | 7904 | 0.010029 | 1.27 |
| M4 | 85 | 4.899093 | 5376 | 0.151429 | 28.17 |
| M5 | 85 | 0.545922 | 5376 | 0.024388 | 4.54 |
| Engine reference (320 rows) | — | — | 320 | 0.198545 | 620.45 |

Timings are environment-dependent and intended only as inference-cost diagnostics. Fit seconds include nested candidate search and outer refits; engine row time includes helper-process startup.

Reproduce with `python3 scripts/evaluate_cper_adg_candidate_v2.py` under `requirements-data-processing.txt`.
