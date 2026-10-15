# Tooling layout

The repository groups command-line tools by responsibility. `package.json` remains the public command index; scripts run by tests or documented workflows also have explicit consumers that must be updated when paths move.

| Path | Responsibility |
| --- | --- |
| `scripts/build/` | WASM builds and other runtime build steps. |
| `scripts/validation/` | Scientific registry, snapshots, outcomes, uncertainty readiness, parity and scenario goldens. |
| `scripts/experiments/` | Scenario runs, batch manifests, resumable journals, replicate summaries and experiment-format tools. |
| `scripts/benchmarks/` | Simulation, browser compute, memory, Rust/WASM and scientific benchmarks, report validation and native SIMD studies. |
| `scripts/science/engine-audits/` | Fixed-configuration engine comparisons against named external cohorts. |
| `scripts/science/source-audits/` | Public-source checks, checksums, coverage and cohort analyses. USDA tools are grouped under `usda/`. |
| `scripts/science/evaluations/` | Model and cohort evaluation harnesses and baseline maintenance. |
| `scripts/science/data_pipelines/` | Scientific data acquisition, normalization and processing. |
| `scripts/science/readiness/` | Evidence-based data and model readiness gates. |
| `scripts/` | Remaining commands whose stable source paths are pinned by research manifests or not yet grouped. |
| `experiments/` | Protocols, source snapshots, evaluation outputs and research records. |

The renderer, art processing pipeline, visual scene schemas, scenario editor and graphics benchmarks were removed. The remaining browser benchmark compares scientific JavaScript and Rust/WASM execution in Workers; it reports no product presentation phase. Data provenance can make a script path observable, so only move pinned scripts together with all manifests, imports, tests and documentation that reference them.
