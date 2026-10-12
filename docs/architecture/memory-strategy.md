# Memory strategy

The domain engine still stores animals as JS objects with names, history arrays and visual coordinates. That remains the compatibility representation for snapshots and deterministic manifests. Routine Worker ticks no longer deep-clone that graph: they send fixed-width `Float64Array` position/weight values and `Uint8Array` action codes, with the buffers transferred to the page. Full snapshots are requested for explicit save, compare, reset and load actions. The app's animal list is virtualized to at most 15 rows, independently of herd size.

## Initial strategy

- Keep current JS object snapshots for compatibility and readable manifests.
- Use flat numeric buffers at both the metabolism ABI and Worker view boundary; convert at the boundary and transfer the view buffers instead of cloning full state for each tick.
- Reuse the WASM input allocation and JS result buffer. The input is copied into WASM and output copied back; no zero-copy claim.
- Gzip/base64 encode persisted scenario snapshots in a versioned localStorage envelope; preserve reading and migrate old uncompressed arrays. Compression is for persistence and does not change the in-memory snapshot contract.
- Keep the last 40 activity records per animal in an internal circular buffer. Materialize the existing oldest-to-newest JSON history only when a snapshot or selected-animal view is requested. Record objects are still created per activity transition; the circular buffer removes repeated array shifting, not record allocation.
- Bound the initial kernel batch at 100,000. The current `FarmEngine` supports at most 10,000 animals, so the 100,000 workload only benchmarks the numeric kernel and does not represent an end-to-end herd.
- Keep per-animal histories and global events bounded as today. Large result archives should avoid duplicating histories in every analytical row.

## Evidence after the first optimization pass

At 10,000 animals in Chromium, the ordinary JS Worker round-trip for a 24-hour tick fell from 657.1 ms to 27.0 ms median; post-GC JS heap fell from 54.5 MB to 4.7 MB. The CPU and layout changes come from the combined packed-view transfer, skipped routine snapshot clone, virtualized DOM list, viewport culling and cached/capped canvas drawing. A direct 10,000-animal engine tick fell from 60.1 ms with a full snapshot to 15.3 ms without it in the final browser run. These are app-level measurements and do not isolate object-vs-SoA layout.

The metabolism batch already crosses as packed arrays, but the browser bridge sample at 10,000 items is about 0.020 ms in JS and 0.080 ms in WASM. Native Rust measured 0.0137 ms for the equivalent loop in its latest run, but excludes engine, browser and rendering costs. These measurements do not justify replacing the domain object graph with SoA yet. It would require keeping histories, names, scenario JSON and renderer coordinates synchronized, while the measured bottleneck was full state cloning and UI work. Keep SoA as a targeted next experiment only if profiling after the transport changes shows per-animal object access or allocation dominating the 18.7 ms tick.

Activity history used `push()` followed by `shift()` after each animal reached 40 entries. In a warmed, alternating-order, five-run 30-day/10,000-animal benchmark, median simulation time fell from 951.2 ms with the old bounded array to 816.6 ms with the ring buffer (14% lower); the resulting 400,000 history entries and snapshots were identical. Snapshot materialization was 426.3 ms versus 436.1 ms, within the noise of this sample. This justifies the small ring-buffer change while leaving the public snapshot shape unchanged. The ring still creates one activity record per transition; packing those records into typed arrays remains a separate experiment.

## Decisions left open

Profile realistic herd sizes and remaining per-animal history-record allocations before choosing SoA, ECS, slab/pool allocation, compact IDs, binary snapshots, shared memory or SIMD. Pasture allocation currently depends on animal iteration order, so changing to parallel reductions changes semantics. Weight/energy updates are independent after per-animal intake is fixed and are the first plausible vectorized stage.

Track heap, external/ArrayBuffer bytes and peak RSS separately from the WASM linear memory high-water mark. Add allocation counters only if they answer a specific regression question.
