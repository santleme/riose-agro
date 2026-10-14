# Full-core browser WASM evaluation — 2026-10-14

## Decision

**GO for continued optional full-core WASM evaluation on this reference workload; NO-GO for changing the product default.** Exact parity held against both official JS fixtures, JavaScript remained the fallback when the WASM file was unavailable, and WASM had lower full-scenario and Worker medians in all three runs at 100, 1,000, and 10,000 animals. The cold startup cost and the single-browser/single-host scope still require review before any product integration.

## Workload and method

The study builds `riose-core` with the isolated `browser-scenario-wasm` feature and runs the same 24-hour pasture baseline request through (1) the Rust core compiled to WASM and (2) the JavaScript `FarmEngine`. Both paths run inside separate module Workers. It uses the repository's supported full-engine sizes, seed `20261012`, and fixed pasture configuration. Each of three independent Chromium processes used a fresh temporary profile; each population had three warmups and 15 timed repetitions, alternating backend order.

Before timing, the harness checks the A3 `baseline-pasture` and B3 `housing-comparison` fixtures against the official goldens and compares JS with WASM exactly. It also checks both a missing WASM file and malformed WASM bytes, verifying that the Worker returns the equivalent JavaScript result with an explicit fallback reason in either case. The production Worker and UI are not changed by this experiment.

The per-run machine-readable reports are [`run-1.json`](run-1.json), [`run-2.json`](run-2.json), and [`run-3.json`](run-3.json); each validates against `docs/architecture/benchmark-report.schema.json`. The full-core WASM artifact is 331,732 bytes. The existing default metabolism-only artifact remains 21,351 bytes and is built independently with `npm run build:wasm`.

## Results

Values below are medians of the three independent run medians. Parentheses show the range across those run medians.

| Animals | Full scenario JS (ms) | Full scenario WASM (ms) | Worker round trip JS (ms) | Worker round trip WASM (ms) | WASM linear memory after scenario |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 1.20 (1.20–1.30) | 0.60 (0.50–0.60) | 1.80 (1.80–1.80) | 1.10 (1.00–1.10) | 1.44 MiB |
| 1,000 | 11.10 (11.00–11.20) | 3.60 (3.60–3.80) | 16.10 (16.00–16.50) | 8.00 (7.90–8.30) | 3.50 MiB |
| 10,000 | 106.00 (105.60–110.50) | 43.20 (42.10–44.20) | 164.40 (164.30–170.10) | 93.40 (93.00–96.00) | 20.88 MiB |

Worker round trips include request scheduling, structured-clone transfer, scenario execution, and response transfer. WASM's JSON ABI adds request encoding, allocation/copy, Rust JSON parsing/serialization, response copy, and JS JSON decoding; the reports break out the JS-observable subphases. At 10,000 animals the median observed WASM-side output copy was about 3.7 ms and JSON decoding about 20.9 ms. Rust JSON parsing, simulation, and serialization remain combined in the ABI-call timing.

Cold Worker startup medians were 9.4 ms for WASM and 5.0 ms for JS. Warm startup is the average per Worker over batches of ten new Workers, after the first WASM fetch: 5.50 ms for WASM and 3.91 ms for JS. The Worker stays alive for multiple scenario requests in normal operation, so startup is a session cost. At 100 animals the warm Worker saves about 0.7 ms per run and needs about seven runs to repay the measured cold-start difference; at 1,000 and 10,000 animals, the scenario savings exceed that startup difference in one run. Warm-start still instantiates the module in each new Worker.

## Limits

- Host: Linux WSL2 x86_64, AMD Ryzen 7 7700X, 16 reported hardware threads, 16 GiB browser `deviceMemory`; browser: headless Chrome 156.0.8078.4. One host and one browser were measured.
- The dedicated benchmark Worker has no product UI. The `ui` phase is explicitly not measured; this is not a rendered-page or user-interaction result.
- WASM memory is the linear-memory buffer size after the result is returned; it is not transient peak allocation. Page JS heap excludes Worker heap attribution. Process RSS and GPU memory are not measured.
- The clean captures identify commit `7d8ceefafcb76fe0a98c6f16d849364c4e815448` with `dirty: false`. Each report also includes SHA-256 hashes for the Rust source modules, JS benchmark and engine, build scripts, locked dependencies, report schema, fixtures, and both WASM artifacts; all three share tree digest `e8e93bbc75b898b66b86ba7204dc65f5fb6a438df67f8ebb5240e4bed4ffcab4`. The fingerprint makes the measured source and artifacts reproducible; this remains a single-host exploratory benchmark, not a release benchmark.
- The simulated outputs remain demonstrative and unvalidated; timing and parity establish implementation equivalence to existing fixtures, not scientific accuracy.

## Reproduce

Build both WASM artifacts and run the static app server in the repository root:

```sh
npm run build:wasm
npm run build:wasm-scenario
python3 -m http.server 8000 --bind 127.0.0.1
```

In a second terminal, capture and validate one run:

```sh
NATIVE_WASM_REPETITIONS=15 NATIVE_WASM_WARMUPS=3 node scripts/benchmark-native-wasm-browser.mjs > /tmp/native-core-browser-wasm.json
node scripts/validate-benchmark-report.mjs < /tmp/native-core-browser-wasm.json
```

The harness uses the local Chromium cache or `CHROME_BIN` and serves the working tree at `RIOSE_URL` (default `http://127.0.0.1:8000/`).
