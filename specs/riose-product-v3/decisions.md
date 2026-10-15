# Decisions

- V3-ADR-001: Product scenario workflows do not wait for behavioral-agent validation; Behavioral Research remains separate and NO-GO.
- V3-ADR-002: Preserve Product V2 and current FarmEngine as an explicitly illustrative mode; scientific calculators execute their registered model directly and remain isolated.
- V3-ADR-003: Add a versioned multi-scenario set contract rather than extending/changing persisted two-arm V2 manifests.
- V3-ADR-004: Every scenario set shares one snapshot, seed, duration and single declared intervention factor. Require at least three total scenarios to enable direct sensitivity/comparison.
- V3-ADR-005: BR-CORTE Eq. 2.6 may be a narrow DMI calculator; supplied ADG is not a predicted response. No default FarmEngine feed cost or ADG trajectory is reused.
- V3-ADR-006: Paid customer decision use remains blocked until a separate independent quantitative/domain gate; table parity, software tests and published equation metadata alone are insufficient.
- V3-ADR-007: AI proposes plans and formats retrieved results only; explicit user confirmation and validators gate execution; never allow direct animal-tick control.
- V3-ADR-008: Ship the first V3 scenario laboratory at `scenario-lab.html` alongside Product V2 until the 3+ arm flow, saved-manifest compatibility and scientific calculator are complete; Product V2 is not removed.
- V3-ADR-009: P3-006 profiles the exact JavaScript Product V3 Worker/UI path and the existing JS/Rust/WASM parity harness separately. Do not label the current single-scenario native benchmark as multi-arm Product V3 parity, and do not migrate scenario sets to WASM without a versioned full-output parity contract.
- V3-ADR-010: Based on the repeated Product V3 benchmark, block a reviewed scenario set if its linear JSON-result estimate exceeds 40 MiB. The estimate is anchored to the measured 10,000-animal/3-arm/7-day result, is a planning proxy rather than a structured-clone or total-memory guarantee, and is recomputed from retained checkpoints. Keep the existing 1,200-cell DOM cap.
- V3-ADR-011: Keep Product V3's no-provider prompt draft deterministic and narrow. It may populate only explicit supported FarmEngine inputs and must still stop at review; missing information asks the user, and unsupported biological requests never fall through to demonstrative outputs.
