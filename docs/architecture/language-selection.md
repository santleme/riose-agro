# Language selection

| Domain | Starting choice | Reason and change trigger |
| --- | --- | --- |
| Current UI and renderer | JavaScript, HTML, CSS | Already shipped behavior and visual fidelity matter. TypeScript or PixiJS can be adopted when the app or asset pipeline benefits justify migration. |
| Worker and orchestration | JavaScript | Already asynchronous and off the UI thread; keep scenario orchestration and structured messages easy to inspect. |
| Tight deterministic numeric kernels | Rust | Memory-safe native and WASM output, shared source, explicit ABI. Adopt one kernel at a time and retain JS until equivalence and workload-level benefits are clear. |
| Scientific analysis and calibration | Python | Mature statistics, data, plotting and model tooling; do not port research code just for uniformity. |
| Specialized physics | C++ only if selected dependency or measured throughput makes it worthwhile | Keep behind a stable adapter; no current need observed. |
| GPU/HPC | CUDA/C++ or another suitable backend only after profiling | Requires large independent workloads and an explicit transfer/cost model; no current evidence supports GPU. |
| Firmware | C or embedded Rust | Choose based on the selected device SDK, resource envelope and team maintenance. No device protocol is currently integrated. |
| Operational/analytical data | JSON/CSV now; SQLite then PostgreSQL; Arrow/Parquet for large analytics | Start local and portable. Upgrade only when concurrency, retention, query or dataset volume needs it. |

Evaluate performance, memory, safety, library maturity, parallelism, portability, integration, maintenance and development cost together. A language change is a measured implementation choice, not a platform objective by itself.
