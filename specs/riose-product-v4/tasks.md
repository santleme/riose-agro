# Product V4 SDD tasks

Allowed statuses: `BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `VALIDATING`, `DONE`.

## P4-001 — Audit and SDD bootstrap

ID: P4-001
Title: Audit Product V2/V3, scientific registry, evidence and blocked dependencies; establish this V4 source of truth
Specification reference: `constitution.md`; V2/V3/behavioral SDD links in `handoff.md`
Dependencies: none
Implementation scope: Record actual reusable comparison/cost/replay/UI/AI seams, scientific scope, test baseline and limitations. Create the V4 specification set.
Acceptance criteria: Audit reflects current source and tests; no duplicate completed V3 feature; gates accurately inherited; all requested V4 documents exist.
Required tests: repository inspection; `npm test`; `git diff --check`.
Evidence: `progress.md`; V3 independent review packet; current module contracts.
Status: DONE (`npm test` baseline 497/497; source audit and required V4 documents recorded).

## P4-002 — Scientific sensitivity sweep for BR-CORTE Eq. 2.6

ID: P4-002
Title: Review, execute, and display a bounded one-factor supplement sensitivity sweep
Specification reference: `scientific-contracts.md`; `decision-analysis.md`; P4-ACC-002/003/004
Dependencies: P4-001; reuse `scientific/model-contract.js` and P3-004 calculator.
Implementation scope: Versioned strict sweep input/result contract, validated min/max/step and max 101 rows; call only registered BR-CORTE Eq. 2.6 with fixed BW and supplied ADG; review-confirm UI and computed table/curve; explicit noncausal limitation.
Acceptance criteria: Every row is an actual registered-model output inside published input ranges; fixed values remain unchanged; repeat is deterministic; review required; mathematical sensitivity has unit; no FarmEngine merge or altered formula.
Required tests: new contract tests from public seam; existing BR-CORTE vectors; Product V3 browser E2E; accessibility/mobile/reduced-motion.
Evidence: test output, capture, benchmark only if measured necessary; `progress.md`.
Status: DONE (sensitivity contract 5/5; existing BR-CORTE scenario 3/3; Product V3 E2E PASS with review/confirm/edit invalidation and 390 px mobile layout).

## P4-003 — Explicit example and empty-input state

ID: P4-003
Title: Prevent sample/default settings being mistaken for user-provided observations
Specification reference: `product-requirements.md` PRD-004; `design-system.md`; P4-ACC-006
Dependencies: P4-001
Implementation scope: Clear initial numeric inputs or mark/load examples explicitly; retain review provenance and existing no-auto-run behavior.
Acceptance criteria: Initial state contains no silently supplied scientific inputs; example selection is visibly labeled and editable; examples cannot be called observed data; invalid/missing values block review.
Required tests: Product V3 browser E2E, input and accessibility checks.
Evidence: screenshots and test output.
Status: DONE (`npm test` 502/502; parity pass; Product V2 and V3 E2E pass; empty/example state captured and visually inspected).

## P4-004 — Product discovery protocol

ID: P4-004
Title: Prepare a focused user-value demonstration and structured feedback instrument
Specification reference: `product-requirements.md` PRD-007; P4-ACC-008
Dependencies: P4-001
Implementation scope: Demonstrate conditional CMS/cost use case, ask about an actual recurring decision and alternatives, capture structured anonymized feedback and success/failure criteria.
Acceptance criteria: protocol distinguishes product demand from scientific validation; blank records only; no contacts or findings fabricated.
Required tests: document consistency review; no software test needed.
Evidence: `docs/product-research/` materials.
Status: IN_PROGRESS

## Reused / gated capabilities

- Multi-arm scenario comparison and shared-seed FarmEngine replay: DONE in P3-002/003/010; do not duplicate.
- Conditional BR-CORTE scenario costs: DONE in P3-004; no new cost model unless an input or equation gap is demonstrated.
- P3-007 AI providers/tool agent: BLOCKED by shared persistent spend ceiling; do not mark complete here.
- P3-008 commercial/scientific readiness: BLOCKED pending independent domain review and evidence. Behavioral integration: NO-GO.
