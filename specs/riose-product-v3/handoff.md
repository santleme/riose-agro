# Product V3 session handoff

Date: 2026-10-15
Branch: `codex/behavioral-agents-sdd` (local commits from earlier Behavioral SDD remain unpushed; do not rewrite/push around network policy).
Last verified commit: `2f71740` (`feat: add bounded BR-CORTE scenario calculator`).
Current branch: `codex/behavioral-agents-sdd`; earlier behavioral/Product V3 commits remain local and unpushed under the network policy.
Completed tasks: P3-001 audit/rescope; P3-002 multi-scenario manifest/replay; P3-003 Worker/UI; P3-004 isolated BR-CORTE calculator; P3-005 cancellation; P3-006 browser performance and JS/Rust/WASM parity evidence.
Task in progress: none currently eligible; P3-007 and P3-008 remain blocked by their documented gates.
Files changed: Product V3 benchmark and resource-budget implementation/evidence; see commits `c8503bc`, `988d596`, `3c430b8`, `d0808da` and persisted JSON reports.
Tests executed: `npm run test:scenario-set-budget` (3/3); `npm run test:product-v3-benchmarks` (2/2); `npm run test:e2e:scenario-lab` (pass); `npm run test:e2e:product` (pass); `npm test` (482/482); `npm run test:parity` (baseline 24 checkpoints; housing 1,440 hourly checkpoints/31 daily rows); `npm run bench:scenario-lab` (1 warmup/3 repetitions/populations 100, 1,000, 10,000); `NATIVE_WASM_REPETITIONS=3 NATIVE_WASM_WARMUPS=1 npm run bench:wasm-scenario-browser` (exact goldens and fallback).
Passing checks: measured actual 3-arm UI, selection, result-size proxy, renderer heap and cell counts; over-budget combinations are disabled before execution; Product V2 flow and JS/Rust trajectory parity remain unchanged.
Known failures: none in verified scopes. Resource estimate is a linear planning proxy, not an actual transfer or total browser memory guarantee. Native WASM benchmark is a 24-hour single-scenario path and does not establish scenario-set parity.
Scientific limitations: FarmEngine stays illustrative. BR-CORTE is a published conditional total-DMI equation requiring supplied ADG, limited to growing Zebu on supplemented tropical pasture and published ranges; totals assume representative fixed inputs. This does not establish Riose independent calibration or paid-customer decision validity.
Visual limitations: initial and calculated-result desktop screenshots retained; 390px width passes; assistive-technology and broader browser matrix remain.
Next action: split P3-007 into provider-independent local planning/explanation work and the spend-gated optional provider integration; do not call paid APIs. Consider on-demand individual history if target-device memory measurements justify it.
Blocked dependencies: P3-007 AI orchestration remains blocked by shared provider spend controls; P3-008 commercial quantitative feature remains blocked pending independent domain review; behavior model integration remains NO-GO and independent of Product V3.
