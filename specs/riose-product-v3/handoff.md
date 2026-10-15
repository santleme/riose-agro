# Product V3 session handoff

Date: 2026-10-15
Branch: `codex/behavioral-agents-sdd` (local commits from earlier Behavioral SDD remain unpushed; do not rewrite/push around network policy).
Last verified commit: pending local P3-002 and SDD commit.
Completed tasks: P3-001 audit/rescope; P3-002 multi-scenario manifest and deterministic replay.
Task in progress: none.
Files changed: Product V3 SDD bundle and audit; `src/client/scenario-set.js`; `tests/scenario-set.test.js`; `package.json` test command.
Tests executed: `npm run test:scenario-set` (8/8); `node --test tests/scenario-contract.test.js tests/scenario-goldens.test.js` (11/11); full `npm test` (473/473); `npm run test:parity` (baseline 24 checkpoints; housing 1,440 hourly checkpoints).
Passing checks: scenario set has one baseline + two interventions; all arms share the captured snapshot/seed/version; replay returns aligned deterministic results; invalid factor changes, baseline drift, unknown versions/fields, duplicate IDs/values and out-of-domain configs are rejected. Product V2 manifest compatibility and existing JS/Rust trajectory parity pass.
Known failures: none in P3-002. P3-003 UI/Worker integration is not implemented yet.
Scientific limitations: FarmEngine is illustrative; BR-CORTE Eq. 2.6 requires supplied ADG and only supports its published domain; no Riose independent full-use validation or paid-customer gate has passed.
Visual limitations: no V3 UI implemented yet; Product V2 remains current UI.
Next action: commit verified P3-002; continue to P3-003 Worker/UI integration.
Blocked dependencies: Paid AI plan/explainer awaits BEH-016 shared spend ceiling; paid-customer decision use awaits P3-008 evidence review; large population parity/performance awaits P2-007/P2-008/P3-006.
