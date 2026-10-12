# Memory strategy

The existing engine stores each animal as a JS object with names, history arrays and visual coordinates. Its snapshot clone duplicates the complete graph. This is maintainable at the current 24-animal default, but history and structured-clone traffic grow with herd size. The app also creates one DOM row per animal.

## Initial strategy

- Keep current JS object snapshots for compatibility and readable manifests.
- Use flat `Float64Array` batches only at the metabolism ABI; keep object-to-buffer conversion localized in the Worker/engine boundary.
- Reuse the WASM input allocation and JS result buffer. The input is copied into WASM and output copied back; no zero-copy claim.
- Bound the initial kernel batch at 100,000. The current `FarmEngine` supports at most 10,000 animals, so the 100,000 workload only benchmarks the numeric kernel and does not represent an end-to-end herd.
- Keep per-animal histories and global events bounded as today. Large result archives should avoid duplicating histories in every analytical row.

## Decisions left open

Profile realistic herd sizes and snapshot/Worker transfer before choosing AoS vs SoA, ECS, slab/pool allocation, compact IDs, binary snapshots, shared memory or SIMD. Pasture allocation currently depends on animal iteration order, so changing to parallel reductions changes semantics. Weight/energy updates are independent after per-animal intake is fixed and are the first plausible vectorized stage.

Track heap, external/ArrayBuffer bytes and peak RSS separately from the WASM linear memory high-water mark. Add allocation counters only if they answer a specific regression question.
