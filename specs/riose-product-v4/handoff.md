# Product V4 handoff

Date: 2026-10-15
Last verified commit: `a014014` (P4-004 user discovery materials); P4-005 source and SDD updates are validated and awaiting commit.
Current branch: `codex/behavioral-agents-sdd`.

Completed tasks: P4-001 audit/bootstrap; P4-002 registered BR-CORTE sensitivity sweep; P4-003 explicit empty/example state; P4-004 discovery protocol/demo/blank record prepared; P4-005 versioned sensitivity archive and explicit replay.
Task in progress: none.
READY: none in the current local V4 queue. Do not invent duplicate work. Existing V3 comparison/replay and conditional cost functions are reused. P3-007 remains blocked by the shared spend gate; P3-008 remains blocked pending independent review. Behavioral semi-Markov remains NO-GO.

Files changed for P4-005: `src/client/br-corte-sensitivity-archive.js`, `schemas/br-corte-dmi-sensitivity-archive-v1.schema.json`, `src/client/scenario-lab-app.js`, `scenario-lab.html`, `tests/br-corte-sensitivity.test.js`, `scripts/e2e/scenario-lab.mjs`, and V4 task/progress/decision/acceptance docs.

Checks actually executed:

- `npm run test:br-corte-sensitivity` — 7/7 pass.
- `npm run test:br-corte-scenarios` — 3/3 pass.
- `npm run test:scenario-lab-integrity` — 4/4 pass.
- `npm run test:e2e:scenario-lab` — PASS: sensitivity export, tamper rejection without replacing the prior result, valid archive opens without calculation, explicit replay matches exactly, edits invalidate review/results, mobile width 390 px with no horizontal overflow, zero console errors.
- `npm run test:e2e:product` — PASS: Product V2 main flow including local replay and mobile layout.
- `npm test` — 504/504 pass (starting suite was 497; P4-002 added 5 sensitivity tests and P4-005 added 2).
- `npm run test:parity` — PASS, pasture seed 417/24 checkpoints; housing seed 2026/1,440 hourly checkpoints and 31 daily rows.
- `git diff --check` — clean before commit.

Visual evidence: Product V4 BR-CORTE sensitivity desktop and mobile screenshots at `docs/evidence/product-v4-br-corte-sensitivity-desktop.png` and `docs/evidence/product-v4-br-corte-sensitivity-mobile.png`. Captures were produced by the local Chromium Playwright E2E. T3 preview status explicitly reported that no automation host is attached to this headless environment; it instructed not to retry. Mobile results show no horizontal overflow. No new animation was introduced; existing reduced-motion CSS remains active.

Scientific limitations: BR-CORTE Eq. 2.6 estimates total DMI conditionally using supplied ADG inside the declared domain. It does not predict ADG/gain, measure forage intake, or establish a causal supplement response; no Riose calibration is claimed. Cost is arithmetic from user-provided price per kg DM, amount, animal count and duration. FarmEngine remains illustrative. Sensitivity archive SHA-256 values verify content consistency but are not cryptographic signatures. Perea NO-GO unchanged; no formulas, thresholds, or status gates changed.

External readiness: discovery protocol and neutral demo are prepared only. No participants contacted and no feedback/interview performed. Independent scientific review is still `NOT_PERFORMED`. No LLM provider call, push, merge, or remote history operation was performed.

Next action: after committing this verified slice, await a new eligible local product task or human recruitment/consent for PRD-007. Do not treat participant discovery as scientific review or unblock P3-007/P3-008 without their real gates.
