# Behavioral SDD session handoff

Date: 2026-10-15
Source PR: https://github.com/santleme/riose-agro/pull/190
Source PR head: 983d0d7259fb01fcdc7c279cd059eeb5eaaf72bc
Working branch: codex/behavioral-agents-sdd
Last verified commit: update after committing BEH-002.
Completed tasks: BEH-000; BEH-001; BEH-002.
Task in progress: none.
Next READY: BEH-003 — implement candidate semi-Markov sequence model using training-fold behavior labels only. BEH-005 remains independently READY.
Files changed in BEH-002: baseline generators/evaluator, tests, package scripts, preregistered protocol, development evidence and SDD status records.
Tests executed: readiness audit + 3 Python tests; baseline 4 Python tests; legacy Perea page/server/data test 1 passed; evaluator rerun byte-identical (SHA-256 `d7def7fa0bb61905f755692cdacadf6e29e21a43b8e9b1cf338e22f4412e7010`); `npm test` 445/445 passed.
Passing checks: animal-fold disjointness and frozen membership; no gap-crossing transitions; deterministic outputs; ontology/length checks; missing transition-row penalty; readiness-reader parity; legacy Perea UI/server/data test; full repository Node regression suite.
Known failures: none.
Scientific limitations: sampled annotation windows only; no complete 24-hour windows; annotations may carry forward under-30-second events; local Mountain timestamps have no UTC offset/fold; CC BY 4.0 is from prior repository audit, not a new live rights review. No behavior model promoted.
Visual limitations: no UI changed.
Next action: implement and test the semi-Markov candidate against the frozen protocol on development folds only. The current Markov baseline fails the stricter future candidate transition threshold against both IID and persistence, so do not open confirmatory results unless the semi-Markov candidate clears all preregistered gates.
Blocked dependencies: BEH-007 lacks confirmed rights and independent compatible data; BEH-008 awaits evaluation and independent review.
Blocked: BEH-007 (independent external data reuse/population fit); BEH-008 scientific promotion.
Implementation constraints: default FarmEngine and Product V2 remain unchanged; no model-trained claims; no unauthorized paid inference or research data upload.
Resume command: Read RUN_LOOP.md + tasks.md, verify current git/PR state and BEH-001 commit, then continue BEH-002 without inspecting historical held-out generative outcomes.
