# Hybrid compute v2: integration and measured results

Captured in isolated branch `codex/pr116-rust-integration`; no merge or push was performed. The comparison audit records the main, hybrid proof-of-concept, and PR #116 revisions and the overlapping paths in [`hybrid-v2-integration-audit.md`](hybrid-v2-integration-audit.md). Parallel scheduling reuses issue #108's `ScenarioWorkerPool`, manifest, journal, and report implementation from PR #116; this work does not add a second worker-pool implementation. Configured comparison, replay, history, scientific tests, and graphics work stayed intact. No Scene Composer, mini-diorama, or selective-rendering source was changed.

## Backend recommendation

| Workload | Recommended executor | Measured result | Memory and cost | Complexity |
| --- | --- | --- | --- | --- |
| Interactive simulation and graphics | Browser JavaScript | Existing local path | No remote bill; browser owns rendering and input latency | Low |
| Independent 24-hour scenarios, 10–100 batches | Local JavaScript, sequential | At 10 scenarios: 13.8 ms median work / end-to-end; at 100: 118 ms | 88 MB / 120 MB p95 sampled process RSS; no cloud cost | Low |
| Independent 24-hour scenarios, around 1,000 | Local JavaScript worker pool, 4 workers when the exact profile allows the ~350 MB RSS budget | 1,069 ms median work, 1,206 ms end-to-end; sequential end-to-end was 1,359 ms | 348 MB p95 sampled process RSS; no cloud cost | Medium |
| Independent 10,000-scenario batch | Measure the exact workload and memory budget; current p95 policy chooses sequential | Four workers reduced median end-to-end by 9.7%, but raised p95 to 51.1 s versus 47.6 s sequential | p95 sampled process RSS 769 MB with four workers versus 687 MB sequential | Medium |
| Configured 30-day numerical comparison | Local Rust CLI when explicitly requested and validated; JS fallback remains available | Rust process end-to-end median: 7.0 / 51.3 / 666.2 ms at 100 / 1,000 / 10,000 animals; JS calculation median: 201.8 / 2,305 / 25,488 ms | Rust child peak RSS: 3.9 / 13.6 / 115.7 MB; JS harness RSS after: 100.9 / 186.7 / 699.9 MB. No cloud cost | Medium |
| Remote Modal candidate | Do not auto-select yet | Cold start, warm start, full remote latency, and speedup have not been measured | Current estimate only: a 60-second L4 allocation has a posted GPU-only floor around $0.0133 before app load, CPU/RAM, and any billed idle time; not an invoice or measured batch cost. [Modal pricing](https://modal.com/pricing), [resource defaults](https://modal.com/docs/guide/resources), [cold starts and scale-down](https://modal.com/docs/guide/cold-start) | High |

The recommendation for 100 versus 4 workers accounts for worker startup: work fell from 118 ms to 82 ms, but end-to-end rose to 226 ms and p95 RSS rose from 123 MB to 224 MB. At 1,000 scenarios the worker pool paid back its startup and improved median end-to-end time by 11%; at 10,000 the median improved but the small sample's p95 did not. Each scheduler scenario uses the checked-in 3-animal baseline over 24 hours. For that fixture, the measured crossover is between 100 and 1,000 scenarios (roughly 500 by linear interpolation); use the selector's exact measurements rather than treating that interpolation as a universal threshold.

The machine-readable [`executor-profile-v2.json`](executor-profile-v2.json) contains eight clean, parity-passed records for 10, 100, 1,000, and 10,000 scenarios on this WSL2 host. `selectExperimentExecutor` matches the complete workload and host profile, then selects the lowest measured end-to-end p95 within RSS and cost limits. The resumable CLI can apply it with `node scripts/experiments/run-scenarios.js --auto <scenario-directory> <result-directory>`; set `RIOSE_EXECUTOR_MAX_RSS_BYTES` to impose an RSS ceiling and `RIOSE_EXECUTOR_MAX_COST_USD` to set the per-experiment cost ceiling (default `$0`). Its current evidence selects 1 worker for 10, 100, and 10,000 scenarios; it selects 4 workers for 1,000 when the declared RSS budget permits. Unknown workloads, host/runtime mismatches, failed parity, heterogeneous scenario shapes, and missing measurements fall back to local JavaScript. This profile selects local scheduler concurrency; it does not infer that Rust or Modal wins a different operation.

## JS and Rust parity and phase costs

The 30-day local benchmark ran one warmup and five measured runs. All animal fields and array order matched at tolerance `1e-12` for 100, 1,000, and 10,000 animals. Separate product integration verification matched all configured factors exactly against both the current JavaScript implementation and frozen Rust vectors (maximum absolute difference 0), and replay/history compatibility passed. The product integration smoke report is explicitly one sample per factor, not a p95 measurement.

| Animals | JS calc median / p95 | Rust process E2E median / p95 | Request serialization median / p95 | JS clone proxy median / p95 | JS output serialization median / p95 | Rust startup median / p95 | Rust parse proxy median / p95 | Storage write / read median / p95 | JS RSS median / p95; retained heap median / p95 | Rust child peak RSS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 201.8 / 208.5 ms | 7.0 / 7.2 ms | 0.14 / 0.14 ms | 0.30 / 0.38 ms | 0.086 / 0.088 ms | 1.22 / 1.57 ms | 0.11 / 0.12 ms | 1.06 / 1.50; 0.28 / 0.36 ms | 100.9 / 101.3 MB; 27.0 / 29.1 MB | 3.9 MB |
| 1,000 | 2,305 / 2,339 ms | 51.3 / 51.7 ms | 1.28 / 1.33 ms | 2.36 / 5.44 ms | 0.129 / 0.132 ms | 1.22 / 1.57 ms | 0.106 / 0.111 ms | 3.72 / 4.31; 0.22 / 0.36 ms | 186.7 / 187.4 MB; 107.8 / 108.0 MB | 13.6 MB |
| 10,000 | 25,488 / 26,222 ms | 666.2 / 726.3 ms | 13.34 / 19.68 ms | 28.87 / 29.78 ms | 0.146 / 0.155 ms | 1.22 / 1.57 ms | 0.105 / 3.59 ms | 3.26 / 9.24; 0.27 / 0.32 ms | 699.9 / 943.6 MB; 569.7 / 810.6 MB | 115.7 MB |

The Rust comparison is a headless CLI subprocess and includes process startup, JSON IPC, and process exit; the JavaScript column is calculation time. This is a practical local batch-path comparison, not an isolated instruction-for-instruction kernel benchmark. This 30-day report was captured from hybrid-v2 source revision `a6293fd`, while the scheduler profile was captured from integration revision `85705be`; these reports are separate cohorts and their cross-report timings should not be compared as a single controlled run. Memory boundaries differ: JS reports harness process RSS and retained heap, while Rust reports sampled child peak RSS. The request sizes were 37 KB / 369 KB / 3.71 MB; the stored result envelope was about 45–46 KB at each size. These measurements do not imply that the interactive browser simulation should move to Rust or cloud execution.

## Scheduler evidence and limits

All four scheduler captures use source revision `85705be`, clean source state, the same 3-animal, 24-hour baseline scenario, and compare sequential with four workers. The 10/100/1,000 reports use five measured samples; the 10,000 report uses three because the full matrix takes longer. The harness reports nearest-rank p95, which is the maximum of three or five observations here and remains exploratory; use at least 30 independent measured batches before setting an SLA. RSS is process-wide sampling every 5 ms, not a hard worker memory limit.

| Scenarios | Workers | Work median / p95 | End-to-end median / p95 | Throughput median | Peak RSS median / p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1 | 13.8 / 15.5 ms | 13.8 / 15.5 ms | 725/s | 88 / 89 MB |
| 10 | 4 | 14.2 / 15.7 ms | 159.8 / 172.3 ms | 702/s | 183 / 184 MB |
| 100 | 1 | 118 / 133 ms | 118 / 133 ms | 847/s | 120 / 123 MB |
| 100 | 4 | 81.6 / 86.0 ms | 226 / 229 ms | 1,225/s | 221 / 224 MB |
| 1,000 | 1 | 1,359 / 1,464 ms | 1,359 / 1,464 ms | 736/s | 183 / 187 MB |
| 1,000 | 4 | 1,069 / 1,149 ms | 1,206 / 1,284 ms | 936/s | 320 / 348 MB |
| 10,000 | 1 | 46.96 / 47.59 s | 46.96 / 47.59 s | 213/s | 681 / 687 MB |
| 10,000 | 4 | 42.27 / 50.97 s | 42.39 / 51.11 s | 236/s | 728 / 769 MB |

The first 10,000 run exposed an O(N²) manifest rewrite in the resumable scheduler. The fix appends each result to the local JSONL journal and atomically checkpoints the full manifest every 100 results. Recovery tests cover interruption within a checkpoint group. The JSONL digest detects accidental corruption but is not an authenticity signature; the journal and manifest are trusted local files. The captured 10,000 benchmark was run after the fix.

## Modal, cost threshold, and fallback

No Modal function was invoked, deployed, or charged. The isolated proof-of-concept adapter remains in the hybrid branch worktree and was not added to this product branch. There is no measured cold-start p95, warm-start p95, transfer latency, end-to-end latency, billed duration, or speedup, so there is no defensible numeric break-even batch size yet. For a future authorized pilot, calculate the latency crossover only from the same operation and input: `N* = (remote cold start + queue + fixed transfer/setup) / (local per-item time - remote per-item time)`, when the remote per-item time is actually lower. Separately compare the estimated bill for the whole invocation, including startup, application load, configured scale-down idle, CPU, memory, and GPU, against the user's cost ceiling.

Modal remains an explicit opt-in candidate for independent numeric batches that are large enough to amortize remote setup. Interactive state, rendering, Scene Composer, mini-dioramas, and selective representation stay local. A remote call requires an explicit authorization and a measured profile record; on timeout, invalid result, or budget/latency violation, fall back to local JavaScript if `allow_local_fallback` is explicitly enabled. The Modal adapter is serialized to one concurrent request and validates payload size; its hourly-rate guard is an estimate, not a billing cap.

## Test and browser status

The branch audit and latest test results are kept with the integration evidence. The scheduler and journal changes retain PR #116's existing scenario, science, and product tests. Chromium verification depends on a usable browser binary and server environment; this host had no Chromium/Chrome executable or installed Playwright/Puppeteer runner during the audit. No rendering path was changed, so the visual experience remains the existing local Scene Composer implementation.

Detailed benchmark artifacts: [30-day JS/Rust](hybrid-local-30-day-v2.json), [10 scenarios](scenario-scheduler-10-v2.json), [100 scenarios](scenario-scheduler-100-v2.json), [1,000 scenarios](scenario-scheduler-1000-v2.json), [10,000 scenarios](scenario-scheduler-10000-v2.json), and [configured comparison integration smoke](native-configured-integration-v1.json).
