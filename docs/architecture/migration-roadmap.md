# Migration roadmap

## Delivered in this worktree

1. Inventory all accessible worktrees, branches, stashes and parallel uncommitted work; record `repository-wide-audit.md`.
2. Record executable system behavior and baseline test/throughput results in `current-system-audit.md`.
3. Add the initial architecture and contracts while preserving comparison manifest v1, current UI, assets and JS engine.
4. Implement Rust runtime primitives for clock, IDs, seed, metrics, command/event envelopes and versioned JSON core snapshots; add a pure metabolism batch kernel, compile native and WASM, connect it to the existing Worker behind `?engine=wasm`, retain JS as the default/fallback, and verify equivalence.
5. Add reproducible JS/WASM and native benchmarks. The current bridge is slower for isolated WASM batches and has no consistent whole-tick advantage, so no further domain rules move yet.

## Next steps, ordered by dependency

| Order | Work | Dependency / gate |
| ---: | --- | --- |
| 1 | Integrate and review the uncommitted main-worktree scientific-data work | Preserve sources, licenses, IDs, validation statuses, and test evidence; no automatic merge |
| 2 | Integrate and review d99d asset manifests/style tokens and the V7 pipeline | Confirm intended assets and quality status; then define a stable visual adapter |
| 3 | Repeat browser benchmarks in a real browser and profile copy/Worker/render costs | Use same hardware, warmup, 30+ samples, confidence/percentile reporting, memory measurements |
| 4 | Add explicit versioned command/state schemas and model metadata | Preserve manifest/snapshot v1 readers; define additive migration strategy |
| 5 | Evaluate typed SoA state and incremental snapshots | Only if measured clone/memory costs warrant the compatibility adapter |
| 6 | Port one further independent hot path or leave it in JS | Require repeatable end-to-end benefit and exact behavior parity |
| 7 | Add native scenario runner and independent scenario parallelism | Requires result archive contract and deterministic scheduling |
| 8 | Consider Arrow/Parquet, SQLite/PostgreSQL, SIMD, C++, GPU or device adapters | Introduce only when a concrete workload and benchmark support the operational cost |

No merges are performed by this plan. Existing PR17/18/19 history is mostly integrated/superseded; only compare behavioral tests if future conflicts arise. The two dirty worktrees are integration dependencies, not a license to copy or modify them here.
