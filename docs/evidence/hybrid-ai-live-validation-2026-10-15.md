# Hybrid AI live validation — 2026-10-15

## Actual status

| Component | Observed result |
|---|---|
| Groq | Authenticated model discovery HTTP 200; `openai/gpt-oss-20b` available; real strict-schema interpretation and browser experiments passed. |
| Hugging Face | Authenticated Hub API HTTP 200; pinned public multilingual weights downloaded and executed locally. Hosted HF chat inference was not exercised. |
| Laya | SDK 0.4.8 installed in an isolated CPU venv; actual local inference and offline startup passed. Experimental routing remains OFF. |
| Scientific execution | Existing registered BR-CORTE and existing FarmEngine only, after explicit confirmation. No formulas or biological rules changed. |
| Production / external science review | P3-007 shared production budget remains blocked; independent review remains NOT_PERFORMED; behavioral semi-Markov remains NO-GO. |

Credentials were supplied under explicit user authorization, through hidden stdin into volatile server environment variables. No secret file, literal command argument, browser credential, authorization-header log, or credential-bearing artifact was created. A generic terminal process still lacks these variables; that is distinct from the separately launched Node watcher, whose actual authenticated responses establish effective configuration. Local source changes remain unpushed.

## Real Product flows

`product-v4-live-ai-e2e-v1.json` records seven successful real Groq interpretations/plans in Chromium: incomplete supplement request → clarification; complete three-arm comparison; completed-result inspection; conversational supplement revision; single conditional BR-CORTE input draft; scientific limitation question; unsupported individual-rumination prediction.

The complete comparison used 200 generated engine animals, 30 days, seed `20261015`, normal demonstrative weather and supplement `[0.5, 1, 1.5]` kg DM/head/day. The browser verified zero Worker executions before confirmation, an explicit actual execution, provenance-bearing archive export, no execution when opening the archive, and explicit replay. The compact archive measured **952,072 bytes**. Confirmed manifest digest: `8bb1685ac6eaffe1c80d750f1646a7f5558c1603f0b4b803f7f2ac78ae36df32`; result digest: `9d1131f690cb2b0b2cd7d551072e35589772d726a90fb1fe2a598dad515affc0`.

The single scientific calculation used BW 400 kg, supplied ADG 0.5 kg/day and supplement 1.6 kg DM/head/day for explicitly stated growing Zebu on tropical pasture. After confirmation, the registered module returned **7.576845 kg DM/head/day** (display rounded to six decimals), with canonical output equality checked against the module and explicit report replay. It did not predict ADG. A final real-provider browser flow verified single-report v2: all five input/output unit labels are explicit, the imported report validates, import does not execute, and explicit replay equals the registered module output. Its bounded live-request evidence is `product-v4-live-single-report-v2.json`; the older single-report v1 reader remains covered by unit tests.

`product-v4-live-scientific-v1.json` records five further successful real Groq plans: generic comparison without numeric inputs; vague improvement request; incomplete sensitivity request; complete BR-CORTE supplement sensitivity; conditional BR-CORTE/cost comparison. The actual sensitivity uses fixed BW 400 kg and supplied ADG 0.5 kg/day, 200 represented animals, 30 days, supplement 0.5–2.0 in steps of 0.25 kg DM/head/day. Its seven points were calculated only after confirmation; export/open/explicit replay matched. The cost comparison used `[0.5, 1, 1.5]`, user price BRL 2 per kg DM and the existing model/cost arithmetic, without autonomous gain, profit or ROI claims.

The final recorded successful-flow artifacts contain **30 remote inference observations** (7 Product + 5 scientific + 16 routing + 1 final transport smoke + 1 single-report v2), with **23,739 reported tokens** and observed request latencies **338–1,853 ms**. These counts describe those artifacts, not all session traffic or a billing total. Additional diagnostic and repeated browser-test calls occurred while fixing issues. The retained browser-attempt JSONL includes a failed test assertion despite successful upstream responses; earlier ad hoc diagnostics have no reconstructed aggregate token/cost total. No monetary cost or free-tier entitlement is invented.

## Defects found and corrected

- Groq omitted required nullable parameter keys for incomplete requests (`json_validate_failed`). A complete required-key template made the same incomplete-request path succeed; native strict schema and independent validators remain mandatory.
- Provider proposals requested irrelevant weight/ADG/price fields for FarmEngine. Required inputs are now derived locally per selected capability. Provider prose cannot invent obligations or scientific outputs.
- A 200-animal/30-day pretty-printed archive exceeded the old 4 MB import guard. Compact exports and a common 64 MiB export/import bound cover the current 40 MiB result-planning cap plus snapshot/provenance overhead. The actual full replay now passes. The bound is a browser resource guard, not a general performance claim.
- File-input events cleared completed results before an invalid import could be rejected. Import validation is now performed before replacing data; invalid imports revoke pending review authority and retain completed outputs.
- Responses arriving after edits are discarded; both assistant buttons share the in-flight guard. Explicit execution remains a separate action. Offline drafts preserve the original deterministic parser assumptions in archives.
- Current result inspection distinguishes FarmEngine, single BR-CORTE, BR-CORTE comparisons and sensitivity. Sensitivity summaries identify sampled points when the sweep has more than ten; scientific versions and units are validated. Browser-supplied summaries are explicitly identified and are not authenticated observations.
- Single BR-CORTE report v2 now declares units at the report root and clarifies that residual forage is a modeled dry-matter balance, not independently validated forage intake. Strict v1 import/replay compatibility is preserved; the registered equation and results did not change.
- Long implementation hashes caused mobile page overflow when BR-CORTE provenance was open. Hashes now wrap; quantitative tables retain their local horizontal scrolling.
- Laya SDK normalization changed the shared cached tokenizer config and caused checksum failure at the second startup. The adapter verifies the original pinned files and confines normalization to a private copy; cached offline loading was then successful.

Authentication, quota/rate errors, invalid JSON/schema, incomplete output, response-size overflow and timeouts have safe local tests. The transport uses 12 s deadlines, bounded completion counts, a 64 KiB streamed response limit and no automatic retries. Model failures visibly select the local parser and never authorize calculation. In the browser, a simulated provider outage preserved the current computed result and did not start another Worker.

## Laya evaluation and decision

Protocol: `specs/riose-product-v4/hybrid-ai-protocol.md`. Fixture SHA-256: `b7f73a27c600eebf823ccb3ba5510bf4d1ee00720c371fb354bed976cc314ab8`, committed before Laya inference in `ed21687`. There are 16 development and 16 final smoke cases, equally split EN/PT over eight exclusive dominant intents. There was no fine-tuning, final-case prompt revision, threshold selection or probability calibration.

| Final 16 cases | Accuracy | Macro F1 | PT accuracy | EN accuracy | Median / p95 |
|---|---:|---:|---:|---:|---:|
| Laya multilingual | 68.75% | 0.6458 | 50% | 87.5% | 200.1 / 222.8 ms CPU |
| Deterministic wrapper | 100% | 1.0000 | 100% | 100% | 0.0017 / 0.0735 ms, tiny single-call measurements |
| Groq gpt-oss-20b | 100% | 1.0000 | 100% | 100% | 428 / 650 ms, includes network |

The deterministic baseline is a new conservative lexical routing wrapper; the unchanged existing scenario parser has no eight-label classifier interface. Its ready flag is also recorded. The wrapper was implemented once after Laya's outputs were already visible, so this comparison is exploratory and not blinded. It was not iteratively optimized against the final cases, and the Laya question/weights were not adjusted. This is not evidence that the original parser handles arbitrary language. Groq's classification comparison is distinct from its larger Product planning schema.

Laya had one unsupported final request routed as sensitivity, one inspection request routed as experiment creation, one sensitivity request routed as cost, and two vague requests routed as unsupported. Full per-case outputs and confusion matrices are in `laya-routing-cpu-v1.json` and `intent-routing-comparison-v1.json`. Development accuracy was 75%; no remedial tuning was attempted after inspecting the final set. Laya failed the predefined relative accuracy/F1 and unsupported-recall screens and passed the CPU latency screen. Decision: **EXPERIMENTAL_OFF**. These developer-authored cases are not external user validation or calibrated reliability estimates; even 16/16 does not authorize production routing.

Runtime: AMD Ryzen 7 7700X, WSL2 Linux, 16 logical/affinity CPUs, 25,199,570,944 bytes OS memory; Python 3.12.3, CPU-only Torch 2.14.1, four inference threads. Model revision `1720e3e3357cfe1e281542e223f8273b0890ca34`; model weights SHA-256 `9d628fd971b700382ac6f65920a86f149777b2e748e0c955fb3b19695aa8f204`. SDK/dependencies: `scripts/ai/laya-cpu-environment.txt`.

First acquisition/initialization: 62.389 s, including ~678 MB download; first classification 216.1 ms; all-case median 206.6 ms; process maximum RSS **2,454,790,144 bytes**. Cached offline startup after the cache fix: **4.970 s**, first classification **183.2 ms**, retained RSS **1,785,044,992 bytes**, maximum RSS **2,428,833,792 bytes**. Startup and steady-state prediction are separate observations. No GPU or cross-host performance is inferred.

The official model/SDK audit with pinned source, license and API references is `laya-groq-official-api-audit-2026-10-15.md`. Reproduction commands and credential inheritance are in `docs/architecture/hybrid-ai-local-runtime.md`. No weights, venv or machine secret configuration is checked into the repository.

## Verification and limits

Final unit regression: **522/522** (40.295 s). Python worker protocol/metrics/fixture tests: **3/3**. Product V2 E2E, Scenario Lab offline E2E, existing AI fixture E2E, new decision UI contract E2E and the real Groq single-report v2 E2E passed. JS/Rust parity passed for pasture seed 417 (24 checkpoints) and housing seed 2026 (1,440 hourly checkpoints, 31 daily rows). Scientific equations and default FarmEngine behavior are unchanged.

Real Chromium evidence: `product-v4-live-initial.png`, `product-v4-live-workspace.png`, `product-v4-live-mobile.png`, `product-v4-live-scientific-desktop.png`, `product-v4-live-scientific-mobile.png`. Desktop 1440×1000 and mobile 390×844 checks passed with reduced motion, no horizontal page overflow and no page errors. The new conversation log is keyboard focusable. T3 preview status/open explicitly reported no automation host; local headless Chromium was used as instructed. This is not WCAG certification or a multi-browser/device performance guarantee.

Remaining external dependencies: independently reviewed scientific decision scope; real user discovery; production-wide provider spend controls; new appropriate behavioral data. This work demonstrates real provider integration and reproducible software execution, not biological model validation, commercial demand, calibrated routing or production reliability.
