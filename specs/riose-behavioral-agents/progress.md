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
- Frozen `07-baseline-preregistration-v1.md` before implementing/running the benchmark: explicit animal partitions (including sealed four-animal confirmatory holdout), three candidate definitions, 20 replicate seed derivation, primary/secondary metrics, support gates, negative controls, and stop thresholds. BEH-002 is IN_PROGRESS. No held-out sequence scores have been generated.
- BEH-002 complete: implemented train-only animal-balanced IID, persistence, and first-order Markov generators and five breed-balanced grouped development folds. Added deterministic replicate seeding, gap-aware evaluation, composition/transition/complete-run metrics, a maximum penalty for missing generated transition rows, ontology/length checks, and animal-leakage tests. Evaluated only 20 development animals; the four confirmatory animals remain reserved and were not scored.
- Baseline evidence: Markov transition TV 0.7528, persistence 0.7544, IID 0.8178; Markov improves over persistence by only 0.0015 and is worse than IID. Macro composition errors are 0.3600 (Markov), 0.3676 (persistence), 0.3532 (IID). These are within-source descriptive baselines, not validation and not a promotion decision. Persistence has no complete interior runs; other duration figures remain annotation-run descriptions.
- Verification: full baseline evaluator rerun produced byte-identical report SHA-256 `d7def7fa0bb61905f755692cdacadf6e29e21a43b8e9b1cf338e22f4412e7010`; readiness tests 3/3, baseline tests 4/4, legacy Perea page/server test 1/1 pass. No FarmEngine or WASM path changed.
- Broader regression: `npm test` passed 445/445 tests (2026-10-15).
- BEH-002 is DONE. BEH-003 is next eligible; any semi-Markov candidate must be compared only on the same development folds first. Do not open confirmatory scores unless code is frozen and the pre-registered threshold passes.
- BEH-003 in progress: froze a semi-Markov candidate protocol before implementation/scoring. It learns complete interior annotated-run durations and run-to-run transitions from training animals only, reports unsupported duration classes, and does not use motion index or physiology. Evaluation remains development-fold-only; confirmatory holdout stays sealed unless every preregistered criterion passes.
- Before semi-Markov scoring, clarified the already-registered per-class composition gate with an exact animal/window/replicate averaging order in the protocol. This makes the +0.05 class-wise comparison testable and does not change any threshold or inspect new candidate outcomes.
