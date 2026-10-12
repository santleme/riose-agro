# Benchmark results

## Setup

- Commit baseline source: `913b36b9fe5c0877c7b857af3e0488cedcfd0e03:engine.js` (loaded directly from Git by the benchmark script, no checkout or source copy).
- Host: Linux x86_64; Node.js `v20.20.2`; Rust `1.95.0` (`x86_64-unknown-linux-gnu`, LLVM 22.1.2).
- Rust release profile: thin LTO, one codegen unit, panic abort. WASM target: `wasm32-unknown-unknown`; output module size: 21,156 bytes.
- Simulation-engine benchmark in Node.js (not a real browser): seed `20261012`; three warmup plus 25 measured runs per entry; each run constructs outside the timer and times a 24-hour `tick()` including its final state snapshot, but excludes rendering, Worker messaging, and engine construction. The same source revision and input are used across the legacy JS, current JS fallback, and WASM paths.
- Kernel benchmark: one warmup plus 25 measured calls; prebuilt packed input and reusable output buffers; includes JS/WASM bridge copies. Native timing uses the same pure Rust function and preallocated vectors with one warmup plus 21 measured calls. It is not a whole-engine native simulation.
- Values are this host's observations, not performance promises. The 25-run spread shows scheduling noise, especially at 100 animals. Memory allocation counts were unavailable.

## End-to-end engine tick

Median and p95 duration in milliseconds for one 24-hour tick:

| Animals | Original JS at baseline commit | Current JS fallback | Rust/WASM path | Interpretation |
| ---: | ---: | ---: | ---: | --- |
| 100 | 0.782 / 1.823 | 0.648 / 1.622 | 0.636 / 1.370 | Noise dominates this short workload. |
| 1,000 | 7.173 / 8.978 | 7.168 / 7.396 | 7.199 / 7.558 | No meaningful difference. |
| 10,000 | 79.912 / 94.070 | 83.905 / 100.163 | 81.717 / 99.012 | No consistent end-to-end gain; most tick work remains in JS. |

The earlier five-run pre-change spot check was 2.43 ms, 9.90 ms, and 94.12 ms for 100, 1,000, and 10,000 animals. The larger same-harness benchmark above is the more useful comparison. `FarmEngine` rejects 100,000 animals, so there is no valid full-engine 100,000-animal result.

## Isolated kernel

Median duration in milliseconds per batch (JS / WASM / native Rust):

| Animals | JS batch | WASM batch | Native Rust batch |
| ---: | ---: | ---: | ---: |
| 100 | 0.000477 | 0.000687 | 0.0001 (reported precision limit) |
| 1,000 | 0.004015 | 0.004162 | 0.0009 |
| 10,000 | 0.039537 | 0.039646 | 0.0090 |
| 100,000 | 0.394871 | 0.395853 | 0.0907 |

The WASM adapter is slightly slower for smaller batches and roughly tied at 10,000 and 100,000 in this Node measurement. Its boundary copies typed-array input into linear memory and copies output back. Native Rust is faster in this isolated loop, where no language bridge exists. At 100,000, only the kernel is measured; renderer and `FarmEngine` have independent lower limits.

## Memory and decision

After the 100,000 batch, WASM linear memory measured 6,946,816 bytes (about 6.62 MiB); the module file is about 20.6 KiB. Node process RSS after the combined benchmark was 203,210,752 bytes; this whole-process figure is not comparable to per-herd memory and is not attributed to Rust. No reliable per-run peak or allocation count was available.

Decision: keep the JS implementation as the default and expose Rust/WASM with `?engine=wasm` for reproducible experimentation. The kernel is correctly integrated and equivalent, but the Node-side JS/WASM boundary has not demonstrated a consistent end-to-end win. Revisit only with real-browser measurements, larger representative workloads, transfer/render costs separated, and memory instrumentation. Native Rust is promising for headless batches but needs a full runner benchmark before choosing it for production.
