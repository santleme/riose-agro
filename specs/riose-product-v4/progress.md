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
