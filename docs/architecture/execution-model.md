# Execution model

## Browser

1. UI sends a command to the module Worker.
2. Worker uses JavaScript by default. Opening the page with `?engine=wasm` asks it to initialize Rust/WASM once; if fetch, compilation or ABI checks fail, it keeps the JavaScript fallback. State and comparison envelopes report the active implementation.
3. For each hourly tick, JS computes behavior and feeding in the existing order, packs post-intake metabolism inputs, invokes one Rust batch call when opted in, and applies outputs. Reset and load return snapshots, as do explicit snapshot requests.
4. Scenario comparison/replay invokes the same kernel for both states and returns implementation metadata in the Worker envelope.
5. The interface consumes versioned scientific snapshots and comparison outputs. Presentation state is not part of the simulation kernel or snapshot contract.

```text
UI command -> Worker/orchestrator -> domain JS -> packed batch ABI
                                                   -> Rust WASM or JS fallback
            <- snapshot/comparison result <-
```

## Native and future batch runs

Native `riose-core` builds as an `rlib`/`cdylib` and includes clock/ID/RNG/metrics primitives, command/event values and versioned JSON core snapshots. The included benchmark executable uses the same pure kernel without browser presentation. A future native simulation runner can own scenario scheduling and write versioned results. Python calibration tools exchange scenario/result files or batched numeric inputs, not per-animal RPCs.

## Determinism and concurrency

The kernel is pure and order-preserving. No RNG or mutable shared state enters the metabolism call. Preserve per-animal order and exact f64 formula. Keep pasture stock updates sequential because animals compete for one paddock stock. Parallelize independent scenarios or the metabolism batch only after repeatability and performance tests. Web Workers and native thread pools are separate options; no shared-memory threading is required for this PoC.
