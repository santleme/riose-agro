# Tooling layout

The root `scripts/` directory contains command-line tools for builds, data audits, simulations, benchmarks and validation. Move a tool only with its command entries, imports, tests, documentation and CI path filters.

| Path | Responsibility | Contents |
| --- | --- | --- |
| `scripts/assets/` | Asset pipeline | Asset composition, validation, provenance and release gates. |
| `scripts/graphics/` | Graphics PoC tooling | Scene adaptation/build, screenshot regression and renderer benchmarks. |
| `scripts/experiments/` | Scenario and batch-experiment tooling | Scenario runner, reusable manifest/journal/dispatch modules, replicate summaries and experiment-format tools. |
| `scripts/benchmarks/` | Benchmark harnesses | Simulation, browser, memory, native/WASM and scientific benchmark entry points, plus their shared report schema and validator. |
| `scripts/` | Remaining project commands | Data audits, scientific processing, build commands and validators whose ownership is not grouped yet. |
| `experiments/` | Research records and experiment-specific code | Protocols, source snapshots, evaluation code, execution outputs, reports and model artifacts; reusable Node helpers belong under `scripts/experiments/`. |

`package.json` is the public command index for supported scripts. Some development tools are invoked directly by tests or documented workflows instead. A path move therefore updates all of those consumers in the same change. Avoid moving scripts solely by filename: data provenance, runtime input paths, and experiment evidence can make a seemingly local rename observable.
