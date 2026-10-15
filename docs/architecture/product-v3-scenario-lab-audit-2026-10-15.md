# Product V3 scenario-laboratory audit — 2026-10-15

## Current product seams

- Product V2 is a vanilla JS/HTML/CSS Product workspace on the active PR stack. It has a deterministic intent contract, explicit review, a paired population Worker, retained day checkpoints, aggregate analysis, selected-animal inspection, local history/replay and JSON export. `experiments.html` remains separate.
- The current Product path holds one reference/intervention pair. `runPopulationComparison` computes each pair from a shared snapshot and seed. The persisted V2 scenario manifest and parser encode a pair; preserve them and introduce a new versioned multi-arm set contract.
- The Worker protocol has progress but no user-facing cancel lifecycle. `P2-009` records the cancellation backlog. Population DOM rendering is capped at 1,200 cells, but that is not evidence of 10,000-animal browser execution performance. `P2-007` native Rust/WASM population observation parity and `P2-008` browser profiling remain backlog.
- `src/client/sensitivity-analysis.js` has deterministic one-factor FarmEngine sensitivity for diet, housing, weather, and supplement. It is not a scientifically validated result and is not yet a V3 multi-arm result view.

## Scientific capability boundary

- `scientific/br_corte_pasture_dmi.js` implements BR-CORTE 2023 Chapter 2 Eq. 2.6 and `br_corte_dmi_adapter.js` registers `br-corte-2023-eq-2.6@2023`.
- Existing `docs/evidence/br-corte-pasture-dmi-domain-audit-2026-10.md` records the official equation/domain and independent-validation table: 174 Zebu experimental units, with published validation metrics; the separate worked example in Table 2.14 is reproduced by an implementation test.
- The calculation needs body weight, supplement dry matter and **user-supplied ADG**. It does not calculate ADG, weight gain, or a supplementation response. Its R² from the development fit is not independent-validation performance.
- The existing `simulateNelorePastureScenario` additionally imposes an ADG weight trajectory and arithmetic residual forage subtraction. It is not appropriate as a quantitative forecast; do not present those derived quantities as BR-CORTE outputs.
- FarmEngine's weight, intake, weather, activity and cost paths remain illustrative. Keep its comparison mode separate from the BR-CORTE module.

## Selected V3 architecture

Add a new `riose-scenario-set/v1` manifest for three or more named FarmEngine arms, one shared starting snapshot/seed, and a single declared common factor. Preserve the current V2 pair contract and history replay. Then integrate via Worker, UI, sensitivity view, cancellation and measured performance. BR-CORTE is a distinct narrow calculator with source-level provenance and optional transparent supplement expenditure using explicitly supplied price. Paid customer use remains gated on independent review/evidence beyond formula or software tests.

Behavioral Research remains independent, semi-Markov remains NO-GO, and no animal-agent implementation is on the Product V3 critical path.
