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
Status: DONE (protocol, neutral demo script and blank feedback instrument reviewed; no users contacted and no findings fabricated).

## P4-005 — Sensitivity archive and deterministic replay

ID: P4-005
Title: Export, validate, reopen and explicitly replay a scientific sensitivity calculation
Specification reference: `product-requirements.md` PRD-006; `scientific-contracts.md`; P4-ACC-009
Dependencies: P4-002
Implementation scope: Add a versioned BR-CORTE sensitivity archive with strict manifest/result binding and hashes; allow opening a saved sensitivity archive into a review state; require explicit recalculation and compare the regenerated result to the archived result. Preserve existing scenario-set and BR-CORTE scenario archives.
Acceptance criteria: Export includes exact reviewed manifest, calculated result, model implementation provenance and canonical digests; modified manifest/result is rejected; reopening never calculates; an explicit replay reproduces byte-canonical result content; existing archive formats continue to work.
Required tests: archive contract/unit tests; Product V3 browser E2E for export/open/no-auto-run/replay/tampering; existing scenario archive and BR-CORTE scenario tests.
Evidence: `progress.md`, focused test output, E2E output.
Status: DONE (versioned archive schema/module; unit tests verify reproducible result binding, hashes, and tamper rejection; Product E2E verifies export, invalid archive isolation, open-without-run, and explicit exact replay; existing scenario archive remains unchanged).

## Reused / gated capabilities

- Multi-arm scenario comparison and shared-seed FarmEngine replay: DONE in P3-002/003/010; do not duplicate.
- Conditional BR-CORTE scenario costs: DONE in P3-004; no new cost model unless an input or equation gap is demonstrated.
- P3-007 AI providers/tool agent: BLOCKED by shared persistent spend ceiling; do not mark complete here.
- P3-008 commercial/scientific readiness: BLOCKED pending independent domain review and evidence. Behavioral integration: NO-GO.

## AI integration continuation

### P4-006 — Product V4 interpretation adapter and archive provenance

ID: P4-006
Title: Connect optional server-side structured AI interpretation to the V4 draft flow without automatic execution
Specification reference: `ai-orchestration.md`; `product-requirements.md` PRD-001/002/003/004; `testing-strategy.md`
Dependencies: P4-001; existing Scenario Lab intent contract; P3-007 remains blocked for production-wide enablement
Implementation scope: Add a bounded Groq/Hugging Face provider adapter for the existing V4 intent schema; deterministic safety reconciliation; no-key/failure fallback; explicit source/model display; preserve confirmed intent and interpreter provenance in archive v2 while retaining archive v1 reading.
Acceptance criteria: Provider output is strict JSON, independently validated server-side and client-side; unsupported local-parser requests remain blocked; only interpretation occurs before review; the existing explicit Run action is still the sole execution path; archive binds the exact approved intent/manifest/execution and provider metadata; v1 replay remains readable; rate limiting is not represented as a shared monetary budget.
Required tests: adapter/request bounds; malformed/out-of-domain/prompt-injection cases; no-key endpoint; V4 E2E no-autostart/review/confirm/export/replay; archive v1/v2 compatibility; Product V2 E2E; regression suite.
Evidence: focused tests, E2E, complete regression, browser screenshots, and server-side provider response metadata when a credential is available in secure runtime configuration.
Status: DONE (strict provider adapter + deterministic fallback, archive v2 intent/provenance binding with v1 reader, provider-fixture UI E2E, local fallback UI E2E, full regression and parity pass; live account call is separated into P4-007).

### P4-007 — Live provider and Product V4 validation

ID: P4-007
Title: Verify authenticated real provider interpretation and full Product V4 experiment flow
Specification reference: `ai-orchestration.md`; `acceptance-criteria.md`; provider integration mission
Dependencies: P4-006; a provider credential available through secure runtime configuration; account/model availability check. Rotation is not a prerequisite when an otherwise valid authorized runtime credential is present.
Implementation scope: Use provider credentials available through the authorized secure runtime to run a bounded live integration battery within the account's actual quota and rate limits. Avoid unnecessary requests and unbounded retries. Exercise interpretation, clarification, multi-arm and BR-CORTE intent, unsupported requests, follow-up edits, then complete review, explicit local execution, export, explanation and replay; never activate production provider traffic.
Acceptance criteria: Credentials come from secure runtime configuration and are not copied into logs, browser state, responses or archives; the selected provider/model is verified by an actual response; live intents pass server/client scientific validation; no request executes automatically; the explicit user action runs only the selected executor; FarmEngine remains demonstrative and BR-CORTE remains conditional on its declared inputs; unsupported biological claims are rejected; export/replay matches; sanitized latency/status/token metadata is recorded when available; P3-007 production/shared spend gate remains unchanged.
Required tests: controlled live provider requests within provider quota; focused Product V4 E2E using a real interpretation; review, explicit confirmation, execution, explanation, export and replay; safe failure/fallback checks; key-safe log review.
Evidence: sanitized provider/model/status/latency and token metadata when provided, E2E output and replay digest. Never store the secret or raw authorization headers. A live provider response validates integration only, not scientific validity or production reliability.
Status: BLOCKED (`GROQ_API_KEY` and `HF_TOKEN` were absent in the current process; no configured provider is available to call. The user authorized a controlled live test battery within real account quotas, without a per-call approval prompt. No provider request has been made.)
