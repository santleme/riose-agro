# Historical system audit

This document records a snapshot at commit `913b36b` and is retained as historical context. It is not a description of the current checkout. See the [repository architecture audit](repository-architecture-audit-2026-10-14.md) for the current inventory and findings.

This document describes the science-first product after removal of the farm map and visual scene tooling.

## Runtime boundaries

- `src/client/engine.js` is the deterministic JavaScript simulation and comparison implementation. It owns model state, inputs, rules, feeding, pasture stocks, costs, activity history, metrics, snapshots, and replay.
- `src/client/worker.js` runs the engine away from the interface. Worker messages carry scientific snapshots and comparison results; there is no selection or view-buffer protocol.
- `src/client/product-app.js` configures one-factor experiments, compares results, plots model outputs, runs local sensitivity analysis, saves local history, and exports CSV, JSON, and Markdown.
- `src/server/server.js` serves the institutional home and experiment product, validates observational snapshot uploads, and exposes the local explanation and optional native-comparison endpoints.
- `crates/riose-core` implements the supported deterministic native path; `wasm/` and the Rust build scripts provide the optional metabolism and scenario integrations.
- `schemas/`, `data/`, `scientific/`, `experiments/`, and `docs/evidence/` hold input contracts, source datasets, equations, reproducibility records, and scientific limitations.

## Simulation and compatibility

The model RNG remains the only RNG used by the scientific simulation. Initialization retains the original sequence of model draws; removing map position generation does not change weight, intake, pasture, cost, activity, or comparison calculations. New snapshots omit animal coordinates and locomotion RNG metadata. JavaScript, Rust, and CLI input boundaries accept those fields from historical snapshots and discard them. Historical golden files remain unchanged; parity checks compare their scientific projection while continuing to compare numeric and event data exactly (or under the existing field-specific tolerance policy).

Observed farm snapshots in `schemas/farm-snapshot.schema.json` remain a separate data contract. They are not the engine state format and do not make an observed cohort eligible for simulation. Simulation outputs retain their demonstrative, unvalidated status.

## User-facing flow

The homepage remains the institutional entry point. `product.html` is the experiment workspace. It reports modeled weight, dry-matter intake, pasture stocks, and model costs using existing engine outputs, labels assumptions and limitations, and distinguishes output from observed measurements. The scenario history is local to the browser. Snapshot review validates an uploaded observational record without importing it into the simulator.

## Removed surface

The product no longer includes a farm map, Canvas/Pixi renderers, isometric terrain, asset atlases, visual scene schemas, scenario composition tools, sprite-processing scripts, graphics benchmarks, or screenshot regression workflows. Branding and research-page assets remain available to the institutional site.
