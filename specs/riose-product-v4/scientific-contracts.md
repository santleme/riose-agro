# Scientific contracts

## Existing registered capability: BR-CORTE Eq. 2.6

Authoritative implementation/metadata: `scientific/br_corte_pasture_dmi.js`, `scientific/br_corte_dmi_adapter.js`, `scientific/model-contract.js`, `schemas/br-corte-pasture-dmi-request-v1.schema.json`; Product wrapper: `src/client/br-corte-scenario.js`.

- ID/version: `br-corte-2023-eq-2.6@2023`.
- Inputs: BW kg (133–474), user-supplied ADG kg/day (−0.18–1.34), supplement kg DM/day/head (0–5.32).
- Output: conditional total DMI kg DM/day/head. Residual `total DMI − supplement` is a DM balance, not separately validated forage intake.
- Domain: growing Zebu cattle grazing tropical pasture with supplementation. Published validation set: 174 experimental units; marginal input bounds do not establish support for every joint combination.
- Evidence: source-reported external validation; no Riose-specific calibration. The equation uses supplied ADG and never predicts gain.
- Costs: only user price × supplement-DM quantity × animals × days. Currency and per-kg-DM basis are explicit. No profit/ROI or full ration cost.
- FarmEngine: `validated:false`, demonstration only. Never pool it with BR-CORTE outputs.
- Behavioral generator: Perea semi-Markov NO-GO; not integrated.

## Sensitivity contract v1 (P4-003)

One-factor deterministic sweep of supplement input, with BW and supplied ADG held fixed. Bounds must remain inside the registered BR-CORTE input range; step must divide the declared interval within a documented numeric tolerance; cap points to protect browser use. Each output row is produced by the registered scientific model and records model provenance. The exact partial derivative of Eq. 2.6 with respect to supplement is `0.7732 (kg DM/head/day output)/(kg DM/head/day input)`; it is an equation property, not an intervention effect. No confidence interval/probability is permitted.

All new persistent envelopes are versioned. Unknown fields, units, model versions, domains, or statuses fail closed. Reuse `scientific/model-contract.js`, not a second registry.
