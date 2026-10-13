# ADG diagnosis and internal CV pre-registration

**State:** protocol registered; no candidate models were fit or tuned for this diagnosis.

## Scope and prior evidence

The historical CGREC comparison is already consulted. It is a descriptive external-site yearling-steer ADG transport diagnostic, not a new final test. Its source is public-domain CGREC data from North Dakota (DOI `10.15482/USDA.ADC/1524719`); the development data are public-domain CPER records from Colorado (DOI `10.15482/USDA.ADC/1528520`). Reproduce existing source checks and reports with `npm run audit:usda-cgrec-longterm`, `npm run audit:engine-adg-cper-ltgi`, and `npm run audit:engine-adg-cgrec-transport`.

Existing artifacts audited:

- `docs/evidence/usda-cper-ltgi-audit.json` — source, row-level CPER observations, unit checks and identity fields.
- `docs/evidence/engine-adg-usda-cper-ltgi-check.json` — CPER temporal holdout and development-only baseline/scale.
- `docs/evidence/usda-cgrec-longterm-audit.json` — source checks and CGREC endpoint reconciliation.
- `docs/evidence/engine-adg-usda-cgrec-transport-check.json` — CPER-to-CGREC external-site comparison, including metrics by year.
- `docs/evidence/rothamsted-adg-audit.json`, `docs/evidence/engine-adg-rothamsted-check.json`, and `docs/evidence/zenodo-maremmana-adg-audit.json` — distinct cohort/year diagnostics already present; none supplies an untouched final test for the new protocol.

The CPER baseline development period 2009–2013 has 320 valid steer records before the existing conservative identity purge and 302 after it. In the purged rows, starting weight is 186.9–344.7 kg (median 274.0), grazing duration is 120–137 days (median 133), and raw endpoint ADG is −0.100 to 1.542 kg/head/day (mean 0.922, median 0.954). Treatment counts are light 68, moderate 94, and heavy 140. Year means vary substantially: 2009 1.008, 2010 0.939, 2011 0.944, 2012 0.569, and 2013 1.154 kg/head/day. The annual differences make a random row split inappropriate.

In the historical CGREC report, the all-year MAE/RMSE/bias (prediction minus observation) are 0.540/0.574/−0.500 kg/head/day for the frozen default engine, 0.222/0.310/−0.058 for the engine multiplied by the CPER-fitted scale, and 0.242/0.301/−0.132 for the CPER-mean baseline. The 1994 group is a sharp reversal: only 14 steers, each on a 192-day season, with mean observed ADG 0.257 kg/day. Mean prediction is 0.662 for the default engine (bias +0.405), 1.189 for the scaled engine (bias +0.932), and 0.922 for the constant baseline (bias +0.665). Five of the 14 initial weights exceed the CPER development maximum of 344.7 kg. 1994 has two moderate, four heavy, and eight extreme-treatment records, with no light group. The CGREC catalogue also notes that 1994 was the only year with mixed-sex herds; this remains a trial-context difference even though the evaluated rows are filtered to records coded as steers. These small-sample metrics flag a context shift; they do not identify its cause.

## Measurement and domain audit

- **Target and unit:** Use raw endpoint ADG, `(final weight − initial weight) / grazing days`, in kg/head/day. CGREC's dictionary labels ADG simply as pounds, but the audit reconciles the published value to endpoint pounds divided by `ADG_DAYS`; both sources are converted with `0.45359237 kg/lb`. Keep the source-published/shrunk ADG as a named sensitivity only, never mix it with the raw primary target.
- **Duration:** CPER development seasons are 120–137 days. CGREC steer seasons are 92 days (1989), 192 (1994), and 122 (2015). The 1994 duration lies outside the CPER development duration range.
- **Weight support:** CPER development starting weights are 186.9–344.7 kg. CGREC 1994 ranges 283.0–435.9 kg; five records are above CPER support. Starting weight alone cannot account for the very low 1994 gains.
- **Population:** CPER development is yearling steers in a shortgrass-steppe grazing system; CGREC selected records are yearling steers with breed unknown in North Dakota mixed-grass prairie. This is an ADG cohort, not mature cows and not DMI.
- **System and trial structure:** CPER has light/moderate/heavy grazing with one remaining pasture replicate per treatment. CGREC has mixed intensity labels including extreme; it reports a 1994 mixed-sex herd context. Supplementation was used in CGREC in 2015, while the engine transfer uses zero supplement. These management contexts are absent from the present engine prediction inputs.
- **Predictors used now:** the frozen engine receives observed starting weight and season duration, then a fixed pasture/diet/weather configuration and zero supplement. The CPER scale multiplies that frozen output; the simple baseline predicts the CPER development mean. None uses observed forage biomass/quality, treatment/stocking rate, weather, breed, sex, year, or system. The historical CGREC outcome is never a predictor.
- **Identity and dependence:** Use CPER source row and animal identity proxy `Owner + Tag.Color + Tag` for purging repeated identities across folds. Group all rows from a year together. Keep treatment/pasture structure intact in each held-out year. Five years are only five independent temporal blocks, despite hundreds of animal rows.

## Pre-registered internal CV protocol

This protocol uses only CPER 2009–2013 development rows. It does not use CGREC 1989–2015, CPER 2014–2019, Rothamsted, or Maremmana outcomes to fit, choose, or tune a model. CPER 2014–2019 and CGREC have already been inspected in prior diagnostics and must not be relabelled as untouched final tests.

1. **Cohort and target:** CPER yearling steers, valid finite positive entry/exit weights and positive season duration, same rows and raw endpoint ADG definition as the current audit. Retain source `Use.Flag` values in the primary cohort and report metrics by flag; do not use `Use.Flag` as a predictor. Exclude no row based on its outcome magnitude.
2. **Folds:** Five leave-one-year-out folds, each testing exactly one year in 2009–2013 and training on the other four. Remove from a fold's training rows any row whose `Owner + Tag.Color + Tag` matches an animal proxy in its held-out year. Do not split rows randomly. Report fold/year MAE, RMSE, and signed mean error, plus pooled out-of-fold and equally weighted year-macro values. No confidence or coverage claim from five blocks.
3. **Frozen candidates (no search):**
   - `M0` constant mean raw ADG calculated from that fold's training animals only.
   - `M1` ordinary least squares with fixed inputs: starting weight in kg, season duration in days, and one-hot treatment (`light`, `moderate`, `heavy`); standardization, if used, is fitted inside each training fold. No interactions, year, pasture ID, source QC flag, final weight, gain, or any target-derived field.
   - `M2` frozen default engine using only starting weight and duration with its fixed historical configuration.
   - `M3` frozen engine output multiplied by one non-negative scalar fitted by least squares using only that fold's training rows. This is a fold-local diagnostic adjustment; never update the production engine.
4. **Primary comparison:** M0 is the prespecified reference. Compare all candidates on exactly the same out-of-fold rows. Primary metric is mean absolute error; also report RMSE and signed bias. Report both pooled and equally weighted year-macro scores so the larger years cannot hide a poor year block. Include each fold's sample count and treatment/flag composition.
5. **Internal advancement rule:** A non-baseline candidate may be called an internal CPER development improvement only if pooled out-of-fold MAE is at least 10% lower than M0, year-macro MAE is lower than M0, absolute pooled bias is no greater than M0, and no held-out year MAE exceeds M0 by more than 0.10 kg/head/day. These are operational gates for choosing whether to continue local development, not scientific validation thresholds or evidence of transport. If no candidate passes all gates, retain M0 as the descriptive reference and report no candidate advancement.
6. **No final-test claim:** Passing the internal CV gates authorizes only further exploratory development within this CPER yearling-steer ADG cohort. Any final independent ADG claim requires a new, eligible, unconsulted site/trial with compatible endpoints and grouping metadata. The historical CGREC set is reserved as already-consulted evidence and is not rerun as a new final test.
7. **Scientific separation:** Do not call any result DMI validation, mature-cow validation, calibration of uncertainty, causal management effect, or full-engine validation. No DMI model is trained under this protocol.

The next implementation step requires a separate explicit instruction to execute this protocol. This file records the diagnosis and freezes the design before any candidate fitting or tuning.
