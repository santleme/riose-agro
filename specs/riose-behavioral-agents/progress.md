# SDD progress

## 2026-10-15 — Bootstrap
- Examined live GitHub PR #190 status: open, not merged, head `983d0d7259fb01fcdc7c279cd059eeb5eaaf72bc`.
- Confirmed existing Product V2 specs at `specs/riose-product-v2/`.
- Examined published repository evidence for Perea v2, other behavior dataset legal/domain barriers, and current scientific model limitations.
- Established `specs/riose-behavioral-agents/` as a separate science-first track.
- Created branch `codex/behavioral-agents-sdd` based on PR #190 head.
- No changes to engine, UI, scientific inference code or model weights. No training, fresh dataset download, runtime test, provider invocation or validation metric generated.
- Scientific status: **NO MODEL PROMOTED; external pasture behavior validity NOT ESTABLISHED**.
- Next: BEH-001; BEH-005 can progress in parallel without touching physiology.

## 2026-10-15 — BEH-001 complete
- Added a standard-library Perea sequence audit that keeps timestamps as naive Mountain local wall clock, applies the historical duplicate policy, finds exact-minute contiguous windows, and reports per-class annotated-run coverage/censoring.
- Reconciled the new canonical records and stable JSON SHA-256 against `evaluate_perea_behavior_grouped.read_observations`; the rows, order, labels, mean motion index, source-row multiplicity and analysis-row count match.
- Evidence: 9,222 source rows; 8,918 animal-minute keys; 290 repeated keys / 304 excess rows; 54 contradictory-label keys (121 rows excluded); 8,864 usable observations; 24 animals; 1,305 operational contiguous windows; zero 24-hour windows.
- Limits: the window definition is an exact-minute operational definition, not source video-session metadata. Labels may carry forward for events under 30 seconds; observed run lengths are not unbiased behavior durations. Timezone offset/fold is absent; no UTC conversion. Source license is inherited from the existing audit, not freshly checked upstream.
- Tests: `npm run audit:perea-time-series-readiness`; `npm run test:perea-time-series-readiness` (3 passing); `node --test tests/perea-rangeland-behavior.test.js` (1 passing).
- No model fitting, training, behavior-policy change, FarmEngine change, or inference output. BEH-001 is DONE. BEH-002 is now READY and is next priority; keep generative score artifacts unopened until its protocol and candidates are frozen.
