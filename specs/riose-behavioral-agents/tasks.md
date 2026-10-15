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
- Status: READY.

## BEH-002 — Freeze generative benchmark and implement simple policies
- Depends on: BEH-001.
- Scope: preregister candidate families, group splits, primary metrics, stop thresholds and evaluation code; IID, persistence and first-order Markov policies.
- Acceptance: per-animal held-out comparisons, gap-aware bout extraction, no future observed signal input; deterministic seeded repeatability and negative controls.
- Status: BACKLOG.

## BEH-003 — Semi-Markov behavior generator
- Depends on: BEH-002.
- Scope: conditional transitions and sampled durations; learned from train-only observed behaviors; feature-availability checks; explicit behavior ontology.
- Acceptance: deterministic outputs and JSON schema; class and duration support; no leakage; transparent outcome and model provenance; no physiology coupling.
- Status: BACKLOG.

## BEH-004 — Comparative evaluation and scientific gate
- Depends on: BEH-003.
- Scope: frozen evaluation over held-out animals and independent replicated sequences; publication of all metrics, failures, resource usage, support limits.
- Acceptance: preregistered pass/fail vs baselines, clear NO-GO where applicable, no external validation claim.
- Status: BACKLOG.

## BEH-005 — Secure AI research assistant (Groq / Hugging Face)
- Depends on: BEH-000; may run independently of BEH-002.
- Scope: allowlisted evidence/model/tools, bounded structured response, server-only keys, confirmation, audit/provenance, deterministic fallback.
- Acceptance: provider-mocked integration tests, prompt-injection and invalid-tool negative tests, budget/timeouts, no raw restricted data upload and no LLM-generated simulation metrics.
- Status: READY.

## BEH-006 — Product V2 opt-in Behavior inspector
- Depends on: BEH-003, BEH-004 and maintained Product V2 integration.
- Scope: observational/generative comparison in minimal interface with provenance and explicit unvalidated label.
- Acceptance: E2E, desktop/mobile accessibility, fail-safe model-unavailable behavior, unchanged default engine results, screenshot inspection.
- Status: BACKLOG.

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
