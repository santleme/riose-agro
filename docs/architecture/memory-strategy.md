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

## Activity-history storage experiment

`npm run bench:history-storage` compares the production object ring with a benchmark-only typed-column ring. Each variant runs in a fresh Node process, performs one untimed 720-hour warm-up, then reports the median of three 720-hour runs. Both use seed `20261012`; the snapshot SHA-256 and number of history entries are checked for equality. Environment: Node `v20.20.2` on Linux x86_64 under WSL2. This is a synthetic engine benchmark, not a browser or production workload.

| Animals | Storage | Tick median | Full snapshot median | Retained heap delta | Retained ArrayBuffer delta |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1,000 | Object ring | 113.2 ms | 46.9 ms | 4.89 MB | 0 MB |
| 1,000 | Typed columns | 255.1 ms | 3.0 ms | 1.02 MB | 0.64 MB |
| 10,000 | Object ring | 1,211.6 ms | 669.7 ms | 48.46 MB | 0 MB |
| 10,000 | Typed columns | 3,031.4 ms | 77.5 ms | 10.05 MB | 6.42 MB |

This turn's `npm run bench:history-storage` rerun used five repetitions per variant, a 720-hour warm-up and 720-hour measured runs. All snapshots were identical, containing 40 entries per animal (400,000 entries at 10,000 animals). At that size, typed columns reduced retained JS heap by about 79% and combined retained heap plus ArrayBuffer memory by about 66%. They made full snapshot materialization about 8.6× faster, but made the measured tick about 2.5× slower. The typed version uses a benchmark-only direct recording path; this comparison does not isolate the representation from that implementation difference, so the tick regression is a reason to reject this prototype for production, not a general claim about typed arrays.

The benchmark also reports RSS, but do not use it to compare these variants: the median post-warm-up RSS baselines differed by about 99 MB between the two 10,000-animal child processes, and the typed process's post-tick RSS fell below its own baseline after garbage collection. The heap and ArrayBuffer deltas are the interpretable retained-storage comparison here; peak RSS needs a more controlled harness.

Keep the production object ring. Its 40-entry cap bounds memory and the currently shipped views request history only for the selected animal or a full explicit snapshot. No history-wide aggregate query exists, so incremental aggregates would add duplicated state and update work without accelerating an active consumer. Revisit columnar storage if full-history export or analysis becomes a measured bottleneck, and compare equivalent write paths before changing production.

## Decisions left open

Profile realistic herd sizes and remaining per-animal history-record allocations before choosing SoA, ECS, slab/pool allocation, compact IDs, binary snapshots, shared memory or SIMD. Pasture allocation currently depends on animal iteration order, so changing to parallel reductions changes semantics. Weight/energy updates are independent after per-animal intake is fixed and are the first plausible vectorized stage.

Track heap, external/ArrayBuffer bytes and peak RSS separately from the WASM linear memory high-water mark. Add allocation counters only if they answer a specific regression question.
