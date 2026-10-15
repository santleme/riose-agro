# Product V4 handoff

Date: 2026-10-15
Last verified commit: pending P4-001 audit/spec commit.
Branch: `codex/behavioral-agents-sdd`.

Completed tasks: P4-001 audit/spec bootstrap; baseline full suite 497/497.
Task in progress: P4-002.
READY: P4-002 BR-CORTE bounded sensitivity; P4-003 explicit example/empty-input state; P4-004 user discovery protocol.
BLOCKED: remote AI agent/tools until P3-007 persistent spend gate; paid decision-use until P3-008 independent review. Behavioral model remains NO-GO.
Files/evidence: V4 specification directory created; see `progress.md` for audited modules and baseline.
Tests executed: starting checkout `npm test` 497/497, 0 fail; V4 focused implementation tests not run yet.
Scientific boundaries: BR-CORTE Eq. 2.6 consumes supplied ADG; it estimates total DMI within its declared domain. FarmEngine is demonstrative. Perea semi-Markov is not connected. No formulas, thresholds or scientific status changed.
Next action: run P4-002 tests first at the request/result contract, then implement minimal model-backed sweep and reviewed UI; follow with P4-003/004 if independently safe.
