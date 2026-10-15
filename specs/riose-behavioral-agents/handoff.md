# Behavioral SDD session handoff

Date: 2026-10-15
Source PR: https://github.com/santleme/riose-agro/pull/190
Source PR head: 983d0d7259fb01fcdc7c279cd059eeb5eaaf72bc
Working branch: codex/behavioral-agents-sdd
Last verified commit: update after committing BEH-003 implementation.
Completed tasks: BEH-000; BEH-001; BEH-002; BEH-003.
Task in progress: none.
Next READY: BEH-004 — internal confirmatory evaluation on the four reserved Perea animals under a separately frozen protocol. BEH-005 remains independently READY.
Files changed in BEH-003: semi-Markov training/generation, versioned JSON schema and AJV test, development evaluator/evidence, package scripts, SDD status.
Tests executed: BEH-001 readiness suite 3/3; BEH-002 baseline suite 4/4; BEH-003 suite 8/8 plus AJV schema integration 1/1; legacy Perea page/server/data test 1/1; full `npm test` 446/446.
Passing checks: all animal folds disjoint; no gap-crossing transitions; deterministic outputs; ontology/output-length/schema checks; fail-closed unsupported duration; implementation/protocol/schema/source hashes; report byte-reproducibility; FarmEngine/JS-WASM regression suite.
Known failures: none.
Scientific limitations: sampled annotation windows only; no complete 24-hour windows; annotations may carry forward under-30-second events; local Mountain timestamps have no UTC offset/fold; CC BY 4.0 is from prior repository audit, not a new live rights review. No behavior model promoted.
Visual limitations: no UI changed.
Next action: commit the frozen BEH-003 candidate and development report (baseline JSON SHA-256 `e28c82ab67316e012787e27231c506c5903c5384c57ee76cc5aba5d0a1b12821`; semi-Markov JSON SHA-256 `d7fef1aa13112ecd91cb0314981a087dbf3726ff7bfceec0c8e45590431cd2eb`). Then freeze BEH-004's confirmatory protocol before evaluating labels from AH:2008, BH:5111, BR:8065, or RC:35. Keep this internal holdout distinct from external validation.
Blocked dependencies: BEH-007 lacks confirmed rights and independent compatible data; BEH-008 awaits evaluation and independent review.
Blocked: BEH-007 (independent external data reuse/population fit); BEH-008 scientific promotion.
Implementation constraints: default FarmEngine and Product V2 remain unchanged; no model-trained claims; no unauthorized paid inference or research data upload.
Resume command: Read RUN_LOOP.md + tasks.md, verify current git/PR state and BEH-001 commit, then continue BEH-002 without inspecting historical held-out generative outcomes.
