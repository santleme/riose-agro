# Issue #15 uncertainty readiness update — 2026-10-13

**Decision remains insufficient evidence.** Product outputs remain demonstrative, the label remains “Sem calibração suficiente,” and no probabilistic intervals are authorized.

## Evidence by outcome

- **Yearling-steer ADG:** the CPER internal nested year comparison found MAE 0.221 kg/head/day for the training mean, 0.234 for OLS and 0.233 for Ridge using initial weight only. A preregistered expanded candidate search found Huber/HGB at about 0.220, only a small development improvement. Five year blocks at one site do not support nominal coverage or transportable uncertainty. CGREC is a previously consulted external diagnostic, not selection data for this experiment.
- **Forage biomass:** the exploratory nested spatial comparison on 234 Brazilian sampling-point records selected OLS in all 13 buffered spatial blocks. The height-only OLS MAE/RMSE/bias were 649.7/885.7/−3.3 kg DM/ha. A fixed farm holdout yielded MAE 1,039 and 1,079 kg DM/ha with opposite biases; campaign transfer had zero coverage because every sampled coordinate repeats. Height measurement order relative to clipping is undocumented, and the 13 blocks are nested in two farms. The earlier, already-consulted Dryad comparison had MAE 2,507.1, RMSE 2,986.4, and bias +2,094.7 kg/ha over eight paddocks. It is related forage mass, not Riose's pasture-stock state.
- **Behavior:** the reproducible expanded animal-grouped Perea procedure had equal-animal RE/RU F1 0.4704 vs 0.4026 in the prior nested result. Its paired animal bootstrap interval (+0.0463, +0.0912) describes within-cohort sensitivity only; it is not a prediction interval, calibration assessment, ranch-transfer estimate, or validation of intake.
- **DMI:** no adult beef-cow grazing cohort meets the #109 gate. Feedlot, dairy, estimated-intake, and other populations remain separate and provide no uncertainty estimate for mature-cow DMI.

## What can and cannot be reported

Report descriptive errors, subgroup results, and fold-level variability only for the exact cohorts and estimands above. The animal and block resampling summaries are descriptive within-cohort stability checks; they do not estimate model calibration or nominal interval coverage. Do not claim that biomass or ADG performance validates DMI, animal-weight scenarios, pasture stock, cost, stress, or the complete engine. Thirteen spatial blocks within two farms, eight Dryad paddocks, five CPER years, and 24 behavior animals do not justify narrow population confidence intervals or prediction-interval coverage claims.

Detailed machine-readable classifications remain in [uncertainty-readiness-issue-15.json](uncertainty-readiness-issue-15.json). Reproduction artifacts: [biomass transport stress](../../experiments/biomass/transport-stress-2026-10/evaluation-report.md), [ADG candidate comparison](../../experiments/diagnostics/adg/cper-candidate-v2/evaluation.md), [behavior model comparison](../../experiments/behavior/perea-tree-models-development/results.md), [historical Dryad comparison](../../experiments/biomass/dryad-external/evaluation-report.md).
