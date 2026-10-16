# Product V4 handoff

Date: 2026-10-15
Last verified commit: `52f472b` (handoff/runtime state; implementation and evidence verified at `62386a0`)
Current branch: `codex/behavioral-agents-sdd`
Starting point for this work: `81b4aa6`; five preserved local commits were added during this continuation (`ed21687`, `90d6fce`, `9130c9f`, `2218cd7`, `62386a0`). All changes remain local; no push, merge, reset, or history rewrite occurred.

## Completed

- P4-001 through P4-009 are DONE with evidence in `tasks.md`, `progress.md`, and the linked specifications. There is no next READY task that can proceed without duplicating completed capabilities or crossing an external gate.
- Groq was connected server-side and authenticated in the authorized Node watcher used for live tests. Real model verified and used: `openai/gpt-oss-20b`. Product V4 asks the provider for a strict input/evidence plan, validates it independently, presents existing review controls, and requires an explicit user action before any executor runs. After the prior watcher ended, Product was restarted in this T3 session through hidden stdin; `http://127.0.0.1:8000/scenario-lab.html` returned HTTP 200. The key exists only in the live Node process environment.
- Hugging Face Hub authentication returned HTTP 200 and the pinned public Laya weights were fetched. Hosted Hugging Face inference was not exercised. Credentials were injected into the watcher process through hidden terminal input and are not written to source, browser state, manifests, artifacts, or commits. A separately started shell process does not inherit the watcher's environment; do not infer the server's provider availability from a different process.
- Product E2E performed a real multi-scenario FarmEngine comparison: 200 animals, 30 days, seed `20261015`, supplement `[0.5, 1, 1.5]` kg DM/head/day. It verified no Worker execution before explicit confirmation, actual execution, export, import without execution, and exact explicit replay. Compact archive size 952,072 bytes; manifest digest `8bb1685ac6eaffe1c80d750f1646a7f5558c1603f0b4b803f7f2ac78ae36df32`; result digest `9d1131f690cb2b0b2cd7d551072e35589772d726a90fb1fe2a598dad515affc0`.
- The registered BR-CORTE calculation ran after review/confirmation for growing Zebu on tropical pasture, 400 kg body weight, supplied ADG 0.5 kg/day, and supplement 1.6 kg DM/head/day. It returned 7.576845 kg DM/head/day. ADG is an input, not a prediction. BR-CORTE sensitivity, user-supplied price arithmetic, result explanation, export, and explicit replay were also exercised through the Product.
- Laya was installed in an isolated CPU-only Python environment, pinned to SDK 0.4.8 and model revision `1720e3e3357cfe1e281542e223f8273b0890ca34`, with model artifact hashes recorded. It is an experimental non-generative worker and is **OFF** in Product. Final set: 11/16 accuracy (68.75%), macro F1 0.6458; Portuguese 4/8, English 7/8. Unsupported-request recall failed its predeclared screen. Median CPU intent latency 200.1 ms, p95 222.8 ms; cached startup 4.970 s; resident memory after load 1,785,049,728 bytes (peak 2,428,837,376 bytes). Deterministic wrapper and Groq each scored 16/16 in this small developer-authored comparison; the wrapper was implemented after Laya outputs were visible, so the result is exploratory and non-blinded, not external validation or general parser accuracy.
- Single BR-CORTE report is now v2, with an explicit root units map and residual-forage limitation. Import remains strict and replayable; v1 compatibility is tested. Commit `62386a0` contains the schema/version change and the real-browser verification artifact.

## Evidence and verification

- Detailed live-provider, scientific, Laya, failure, limit, and reproduction record: `docs/evidence/hybrid-ai-live-validation-2026-10-15.md`.
- Safe local configuration and reproduction steps: `docs/architecture/hybrid-ai-local-runtime.md`.
- Real Product browser records: `docs/evidence/product-v4-live-ai-e2e-v1.json`, `product-v4-live-scientific-v1.json`, and `product-v4-live-single-report-v2.json`.
- Frozen router comparison and CPU evidence: `docs/evidence/groq-routing-v1.json`, `intent-routing-comparison-v1.json`, `laya-routing-cpu-v1.json`, and the accompanying official audit/environment records.
- Chromium captures: `product-v4-live-initial.png`, `product-v4-live-workspace.png`, `product-v4-live-mobile.png`, `product-v4-live-scientific-desktop.png`, and `product-v4-live-scientific-mobile.png`; desktop 1440×1000 and mobile 390×844 were visually reviewed. Reduced-motion mode and no horizontal overflow were checked.
- Final Node regression after report v2 change: `npm test` PASS, **522/522**, 40.295 s.
- `npm run test:laya-router`: PASS, 3/3 Python worker tests.
- Product V2 E2E, Scenario Lab offline E2E, existing fixture-only assistant E2E, decision-assistant contract E2E, real Groq product/scientific/single-report E2Es: PASS.
- `npm run test:parity`: PASS; pasture seed 417, 24 checkpoints; housing seed 2026, 1,440 hourly checkpoints and 31 daily rows.
- `git diff --check` and JSON parsing for the five final inference evidence files: PASS. Test-regenerated changes to pre-existing `docs/evidence` files were restored; no scientific baseline evidence is included in this work.

Thirty recorded successful remote inference observations across the cited artifacts report 23,739 tokens; artifact latencies range from 338 to 1,853 ms. This is not total session traffic or a billing total. Additional diagnostics and repeated browser attempts occurred; no monetary cost or free-tier entitlement is claimed. The retained browser-attempt JSONL records a harness assertion failure even though the provider responded successfully. Failures are documented rather than counted as successful flows.

## Gates and limits

- FarmEngine remains a demonstrative rule engine; its outputs are not validated livestock forecasts. BR-CORTE estimates conditional total DMI only with user-supplied ADG and declared domain; no gain response to supplement is calculated. These models are not merged into one status or claim.
- Semi-Markov bovine behavior remains NO-GO. Laya is not used for individual physiological or behavioral decisions.
- P3-007 remains BLOCKED for shared/production provider usage because a persistent shared spend gate is absent. P3-008 remains BLOCKED / `NOT_PERFORMED` pending an actual independent scientific review. The development-session authorization only covered controlled non-production tests.
- The current Node watcher holds the Groq key only in volatile process memory; session termination may stop it. Do not infer persistent credential availability from the captured live evidence. For a new session, provide the provider key through the secure environment mechanism described in `docs/architecture/hybrid-ai-local-runtime.md` and start Node in that same process tree; the report records how to reproduce the live tests.
- No users were contacted, no commercial demand or willingness-to-pay is claimed, and no external scientific review is claimed.

## Files and commits

Implementation/spec/evidence commits, oldest first: `ed21687`, `90d6fce`, `9130c9f`, `2218cd7`, `62386a0`.

The closing SDD audit/report changes are being recorded separately after this implementation commit. No key or other credential is included. Preserve all local commits; do not push, merge, reset, or rewrite history without explicit authorization.

## Next action

No independent READY implementation task remains in this SDD track. Keep P3 gates blocked, preserve the negative Laya promotion decision, and wait for new user research direction, an external scientific reviewer, or a persistent provider budget gate before adding a dependent task. Product can be demonstrated locally with its scientific and demonstrative labels intact; this handoff does not authorize decision-grade commercial claims.

## Session handoff — 2026-10-16

Last verified implementation commit: `1cb9896` (`Add user-priced conditional supplement costs`).
Current branch: `codex/behavioral-agents-sdd`.
Completed this session: P4-013. P4-011 and P4-012 were already done and not repeated.
Task in progress: none. No Product V4 task is READY without external user research, new requirements, or a gated external dependency.

Files changed in the implementation commit: Product cost disclosure and responsive styling; independent versioned conditional-cost arithmetic; validated local history persistence; cost-aware export digest; Product E2E and focused unit coverage; P4 task/progress/decision/acceptance records; desktop branch and mobile cost screenshots.

Tests executed: combined cost/history unit tests 30/30; `npm run test:e2e:product` PASS; `npm test` PASS 529/529 in 38.97 seconds; `git diff --check` PASS. The E2E verified that price entry/edit/cost review never posts an engine Worker command, branch cost uses remaining days, exports bind cost provenance, local history preserves the amount, and replay verifies it. No parity run was needed because engine, Rust, and WASM code were untouched.

Passing checks: visual review at 1440×1100 and 390×844, including mobile no-overflow. Captures are `docs/evidence/visual-review/2026-10-16/03b-product-conditional-cost-mobile.png` and `.../10b-product-branch-cost-desktop.png`.

Known failures: the first E2E attempt had an assertion-order issue in its mobile disclosure test; that test was corrected and the full Product E2E passed. No known code/test failures remain.

Scientific limitations: FarmEngine remains demonstrative; the new amount is transparent arithmetic on supplement supplied, herd count, horizon, and user price. It is not measured intake, total ration cost, profit, ROI, or evidence of production response. BR-CORTE and behavioral NO-GO are unchanged. P3-007 remains blocked; P3-008 remains `NOT_PERFORMED`.

Visual limitations: mobile conversation remains a scrollable compact panel as before; the new cost disclosure is readable and fits the viewport. No new motion was added.

Working tree note: unrelated pre-existing local edits remain unstaged in `docs/architecture/current-system-audit.md`, `docs/architecture/module-boundaries.md`, `docs/architecture/repository-layout.md`, several engine/source evidence JSON and Product V2 screenshots, plus `tests/adult-data.test.js` and `tests/simulation-report.test.js`. Preserve them; they were not part of P4-013. E2E-generated non-target screenshots were removed and the pre-existing 2026-10-15 visual captures were restored.

Next action: hold Product V4 implementation here until real user feedback or a new independently eligible task is supplied. Do not activate provider traffic, change behavioral gates, or present the FarmEngine as decision-grade.

## Session handoff — 2026-10-16 — P4-014

Last verified commit: `9567c45` (`Fix Product agent visibility and mobile paths`).
Current branch: `codex/behavioral-agents-sdd`.

Completed tasks: P4-014. Earlier P4-001–P4-013 and P4-006–P4-009 remain as recorded; no prior work was recreated. Task in progress: none.

Files changed for P4-014: `product.css`, `product.html`, `src/client/product-app.js`, `scripts/e2e/product-flow.mjs`, P4 V4 tasks/progress/decisions/handoff/acceptance criteria, and 390 px/desktop visual captures.

Tests executed: `npm run test:e2e:product` PASS; `npm run test:e2e:decision-assistant` PASS using its documented provider fixture (no external inference); `npm test` PASS, 531/531 in 39.9 seconds; `node --check` for Product and server modules PASS; `git diff --check` PASS. No JS/Rust/WASM engine or scientific formula changed, so trajectory parity was not rerun.

Observed runtime: the prior process on port 8000 was a long-running Node instance with an older server route; it returned 404 for `/api/assistant-status`. Restarting from this checkout made that route available. The current Node process reports Groq/HF credentials missing, remote assistant unavailable, local planner available, and Laya `experimental-disabled`; response contains no secret values. No remote inference was attempted and no token from chat was reused.

Product behavior: prompts use `/api/decision-assistant`; fallback is labeled as local deterministic planning; a structured plan still requires review and an explicit run action. Grounded scientific questions preserve results without issuing Worker commands. The result view presents computed baseline/intervention population paths and a checkpoint timeline. A mobile screenshot caught opacity-zero content during the reveal; the cards now animate with transform only and the E2E asserts both arms visible at 390 px, including reduced-motion handling.

Known failures: none in executed tests. Remote Groq/HF behavior is unverified in this server process because its secure environment has no credential. This is configuration availability, not a passing live-provider check.

Scientific limitations: FarmEngine remains a deterministic demonstrative engine; its hourly activity/physiology rules are not validated livestock behavior or forecast. The behavioral agent remains NO-GO; Laya remains off. BR-CORTE only estimates total DMI conditional on supplied ADG within its stated growing-Zebu domain; it does not predict ADG. No scientific gate or claim was changed.

Visual evidence: reviewed desktop `docs/evidence/visual-review/2026-10-16/03-product-results.png` and mobile `04-product-workspace-mobile.png` in headless Chromium. Both comparison arms are legible at mobile width; motion is transform-only and reduced motion disables it. T3 Preview reported that no automation host is connected, so Chromium E2E was used.

Blocked dependencies: configure `GROQ_API_KEY` and `LLM_PROVIDER=groq` in the secure environment inherited by the Node server, then restart that server in the same process tree, to exercise live Groq in Product. HF remains optional. Keep P3-007 (shared/production spend gate) and P3-008 (independent review) blocked. Never paste credentials into chat or source.

Working tree note: `docs/evidence/visual-review/2026-10-16/03b-product-conditional-cost-mobile.png` and `10b-product-branch-cost-desktop.png` were already modified at the start of this turn and were not included in commit `9567c45`; preserve them for review.

Next action: use the same Product E2E with secure Groq configuration when the user provisions it; verify live interpretation separately from scientific validity. No merge or push was performed.
