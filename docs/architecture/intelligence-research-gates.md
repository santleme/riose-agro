# Intelligence and scale research gates

This page coordinates the conditional research tracks in [issue #77](https://github.com/santleme/riose-agro/issues/77). Each track can end with a documented no-go. A result is exploratory until its evidence and limitations are reviewed; it does not change a product default by itself.

## Decision sequence

```text
Dataset and population readiness (#96 + independent domain review #22)
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

The data readiness and domain review tracks should run in parallel. A missing eligible population or lawful access is a valid stop condition for #109; it also prevents #110 from training on an unsuitable substitute. Accelerator experiments are separate from model readiness and must use a workload confirmed by profiling. The full-core WASM study starts only after #86 passes.

## Track gates

| Track | Start when | Minimum evidence for a decision | Stop condition |
| --- | --- | --- | --- |
| Predictive data gate (#109) | Dataset readiness matrix (#96) and independent domain review (#22) are available | Named population and estimand, inclusion rules, lawful access, outcome and feature provenance, missingness, animal/trial grouping, and explicit go/no-go | No accessible cohort with usable outcomes and defensible held-out groups |
| DMI baseline (#110) | #109 has a go decision for a defined cohort | Train-only preprocessing; grouped train/validation/test split; identical cases for mechanistic and predictive baselines; MAE, RMSE, bias, subgroup limits, seed, and CPU cost | Leakage, inadequate held-out groups, or no credible improvement over the population-matched reference |
| AMD/GPU (#111) | #81 report contract and a profile-confirmed independent numeric kernel are available | Equivalent inputs and output check; confirmed device/backend versus CPU fallback; setup, transfer, steady-state and end-to-end time; workload sizes, repetitions, memory, and hardware | No eligible workload, unavailable accelerator, incorrect output, or no repeatable whole-path benefit |
| Rust/C++ (#112) | #81 report contract and a profile-confirmed pure kernel are available | Shared fixtures and precision; compiler/build details; kernel and FFI costs; ownership, packaging, and maintenance implications; repeated measurements | No material workload-level advantage or required C++ library |
| Full-core browser WASM (#113) | #81 report contract and full native-core parity (#86) pass | Same scenario fixtures; cold and warm startup; worker, marshaling and full-scenario time; memory and supported browser/device; JS fallback behavior | Parity is incomplete or whole-path results show no repeatable benefit |

## Reporting and promotion

Use the versioned report shape from [benchmark results](benchmark-results.md) for performance studies. Keep correctness, setup, data movement, and end-to-end costs visible; do not compare kernel-only timings as if they represented the farm simulation. Record seeds, repetitions, warmup, runtime/compiler versions, hardware, memory measurement method, and fallback status. State whether the hardware actually ran the selected backend.

Each report must identify the evidence that supports its decision and list population, access, hardware, or workload limits. A no-go should state the evidence gap and the condition that would reopen the track. Keep prototypes and optional paths isolated. Product adoption requires a separate review of repeatability, compatibility, maintenance, and fallback behavior.

## Current dependency audit

The issue tree has no single prerequisite that blocks all of #77. #96 supplies the dataset readiness matrix; #22 remains an independent domain-review dependency for the final #109 decision. #110 follows #109. #111 and #112 can proceed independently after #81 and kernel profiling. #113 waits for #81, #80, and #86; current kernel-only WASM results do not satisfy that gate.
