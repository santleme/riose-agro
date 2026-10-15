# Memory strategy

The scientific engine keeps object-per-animal state, bounded activity history, and complete versioned snapshots. New snapshots contain model inputs, outputs, events, and metrics; map coordinates and locomotion RNG state have been removed. Legacy coordinates are accepted only at snapshot input boundaries and discarded.

## Current limits

- `FarmEngine` supports 1–10,000 animals. A numeric metabolism kernel may be measured at larger batch sizes, but that does not establish full-engine capacity.
- Histories retain at most 40 records per animal and the engine caps recent events. Full snapshots are copied only when the caller requests them.
- The Worker protocol carries scientific snapshots and comparison outputs. It has no position/action view buffers.
- Browser history is local and size-bounded. Its manifest format and replay compatibility are tested separately from the simulation.

## Measurement policy

Use `npm run bench:memory`, `npm run bench:history`, and the Rust computation benchmarks to separate construction, tick, snapshot, serialization, retained heap, ArrayBuffer, WASM memory, and process RSS. These measurements have different scopes; do not treat a kernel-only batch as a full herd simulation or process RSS as animal-attributable memory.

Several checked-in browser memory reports predate removal of the map and include DOM, Canvas, or packed-view costs. Keep those records as historical evidence and do not use their UI timings as a current product baseline. The current numerical formulas and deterministic outputs are unchanged by the view-state removal.

Keep the object representation unless equivalent-write-path measurements show a repeatable end-to-end benefit from an alternative. Any future storage or parallelism change must preserve stable animal order, pasture allocation semantics, replay compatibility, and scientific output parity.
