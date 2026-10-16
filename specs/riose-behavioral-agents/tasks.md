# Behavioral Agents — SDD task queue

Statuses: BACKLOG, READY, IN_PROGRESS, BLOCKED, VALIDATING, DONE.

## BEH-000 — Initialize science-first SDD
- Depends on: Product V2 PR #190 head `983d0d7`; no code merge.
- Scope: Evidence inventory; task queue; architecture; frozen candidate evaluation guidance; LLM research boundary; safety gates; autonomous continuation runbook.
- Acceptance: Files committed on independent follow-on branch; no engine/model/UI modifications; scientific limitations explicit.
- Status: DONE (docs-only; runtime tests not run).

## BEH-001 — Timestamped Perea data/readiness audit
- Depends on: BEH-000.
- Scope: Reconcile row/animal IDs, duplicate timestamps, contradictory labels, contiguous session windows, timezones, per-class minutes, durations, annotation carry-forward, licensing manifest/checksum. Compare preprocessing bytes to earlier scripts.
- Acceptance: deterministic machine-readable readiness report and tests; no model fitting; annotate which metrics have sufficient coverage and which do not.
- Files: `data/perea-rangeland-behavior/`, `scripts/science/`, `tests/`, `docs/evidence/` as appropriate.
- Evidence: `docs/evidence/perea-time-series-readiness.md` and `.json`; parity digest and deterministic report are covered by `tests/test_perea_time_series_readiness.py`.
- Status: DONE (audit and parity tests pass; no model fitting).

## BEH-002 — Freeze generative benchmark and implement simple policies
- Depends on: BEH-001.
- Scope: preregister candidate families, group splits, primary metrics, stop thresholds and evaluation code; IID, persistence and first-order Markov policies.
- Acceptance: per-animal held-out comparisons, gap-aware bout extraction, no future observed signal input; deterministic seeded repeatability and negative controls.
- Evidence: `07-baseline-preregistration-v1.md`; `docs/evidence/perea-generative-baselines-v1.md` and `.json`; deterministic seeded evaluator and negative-control tests.
- Status: DONE (development folds evaluated under the frozen animal-grouped protocol; no model promotion).

## BEH-003 — Semi-Markov behavior generator
- Depends on: BEH-002.
- Scope: conditional transitions and sampled durations; learned from train-only observed behaviors; feature-availability checks; explicit behavior ontology.
- Acceptance: deterministic outputs and JSON schema; class and duration support; no leakage; transparent outcome and model provenance; no physiology coupling.
- Evidence: `08-semimarkov-protocol-v1.md`; `schemas/perea-behavior-sequence-v1.schema.json`; `docs/evidence/perea-semimarkov-development-v1.md` and `.json`; deterministic output and training-boundary tests.
- Status: DONE (research-only candidate passed development eligibility; it subsequently failed the frozen confirmatory gate and remains NO-GO).

## BEH-004 — Comparative evaluation and scientific gate
- Depends on: BEH-003.
- Scope: frozen evaluation over held-out animals and independent replicated sequences; publication of all metrics, failures, resource usage, support limits.
- Acceptance: preregistered pass/fail vs baselines, clear NO-GO where applicable, no external validation claim.
- Evidence: `09-confirmatory-protocol-v1.md`; `docs/evidence/perea-confirmatory-v1.md`, `.json`, and `perea-confirmatory-execution-metadata.json`; frozen roster and result tests.
- Status: DONE (frozen internal holdout evaluated; NO-GO for this candidate on this source; no promotion).

## BEH-005 — Secure AI research assistant (Groq / Hugging Face)
- Depends on: BEH-000; may run independently of BEH-002.
- Scope: allowlisted evidence/model/tools, bounded structured response, server-only keys, confirmation, audit/provenance, deterministic fallback.
- Acceptance: provider-mocked integration tests, prompt-injection and invalid-tool negative tests, budget/timeouts, no raw restricted data upload and no LLM-generated simulation metrics.
- Evidence: `10-beh005-security-contract.md`; `src/server/behavior-research-assistant.js`; `tests/behavior-research-assistant.test.js`; `docs/evidence/behavioral-external-data-and-provider-audit-2026-10.md`.
- Status: DONE (read-only allowlist, current Groq/HF contract review and provider-mocked security checks pass; no credentials, paid API calls or raw datasets sent).

## BEH-006 — Product V2 opt-in Behavior inspector
- Depends on: BEH-003, BEH-004 and maintained Product V2 integration.
- Scope: observational/generative comparison in minimal interface with provenance and explicit unvalidated label.
- Acceptance: E2E, desktop/mobile accessibility, fail-safe model-unavailable behavior, unchanged default engine results, screenshot inspection.
- Status: BLOCKED (BEH-004 NO-GO; do not integrate this candidate into Product without a new eligible candidate and independent review).

## BEH-007 — External dataset clearance and independent-domain check
- Depends on: legal rights, suitable population, appropriate measured labels, preregistered independent evaluation.
- Scope: identify eligible source (e.g. Chile with actual grant) or request separate permission with user's authorization.
- Acceptance: documents license/rights, ontology, population, holdout groups and true external-site metrics; no inflated claims.
- Status: BLOCKED (commercial rights and independent compatible data not confirmed).

## BEH-008 — Decision on scientific model promotion
- Depends on: BEH-004 and BEH-007 and model/domain review.
- Scope: decide limited research promotion vs rejection, with evidence report; distinct validation for any physiology or intervention coupling.
- Acceptance: written GO/NO-GO approved independently; never promote from software tests alone.
- Status: BLOCKED.

## Existing Product V2 dependencies (do not duplicate)
- P2-007 native Rust/WASM population observations, P2-008 browser 10k performance, P2-009 cancellation remain in `specs/riose-product-v2/tasks.md`.
- PR #190 stays open/unmerged; no implicit merge to main.

## BEH-009+ — Post-NO-GO SDD track

### BEH-009 — Reproducible NO-GO diagnostic replay
- Specification reference: `09-confirmatory-protocol-v1.md`; `11-post-nogo-diagnostic-protocol-v1.md`.
- Dependencies: BEH-004 frozen NO-GO result.
- Scope: replay only the pinned model/baselines/seeds; describe gate arithmetic, sequence coverage, duration/censoring and per-animal metrics. No tuning or threshold changes.
- Acceptance criteria: existing gate values reconcile; generated diagnostics match the original per-animal report; artifact reproduces byte-for-byte; conclusions separate verified facts from unknown causes.
- Required tests: `npm run test:perea-no-go-diagnostics`; two deterministic audit runs.
- Evidence: `docs/evidence/perea-no-go-diagnostic-v1.md` and `.json`, `scripts/science/behavior/audit_perea_no_go_diagnostics.py`, `tests/test_perea_no_go_diagnostics.py`.
- Status: DONE (post-hoc diagnostic only; original candidate remains NO-GO).

### BEH-010 — Versioned agent component interfaces
- Specification reference: `12-agent-component-architecture-v1.md`.
- Dependencies: BEH-000; no candidate is required.
- Scope: versioned contracts for behavior policy, physiological state, environment, observation model and intervention effect, with provenance and explicit unsupported values.
- Acceptance criteria: interfaces keep behavior ontology separate from FarmEngine actions; unsupported results cannot carry invented numeric outputs; breaking changes require a new interface version.
- Required tests: `npm run test:behavior-component-contracts`.
- Evidence: `schemas/behavioral-agent-interfaces-v1.schema.json`, `src/server/behavior-component-contract.js`, `tests/behavioral-agent-interfaces.test.js`.
- Status: DONE (schema/consistency checks pass; no biological component implemented or promoted).

### BEH-011 — Pasture dataset and data-rights screen
- Specification reference: `02-evidence-inventory.md`; `13-external-data-and-access-plan.md`.
- Dependencies: BEH-001 source inventory.
- Scope: assess Tabapuã DOI microdata and candidate pasture behavior datasets; list required variables; draft data/commercial permission request without sending.
- Acceptance criteria: distinguish paper license from microdata rights; capture temporal coverage and observation limitations; exclude unclear/conflicting licenses from commercial pipeline.
- Required tests: evidence link/source audit and `git diff --check` (no runtime model tests).
- Evidence: `docs/evidence/behavioral-external-data-and-provider-audit-2026-10.md`.
- Status: DONE (screening and unsent request draft complete; no source is cleared for import into the commercial behavior-training pipeline).

### BEH-012 — NO-GO assistant retrieval and provider contract audit
- Specification reference: `10-beh005-security-contract.md`; `13-external-data-and-access-plan.md`.
- Dependencies: BEH-005 and BEH-009.
- Scope: deterministic, allowlisted retrieval of frozen NO-GO metrics and limitations; official current Groq/HF API contract review.
- Acceptance criteria: no-key request returns cited registered values; provider cannot invent metrics or promote a model; server-side schema, timeout, request/output bounds, key secrecy and deterministic fallback remain in force.
- Required tests: `npm run test:behavior-research-assistant`; provider-mocked only, no live paid calls.
- Evidence: `src/server/behavior-research-assistant.js`; `docs/evidence/perea-no-go-diagnostic-v1.json`; `docs/evidence/behavioral-external-data-and-provider-audit-2026-10.md`.
- Status: DONE (14 assistant security tests pass; no model execution available).

### BEH-013 — Tabapuã microdata access and reuse clearance
- Specification reference: `13-external-data-and-access-plan.md`.
- Dependencies: written data availability, commercial reuse permission and completeness/schema review from data owners.
- Scope: only after authorized receipt, checksum and inspect the observation/sensor files and provenance.
- Acceptance criteria: explicit license/grant for commercial use, training/derivatives and retention; stable anonymized IDs, transition timestamps, observation bounds and handling covariates audited.
- Required tests: new source-specific parsing/quality tests after legal/data gate passes.
- Evidence: pending; draft request is not sent.
- Status: BLOCKED (microdata are not public; no author contact or reuse grant).

### BEH-014 — New behavior generator experiment
- Specification reference: `11-post-nogo-diagnostic-protocol-v1.md`; `12-agent-component-architecture-v1.md`.
- Dependencies: suitable licensed external sequences, adequate observation windows and a new frozen protocol before outcome inspection.
- Scope: reconsider daypart, hierarchical, censor-aware or hybrid generators only against a specific preregistered hypothesis and appropriate data.
- Acceptance criteria: independent train/development/confirmatory units; censoring and observation process modeled explicitly; comparison against matched baselines; no use of the already inspected four Perea holdout animals for tuning.
- Required tests: new protocol-specific leakage, determinism and metric tests once eligible data exist.
- Evidence: none; candidate decision recorded in ADR-BEH-013.
- Status: BLOCKED (no candidate is scientifically justified for a new confirmatory experiment with currently cleared data).

### BEH-015 — Model promotion or intervention coupling
- Specification reference: `12-agent-component-architecture-v1.md`; `06-product-integration.md`.
- Dependencies: successful independent behavior validation, domain review, and separate outcome-specific evidence for any physiological/intervention coupling.
- Scope: promotion decision and any opt-in adapter.
- Acceptance criteria: independent written review; preserve FarmEngine defaults; behavior generation does not imply weight, intake, heat or supplementation response.
- Required tests: only after all scientific and product dependencies pass.
- Evidence: none.
- Status: BLOCKED (BEH-004 NO-GO; no independent validation or intervention-effect evidence).

### BEH-016 — Shared provider spend ceiling
- Specification reference: `10-beh005-security-contract.md`; `risks.md` RSK-BEH-008.
- Dependencies: deployment-level shared persistent storage/budget service and explicit operator configuration for hard spend ceilings.
- Scope: enforce aggregate provider request and dollar budgets across processes/restarts, expose alerts/audit without storing prompts.
- Acceptance criteria: race-safe quota tests, bounded maximum spend under retry/restart/multi-worker conditions, paid calls denied after budget exhaustion; provider stays disabled without explicit configuration.
- Required tests: fake-clock/fake-provider quota and concurrency tests; no live paid inference.
- Evidence: none; current code has only bounded input/output/time and per-IP in-process rate limiting.
- Status: BLOCKED (no shared budget backend is configured; do not enable paid providers as a production capability until resolved).
