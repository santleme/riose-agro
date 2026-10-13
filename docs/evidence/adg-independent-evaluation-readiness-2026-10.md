# ADG external evaluation readiness (October 2026)

## Decision

The existing CPER-to-CGREC evaluation is sufficient for the current, narrowly scoped ADG transport diagnostic. This work block does not add another holdout or fit another model because that would repeat an existing reproducible comparison. The result remains separate from mature-cow DMI and from full-engine validation.

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

## Limits and remaining gate

This is a separate yearling-steer ADG diagnostic. The frozen engine receives starting weight and interval duration but not matched pasture biomass, weather, forage quality, stocking group, or supplementation. The CGREC sample covers only three years at one site, and 200 of 291 records are from 2015. It does not establish performance in mature cows, Brazilian systems, individual DMI, pasture inventory, cost, causal management effects, calibrated uncertainty, or the full simulator.

Therefore this work does not change the DMI readiness decision: the original mature beef-cow pasture DMI target remains NO-GO until an eligible, downloadable, individually identified source is obtained. No training or validation claim is transferred between the ADG and DMI populations.
