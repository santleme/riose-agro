# CPER ADG internal leave-one-year-out evaluation

Classification: **internal_cper_yearling_steer_adg_leave_one_year_out_diagnostic_not_validation**

Population: CPER yearling steers; non-steers excluded by protocol. (320 rows, 320 OOF predictions).
Development years: 2009, 2010, 2011, 2012, 2013. Duration is treated as a **known-at-prediction horizon** per the frozen protocol. No CGREC or CPER 2014+ outcomes were read or used.

## Candidate metrics

| Candidate | Pooled MAE | Pooled RMSE | Pooled bias | Year-macro MAE | Gate |
|---|---:|---:|---:|---:|---|
| M0 | 0.221 | 0.298 | 0.001 | 0.220 | reference |
| M1 | 0.342 | 0.453 | -0.098 | 0.341 | does not pass |
| M2 | 0.459 | 0.508 | -0.422 | 0.460 | does not pass |
| M3 | 0.265 | 0.350 | -0.012 | 0.264 | does not pass |

## Fold results

| Held year | Train n | Test n | Purged identities | M0 MAE | M1 MAE | M2 MAE | M3 MAE |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2009 | 254 | 62 | 4 | 0.130 | 0.164 | 0.552 | 0.220 |
| 2010 | 255 | 65 | 0 | 0.123 | 0.139 | 0.427 | 0.142 |
| 2011 | 256 | 64 | 0 | 0.120 | 0.145 | 0.450 | 0.139 |
| 2012 | 248 | 65 | 7 | 0.436 | 0.474 | 0.224 | 0.515 |
| 2013 | 251 | 64 | 5 | 0.290 | 0.783 | 0.649 | 0.303 |

Selected candidate under the frozen operational rule: **none**.

Internal development only. A passing candidate does not establish external transport, mature-cow/DMI validity, causal treatment effects, or full-engine validation. CGREC and all CPER 2014+ outcomes were not used.

The prediction target is raw endpoint ADG in kg/head/day. `Use.Flag` is reported but never used as a feature; final weight, gain, ADG-derived values, year, pasture ID, and group identifiers are excluded from predictors. Treatment is represented by the prespecified one-hot terms (heavy reference).

This five-year internal CV is not an independent external validation and does not validate DMI or the full Riose engine.
