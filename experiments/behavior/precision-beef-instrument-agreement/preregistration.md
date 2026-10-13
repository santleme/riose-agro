# Precision Beef instrument-agreement diagnostic

Registered 2026-10-13 before fitting a model. This is a separate, narrow diagnostic on the public Precision Beef source: collar accelerometer summaries versus the RumiWatch halter's instrument-derived classifications. It does not validate human-observed behavior or Riose outputs.

## Source and cohort

- Source: Zenodo [10.5281/zenodo.4064802](https://doi.org/10.5281/zenodo.4064802), record-declared CC BY 4.0; primary article [10.3390/s22062323](https://doi.org/10.3390/s22062323).
- The README describes 18 finishing steers in indoor housing over three UK farm trials; breed and exact age are not given.
- Preserve the README split: animals 04, 10, and 11 are source-test animals; the other 15 are source-train animals. The primary article has already reported a test result using this cohort, so this is not a new independent literature holdout.

## Frozen preparation

- Keep the source's timezone-naive wall-clock timestamps unchanged.
- Pair collar and halter rows by exact timestamp equality only. Do not shift, interpolate, or nearest-match records.
- Aggregate to source seconds. Retain only seconds with exactly ten exact, valid collar/halter pairs and a unique majority reference class. Exclude tied reference classes and report their number and proportion.
- Inputs are collar-only per-axis mean, population standard deviation, minimum, and maximum for x/y/z in mg.
- Target is the unique second-level majority of the RumiWatch codes: 0 other, 1 rumination, 2 eating-or-drinking. Drinking is already merged into eating by the source.
- Never use labels, animal/trial identifiers, timestamps, or split as model predictors. Keep each animal wholly within its source split.

## Fixed models and evaluation

Compare an equal-animal-weighted training-majority class baseline (break ties by smaller numeric class code) with one fixed `RandomForestClassifier`: 200 trees, depth 12, minimum leaf 10, square-root feature sampling, `balanced_subsample` class weights, one CPU worker, and seed 20261013. Give every source-train animal equal total training weight, distributed evenly over its eligible seconds.

Report descriptive leave-one-animal-out predictions within the 15 source-train animals. Fit the fixed models on those 15 animals and evaluate once on untouched source-test animals 04, 10, and 11. The primary metric is pooled macro-F1 over the three classes. Also report balanced accuracy, accuracy, class precision/recall/F1/support, per-animal confusion matrices and metrics, eligible coverage, and CPU fit/inference time.

Do not bootstrap seconds as if independent. Report the three test-animal results separately; three animals cannot support population-level uncertainty, calibration, or held-out-trial/farm claims.

## Interpretation boundary

The target is an instrument reference, not human-video-confirmed truth in the downloaded files. The source-test animals have already been used in the primary article. Results can describe agreement between a collar model and RumiWatch within this source split only. They cannot validate pasture behavior, mature cows, DMI, ADG, pasture biomass, uncertainty intervals, or the Riose engine.
