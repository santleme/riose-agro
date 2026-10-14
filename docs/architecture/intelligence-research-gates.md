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
| AMD/GPU (#111) | #81 report contract and a profile-confirmed independent numeric kernel are available | Equivalent inputs and output check; confirmed device/backend versus CPU fallback; setup, transfer, steady-state and end-to-end time; workload sizes, repetitions, memory, and hardware | No eligible workload, unavailable accelerator, incorrect output, or no repeatable whole-path benefit |
| Rust/C++ (#112) | #81 report contract and a profile-confirmed pure kernel are available | Shared fixtures and precision; compiler/build details; kernel and FFI costs; ownership, packaging, and maintenance implications; repeated measurements | No material workload-level advantage or required C++ library |
| Full-core browser WASM (#113) | #81 report contract and full native-core parity (#86) pass | Same scenario fixtures; cold and warm startup; worker, marshaling and full-scenario time; memory and supported browser/device; JS fallback behavior | Parity is incomplete or whole-path results show no repeatable benefit |

## Reporting and promotion

Use the versioned report shape from [benchmark results](benchmark-results.md) for performance studies. Keep correctness, setup, data movement, and end-to-end costs visible; do not compare kernel-only timings as if they represented the farm simulation. Record seeds, repetitions, warmup, runtime/compiler versions, hardware, memory measurement method, and fallback status. State whether the hardware actually ran the selected backend.

Each report must identify the evidence that supports its decision and list population, access, hardware, or workload limits. A no-go should state the evidence gap and the condition that would reopen the track. Keep prototypes and optional paths isolated. Product adoption requires a separate review of repeatability, compatibility, maintenance, and fallback behavior.

## Current dependency audit

The issue tree has no single prerequisite that blocks all of #77. #96 supplied the dataset readiness matrix, and #109 recorded a no-go because no eligible target cohort is available. #22 is closed as not planned and no independent review was performed; this is a stated evidence limitation, not a dependency. #110 follows #109 and remains no-go for the original DMI target. #111 and #112 have evidence reports and can be reviewed independently after #81 and kernel profiling. The prerequisites #81, #80, and #86 for #113 are now closed. A separate full-core browser WASM study now has exact fixture parity and repeated end-to-end gains across three Chromium versions on one host; product adoption remains unapproved pending issue-level review and evidence from another browser engine and device.

## Coordinated status — 2026-10-14

This roll-up distinguishes an issue's GitHub state from whether its technical evidence exists. A report artifact does not close its child issue or authorize a product change.

| Track | GitHub state | Evidence already in this repository | Current decision / next action |
| --- | --- | --- | --- |
| #109 population and data readiness | Closed | [`dmi-baseline-no-go-2026-10.json`](../evidence/dmi-baseline-no-go-2026-10.json), [`dmi-adg-readiness-v1.md`](../evidence/dmi-adg-readiness-v1.md), and [`scientific-module-evaluations-2026-10-13.md`](../evidence/scientific-module-evaluations-2026-10-13.md) | NO-GO for supervised training on individual total DMI in mature beef cows grazing pasture. No available cohort meets the target population, outcome, access, and independent-group requirements. No training was performed for this target. |
| #110 DMI predictive baseline | Closed as not planned | #109's no-go evidence and the separate fixed-default DMI diagnostics under `docs/evidence/` | Do not train a substitute model for the original target. Other population/outcome diagnostics do not satisfy this track. |
| #111 AMD/GPU against CPU | Open | [`amd-metabolism-benchmark-no-go-2026-10.md`](../evidence/amd-metabolism-benchmark-no-go-2026-10.md) and its clean, schema-validated JSON recapture from 2026-10-14 | NO-GO on this host: the selected production metabolism kernel was measured on CPU, but no ROCm device/runtime was available, so accelerator correctness, transfers, and speedup remain unmeasured. Rerun on a ROCm-enabled host; CPU fallback is not GPU evidence. |
| #112 Rust/C++ kernel comparison | Open | [`cpp-rust-metabolism-prototype-2026-10.md`](../evidence/cpp-rust-metabolism-prototype-2026-10.md) and [`cpp-rust-metabolism-benchmark-2026-10.json`](../evidence/cpp-rust-metabolism-benchmark-2026-10.json), cleanly recaptured at `8221bc6` | NO-GO for production C++: shared fixtures matched bitwise, while C ABI and ownership costs provided no material workload-level reason to add a second implementation. The comparison remains a kernel study, not a full FarmEngine claim. |
| #113 full-core browser WASM | Open | [`native-core-browser-wasm-2026-10-14/`](../evidence/native-core-browser-wasm-2026-10-14/README.md) contains nine schema-validated clean Chromium reports (versions 147, 153, and 156) tied to commit `4533668`; each separates JS/Rust engine timing, WASM JSON parse/serialize, Worker/full-scenario timing, and memory. A3/B3 goldens match exactly, and unavailable/malformed-WASM fallback passes in every run. | GO to continued optional evaluation on the measured host: full-scenario and Worker medians favor WASM at 100/1k/10k across all three Chromium versions. Chrome 147 has a notably higher WASM startup cost. No product-default change: all captures use one browser engine/host and omit rendered UI. Review and another browser engine/device are still needed before adoption. |

### Parent epic disposition

The evidence supports the data/model no-go, the current no-go decisions for GPU and production C++, and a scoped go to continue WASM evaluation. Keep each conclusion limited to its measured population, workload, and host. The parent epic remains open while its open child issues #111–#113 need issue-level review and disposition; #111 requires a ROCm-enabled host for any accelerator comparison, and #113 still needs another browser engine/device and rendered-UI measurements before product adoption. Do not rerun DMI model training, buy accelerator time, or change product defaults based on these exploratory reports.
