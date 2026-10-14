# Full-core browser WASM evaluation — 2026-10-14

## Decision

**GO for continued optional full-core WASM evaluation; NO-GO for changing the product default.** WASM had lower full-scenario and Worker medians than JavaScript in all nine captures across three Chromium versions and all tested populations. A3/B3 results matched the official goldens exactly, and missing or malformed WASM fell back to JavaScript in every capture.

Startup costs vary sharply by browser version. Chrome 147 took about 44 ms per warm WASM Worker versus 6 ms for JavaScript; Chrome 153 and 156 were closer, but WASM remained slower to start. These results are a version-specific candidate, not a product-wide performance claim.

## Workload and method

The study builds `riose-core` with the isolated `browser-scenario-wasm` feature and runs the same 24-hour pasture baseline request through (1) the Rust core compiled to WASM and (2) the JavaScript `FarmEngine`. It uses supported engine populations of 100, 1,000, and 10,000 animals, seed `20261012`, and fixed pasture configuration. Each browser version was measured in three independent Chromium processes with fresh temporary profiles; every population used three warmups and 15 timed repetitions, alternating backend order.

Before timing, the harness checks A3 `baseline-pasture` and B3 `housing-comparison` against their official goldens and compares JS with WASM exactly. It also checks both a missing WASM file and malformed WASM bytes, verifying that the Worker returns the equivalent JavaScript result with an explicit fallback reason. Every run validates against `docs/architecture/benchmark-report.schema.json` and includes source-file hashes.

The captures identify clean source revision `232e704c402f33f9597fb86d275b691cbdd3cce2` (`dirty: false`) and share source-tree digest `d20abcbcea54b355d447163f875583b11d50f6ac0dfdfc6c07f001b04712ea17`.

## Results

Each value is the median of the three independent run medians; parentheses show the range across those run medians. Times are milliseconds.

| Chromium | Animals | Full scenario JS | Full scenario WASM | Worker JS | Worker WASM | WASM memory after scenario |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 147.0.7727.15 | 100 | 1.20 (1.20–1.40) | 0.60 (0.50–0.70) | 1.80 (1.70–1.80) | 1.00 (1.00–1.10) | 1.44 MiB |
| 147.0.7727.15 | 1,000 | 11.60 (11.30–11.80) | 4.00 (3.90–4.40) | 16.00 (15.70–16.10) | 8.20 (8.20–8.30) | 3.50 MiB |
| 147.0.7727.15 | 10,000 | 103.10 (102.80–106.20) | 43.30 (43.20–43.70) | 156.00 (153.70–158.30) | 87.40 (87.10–87.40) | 20.88 MiB |
| 153.0.8010.12 | 100 | 1.20 (1.20–1.40) | 0.60 (0.50–0.60) | 1.90 (1.90–1.90) | 1.10 (1.10–1.20) | 1.44 MiB |
| 153.0.8010.12 | 1,000 | 11.60 (11.40–11.60) | 3.90 (3.90–4.20) | 17.30 (17.20–18.00) | 8.80 (8.70–9.30) | 3.50 MiB |
| 153.0.8010.12 | 10,000 | 110.60 (110.40–113.00) | 43.60 (43.00–43.80) | 176.30 (176.00–181.20) | 99.70 (99.70–101.20) | 20.88 MiB |
| 156.0.8078.4 | 100 | 1.30 (1.30–1.30) | 0.60 (0.50–0.60) | 1.90 (1.80–2.00) | 1.10 (1.10–1.10) | 1.44 MiB |
| 156.0.8078.4 | 1,000 | 12.20 (11.70–12.40) | 3.90 (3.80–4.40) | 17.40 (17.30–17.40) | 8.70 (8.70–9.10) | 3.50 MiB |
| 156.0.8078.4 | 10,000 | 112.40 (109.50–114.00) | 43.60 (42.70–43.80) | 174.20 (172.30–180.40) | 95.90 (95.20–97.40) | 20.88 MiB |

### Startup cost

Startup values are medians of the three run-level medians. Warm startup is the average per Worker across batches of ten new Workers after the initial WASM fetch.

| Chromium | Cold WASM | Cold JS | Warm WASM | Warm JS |
| --- | ---: | ---: | ---: | ---: |
| 147.0.7727.15 | 48.1 ms | 7.6 ms | 44.33 ms | 6.35 ms |
| 153.0.8010.12 | 12.5 ms | 7.3 ms | 8.78 ms | 6.01 ms |
| 156.0.8078.4 | 10.3 ms | 5.7 ms | 6.38 ms | 4.49 ms |

At 100 animals, the warm Worker saves about 0.8 ms per run. The warm-start penalty implies roughly 48 runs to break even on Chrome 147, four on Chrome 153, and three on Chrome 156. At 1,000 animals, the same estimate is five, one, and one run respectively; at 10,000 animals, a single run repays the warm-start penalty for each version. This estimate uses only the measured Worker round trip and startup medians; it is not a browser-session workload model.

Worker round trips include request scheduling, structured-clone transfer, scenario execution, and response transfer. The JSON ABI adds request encoding, allocation/copy, Rust JSON parsing/serialization, response copy, and JS JSON decoding; the reports break out JS-observable subphases. At 10,000 animals, WASM-side output copy was about 3.7 ms and JSON decoding about 20.9 ms on Chrome 156. Rust parsing, simulation, and serialization remain combined in the ABI-call timing.

## Limits

- One host was measured: Linux WSL2 x86_64, AMD Ryzen 7 7700X, 16 reported hardware threads, and 16 GiB browser `deviceMemory`. The three measurements are Chromium versions on the same Blink/V8 engine, not three browser engines or three devices.
- The cached WebKit GTK and WPE MiniBrowsers could not launch because `libgtk-4.so.1` and `libgstgl-1.0.so.0` are absent; no Firefox binary was available. A second browser engine remains unmeasured.
- The dedicated benchmark Worker has no product UI. The `ui` phase is explicitly not measured; this is not a rendered-page or user-interaction result.
- WASM memory is the linear-memory buffer size after the result is returned; it is not transient peak allocation. Page JS heap excludes Worker heap attribution. Process RSS and GPU memory are not measured.
- The simulated outputs remain demonstrative and unvalidated. Timing and parity establish implementation equivalence to existing fixtures, not scientific accuracy.

## Reproduce

Build the optional scenario artifact and run a static server in the repository root:

```sh
npm run build:wasm-scenario
python3 -m http.server 8000 --bind 127.0.0.1
```

In a second terminal, choose an installed Chromium binary and capture one run:

```sh
CHROME_BIN=/path/to/chrome NATIVE_WASM_REPETITIONS=15 NATIVE_WASM_WARMUPS=3 node scripts/benchmark-native-wasm-browser.mjs > /tmp/native-core-browser-wasm.json
node scripts/validate-benchmark-report.mjs < /tmp/native-core-browser-wasm.json
```

The harness uses the local Chromium cache or `CHROME_BIN` and serves the working tree at `RIOSE_URL` (default `http://127.0.0.1:8000/`).
