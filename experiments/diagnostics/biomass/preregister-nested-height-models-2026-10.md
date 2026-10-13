# Nested development protocol for single-height biomass candidates

**State:** registered before fitting the new candidate family. This is an exploratory development exercise chosen after the existing Mendeley and Dryad baseline results had already been reviewed. The nested outer predictions do not make those earlier reviewed outcomes pristine; this is not independent validation.

## Data and target

Use only the 234 complete rows in the Mendeley Brazilian pasture cohort (`10.17632/nj72kmdj77.1`, CC BY 4.0). Predict clipped-quadrat dry forage yield in kg DM/ha from one feature, `sward_height_cm`. The Parquet SHA-256 is `ccc626011de7445769efc72a1168fea99a7b1db6e2c4d87b8fdd9f2f987e4fc7`. Height was collected at the same points as biomass in the later campaigns, but the source does not document whether it was read before clipping. Treat the relationship as study-local and do not describe it as a proven pre-measurement operational predictor.

The feature-and-group-only preflight found 13 outer spatial components. Each outer training subset retained 210–216 rows. Repeating the same buffered component split inside each outer training subset gave 12 nonempty inner folds, 100% inner validation coverage, and at least 192 inner training rows. The preflight did not inspect outcomes. Stop without fitting if any outer training set has fewer than eight nonempty inner folds, under 70% coverage, or an empty inner train set. Never reduce the 100 m buffer to make the gate pass.

## Fixed candidates and selection

The new, compact exploratory candidates are increasing isotonic regression, a shallow 100-tree monotone random forest, and a monotone histogram gradient booster with three leaves. Their exact settings and seeds are frozen in the JSON protocol. Median and OLS remain the baseline and reference. No parameter search is allowed.

For every outer holdout, choose among median, OLS, isotonic, RF, and HGB using only the equal-weight mean of inner buffered-block MAE. Fit the selected estimator on that outer training set and predict its held-out block. Also write fixed-candidate outer OOF predictions for all models on the same 234 rows. Outer candidate errors are descriptive and cannot select a global model. Dryad outcomes, including the previously reported external results, are excluded from all fitting, selection, threshold setting, and tuning.

Do not use target aliases, fresh weights, identifiers, coordinates, farm/campaign labels, later measurements, or Dryad values as features. Keep all coordinate aliases and points within the 100 m buffer out of training for each held-out component.

## Advancement criteria

Compare the nested-selected procedure with OLS on identical outer rows. A development candidate advances only if it improves equal-block MAE by at least 10%, worsens pooled RMSE by no more than 5%, has absolute pooled bias no more than 100 kg DM/ha above OLS, and worsens no farm or campaign subgroup MAE by more than 10%. If any condition fails, retain OLS as the development reference. Report all 13 spatial-block errors and subgroup results; two farms do not support population-level confidence or prediction intervals.

The Dryad comparison was already reported before this candidate family was specified. It cannot be called an independent validation of these candidates, and it is not to be consulted for selection. This run does not establish new-farm transport, tropical pasture inventory, animal DMI, ADG, or Riose engine validity.

## Reproduction

```bash
uv run --python 3.12 --with-requirements requirements-data-processing.txt -- python scripts/evaluate_biomass_nested_development.py
uv run --python 3.12 --with-requirements requirements-data-processing.txt -- python -m unittest tests.test_biomass_nested_development -v
```

