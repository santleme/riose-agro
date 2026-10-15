# Product V3 SDD task queue

Allowed statuses: `BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `VALIDATING`, `DONE`.

## P3-001 — Audit and re-scope Product around scenario laboratory

ID: P3-001  
Title: Audit Product V2, FarmEngine, BR-CORTE and existing sensitivity/execution paths  
Specification reference: `README.md`, `03-system-architecture.md`, `04-scientific-gates.md`  
Dependencies: none  
Implementation scope: Record reusable behavior, limitations and the split between illustrative and scientific calculations.  
Acceptance criteria: Identify current two-arm boundary, sensitivity function, Worker lifecycle, BR-CORTE domain and evidence, and commercial gate.  
Required tests: repository inspection; `git diff --check`.  
Evidence: `docs/architecture/product-v3-scenario-lab-audit-2026-10-15.md`.  
Status: DONE

## P3-002 — Versioned multi-scenario manifest seam

ID: P3-002  
Title: Create/validate a reproducible set of three or more FarmEngine scenarios  
Specification reference: `01-product-requirements.md` LAB-001; `03-system-architecture.md`; `08-acceptance-criteria.md`  
Dependencies: P3-001; reuse P2-002 contracts without changing them.  
Implementation scope: Add `riose-scenario-set/v1` creation, validation, and deterministic replay with one reference plus 2–9 interventions, one common factor, unique IDs/values, immutable shared snapshot, seed and engine version.  
Acceptance criteria: Valid set replays every intervention from the same snapshot/seed with aligned checkpoints and shared baseline; repeated replay is deterministic; invalid shape, unsupported version, extra fields, invalid factor, multiple changed factors, duplicate arm IDs/values, and out-of-domain config are rejected. Existing V2 manifests remain accepted unchanged.  
Required tests: `npm run test:scenario-set`; Product V2 scenario-contract regression.  
Evidence: `tests/scenario-set.test.js`; `src/client/scenario-set.js`.  
Status: DONE (`test:scenario-set` 8/8; scenario contract and golden regressions 11/11 pass).

## P3-003 — Multi-arm Worker execution and Product review/results UI

ID: P3-003  
Title: Run and display 3+ scenarios and sensitivity in Product  
Specification reference: LAB-001/LAB-003; `02-user-journeys.md`; `06-design-system.md`  
Dependencies: P3-002.  
Implementation scope: Execute all arms from the same snapshot/seed, show named comparison traces, deterministic sensitivity and provenance; retain Product V2 fallback/history compatibility.  
Acceptance criteria: User can review 3+ arms before run, run them in a Worker, compare actual returned traces, move across shared checkpoints, export/re-open a versioned manifest and recalculate all arms, and adjust one bounded sensitivity grid.
Required tests: Worker, contract/replay, browser E2E, mobile/accessibility and regression tests.  
Evidence: `scripts/e2e/scenario-lab.mjs`; `docs/evidence/product-v3-scenario-lab-initial.png`; `docs/evidence/product-v3-scenario-lab-results.png`.
Status: DONE (`npm run test:e2e:scenario-lab`, V2 E2E and `npm test` 474/474 pass).

## P3-004 — Isolated BR-CORTE Eq. 2.6 scientific calculator

ID: P3-004  
Title: Expose a narrow published DMI calculation and conditional scenario costs  
Specification reference: LAB-002/LAB-007; `04-scientific-gates.md`; `../../docs/evidence/br-corte-pasture-dmi-domain-audit-2026-10.md`.  
Dependencies: P3-001; P3-003 review surface may be reused but this calculator remains separate from FarmEngine.  
Implementation scope: Provide BW, supplied ADG and supplement inputs; compare 3+ supplement values; optional explicit supplement DM price/currency; provenance and domain disclosure.  
Acceptance criteria: Reproduces published worked vector; rejects or clearly blocks out-of-domain values; labels population totals as explicit arithmetic; never predicts ADG/weight gain, forage intake, profit or heat response.  
Required tests: scientific reference vectors, boundaries, unit/scaling, persistence/replay and UI tests.

Evidence: [`docs/evidence/br-corte-pasture-dmi-domain-audit-2026-10.md`](../../docs/evidence/br-corte-pasture-dmi-domain-audit-2026-10.md), [`docs/evidence/br-corte-product-v3-reference-scenario-v1.json`](../../docs/evidence/br-corte-product-v3-reference-scenario-v1.json), [`docs/evidence/product-v3-scenario-lab-initial.png`](../../docs/evidence/product-v3-scenario-lab-initial.png), [`docs/evidence/product-v3-scenario-lab-results.png`](../../docs/evidence/product-v3-scenario-lab-results.png).
Status: DONE (`npm run test:br-corte-scenarios`; Product V3 browser E2E including import/replay; full suite 477/477; JS/Rust parity).

## P3-005 — Cancellable scenario Worker

ID: P3-005  
Title: Cancel multi-arm runs without persisting partial results  
Specification reference: LAB-004; P2-009.  
Dependencies: P3-003; reuse P2-009 rather than fork the Worker lifecycle.  
Implementation scope: Responsive cancel, cleanup/recreation, explicit cancelled state, rerun reviewed manifest.  
Acceptance criteria: Cancellation never creates complete history or an exportable result; no stale message can overwrite a later run.  
Required tests: Worker lifecycle unit and browser cancellation E2E.  
Evidence: `tests/worker-protocol.test.js`; `scripts/e2e/scenario-lab.mjs`.
Status: DONE (cancel terminates the dedicated Worker; no result/history is created; rerun uses the still-reviewed manifest).

## P3-006 — Large-population performance and native parity

ID: P3-006  
Title: Profile 3+ arm payloads and preserve JS/Rust/WASM parity  
Specification reference: LAB-005; P2-007/P2-008.  
Dependencies: P3-003; P3-005.  
Implementation scope: Extend native compact observations only after versioned parity contract; profile browser run, transfer, render, memory and interaction.  
Acceptance criteria: record 100/1,000/10,000 results for the same fixed 3-arm scenario on a named browser/device; include actual UI, selected-animal interaction, result-size proxy, page-renderer memory and DOM-cell/node observations or explicitly state unavailable; preserve JS/Rust/WASM parity; document and test the measured 40 MiB planning cap and 1,200-cell DOM cap, including their limits.

Required tests: JS/Rust trajectory parity, existing WASM golden parity/fallback benchmark, Product V3 browser-flow regression and repeatable `npm run bench:scenario-lab`.

Evidence: [`docs/evidence/product-v3-scenario-lab-benchmark-2026-10.json`](../../docs/evidence/product-v3-scenario-lab-benchmark-2026-10.json), [`docs/evidence/product-v3-native-wasm-browser-benchmark-2026-10.json`](../../docs/evidence/product-v3-native-wasm-browser-benchmark-2026-10.json), existing parity artifacts/results and browser E2E.
Status: DONE (100/1,000/10,000 repeated browser profile; 40 MiB estimated-result guard and 1,200-cell cap tested; JS/Rust trajectories, WASM goldens and fallback pass).

## P3-007 — AI experiment planner and grounded explainer

ID: P3-007  
Title: Plan, validate, confirm, execute allowlisted tools and explain actual results  
Specification reference: LAB-006; `05-ai-orchestration.md`.  
Dependencies: P3-003, P3-004, BEH-016 shared provider budget.  
Implementation scope: Reuse server-side providers, deterministic fallback, allowed tool registry, confirmed execution and retrieved result explanation.  
Acceptance criteria: model cannot supply outcome numbers or bypass domain gates; every claim maps to tool result/provenance; spend/time/token limits enforced.  
Required tests: provider mocks, prompt injection, schema/tool allowlist, no-key path and budget gates.  
Evidence: security tests and API contract docs.  
Status: BLOCKED (shared persistent provider spend ceiling is not implemented).

## P3-008 — Quantitative feature and paid-customer readiness gate

ID: P3-008  
Title: Independent domain review of the first quantitative product capability  
Specification reference: LAB-007; `04-scientific-gates.md`.  
Dependencies: P3-004 and independent domain review/evidence appropriate to product claim.  
Implementation scope: Freeze claims and evaluation protocol; review external evidence and failure modes; publish go/no-go decision.  
Acceptance criteria: signed scientific/domain review, reproducible external evidence and approved limitations; otherwise keep paid customer decision use blocked.  
Required tests: scientific protocol and audit reproduction, not just unit tests.  
Evidence: future independent review artifact.  
Status: BLOCKED (the current equation audit and reference reproduction do not establish Riose independent validation or commercial readiness).
