# Product V4 handoff

Date: 2026-10-15
Last verified commit: P4-001 SDD bootstrap at `021b978`; P4-002 implementation is being finalized.
Branch: `codex/behavioral-agents-sdd`.

Completed tasks: P4-001 audit/spec bootstrap; P4-002 sensitivity slice has passed focused/unit and browser E2E checks; baseline full suite was 497/497 before V4 changes.
Task in progress: none; P4-002 implementation has completed focused checks and is ready to commit.
READY: P4-003 explicit example/empty-input state; P4-004 user discovery protocol.
BLOCKED: remote AI agent/tools until P3-007 persistent spend gate; paid decision-use until P3-008 independent review. Behavioral model remains NO-GO.
Files/evidence: V4 specification directory created; see `progress.md` for audited modules and baseline.
Tests executed: starting checkout `npm test` 497/497, 0 fail; P4-002 sensitivity 5/5; BR-CORTE scenarios 3/3; Product V3 E2E pass (desktop/mobile sensitivity and edit invalidation); Product V2 E2E pass.
Scientific boundaries: BR-CORTE Eq. 2.6 consumes supplied ADG; it estimates total DMI within its declared domain. FarmEngine is demonstrative. Perea semi-Markov is not connected. No formulas, thresholds or scientific status changed.
Next action: commit P4-002 evidence, then select P4-003 and test empty forms/example loading/no-auto-run.
