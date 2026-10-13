# Benchmark results

## Versioned report format

New outputs from the simulation, browser, graphics PoC, history, native-kernel, and AMD compute-service benchmark harnesses use the envelope in [`benchmark-report.schema.json`](benchmark-report.schema.json) (`schemaVersion: 1`). The shared Node adapter validates each envelope against this schema before a harness writes or prints it; `npm run test:benchmark-report` checks a generated report and verifies that missing timing boundaries, seed, or population fail validation. An adapter call also fails immediately if seed or population metadata is omitted, so those fields cannot silently become `null` or an empty list. Deterministic workloads that do not use a PRNG identify that fact with a descriptive seed label.

The envelope records source revision and dirty state, runtime, host hardware, workload seed and population scope, warmup and repetition counts, and a fixed `phases` map for `engine`, `snapshot`, `serialization`, `worker`, `ui`, `layout`, `render`, and `startup`. Each report also declares `timingBoundaries` with what each reported phase times and excludes. Unmeasured phases are explicitly marked `not-measured`; they are not inferred from neighboring phases. Every normalized phase measurement names its metric and unit and can carry median/spread and memory observations. The existing harness-specific payload remains under `results` for its detailed fields. A non-animal workload uses `count` plus `unit` in population metadata. Animal counts remain explicit, and any 100,000-animal report must label that population `numeric-kernel-only`; it cannot be reported as a full-engine or renderer workload. The AMD service additionally keeps its prior top-level v1 fields for existing report consumers.

The report's GPU memory field is `null` unless a harness can actually measure it; JavaScript heap does not stand in for GPU allocation. The default limit metadata distinguishes the 10,000-animal FarmEngine and renderer limits from isolated numeric-kernel measurements at 100,000. A 100,000 kernel row must declare `scope: "numeric-kernel-only"`; it is not evidence for a full-engine or renderer load. These limits describe current measurement scope and do not add performance thresholds.

## Memory profiling protocol

`npm run bench:memory` invokes `scripts/benchmark-memory.mjs` with `--expose-gc`. It emits the versioned report envelope and, for 100/1,000/10,000 animals, measures FarmEngine construction, a 24-hour tick, a full snapshot clone, the existing gzip/base64 snapshot encoder plus a representative one-scenario storage-envelope JSON string, and a Node-side projection matching the current Worker view fields. The 100,000 row is numeric-kernel-only with preallocated numeric buffers; it does not construct FarmEngine state or claim full-engine support. `BENCH_MEMORY_REPETITIONS` (default 3) and `BENCH_MEMORY_HERDS` (default `100,1000,10000,100000`) configure the run. Normalized measurements aggregate median and spread across repetitions for each population and phase; raw samples remain in `results.samples`.

Memory dimensions stay separate: post-GC retained deltas include JS heap, external and ArrayBuffer bytes, and WASM linear memory; payload sizes report snapshot JSON UTF-8, gzip bytes, base64 UTF-8, representative storage-envelope JSON UTF-8, or Worker-view transfer buffers and metadata. Retained deltas and payload sizes include `bytes/animal` measurements for each herd. Absolute RSS stays process-level and is never divided by population. The harness also samples whole-process RSS with an independent Worker during every phase and records per-run phase peaks plus the nonnegative increase over the immediate pre-phase RSS baseline; this increase is normalized per animal as an explicitly labeled process-wide lower-bound proxy, not as attributable animal memory. It includes all live process memory and the monitor thread, and can miss short transients between polls. The cumulative `process.resourceUsage().maxRSS` remains available but is not treated as a phase peak. Synchronous transient JS-heap peaks and allocation counts are unavailable; GPU memory remains `null`. The Worker phase counts the current packed projection in Node but does not measure browser Worker transfer, renderer, or GPU memory. Browser localStorage writes and quotas are outside this harness; the serialized JSON envelope is a payload-size and retained-string proxy. The first clean capture [`memory-benchmark-2026-10-12.json`](../evidence/memory-benchmark-2026-10-12.json) records three repetitions on Node.js v20.20.2, source revision `42c4738`, and `dirty: false`. The latest clean capture [`memory-profile-2026-10.json`](../evidence/memory-profile-2026-10.json) uses source revision `4d56404`, five repetitions, and the corrected Node `maxRSS` conversion for Linux and macOS. At 10,000 animals, the serialized snapshot was 8,255,329 UTF-8 bytes, gzip was 764,946 bytes, base64 was 1,019,928 bytes, and the representative storage-envelope JSON was 1,020,171 bytes. The Worker-view payload was 370,000 transferable bytes (plus 2,115 bytes of metadata JSON). At 100,000 animals, only the numeric kernel ran. These are observations from this host and harness; the machine-readable report preserves all per-phase samples, and no browser quota, renderer, or GPU result is implied.

This schema is applied to new harness output only. Historical prose and measurements below are preserved as recorded; they were not rerun or retrofitted into a format that would imply missing metadata.

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

## Browser profiling and optimized app path

The browser harness is `npm run bench:browser` (`BENCH_REPETITIONS=5` controls the run count; `RIOSE_URL` selects the served app and may include `?engine=wasm`). It launches local Chromium, sends real messages to the app's Worker, collects Chrome Performance metrics and V8 CPU samples, and runs equivalent JS/WASM engine and kernel workloads in the browser. The Worker round-trip includes queueing, simulation and the response transfer. For engine function profiling, the same `FarmEngine` module is profiled on the page thread because Chromium does not expose the dedicated Worker to this harness's CPU profiler. This distinction prevents interpreting main-thread samples as Worker-thread samples.

The baseline is the checked-out `913b36b` app; the optimized app is this Architecture V2 worktree after the Worker view transfer, list virtualization, sprite caching and no-snapshot tick changes. Both used Chromium 156.0.8078.4, seed `20261012`, 10,000 animals and a 24-hour tick. The baseline used 9 repetitions and the final run used 5; compare medians, and treat p95 as directional because the sample counts differ.

| Measurement at 10,000 animals | Baseline | Optimized app | Change |
| --- | ---: | ---: | ---: |
| Worker 24-hour round-trip median | 657.1 ms | 27.0 ms | 95.9% lower |
| Worker round-trip p95 | 961.9 ms | 34.5 ms | directional; repetition counts differ |
| JS heap after forced GC | 54.5 MB | 4.7 MB | 91.4% lower |
| DOM nodes after workload | 130,595 | 731 | 99.4% lower |
| Main-thread script time per tick | 931.0 ms | 24.6 ms | 97.4% lower |
| Layout time per tick | 203.8 ms | 1.12 ms | 99.5% lower |

The before profile sampled `drawCow` (111 samples), `listAnimals` (103) and `draw` (68); the 10,000-animal list was creating 10,000 DOM rows and redraws repeatedly reconstructed pixel-art cows. The optimized profile sampled `draw` (32), `drawCow` (8), and `listAnimals` (0 in this five-run sample); the list now keeps at most 15 visible rows, sprite variants are cached, and the high-herd map is capped at 30 draws per second. Worker ticks now send packed position/action arrays and lightweight UI state instead of a deep-cloned full snapshot. A full snapshot is still requested for explicit save, comparison, reset or load actions.

Profiling the full `FarmEngine.tick(24)` at 10,000 animals in Chromium gave 60.1 ms median with a snapshot versus 15.3 ms without it (75% lower). The CPU sample profile attributed 48 of 868 hits to `snapshot` when enabled; routine Worker ticks now skip that copy. The isolated 10,000-item metabolism batch measured 0.020 ms in JS and 0.080 ms through WASM in this run. A final five-run WASM browser pass measured a 36.7 ms Worker round-trip versus 27.0 ms for JS, and a 16.7 ms no-snapshot 10,000-animal tick versus 15.3 ms for JS. The gap shifts across runs, so it does not establish a repeatable WASM advantage; the isolated bridge batch is slower through WASM in this workload. This supports keeping JS as the default for the current small kernel. The Rust native benchmark measures only the equivalent pure metabolism loop and is not comparable to the whole browser engine. A fresh native run (21 repetitions) measured 0.0002, 0.0014, 0.0137 and 0.1407 ms at 100, 1,000, 10,000 and 100,000 animals respectively; those values are host-specific.

### Long-run activity-history buffer

`npm run bench:history` compares the original `push`/`shift` history maintenance with the production circular buffer over 720 hourly steps (30 days), including the ordinary animal transitions and event rules. It alternates run order, warms both paths, and checks full snapshots for exact equality. In a warmed, alternating five-repetition run, 10,000 animals took 951.2 ms median with `shift` and 816.6 ms with the ring (14% lower); each result retained 400,000 chronologically identical history entries. Final snapshot materialization measured 426.3 ms versus 436.1 ms, within the noise of this sample. At 1,000 animals the tick was 81.3 ms versus 75.1 ms, a smaller 8% change. The ring removes array movement, but still creates one record object per transition.

The measured 10,000-animal state after 24 hours serialized to 8,255,329 JSON bytes. Gzip reduced it to 764,946 bytes and base64 storage to 1,019,928 characters; raw JSON did not fit the tested browser's `localStorage`, while five compressed copies fit. Scenario persistence now writes a versioned gzip/base64 envelope, reads legacy uncompressed scenario arrays, and migrates those entries in the background. A round-trip test covers a 1,000-animal snapshot, and the server test verifies that the browser can load the compression helper. Browser quota differs by browser/profile, so the five-copy result is a sample, not a guarantee.

## USDA CPER audit correction

The discrepancy was in the expected count, not the source files or hashes. The verified snapshot contains four CSVs: two study data tables (`period.csv`, `daily.csv`) and their two dictionaries (`period_dict.csv`, `daily_dict.csv`). The audit had one list for every verified file while the test treated its length as a count of data tables. The report now preserves the complete `verifiedSnapshotFiles` list and exposes separate `verifiedDataFiles` and `verifiedDictionaryFiles` lists; the regression test asserts all four filenames and the two-plus-two split.

Run a reproducible browser measurement with:

```sh
npm run bench:browser
BENCH_REPETITIONS=5 RIOSE_URL='http://127.0.0.1:8000/?engine=wasm' npm run bench:browser
```

Run native isolated-kernel measurements with `npm run bench:rust-native`. The first browser command needs the local server at port 8000; the harness itself creates and removes an isolated temporary Chromium profile.
