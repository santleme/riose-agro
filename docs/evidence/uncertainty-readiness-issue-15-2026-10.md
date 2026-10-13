# Issue #15 uncertainty readiness update — 2026-10-13

**Decision remains insufficient evidence.** Product outputs remain demonstrative, the label remains “Sem calibração suficiente,” and no probabilistic intervals are authorized.

## New evidence by outcome

- **Yearling-steer ADG:** CPER 2009–2013 leave-one-year-out results provide source-specific descriptive error only. Of the four frozen candidates, none passed the operational advancement rule. Five held-out years are too few to support nominal coverage or transportable uncertainty. The historical CGREC and 2014+ CPER cohorts were not used for selection in this experiment.
- **Forage biomass:** the selected height-only OLS model has a buffered spatial CV on 234 Brazilian sampling-point records across 13 field components nested in two farms. It was evaluated once on 64 matched Dryad paddock-time aggregates from eight repeated paddocks. Dryad MAE is **2,507.1 kg/ha**, RMSE **2,986.4 kg/ha**, and bias **+2,094.7 kg/ha**. This predicts related forage-mass measurements, not the engine's pasture-stock state. Forty Dryad rows lie within the Mendeley height range; the 24 above-range rows are all MOB, so the support split is confounded with treatment and year.
- **DMI:** no adult beef-cow grazing cohort meets the #109 gate. Feedlot, dairy, estimated-intake, and other population data remain separate and do not provide uncertainty for the mature-cow target.
- **Behavior:** the existing grouped evaluation predicts categorical behavior from motion index. It does not validate intake or quantify uncertainty for a Riose engine output. XGain's processed behavior counts are not independent reference labels.

## What can and cannot be reported

Report descriptive MAE, RMSE, bias, subgroup and fold results for the exact cohorts and estimands above. Do not label these as calibrated uncertainty or claim that biomass or ADG performance validates DMI, animal weight scenarios, pasture stock, cost, stress, or the complete engine. The eight Dryad paddocks and five CPER year blocks do not justify narrow confidence intervals or prediction-interval coverage claims.

Detailed machine-readable classifications and evidence references remain in [uncertainty-readiness-issue-15.json](uncertainty-readiness-issue-15.json). New model reports: [CPER ADG internal CV](../../experiments/diagnostics/adg/cper-internal-cv-2026-10.md) and [Mendeley-to-Dryad biomass evaluation](../../experiments/biomass/dryad-external/evaluation-report.md).
