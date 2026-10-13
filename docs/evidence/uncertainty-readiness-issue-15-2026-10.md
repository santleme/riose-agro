# Issue #15 uncertainty readiness update — 2026-10-13

**Decision remains insufficient evidence.** Product outputs remain demonstrative, the label remains “Sem calibração suficiente,” and no probabilistic intervals are authorized.

## Evidence by outcome

- **Yearling-steer ADG:** the CPER internal nested year comparison found MAE 0.221 kg/head/day for the training mean, 0.234 for OLS and 0.233 for Ridge using initial weight only. No candidate improved the baseline. Five year blocks at one site do not support nominal coverage or transportable uncertainty. CGREC is a previously consulted external diagnostic, not selection data for this experiment.
- **Forage biomass:** the exploratory nested spatial comparison on 234 Brazilian sampling-point records selected OLS in all 13 buffered spatial blocks. The height-only OLS MAE/RMSE/bias were 649.7/885.7/−3.3 kg DM/ha; no new candidate passed advancement criteria. Height measurement order relative to clipping is undocumented, and the 13 blocks are nested in two farms. The earlier, already-consulted Dryad comparison had MAE 2,507.1, RMSE 2,986.4, and bias +2,094.7 kg/ha over eight paddocks. It is related forage mass, not Riose's pasture-stock state.
- **Behavior:** the post-hoc MI threshold rule had equal-animal RE/RU F1 0.392 and auto-fed persistence had 0.364 over the same 5,582 rows; the earlier nested selection had 0.403 for that primary metric. The new rules did not advance and neither evaluation calibrates an engine output or validates intake.
- **DMI:** no adult beef-cow grazing cohort meets the #109 gate. Feedlot, dairy, estimated-intake, and other populations remain separate and provide no uncertainty estimate for mature-cow DMI.

## What can and cannot be reported

Report descriptive errors, subgroup results, and fold-level variability only for the exact cohorts and estimands above. Do not call these calibrated uncertainty or claim that biomass or ADG performance validates DMI, animal-weight scenarios, pasture stock, cost, stress, or the complete engine. Thirteen spatial blocks within two farms, eight Dryad paddocks, five CPER years, and 24 behavior animals do not justify narrow population confidence intervals or prediction-interval coverage claims.

Detailed machine-readable classifications remain in [uncertainty-readiness-issue-15.json](uncertainty-readiness-issue-15.json). Reproduction artifacts: [biomass candidate evaluation](../../experiments/biomass/nested-development-2026-10/evaluation-report.md), [ADG candidate evaluation](../../experiments/diagnostics/adg/cper-preoutcome-candidate-v1/evaluation.md), [behavior development diagnostic](../../experiments/behavior/perea-threshold-persistence-development/results.md), [historical Dryad comparison](../../experiments/biomass/dryad-external/evaluation-report.md).
