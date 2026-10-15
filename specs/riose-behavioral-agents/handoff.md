# Behavioral SDD session handoff

Date: 2026-10-15
Source PR: https://github.com/santleme/riose-agro/pull/190
Source PR head: 983d0d7259fb01fcdc7c279cd059eeb5eaaf72bc
Working branch: codex/behavioral-agents-sdd
Last verified commit: update after committing BEH-004 NO-GO evidence.
Completed tasks: BEH-000; BEH-001; BEH-002; BEH-003.
Task in progress: none.
Next READY: BEH-005 — secure AI research assistant can proceed independently. BEH-006 is blocked by the BEH-004 NO-GO; BEH-007/008 remain blocked by rights/external evidence.
Files changed in BEH-004: pinned confirmatory evaluator, partition/result tests, deterministic report, separate host resource sidecar, human evidence summary and SDD status/decision records.
Tests executed: confirmatory partition and result tests 4/4; confirmatory evaluator run twice with byte-identical JSON SHA-256 `499d7d0c0952428c9f305bab7c73123f70770f20599d9f779a645739bb23a94f`; full `npm test` 446/446 after BEH-004 tests.
Passing checks: frozen SHA-256 identities match; 20 train/4 confirmatory animals disjoint; expected NO-GO gate asserted; no model promotion/external validity; resource sidecar separate from scientific result.
Known failures: none.
Scientific limitations: sampled annotation windows only; no complete 24-hour windows; annotations may carry forward under-30-second events; local Mountain timestamps have no UTC offset/fold; CC BY 4.0 is from prior repository audit, not a new live rights review. No behavior model promoted.
Visual limitations: no UI changed.
Next action: implement BEH-005's secure research assistant from existing server/provider code, or re-audit that scope and record any satisfied criteria before changing it. Preserve allowlisted evidence/tools, server-only keys, confirmation, bounded responses, deterministic fallback, and no model-generated metrics. Do not resume the failed semi-Markov candidate from confirmatory labels.
Blocked dependencies: BEH-007 lacks confirmed rights and independent compatible data; BEH-008 awaits evaluation and independent review.
Blocked: BEH-007 (independent external data reuse/population fit); BEH-008 scientific promotion.
Implementation constraints: default FarmEngine and Product V2 remain unchanged; no model-trained claims; no unauthorized paid inference or research data upload.
Resume command: Read RUN_LOOP.md + tasks.md, verify current git/PR state and BEH-001 commit, then continue BEH-002 without inspecting historical held-out generative outcomes.
