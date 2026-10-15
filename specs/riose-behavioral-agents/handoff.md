# Behavioral SDD session handoff

Date: 2026-10-15
Source PR: https://github.com/santleme/riose-agro/pull/190
Source PR head: 983d0d7259fb01fcdc7c279cd059eeb5eaaf72bc
Working branch: codex/behavioral-agents-sdd
Last verified commit: update after committing BEH-001.
Completed tasks: BEH-000; BEH-001.
Task in progress: BEH-002 — freeze benchmark protocol and implement baselines without reading held-out generative outcomes.
Next READY: BEH-002. BEH-005 remains independently READY.
Files changed: Perea sequence parser/audit, machine-readable and human-readable evidence, audit tests, package scripts, SDD task/progress/decision/handoff records.
Tests executed: `npm run audit:perea-time-series-readiness`; `npm run test:perea-time-series-readiness` (3 passed); `node --test tests/perea-rangeland-behavior.test.js` (1 passed).
Passing checks: deterministic report rerun; stable canonical observation SHA-256 parity with historical classifier reader; duplicate/gap/censoring fixture tests; legacy Perea UI/server/data test.
Known failures: none.
Scientific limitations: sampled annotation windows only; no complete 24-hour windows; annotations may carry forward under-30-second events; local Mountain timestamps have no UTC offset/fold; CC BY 4.0 is from prior repository audit, not a new live rights review. No behavior model promoted.
Visual limitations: no UI changed.
Next action: freeze candidate definitions, train/test animal folds, metrics and stop conditions in a committed preregistration artifact, then implement and test IID/persistence/first-order Markov baselines.
Blocked dependencies: BEH-007 lacks confirmed rights and independent compatible data; BEH-008 awaits evaluation and independent review.
Blocked: BEH-007 (independent external data reuse/population fit); BEH-008 scientific promotion.
Implementation constraints: default FarmEngine and Product V2 remain unchanged; no model-trained claims; no unauthorized paid inference or research data upload.
Resume command: Read RUN_LOOP.md + tasks.md, verify current git/PR state and BEH-001 commit, then continue BEH-002 without inspecting historical held-out generative outcomes.
