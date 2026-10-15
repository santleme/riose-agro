# Product V4 progress

## 2026-10-15 — Context recovery and baseline

- Branch: `codex/behavioral-agents-sdd`; starting HEAD `93cfbd7`; working tree clean. Prior local commits preserved, no reset/push/merge.
- Read Product V2/V3 SDD, P3-011 review package, Product V3 source, scientific model contract, BR-CORTE scenario wrapper and behavioral-agent task/handoff/decision records. No V4 folder existed. No repository `AGENTS.md` or `GLOSSARY.md` found.
- Reusable: V3 three-arm deterministic scenario set, shared seed/snapshot, Worker cancellation, archive/replay; separate P3-004 BR-CORTE multi-level table and optional user-entered price arithmetic; deterministic prompt parsing; registered model/provenance; P3-011 browser capture/benchmark.
- Gap: `analyzePastureDmiSensitivity` only provides a fixed OAT diagnostic in the scientific module; it is not a user-selectable reviewed interval/step and is not exposed in Product V3. Do not conflate FarmEngine sweep with scientific sensitivity.
- BR-CORTE contract: BW 133–474 kg, supplied ADG −0.18–1.34 kg/day, supplement 0–5.32 kg DM/head/day. Equation estimates conditional total DMI and does not predict gain. FarmEngine stays demonstrative; Perea stays NO-GO; P3-007/008 gates unchanged.
- Baseline `npm test`: 497/497 pass, 0 fail (41.5 s). P3-011 benchmark baseline and exact machine-specific limits are in the V3 handoff.
- P4-001 complete: V4 specs and audit baseline are recorded; P3 gates and scientific boundaries are preserved.
- Next: implement P4-002 bounded BR-CORTE sensitivity sweep at a strict versioned public seam.


## P4-002 — BR-CORTE deterministic sensitivity slice

- Added `riose-br-corte-dmi-sensitivity/v1` request and JSON Schema; only eligible input is supplement at 0–5.32 kg DM/head/day, while body weight and user-supplied ADG remain fixed. Interval must be step-divisible and produce 2–101 points.
- Each row calls registered `br-corte-2023-eq-2.6@2023`, returns actual total DMI, arithmetic represented-herd totals and optional user-priced supplement cost, with source/model implementation provenance. Exact derivative 0.7732 is labeled equation sensitivity, not intervention causality. Prediction interval remains null; validated remains false. No formula or FarmEngine behavior changed.
- Added a distinct sensitivity review and explicit Calculate action, chart, table, units and limitation text. Editing the sweep revokes reviewed and computed state. Mobile scientific controls reflow to one column, 42 px action target, 12 px labels, and 390 px has no horizontal overflow. New UI adds no animation; existing reduced-motion behavior remains unchanged.
- Tests: sensitivity contract/schema 5/5; existing BR-CORTE scenario/cost 3/3; Product V3 E2E pass with seven calculated points, range edit invalidation/no automatic execution, desktop capture, mobile result, 390 px no overflow and no browser console errors; Product V2 E2E pass. Captures: `docs/evidence/product-v4-br-corte-sensitivity-desktop.png`, `docs/evidence/product-v4-br-corte-sensitivity-mobile.png`.
- The initial mobile E2E caught 10 px labels on the new sweep (style selector missed its class). Scoped mobile typography was corrected and the rerun passed.
- P4-003 is next READY: replace implicit numeric/scientific form values with empty inputs and an explicitly loaded example. Full regression/parity run follows P4-003.


## P4-003 — Explicit example and empty-input state

- Cleared population, duration, intervention and BR-CORTE numeric form values on initial load; blank inputs and blank weather rule now block review. The visible reproducibility seed remains and is labeled as configuration, not animal data. Examples are explicit; loading fills editable inputs only and never runs a calculation.
- Added a BR-CORTE example button using representative values and no price. Inline message says inputs are illustrative and not observations. Prompt example button remains draft-only.
- E2E asserts initial inputs are empty/invalid, no review/results/Worker post is created, examples load explicitly, and calculation still needs explicit review/confirmation. Product V3 flow passes. Full suite `npm test` 502/502; JS/Rust parity passes 24 pasture and 1,440 hourly housing checkpoints; Product V2 E2E passes.
- Visual captures: `docs/evidence/product-v4-empty-state.png` and `docs/evidence/product-v4-empty-and-example-state.png`; reviewed at 1440×1000. Sensitivity mobile result capture continues to show 390 px width and no overflow.
- P4-004 discovery protocol, neutral demonstration script, and blank interview record are complete in `docs/product-research/`. Materials state they are prepared, not executed; no users were contacted and no findings are claimed. Readout thresholds are precommitted and explicitly do not confer scientific or commercial approval.

## P4-004 — User discovery preparation

- Prepared an exploratory protocol for a recurring pasture supplementation and cost-comparison decision, a seven-minute neutral product demonstration, and an empty anonymized feedback instrument.
- The materials distinguish user-workflow evidence from scientific validation and commercial readiness. They prohibit invented participant data/prices, require consent, and do not authorize outreach. No interviews or external contact occurred.
- Reviewed all three documents for consistency and blank response fields; `git diff --check` passes. No software tests apply to this document-only task.
- P4-005 is READY: sensitivity results currently have no dedicated scientific archive/replay contract. The existing scenario-set archive must remain unchanged.
