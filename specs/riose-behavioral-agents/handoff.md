# Behavioral SDD session handoff

Date: 2026-10-15
Active PR: https://github.com/santleme/riose-agro/pull/191
Base PR: https://github.com/santleme/riose-agro/pull/190 (head `983d0d7259fb01fcdc7c279cd059eeb5eaaf72bc`)
Working branch: codex/behavioral-agents-sdd
Last verified implementation commit: 24871a6 (`feat: add gated behavior research assistant`).
Completed tasks: BEH-000; BEH-001; BEH-002; BEH-003; BEH-004; BEH-005.
Task in progress: none.
Next READY: none. BEH-006 is blocked by the BEH-004 NO-GO; BEH-007/008 remain blocked by rights/external evidence.
Files changed in BEH-005: server research-assistant module and routes, provider-mocked/security tests, package script, contract/status/decision/handoff records.
Tests executed: BEH-005 provider/security suite 13/13; readiness tests 3/3; sequence baseline and schema 9/9; confirmatory partition/results 4/4; full `npm test` 459/459.
Passing checks: strict schema; bounded provider input/output/time; deterministic fallback; 4-tool server allowlist; no raw corpus upload; credentials server-only; confirmation and NO-GO fail-closed; rate limiting; FarmEngine/JS-WASM regression.
Known failures: none.
Scientific limitations: sampled annotation windows only; no complete 24-hour windows; annotations may carry forward under-30-second events; local Mountain timestamps have no UTC offset/fold; CC BY 4.0 is from prior repository audit, not a new live rights review. No behavior model promoted.
Visual limitations: no UI changed.
Next action: no READY behavioral-agent task remains. Resume only if the independent rights/data blocker changes, a new candidate is preregistered, or a future task explicitly authorizes Product integration. Do not resume the failed semi-Markov candidate from confirmatory labels.
Blocked dependencies: BEH-007 lacks confirmed rights and independent compatible data; BEH-008 awaits evaluation and independent review.
Blocked: BEH-007 (independent external data reuse/population fit); BEH-008 scientific promotion.
Implementation constraints: default FarmEngine and Product V2 remain unchanged; no model-trained claims; no unauthorized paid inference or research data upload.
Resume command: Read RUN_LOOP.md + tasks.md, verify current git/PR state and this handoff. No behavioral-agent task is READY; continue only after a blocker changes or a new separately preregistered task is added.
