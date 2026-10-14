# Native metabolism SIMD study — issue #91

**Decision: `CONDITIONAL_GO` for a future, separately reviewed production optimization.** Keep product defaults and the production kernel unchanged. The isolated AVX2 prototype is numerically exact and beats the generic SSE2 build in the numeric kernel on this host, but measured end-to-end buffer lifecycle gains are small or absent at the repository's 10,000-animal engine limit. A production change needs a full-engine benchmark on controlled CI hardware first.

## Scope and baseline

The unchanged kernel is `crates/riose-core/src/lib.rs::update_metabolism`. It consumes four interleaved `f64` values per animal (weight, energy, intake, resting) and writes two (weight, energy), with a maximum batch of 100,000. The repository's farm engine and renderer limits are each 10,000. The existing `bench-metabolism` fixture is preserved exactly; a second deterministic fixture exercises energy clamps and the resting branch.

The SIMD implementation lives only in `crates/riose-core/examples/simd_metabolism_study.rs`. It transposes four packed records to AVX2 vectors, applies the same `f64` operations in the same order without fast math or FMA, then writes packed outputs and sends tails through the unchanged scalar kernel. Runtime feature detection selects the AVX2 function only when available; the production kernel is the fallback. No production defaults, model equations, or public APIs changed.

## Compiler audit

Captured with the CI Rust toolchain, Rust 1.95.0 / LLVM 22.1.2, release thin LTO, one codegen unit, panic abort:

- Default `x86_64-unknown-linux-gnu` compilation already auto-vectorizes the production loop with 128-bit SSE2 packed-double operations (`divpd`, `mulpd`, `addpd`, `maxpd`, `minpd`) across two animals at a time.
- `-C target-cpu=native` emits 256-bit AVX2 packed-double operations (`vdivpd`, `vmulpd`, `vaddpd`, `vmaxpd`, `vminpd`) across four animals at a time, plus vector unpack/permutation instructions for the packed input and output layout.
- `-C no-vectorize-loops -C no-vectorize-slp` emits no packed-double arithmetic in this kernel.
- The checked `std::simd::Simd<f64, 4>` probe fails on Rust 1.95.0 with `E0658 portable_simd` (still unstable for this toolchain). The study therefore uses stable `std::arch` AVX2 behind runtime detection.

The corresponding disassembly and LLVM IR are preserved in `audit-generic/`, `audit-native/`, and `audit-scalar/`; `portable-simd-probe.txt` preserves the portability probe diagnostic.

## Method

- Machine: Intel Core i5-10400F, x86_64 with SSE2/AVX2, Ubuntu 24.04.4 under WSL2 on Windows 11. This is one virtualized host; it is not a second independent machine.
- Inputs: exact existing native benchmark fixture plus deterministic mixed-clamp/resting fixture; 1,000, 10,000, and 100,000 animals. Each implementation receives the same packed inputs and preallocated output for kernel-only measurements.
- Implementations: current production kernel, direct AVX2 prototype, per-call runtime-dispatched prototype, and forced production fallback.
- Each report uses five warmups and 31 timed repetitions per case. Four independent process captures rotate implementation order. Timings are per-call medians normalized over batches of `1,000,000 / animal_count` calls. Paired speedup is the median of the four within-capture ratios `current / candidate`; raw observations and each capture median remain in the JSON files.
- Separately measured metrics: `metabolismBatch` (preallocated kernel only), `allocateFillKernelRelease` (fixture and output allocation/fill/release plus kernel), and `allocateFillRelease` (shared input/output setup, kernel excluded). Dispatch selection overhead is reported separately. Build, startup, JSON, FarmEngine, workers, UI, and rendering are outside the timed boundary.
- B3 numeric check: project the animals from `tests/scenario-goldens/housing-comparison.json` into the packed kernel input with intake/resting boundary combinations, and compare output bits. This checks the kernel projection only; the canonical scenario golden is replayed independently by the runner.
- All 12 benchmark reports were checked against the repository benchmark schema and assert bitwise equivalence. `/usr/bin/time -v` records process RSS and elapsed time for every capture.

## Results

Times below are medians across the four capture medians. Paired speedup is the median of the four matched ratios, so it may not equal the ratio of the two displayed aggregate medians. `µs/call` is the normalized single-kernel call time.

### Generic compiler target: production SSE2 versus AVX2 dispatch

| Animals | Dataset | Current kernel (µs) | Runtime dispatch (µs) | Paired speedup | Allocation + kernel current / dispatch (µs) |
|---:|---|---:|---:|---:|---:|
| 1,000 | Existing fixture | 2.347 | 1.916 | 1.229× | 3.954 / 3.733 |
| 10,000 | Existing fixture | 21.712 | 18.938 | 1.183× | 37.607 / 36.012 |
| 100,000 | Existing fixture | 256.640 | 212.385 | 1.209× | 438.785 / 481.810 |
| 1,000 | Mixed clamps/resting | 2.257 | 1.711 | 1.287× | 7.106 / 6.251 |
| 10,000 | Mixed clamps/resting | 22.652 | 19.159 | 1.210× | 65.922 / 70.224 |
| 100,000 | Mixed clamps/resting | 249.280 | 191.930 | 1.421× | 802.305 / 803.560 |

The kernel-only improvement is consistent in these four captures, while the buffer-lifecycle measurement is within noise or regresses for several cases. At the current 10,000-animal engine limit, the observed kernel-only difference is about 2.8–3.5 microseconds per call; this study did not measure full simulation impact.

### Native compiler target and measurement stability

At 100,000 animals, the paired runtime-dispatch/current ratios across captures were `0.99×, 0.94×, 1.07×, 1.43×` on the existing fixture and `0.85×, 3.93×, 0.59×, 1.07×` on the mixed fixture. This variation makes the native-target performance comparison inconclusive on this WSL2 host. Results by capture, including the large excursions, are retained verbatim in `summary.json` and the raw reports. The verdict does not treat one favorable aggregate as proof of a native-target gain.

The separate dispatch-selection-only measurement is around a few nanoseconds per choice on this host; per-call dispatch results above include the selection and indirect kernel call. Its cost is small compared with the measured kernels, but sub-microsecond selection timings should be read as approximate on this virtualized timer.

## Numeric correctness, fallback, and portability

The AVX2 prototype and current kernel matched output bits (`tolerance = 0`) for both fixtures at 0, 1, 2, 3, 4, 5, 7, 15, 1,000, 10,000, and 100,000 animals; the projected B3 set; malformed buffers; NaN, infinities, and signed zero. Scalar fallback produced the same bits. The canonical B3 scenario golden test passed. Tests were also run with AVX and AVX2 target features disabled, exercising portable compilation and fallback. An actual non-AVX2 CPU was unavailable, and no WASM SIMD build or performance claim is made.

## Decision and next gate

`CONDITIONAL_GO` means the isolated AVX2 kernel is a justified research prototype for generic builds, not an approval to adopt it in product defaults. The generic build already vectorizes at 128 bits, and the prototype adds packed-layout shuffles and architecture-specific code. Given the engine's 10,000-animal limit and the near-zero or negative allocation-inclusive result in the mixed workload, the evidence does not show a material full-engine benefit yet.

Reconsider production integration only after a full FarmEngine benchmark on controlled CI hardware shows a repeatable material improvement at supported populations, retains bitwise B3 parity, and validates the non-AVX2 fallback on real hardware. Keep the current kernel and defaults until that gate is met.

## Reproduction and files

The source harness, audit, and capture scripts are in `crates/riose-core/examples/simd_metabolism_study.rs` and `scripts/{audit-native-simd.py,run-native-simd-study.sh,summarize-native-simd.py}`. The runner requires a clean checkout and external Cargo/output directories. `summary.json` consolidates, but does not replace, the raw 12 reports; each `*-run-*.time.txt` contains GNU time/RSS output.

Source revision: `ae21e8b0056ccb9a15353907168d6bb947cff083` (the harness commit before this evidence report). Study base: `4ffe4f7e10d8b6b9765e92293374c1034a357fe1`.

## Verification

- Rust 1.95 `cargo fmt --all -- --check`: passed.
- Rust 1.95 `cargo test --offline --locked --workspace`: passed (54 tests across library, CLI, and 8 canonical scenario goldens).
- Release `cargo build --offline --locked --workspace --release`: passed.
- AVX2 study example tests: passed for generic, native, scalar, and `-C target-feature=-avx,-avx2` builds; the canonical `scenario_goldens` integration test passed in the runner.
- Focused example Clippy with `-D warnings`: passed while allowing the existing workspace `manual_range_contains` lint.
- Strict workspace Clippy fails on the existing `crates/riose-core/src/simulation.rs:275` `manual_range_contains` warning. No production/scientific code was changed to work around it.
- `npm run test:benchmark-report` (15 tests) and `npm run test:scenarios`: passed.
- Full `npm test`: 604 of 605 tests passed. The one optional Chromium graphics smoke failed because this isolated worktree lacks the Linux `esbuild` optional package (`ERR_MODULE_NOT_FOUND`); CI's normal job runs `npm ci` and does not install Chromium, so that smoke is normally skipped there. The first local attempt also omitted Rust from the environment; rerunning with Rust 1.95 fixed the cargo-dependent adapter tests.
- GNU time reports show process peak RSS between 27,264 and 27,776 KiB across all 12 captures. This is whole-process RSS, not an isolated kernel allocation measurement. The shared schema marks the memory phase not measured.

For a clean reproduction, check out the source revision above, provide Rust 1.95, Node, Python 3, GNU time, `objdump`, and `nm`, and keep both build and output directories outside the checkout:

```sh
export PATH=/path/to/rust-1.95/bin:$PATH
export CARGO_HOME=/path/to/external/cargo-home
export SIMD_STUDY_TARGET_ROOT=/path/to/external/targets
bash scripts/run-native-simd-study.sh /path/to/external/captures
python3 scripts/summarize-native-simd.py /path/to/external/captures > summary.json
```

The capture revision in each JSON is the source commit used for the measurements. Before opening the PR, `origin/main` advanced to `9c5838e2a1fbafbf5d3c3a73c3613338dc70261f`; its update did not modify `update_metabolism`, the study example, capture scripts, or CI changes relevant to this study. Those benchmark-relevant files were verified identical after rebasing the study onto that current main. The captures retain their original source revision and base as provenance.
