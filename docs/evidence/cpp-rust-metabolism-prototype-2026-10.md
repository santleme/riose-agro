# Rust/C++ metabolism prototype

This is a bounded comparison of the pure metabolism kernel identified in [the current system audit](../architecture/current-system-audit.md). It is not a FarmEngine benchmark and does not establish application-level speedup.

## Result

The fixture was bitwise identical for all outputs at 1,000, 10,000, and 100,000 animals. In this WSL2 run, Rust-native kernel medians were 0.000963 ms, 0.010197 ms, and 0.127353 ms. C++ called through the isolated C ABI measured 0.001593 ms, 0.016092 ms, and 0.167241 ms. The allocation/fill/call/free path measured 0.002880 ms, 0.040393 ms, and 0.863018 ms for Rust and 0.003771 ms, 0.192289 ms, and 2.143168 ms for C++.

The clean release build took 4,917.5 ms. The detailed shared-envelope measurements and runtime metadata are in [the JSON report](cpp-rust-metabolism-benchmark-2026-10.json).

Decision: no-go for adding production C++. It has no measured advantage in this workload, while introducing a second implementation, C ABI ownership/FFI concerns, and additional build tooling. The isolated prototype intentionally has no C++ dependency in the production crate or runtime.

## Reproduction

From the repository root, run:

```sh
cargo test --manifest-path experiments/cpp-metabolism/Cargo.toml
node scripts/benchmark-rust-cpp-metabolism.mjs > /tmp/cpp-rust-metabolism.json
cat /tmp/cpp-rust-metabolism.json | node scripts/validate-benchmark-report.mjs
```

The benchmark runner cleans the isolated Cargo target directory before measuring a release build. Rust uses Cargo `--release`; C++ uses `-std=c++20 -O3 -fno-fast-math -ffp-contract=off`. Both run the same binary64 fixture. Timings report preallocated kernel-only calls and a separate allocation/fill/kernel/free path. The C ABI is linked only into the isolated benchmark package.

## Limits

This host was WSL2 on an AMD Ryzen 7 7700X, x86_64, with Rust 1.95.0 and GCC C++ 13.3.0. The fixture covers finite inputs within the current model-state domain; it does not cover NaNs or malformed model state. These timings are specific to this host and do not justify extrapolation to a full simulation.
