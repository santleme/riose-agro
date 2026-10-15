# Intelligence and scale research gates

This page coordinates the conditional research tracks in [issue #77](https://github.com/santleme/riose-agro/issues/77). Each track can end with a documented no-go. A result is exploratory until its evidence and limitations are reviewed; it does not change a product default by itself.

## Decision sequence

```text
Dataset and population readiness (#96)
                         |
                         v
       Predictive-model readiness decision (#109)
                    |             |
                    v             v
         DMI baseline (#110)    No-go and evidence gap

Comparable benchmark contract (#81) + measured kernel
                    |             |
                    v             v
       GPU/CPU comparison (#111)  Rust/C++ comparison (#112)

Native core parity (#86) + browser benchmark contract (#81)
                         |
                         v
             Full-core browser WASM study (#113)
```

The data-readiness matrix is the evidence gate for #109. A missing eligible population or lawful access is a valid stop condition; it also prevents #110 from training on an unsuitable substitute. No independent domain review was obtained for #22, which is closed as not planned; its absence is recorded as a limitation and is not an operational prerequisite for product engineering or for documenting this data-based no-go. Accelerator experiments are separate from model readiness and must use a workload confirmed by profiling. The full-core WASM study starts only after #86 passes.

## Track gates

| Track | Start when | Minimum evidence for a decision | Stop condition |
| --- | --- | --- | --- |
| Predictive data gate (#109) | Dataset readiness matrix (#96) is available | Named population and estimand, inclusion rules, lawful access, outcome and feature provenance, missingness, animal/trial grouping, and explicit go/no-go | No accessible cohort with usable outcomes and defensible held-out groups |
| DMI baseline (#110) | #109 has a go decision for a defined cohort | Train-only preprocessing; grouped train/validation/test split; identical cases for mechanistic and predictive baselines; MAE, RMSE, bias, subgroup limits, seed, and CPU cost | Leakage, inadequate held-out groups, or no credible improvement over the population-matched reference |
| Vendor-neutral GPU (#111) | #81 report contract and a profile-confirmed independent numeric kernel are available | Equivalent inputs and output check; confirmed device/backend versus CPU fallback; setup, transfer, steady-state and end-to-end time; workload sizes, repetitions, memory, and hardware | No eligible workload, unavailable accelerator, incorrect output, or no repeatable whole-path benefit |
| Rust/C++ (#112) | #81 report contract and a profile-confirmed pure kernel are available | Shared fixtures and precision; compiler/build details; kernel and FFI costs; ownership, packaging, and maintenance implications; repeated measurements | No material workload-level advantage or required C++ library |
| Full-core browser WASM (#113) | #81 report contract and full native-core parity (#86) pass | Same scenario fixtures; cold and warm startup; worker, marshaling and full-scenario time; memory and supported browser/device; JS fallback behavior | Parity is incomplete or whole-path results show no repeatable benefit |

## Reporting and promotion

Use the versioned report shape from [benchmark results](benchmark-results.md) for performance studies. Keep correctness, setup, data movement, and end-to-end costs visible; do not compare kernel-only timings as if they represented the farm simulation. Record seeds, repetitions, warmup, runtime/compiler versions, hardware, memory measurement method, and fallback status. State whether the hardware actually ran the selected backend.

Each report must identify the evidence that supports its decision and list population, access, hardware, or workload limits. A no-go should state the evidence gap and the condition that would reopen the track. Keep prototypes and optional paths isolated. Product adoption requires a separate review of repeatability, compatibility, maintenance, and fallback behavior.

## Current dependency audit

The issue tree has no single prerequisite that blocks all of #77. #96 supplied the dataset readiness matrix, and #109 recorded a no-go because no eligible target cohort is available. #22 is closed as not planned and no independent review was performed; this is a stated evidence limitation, not a dependency. #110 follows #109 and remains no-go for the original DMI target. #111 and #112 have evidence reports and can be reviewed independently after #81 and kernel profiling. The prerequisites #81, #80, and #86 for #113 are now closed. Full-core browser WASM evidence covers Chromium and Firefox with exact fixture parity and legacy UI-display timing. The historical UI measurement is not an active Riose product component. Chromium favors WASM across tested populations, while Firefox does not; product adoption remains unapproved pending issue-level review and evidence from another device.

## Coordinated status — 2026-10-14

This roll-up distinguishes an issue's GitHub state from whether its technical evidence exists. A report artifact does not close its child issue or authorize a product change.

| Track | GitHub state | Evidence already in this repository | Current decision / next action |
| --- | --- | --- | --- |
| #109 population and data readiness | Closed | [`dmi-baseline-no-go-2026-10.json`](../evidence/dmi-baseline-no-go-2026-10.json), [`dmi-adg-readiness-v1.md`](../evidence/dmi-adg-readiness-v1.md), and [`scientific-module-evaluations-2026-10-13.md`](../evidence/scientific-module-evaluations-2026-10-13.md) | NO-GO for supervised training on individual total DMI in mature beef cows grazing pasture. No available cohort meets the target population, outcome, access, and independent-group requirements. No training was performed for this target. |
| #110 DMI predictive baseline | Closed as not planned | #109's no-go evidence and the separate fixed-default DMI diagnostics under `docs/evidence/` | Do not train a substitute model for the original target. Other population/outcome diagnostics do not satisfy this track. |
| #111 vendor-neutral physical GPU against CPU | Open | [`nvidia-metabolism-benchmark-2026-10.md`](../evidence/nvidia-metabolism-benchmark-2026-10.md) and its schema-validated JSON; historical AMD/ROCm-unavailable report retained separately | NO-GO for the measured GTX 1060/CUDA case: physical GPU execution and correctness were confirmed, but warm end-to-end GPU medians lost at all four populations after setup, copies, synchronization, output allocation, and device frees. No product GPU path is proposed. AMD/ROCm remains optional future cross-vendor validation; no cross-vendor claim is made. PR #135 is open for issue-level review. |
| #112 Rust/C++ kernel comparison | Open | [`cpp-rust-metabolism-prototype-2026-10.md`](../evidence/cpp-rust-metabolism-prototype-2026-10.md) and [`cpp-rust-metabolism-benchmark-2026-10.json`](../evidence/cpp-rust-metabolism-benchmark-2026-10.json), cleanly recaptured at `8221bc6` | NO-GO for production C++: shared fixtures matched bitwise, while C ABI and ownership costs provided no material workload-level reason to add a second implementation. The comparison remains a kernel study, not a full FarmEngine claim. |
| #113 full-core browser WASM | Open | [`native-core-browser-wasm-2026-10-14/`](../evidence/native-core-browser-wasm-2026-10-14/README.md) contains nine schema-validated clean Chromium reports (147, 153, and 156) and three clean Firefox 144 reports. Captures include full-scenario and Worker time, startup, memory, and legacy benchmark-only result-display estimates. Rendering tools have since been removed; preserve these records as historical evidence. A3/B3 goldens and missing/malformed-WASM fallback pass in all 12 reports. | GO only to continued optional evaluation; NO-GO for product adoption. Chromium reports repeatably favor WASM across all populations; Firefox ties at 100, favors JS at 1,000, and favors WASM at 10,000. The archived UI phase measured equal JS/WASM snapshots through the former renderer; it is excluded from current product performance claims. All captures use one host; another device and issue-level review remain before adoption. |

### Parent acceptance audit

| Parent criterion | Evidence/status |
| --- | --- |
| Dataset/population gate precedes training | **Satisfied.** #109 recorded NO-GO against the original mature-cow pasture DMI target before any training; the later ADG, biomass, and behavior diagnostics remain separate targets. |
| GPU study confirms actual accelerator execution and includes equivalent output, setup/copy and total-run costs | **Satisfied for the measured NVIDIA study; vendor-specific.** #111 confirms physical GTX 1060 CUDA execution, CPU/GPU correctness at every tested size, setup/copy/cleanup costs, and no fallback claim. It does not generalize to AMD/ROCm or other devices; optional cross-vendor validation is future work. PR #135 is open for issue-level review. |
| C++ study includes ABI/build/ownership costs | **Satisfied for the selected metabolism kernel.** #112 compares shared outputs through the C ABI and accounts for setup/allocation and ownership costs; it does not claim full-engine performance. |
| WASM study includes startup and Worker costs | **Satisfied for the measured browser matrix.** #113 reports full-scenario, Worker, startup, memory, parity, fallback, plus a historical result-display probe. The archived UI timing is not live full-core WASM integration and is not used as a current product measure. |
| No exploratory result changes product defaults without review and repeatable benefit | **Satisfied.** The JavaScript default remains unchanged; the browser evidence recommends optional evaluation only, and PR #131 is available for review. |

### Parent epic disposition

The evidence supports the data/model no-go, the measured NVIDIA GPU no-go, the production C++ no-go, and continued optional WASM evaluation without product adoption. Keep each conclusion limited to its measured population, workload, engine, and host. The parent epic remains open because #111-#113 still need issue-level review and disposition; #113 also needs another device before an adoption decision. #111's physical GTX 1060 study is complete for a single CUDA configuration, while AMD/ROCm remains optional future cross-vendor validation. Do not rerun DMI model training, buy accelerator time, or change product defaults based on these exploratory reports.
