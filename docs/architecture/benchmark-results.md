# Benchmark results

## Setup

- Commit baseline source: `913b36b9fe5c0877c7b857af3e0488cedcfd0e03:engine.js` (loaded directly from Git by the benchmark script, no checkout or source copy).
- Host: Linux x86_64; Node.js `v20.20.2`; Rust `1.95.0` (`x86_64-unknown-linux-gnu`, LLVM 22.1.2).
- Rust release profile: thin LTO, one codegen unit, panic abort. WASM target: `wasm32-unknown-unknown`; output module size: 21,156 bytes.
- Simulation-engine benchmark in Node.js (not a real browser): seed `20261012`; ten warmups plus 25 measured runs per entry; each run constructs outside the timer and times a 24-hour `tick()` including its final state snapshot, but excludes rendering, Worker messaging, and engine construction. The same source revision and input are used across the legacy JS, current JS fallback, and WASM paths.
- Kernel benchmark: 50 warmups plus 25 measured calls; prebuilt packed input and reusable output buffers; includes JS/WASM bridge copies. Native timing uses the same pure Rust function and preallocated vectors with one warmup plus 21 measured calls. It is not a whole-engine native simulation.
- Values are this host's observations, not performance promises. The 25-run spread shows scheduling noise, especially at 100 animals. Memory allocation counts were unavailable.

## End-to-end engine tick

Median and p95 duration in milliseconds for one 24-hour tick:

| Animals | Original JS at baseline commit | Current JS fallback | Rust/WASM path | Interpretation |
| ---: | ---: | ---: | ---: | --- |
| 100 | 0.627 / 0.985 | 0.633 / 0.892 | 0.645 / 0.922 | Noise dominates this short workload. |
| 1,000 | 6.277 / 7.278 | 7.297 / 8.816 | 7.476 / 7.807 | No meaningful difference. |
| 10,000 | 79.355 / 100.795 | 74.407 / 100.533 | 78.847 / 97.175 | No consistent end-to-end gain; most tick work remains in JS. |

An earlier five-run pre-change spot check was 2.43 ms, 9.90 ms, and 94.12 ms for 100, 1,000, and 10,000 animals. `FarmEngine` rejects 100,000 animals, so there is no valid full-engine 100,000-animal result.

## Isolated kernel

Median duration in milliseconds per batch (JS / WASM / native Rust):

| Animals | JS batch | WASM batch | Native Rust batch |
| ---: | ---: | ---: | ---: |
| 100 | 0.007251 | 0.000541 | 0.0001 (reported precision limit) |
| 1,000 | 0.004015 | 0.004052 | 0.0009 |
| 10,000 | 0.039262 | 0.039033 | 0.0090 |
| 100,000 | 0.404084 | 0.433648 | 0.0909 |

The WASM adapter varies with batch size and is slightly slower at 100,000 in this Node measurement. Its boundary copies typed-array input into linear memory and copies output back. Native Rust is faster in this isolated loop, where no language bridge exists. At 100,000, only the kernel is measured; renderer and `FarmEngine` have independent lower limits.

## Snapshot transfer sample

Median and p95 milliseconds for a representative snapshot-shaped payload. `structuredClone` is measured on the engine's read-only proxy snapshot; JSON is stringify plus parse. Byte counts are UTF-8 JSON size.

| Animals | `structuredClone` | `structuredClone` proxy | JSON round-trip | JSON bytes |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 0.160 / 0.173 | 0.171 / 0.184 | 0.089 / 0.096 | 36,974 |
| 1,000 | 1.534 / 2.032 | 1.718 / 1.852 | 0.883 / 0.895 | 369,401 |
| 10,000 | 19.330 / 23.482 | 20.326 / 22.074 | 8.954 / 9.474 | 3,710,317 |

## Memory and decision

After the 100,000 batch, WASM linear memory measured 6,946,816 bytes (about 6.62 MiB); the module file is about 20.6 KiB. Node process RSS after the combined benchmark was 239,144,960 bytes; this whole-process figure is not comparable to per-herd memory and is not attributed to Rust. No reliable per-run peak or allocation count was available.

Decision: keep the JS implementation as the default and expose Rust/WASM with `?engine=wasm` for reproducible experimentation. The kernel is correctly integrated and equivalent, but the Node-side JS/WASM boundary has not demonstrated a consistent end-to-end win. Revisit only with real-browser measurements, larger representative workloads, transfer/render costs separated, and memory instrumentation. Native Rust is promising for headless batches but needs a full runner benchmark before choosing it for production.
