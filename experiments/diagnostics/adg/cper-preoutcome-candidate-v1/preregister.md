# CPER pre-outcome ADG candidate development v1

**Registered before execution.** The experiment is internal development for CPER yearling steers only. It does not use CGREC outcomes and does not change frozen baseline or transport artifacts.

## Data and feature decision

Use the 320 CPER steer records from 2009–2013, including source rows marked as outliers. The target is raw endpoint ADG, `(off_Weight - on_Weight) × 0.45359237 / Season.Days`, in kg/head/day.

Initial liveweight is the only predictor. Realized `Season.Days` is excluded because the field may only be known after the grazing interval; the existing known-horizon assumption is not extended into this experiment. `Treatment` and `Pasture` are excluded: each treatment maps to one remaining pasture in this dataset, so their effects cannot be separated and would not support transport to an unseen pasture. Year, identity, source QC flag, ending weight, gain, shrink and ADG-derived fields are excluded as predictors.

## Nested split and candidates

The outer evaluation holds out each year from 2009 through 2013 in turn. Training rows sharing the held-out year's `Owner|Tag.Color|Tag` identity proxy are purged. For every outer fold, Ridge alpha is selected only by equally weighted MAE across leave-one-year-out inner folds in that outer training partition. Ties choose the smaller alpha. No random split or stochastic fitting is used.

- **M0:** mean ADG of outer training rows.
- **M1:** ordinary least squares using initial weight only.
- **M2:** Ridge using initial weight only; alpha from the fixed grid `[0.01, 0.1, 1, 10]`, selected inside the outer training data.

Report pooled OOF MAE, RMSE and signed bias; equally weighted outer-year macro metrics; fold metrics; Ridge selections; and descriptive source-flag metrics. Do not use the five year blocks to claim inferential uncertainty or transport performance. This is not an external or prospective validation and does not validate mature cows, DMI, causal treatment effects, other sites or the full engine.

Machine-readable protocol: [`preregister.json`](preregister.json).
