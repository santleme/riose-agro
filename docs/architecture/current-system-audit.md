# Historical system audit

This document records a snapshot at commit `913b36b` and is retained as historical context. It is not a description of the current checkout. See the [repository architecture audit](repository-architecture-audit-2026-10-14.md) for the current inventory and findings.

Audit scope: committed tree at `913b36b` in the isolated Architecture V2 worktree, with parallel uncommitted work inventoried separately in [repository-wide-audit.md](repository-wide-audit.md). Findings below describe executable code, not planned work.

## Inventory

| Area | Implemented today |
| --- | --- |
| Languages/runtime | Browser JavaScript ES modules, HTML/CSS, Node.js 20 server and tests, Python 3 data audit/build scripts, JSON schemas and datasets. |
| Dependencies | Runtime server imports Ajv 2020 and `ajv-formats` for snapshot review. The committed package has six installed package instances after `npm ci`; there is no frontend bundler or framework. |
| Simulation | `engine.js` contains `FarmEngine`, two deterministic LCG streams (model and locomotion), state initialization, hourly rule transitions, feeding/pasture/cost accounting, weight/energy updates, snapshots, metrics and scenario comparison/replay. Assumptions are explicitly illustrative and uncalibrated. |
| Worker | `src/client/worker.js` owns one JS `FarmEngine` in a module Worker and handles versioned reset/load/configure/select/tick/compare/replay/snapshot commands. State responses carry snapshots; configure/select/tick return a compact v1 view with three validated transferable buffers. |
| UI/rendering | `app.js` directly coordinates DOM, Worker, scenario localStorage, canvas map drawing, interpolation/positions, controls, comparison display and CSV export. The map is a 576×336 canvas. No PixiJS, React, TypeScript, or separate renderer package is installed in the committed baseline. |
| Scenarios/data | Comparison manifest `agroville-comparison` v1, farm snapshot and outcome-record JSON Schemas, localStorage saved scenarios, JSON import/export, SHA-256 linking and local server validation are implemented. No database or Arrow/Parquet pipeline is wired into runtime. |
| Scientific evidence | The committed baseline has evidence/provenance documentation and observed-data pages. Current simulation output remains demonstrative; the model is not calibrated or validated against the scientific datasets. Parallel uncommitted main-worktree research adds broader source audits and transport checks. |
| Assets | The committed baseline includes the farm-world image and the existing canvas/art presentation. The larger V7 style guide, asset manifests, sprite library and processing pipeline live as uncommitted work in the separate `d99d` worktree. |
| Quality | Node built-in `node:test` tests for engine, UI, schema/snapshot/outcome behavior, plus Python audits exercised by tests. No Rust, WASM, benchmark suite, performance budgets, CI workflow, or build pipeline is present. |

## Boundaries and behavior

The Worker boundary is already a useful process boundary: UI controls send commands and receive state, while simulation and comparisons execute in the Worker. However, the Worker imports the same large `engine.js` module as all rule and replay code. There is no typed message schema or engine-version field on the state transport. Full snapshots contain strings, histories and events as well as numerical state, and are structured-cloned for every response.

`FarmEngine.tick()` interleaves rule selection, thirst/energy, feeding, pasture stock, cost and intake, weight gain, history/event recording, deterministic movement and interpolation state. The implementation is simple and deterministic, but domain science, behavior, world state and presentation coordinates share one mutable animal object. The map reads those coordinates directly. Comparison runs two full engine copies sequentially inside the Worker; simulation and rendering costs are not benchmarked separately.

Memory use grows with each animal's object/string fields and per-animal history. `recordActivity()` retains the last 40 history entries per animal; events retain 100 globally. `snapshot()` deep-clones the complete graph. Current count validation caps herds at 10,000, and `app.js` renders one list row per animal. There is no evidence that the current main-thread renderer could display 100,000 animals efficiently, and no need to render animals for native batch runs.

Stable behavior worth preserving includes: explicit deterministic seed handling; separate movement and model random streams; pure manifest replay from saved snapshots; same-state scenario comparisons that alter housing only; and clear labels that distinguish simulated output from observations and validation. These are compatibility and scientific-integrity requirements, not candidates for opportunistic rewrite.

## Coupling, allocation and measurement findings

- The most defensible first Rust boundary is the small scalar metabolism calculation inside the animal loop: weight gain and energy update from current weight, energy, intake and resting status. It is deterministic and independent per animal once intake/action are computed. Keep behavior, feed allocation, pasture depletion, movement, histories and logs in JS for the first slice.
- A batch boundary can avoid one foreign-function call per animal, but arrays still need to cross the JS/WASM boundary. Use flat numeric buffers and measure copies; do not call this zero-copy.
- Pasture depletion currently depends on animal iteration order, so parallelizing it would change results. Weight/energy after each animal's intake can be parallelized later, but determinism and numerical equivalence must be measured first.
- Repeated `structuredClone` of complete snapshots and building full history/event records are likely memory/transport costs. Do not optimize before separately timing tick, snapshot, Worker transfer and rendering.
- Rendering coordinates are simulation state today. A future visual-state adapter should own camera-space interpolation and culling while preserving the current asset/style work.
- Existing model constants and equations are illustrative assumptions. A faster implementation must preserve the formula and evidence status exactly.

## Baseline measurements

Environment: Node `v20.20.2`, Linux `x64`; committed JS implementation; fixed seed `20261012`; 24 hourly ticks per run; five runs per size, reporting median for tick duration only (construction excluded from the timed interval). This measures the simulation call, not rendering, worker messaging, or snapshot serialization.

| Animals | Median 24-tick duration | Result |
| ---: | ---: | --- |
| 100 | 2.43 ms | 5/5 runs completed |
| 1,000 | 9.90 ms | 5/5 runs completed |
| 10,000 | 94.12 ms | 5/5 runs completed |
| 100,000 | — | Rejected by existing `FarmEngine` validation: supported count is 1–10,000 |

At measurement end process RSS was 110,698,496 bytes. This is whole-process RSS, not per-herd resident memory. The baseline does not expose allocation counts or peak per-run memory. The 100,000 case is recorded as unsupported rather than extrapolated.

After `npm ci`, baseline `npm test` reports 80 passing and 1 failing test out of 81. Failure: `tests/usda-audit.test.js` expects two USDA CPER groups but the committed fixture/audit currently reports four (`4 !== 2`). Initial test attempt before dependency installation had additional `ajv` module-not-found errors; those were environment setup, not retained test failures. No source was edited to hide the existing mismatch.

## Risks and candidate boundaries

Keep the JS engine as fallback until native and WASM results match. The metabolic calculation is a bounded first prototype, not a validated scientific model. Contract changes to snapshots or manifest v1 can invalidate saved files; use additive/versioned adapters. Renderer choice, ECS, native parallelism, SIMD, database, binary snapshots, C++/GPU and device protocols remain unproven needs. First revisit count limits and visual culling only after benchmarks show which subsystem blocks larger batches.
