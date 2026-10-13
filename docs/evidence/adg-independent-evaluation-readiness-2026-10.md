# ADG external evaluation readiness (October 2026)

## Decision

The existing CPER-to-CGREC evaluation remains the only external-site ADG transport diagnostic. A separate nested CPER development experiment has now compared pre-outcome candidates without using CGREC outcomes. It did not improve the baseline and does not create a new holdout. Both results remain separate from mature-cow DMI and full-engine validation.

Reproduce source integrity and the evaluation with:

```sh
npm run audit:usda-cgrec-longterm
npm run audit:engine-adg-cgrec-transport
```

The scripts write the integrity report to [`usda-cgrec-longterm-audit.json`](usda-cgrec-longterm-audit.json) and the evaluation to [`engine-adg-usda-cgrec-transport-check.json`](engine-adg-usda-cgrec-transport-check.json). A focused regression test is `tests/usda-cgrec-engine-adg.test.js`.

## Existing independent split

The development set is USDA-ARS CPER yearling-steer data from 2009–2013 (302 observations). The external holdout is CGREC in North Dakota, a separate station and animal cohort, with 291 yearling-steer records from 1989, 1994, and 2015. CGREC data are public domain; the local source file checksum is verified. Source record ID, tag, year, pasture, and treatment are retained. The published pound-based ADG is independently reconciled against endpoint weights and duration before conversion to kg/day.

The comparison uses the frozen engine, its CPER development-set scale, and a simple constant baseline equal to the CPER development-set mean ADG. No CGREC outcomes are used to fit or select a prediction. On the same 291 external records:

| Prediction | MAE (kg/head/day) | RMSE (kg/head/day) | Mean error (kg/head/day) |
|---|---:|---:|---:|
| CPER development mean baseline | 0.242 | 0.301 | -0.132 |
| Frozen engine × CPER development scale | 0.222 | 0.310 | -0.058 |
| Frozen engine default | 0.540 | 0.574 | -0.500 |

These are descriptive errors on one external station, not evidence that the engine outperforms a generalizable ML model. The scaled engine has slightly lower MAE but higher RMSE than the constant baseline in this holdout.

## New internal candidate development

The additional pre-registered CPER-only experiment uses the 320 yearling-steer observations from 2009–2013 and nested leave-one-year-out folds with repeated animal identity proxies purged from each training split. Only initial liveweight is used as a predictor. Realized grazing duration is excluded because it is not guaranteed to be available before prediction; treatment and pasture are excluded because they map one-to-one in these records.

On the identical 320 outer OOF rows, the training mean baseline had MAE/RMSE/bias 0.221/0.298/+0.001 kg/head/day, OLS with initial weight had 0.234/0.309/+0.021, and nested Ridge had 0.233/0.308/+0.020. Ridge selected alpha 10 in all five outer years. No candidate improved the baseline. The result is internal development evidence from one site and five year blocks, not validation or evidence for mature-cow DMI. See the [pre-registration](../../experiments/diagnostics/adg/cper-preoutcome-candidate-v1/preregister.md), [evaluation](../../experiments/diagnostics/adg/cper-preoutcome-candidate-v1/evaluation.md), and [reproducible runner](../../scripts/evaluate_cper_preoutcome_adg_candidates.py).

## Limits and remaining gate

This is a separate yearling-steer ADG diagnostic. The frozen engine receives starting weight and interval duration but not matched pasture biomass, weather, forage quality, stocking group, or supplementation. The CGREC sample covers only three years at one site, and 200 of 291 records are from 2015. It does not establish performance in mature cows, Brazilian systems, individual DMI, pasture inventory, cost, causal management effects, calibrated uncertainty, or the full simulator.

Therefore this work does not change the DMI readiness decision: the original mature beef-cow pasture DMI target remains NO-GO until an eligible, downloadable, individually identified source is obtained. No training or validation claim is transferred between the ADG and DMI populations.
