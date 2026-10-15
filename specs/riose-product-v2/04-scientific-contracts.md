# Scientific and observation contracts

## Intent
`riose-experiment-intent/v1` contains `population`, `duration`, `baseline`, `intervention`, `target_scope`, `requested_outputs`, `assumptions`, `missing_inputs`, `unsupported_requests`. Validator rejects unknown fields, unsupported enums/ranges, invalid factor count, unbounded notes, and non-herd scope. Breed is metadata only. Defaults and provenance are explicit. Supplement input uses the engine unit kg DM/head/day; if the prompt omits dry-matter basis, the review states that unit assumption.

## Engine and provenance
FarmEngine JS and Rust states include `weight`, `initialWeight`, `energy`, `thirst`, `action`, `patch`, bounded activity `history`, and global `events`; preserve their documented semantics in the Product audit. Energy/thirst are state indices, not calibrated physiological units. Activity rules are deterministic demonstrations. Daily herd intake/cost/pasture outputs are aggregates; do not attribute these to individual animals. Weight changes are demonstrative, not validated animal predictions. Heat selects illustrative weather rules, not a heat-stress model. `validated:false` remains explicit.

## Divergence
For a displayed animal indicator `x`, `delta = x_intervention - x_baseline` for the same engine animal ID, checkpoint day, and initial snapshot. The current weight-difference filters classify `delta > 0.01 kg` positive, `delta < -0.01 kg` negative, and `abs(delta) <= 0.01 kg` neutral; this display tolerance avoids presenting sub-hundredth-kg floating-point differences as meaningful. Values are rounded only for display. Aggregate deltas use the paired row values for the same day. Never compare unrelated IDs or seeds.

## Evidence gates
- BR-CORTE 2023 Eq. 2.6 computes DMI from weight, supplement, and supplied ADG within declared domain; it does not predict ADG. Contract/schema: `scientific/model-contract.js`, `scientific/br_corte_pasture_dmi.js`, `schemas/br-corte-pasture-dmi-request-v1.schema.json`.
- USDA/CPER yearling observed cohort remains distinct from mature cows.
- Perea grouped-by-animal classification is a bounded classification diagnostic, not behavior generation evidence.
- Biomass sampling estimates do not equal required engine paddock stock; transport reports restrict generalization.
- Individual DMI gates and NO-GO reports remain authoritative.
- No predictive uncertainty or confidence is shown without calibrated method and evidence.
- Generative Agents, Social Simulacra, Grounded Theory Based Agents and livestock ABM papers are architecture references, not validation of this engine or bovine behavior. The repository literature review and Product audit list the checked work and scope boundaries. No LLM acts hourly.

See [Product audit](../../docs/architecture/product-conversational-simulation-audit-2026-10-15.md), [scientific module evaluation](../../docs/evidence/scientific-module-evaluations-2026-10-13.md), and model/data registries. Do not auto-connect a model merely because it is present.
