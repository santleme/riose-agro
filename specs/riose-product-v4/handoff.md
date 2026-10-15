# Product V4 handoff

Date: 2026-10-15
Last verified commit: `8dc694f` (P4-003 explicit example and empty-input state); P4-004 materials are pending commit.
Branch: `codex/behavioral-agents-sdd`.

Completed tasks: P4-001 audit/spec bootstrap; P4-002 BR-CORTE sensitivity; P4-003 explicit empty/example inputs; P4-004 user discovery protocol and instruments prepared. Full suite currently 502/502; parity and V2/V3 E2E pass.
Task in progress: none (P4-004 implementation complete, docs awaiting commit).
READY: P4-005 sensitivity archive and deterministic replay. P3-007/P3-008 gates remain blocked.
BLOCKED: remote AI agent/tools until P3-007 persistent spend gate; paid decision-use until P3-008 independent review. Behavioral model remains NO-GO.
Files/evidence: V4 specification directory created; see `progress.md` for audited modules and baseline.
Tests executed: starting checkout `npm test` 497/497, 0 fail; P4-002 sensitivity 5/5; BR-CORTE scenarios 3/3; Product V3 E2E pass (desktop/mobile sensitivity and edit invalidation; empty/example input state); Product V2 E2E pass; `npm test` 502/502; `npm run test:parity` pass.
Scientific boundaries: BR-CORTE Eq. 2.6 consumes supplied ADG; it estimates total DMI within its declared domain. FarmEngine is demonstrative. Perea semi-Markov is not connected. No formulas, thresholds or scientific status changed.
Next action: commit P4-004 documentation, then implement P4-005 as a separate versioned BR-CORTE sensitivity archive; do not alter or conflate existing scenario archives.
