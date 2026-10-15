# SDD task queue

Statuses: `BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `VALIDATING`, `DONE`.

## P2-001
ID: P2-001
Title: Audit current Product, engine, science, executor, and PR state
Specification reference: `00-constitution.md`, `03-system-architecture.md`, `04-scientific-contracts.md`
Dependencies: none
Implementation scope: Inspect current checkout/PR history; record effective product and science boundaries.
Acceptance criteria: Audit notes PR #185/#186/#187 states, engine state semantics, available executors, evidence gates, and limitations.
Required tests: repository inspection; no behavior tests
Evidence: `../../docs/architecture/product-conversational-simulation-audit-2026-10-15.md`
Status: DONE

## P2-002
ID: P2-002
Title: Define versioned intent and compact population observation contracts
Specification reference: `04-scientific-contracts.md`, `08-population-workspace.md`
Dependencies: P2-001
Implementation scope: Strict natural language intent parser/validator, supported amendments, paired deterministic runner, checkpoint/history projection, Worker protocol.
Acceptance criteria: Reject out-of-domain inputs; stable IDs, same snapshot and seed; aggregates match existing comparison; observations are bounded and provenance retained.
Required tests: parser validation, amendment, worker protocol, aggregate parity, compact history tests
Evidence: `tests/product-population.test.js`; `src/client/population-experiment.js`; `src/client/worker-protocol.js`
Status: DONE

## P2-003
ID: P2-003
Title: Create responsive prompt/review/population Product workspace
Specification reference: `01-product-requirements.md`, `02-user-journeys.md`, `06-design-system.md`, `07-interaction-motion.md`, `08-population-workspace.md`
Dependencies: P2-002
Implementation scope: Replace redirect with empty prompt state, suggestions, conversation, review/confirm, grid, timeline, inspector, aggregates, provenance, history and export; preserve old Experiments UI.
Acceptance criteria: Explicit review before execution; real Worker results only; stable cell IDs; mobile/keyboard/reduced motion; follow-up invalidates results until confirmed again.
Required tests: browser E2E and `tests/app.test.js`
Evidence: `docs/evidence/product-v2-initial.png`, `docs/evidence/product-v2-workspace.png`, `docs/evidence/product-v2-mobile.png`
Status: DONE

## P2-004
ID: P2-004
Title: Add optional server-only structured intent provider
Specification reference: `05-ai-orchestration.md`, `04-scientific-contracts.md`
Dependencies: P2-002
Implementation scope: Existing provider configuration, strict schema, bounded prompt/response/time, fail-closed validation, no-key/failure fallback.
Acceptance criteria: No secrets in browser; provider output cannot execute or include unvalidated fields; deterministic mode clearly labeled.
Required tests: `tests/experiment-intent-api.test.js`
Evidence: server endpoint and API tests
Status: DONE

## P2-005
ID: P2-005
Title: Validate full regression, parity, and responsive browser behavior
Specification reference: `09-testing-strategy.md`, `10-acceptance-criteria.md`
Dependencies: P2-003, P2-004
Implementation scope: Full tests/parity; browser flow/screenshots; performance sample; fix findings.
Acceptance criteria: all listed regression tests pass; initial/results/mobile inspected; no fabricated output; diff clean of generated artifacts.
Required tests: `npm test`; `npm run test:parity`; Playwright flow
Evidence: `progress.md` and screenshots under `../../docs/evidence/`
Status: DONE

## P2-006
ID: P2-006
Title: Commit implementation and open review PR
Specification reference: `00-constitution.md`, `11-implementation-plan.md`
Dependencies: P2-005
Implementation scope: Separate commits by responsibility, push task branch, open/link PR, no merge.
Acceptance criteria: PR contains tests, limitations, screenshots, and clean task handoff.
Required tests: clean diff check and PR linkage check
Evidence: PR URL in `handoff.md`
Status: DONE

## P2-007
ID: P2-007
Title: Add native Rust/WASM compact population observations
Specification reference: `03-system-architecture.md`, `04-scientific-contracts.md`
Dependencies: P2-002; define versioned Rust/WASM parity contract first
Implementation scope: Native paired runner, compact checkpoint observations, parity against JS and stable projection.
Acceptance criteria: identical same-seed checkpoints and aggregates across JS/Rust; serialization/performance bounds.
Required tests: Rust unit, WASM integration, JS/Rust parity suite
Evidence: future benchmark and parity artifacts
Status: BACKLOG

## P2-008
ID: P2-008
Title: Profile browser Worker and 10,000-animal payload/render performance
Specification reference: `08-population-workspace.md`, `09-testing-strategy.md`
Dependencies: P2-003
Implementation scope: Browser heap/transfer timing and virtualized/Canvas alternative only if measured necessary.
Acceptance criteria: documented device/browser, run durations, memory and interaction latency; no arbitrary performance claim.
Required tests: repeatable browser performance harness
Evidence: future benchmark report
Status: BACKLOG


## P2-009
ID: P2-009
Title: Add cancellable population Worker lifecycle
Specification reference: `02-user-journeys.md`, `07-interaction-motion.md`
Dependencies: P2-003
Implementation scope: Expose Cancel while running, terminate/recreate Worker safely, discard partial result and preserve review state.
Acceptance criteria: Cancel is responsive; no incomplete manifest/history/result appears; user can rerun.
Required tests: Worker lifecycle unit test and browser cancellation E2E.
Evidence: future E2E and cancellation record
Status: BACKLOG
