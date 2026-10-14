# Full-core browser WASM evaluation — 2026-10-14

## Decision

**NO-GO for changing the product default; continue optional evaluation.** Nine clean Chromium captures show repeatable full-scenario and Worker wins for WASM. Three clean Firefox captures show a different result: Rust engine time is lower, but full-scenario and Worker results are mixed or statistically close, and WASM does not win at every population. A3/B3 outputs match the official goldens exactly, and unavailable or malformed WASM falls back to JavaScript in all 12 captures.

Startup costs vary sharply by browser version. Chrome 147 took 35.96 ms per warm WASM Worker versus 5.97 ms for JavaScript. Chrome 153/156 were closer, but WASM still started more slowly. These results support optional evaluation on the measured workload, not a product-wide performance claim.

## Workload and method

The study builds `riose-core` with the isolated `browser-scenario-wasm` feature and runs the same 24-hour pasture baseline request through (1) the Rust core compiled to WASM and (2) the JavaScript `FarmEngine`. It uses engine-supported populations of 100, 1,000, and 10,000 animals, seed `20261012`, and fixed pasture configuration. Each browser build was measured in three independent processes with fresh profiles; every population used three warmups and 15 timed repetitions, alternating backend order. The new cross-engine runner uses Playwright 1.57.0 for Chromium or Firefox.

Before timing, the harness checks A3 `baseline-pasture` and B3 `housing-comparison` against their official goldens and compares JS with WASM exactly. It also checks both a missing WASM file and malformed WASM bytes, verifying that the Worker returns the equivalent JavaScript result with an explicit fallback reason. Every run validates against `docs/architecture/benchmark-report.schema.json` and includes source-file hashes.

The WASM ABI reports request JSON parsing, `run_native_scenario` execution, and result JSON serialization separately. JavaScript reports `FarmEngine` setup, tick, snapshot, and metrics time. The ABI's total call also includes response-envelope assembly; the envelope is built in place to avoid retaining a second copy of the large result. The response JSON decode and copy remain separate bridge measurements.

The Chromium captures identify clean source revision `4533668ad03665a242551df7c7d41eeaa05c2387` (`dirty: false`) and share source-tree digest `e08ef8eb84c0be97c0c56c146d450bf6568356fd5852d778742d92f087d0cace`. `run-1.json` through `run-3.json` cover Chromium 156; `chrome-147-run-1.json` through `chrome-147-run-3.json` and `chrome-153-run-1.json` through `chrome-153-run-3.json` contain the other captures. The Firefox captures use clean source revision `0a4916ba51d4502d62f38a3d327887e593b352af`, source-tree digest `3447db9e7524fd26c8e16a39e2838171522be17e5ef8cefae162473a97f86965`, and Firefox 144.0.2. `firefox-144-run-1.json` through `firefox-144-run-3.json` contain those results.

## Engine time

Each value is the median of three run-level medians; parentheses show the range across those run medians. Times are milliseconds. The request-parse samples were reported as 0.00 ms at the browser clock's observed 0.1 ms granularity; read these as below measurement resolution, not as zero work.

| Chromium | Animals | FarmEngine JS | Native scenario WASM | WASM request parse | WASM result JSON serialization |
| --- | ---: | ---: | ---: | ---: | ---: |
| 147.0.7727.15 | 100 | 1.30 (1.20–1.30) | 0.10 (0.10–0.10) | <0.10 | 0.10 (0.10–0.10) |
| 147.0.7727.15 | 1,000 | 11.10 (10.90–11.10) | 0.80 (0.80–0.90) | <0.10 | 1.00 (1.00–1.00) |
| 147.0.7727.15 | 10,000 | 100.70 (99.20–102.50) | 7.50 (7.40–7.50) | <0.10 | 10.10 (10.00–10.20) |
| 153.0.8010.12 | 100 | 1.20 (1.20–1.30) | 0.10 (0.10–0.10) | <0.10 | 0.10 (0.10–0.10) |
| 153.0.8010.12 | 1,000 | 10.90 (10.90–11.20) | 0.80 (0.80–0.90) | <0.10 | 1.00 (1.00–1.00) |
| 153.0.8010.12 | 10,000 | 107.50 (104.50–108.50) | 7.30 (7.20–7.40) | <0.10 | 9.80 (9.80–9.90) |
| 156.0.8078.4 | 100 | 1.20 (1.20–1.30) | 0.10 (0.10–0.10) | <0.10 | 0.10 (0.10–0.10) |
| 156.0.8078.4 | 1,000 | 11.40 (11.40–11.70) | 0.80 (0.80–0.90) | <0.10 | 1.00 (1.00–1.10) |
| 156.0.8078.4 | 10,000 | 105.30 (102.00–106.20) | 7.50 (7.50–7.60) | <0.10 | 10.10 (9.70–10.10) |

Firefox 144 engine-time medians are shown below. Each value is the median of the three process-level medians; parentheses show the range across processes. The browser timer has approximately 1 ms granularity for the sub-millisecond WASM measurements.

| Firefox | Animals | FarmEngine JS | Native scenario WASM | WASM request parse | WASM result JSON serialization |
| --- | ---: | ---: | ---: | ---: | ---: |
| 144.0.2 | 100 | 2 (1–2) | <1 (0–1) | <1 | 1 (0–1) |
| 144.0.2 | 1,000 | 14 (13–14) | 5 (5–6) | <1 | 5 (5–6) |
| 144.0.2 | 10,000 | 149 (141–153) | 51 (50–53) | <1 | 51 (51–52) |

## Full scenario and Worker results

Values are milliseconds with the same median/range convention. WASM linear memory is the median buffer size after the returned response is copied.

| Chromium | Animals | Full scenario JS | Full scenario WASM | Worker JS | Worker WASM | WASM memory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 147.0.7727.15 | 100 | 1.30 (1.20–1.30) | 0.60 (0.60–0.60) | 1.80 (1.70–1.80) | 1.00 (1.00–1.00) | 1.44 MiB |
| 147.0.7727.15 | 1,000 | 11.10 (10.90–11.10) | 4.30 (4.20–4.50) | 15.50 (15.40–15.50) | 8.30 (8.20–8.50) | 3.50 MiB |
| 147.0.7727.15 | 10,000 | 100.70 (99.20–102.50) | 42.50 (42.50–42.60) | 149.80 (147.90–152.70) | 83.80 (83.80–84.30) | 20.88 MiB |
| 153.0.8010.12 | 100 | 1.20 (1.20–1.30) | 0.60 (0.50–0.60) | 1.80 (1.80–1.80) | 1.10 (1.00–1.10) | 1.44 MiB |
| 153.0.8010.12 | 1,000 | 10.90 (10.90–11.20) | 4.00 (4.00–4.00) | 16.70 (16.30–16.90) | 8.40 (8.40–8.50) | 3.50 MiB |
| 153.0.8010.12 | 10,000 | 107.50 (104.50–108.50) | 41.20 (40.90–41.60) | 168.50 (166.60–168.60) | 94.60 (93.60–95.20) | 20.88 MiB |
| 156.0.8078.4 | 100 | 1.20 (1.20–1.30) | 0.60 (0.60–0.60) | 1.80 (1.80–1.90) | 1.10 (1.00–1.10) | 1.44 MiB |
| 156.0.8078.4 | 1,000 | 11.40 (11.40–11.70) | 4.10 (3.90–4.40) | 16.90 (16.60–17.00) | 8.40 (8.40–9.00) | 3.50 MiB |
| 156.0.8078.4 | 10,000 | 105.30 (102.00–106.20) | 41.90 (41.10–43.40) | 164.90 (161.90–168.20) | 92.20 (92.00–94.80) | 20.88 MiB |

| Firefox | Animals | Full scenario JS | Full scenario WASM | Worker JS | Worker WASM | WASM memory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 144.0.2 | 100 | 2 (1–2) | 1 (1–2) | 2 (2–2) | 2 (2–2) | 1.44 MiB |
| 144.0.2 | 1,000 | 14 (13–14) | 14 (14–16) | 20 (19–21) | 22 (21–25) | 3.50 MiB |
| 144.0.2 | 10,000 | 149 (141–153) | 142 (138–146) | 223 (221–232) | 216 (208–217) | 20.88 MiB |

Firefox's full-scenario medians do not show a repeatable gain at 100 or 1,000 animals; at 10,000, WASM is about 5% faster end to end. Worker round-trip improves at 10,000 but is slower at 1,000. Each capture consequently records **NO-GO for product adoption** under the all-population decision rule. Rust engine time is much lower at 1,000 and 10,000, while JSON serialization and response decode consume most of the WASM path at 10,000 animals.

## Startup cost

Startup values are medians of the three run-level medians. Warm startup is the average per Worker across batches of ten new Workers after the initial WASM fetch.

| Chromium | Cold WASM | Cold JS | Warm WASM | Warm JS |
| --- | ---: | ---: | ---: | ---: |
| 147.0.7727.15 | 40.1 ms | 6.2 ms | 35.96 ms | 5.97 ms |
| 153.0.8010.12 | 11.7 ms | 6.5 ms | 7.55 ms | 5.12 ms |
| 156.0.8078.4 | 9.9 ms | 5.2 ms | 5.62 ms | 3.90 ms |
| Firefox 144.0.2 | 33 ms (32–38) | 19 ms (17–22) | 16.6 ms (15.6–21.5) | 10.1 ms (9.3–13.8) |

At 100 animals, the warm Worker saves about 0.7–0.8 ms per run. The warm-start penalty implies roughly 38 runs to break even on Chrome 147, four on Chrome 153, and three on Chrome 156. At 1,000 animals, the corresponding estimates are five, one, and one run; at 10,000 animals, one run repays the measured penalty for each version. This estimate uses only measured Worker round-trip and startup medians; it is not a browser-session workload model.

Worker round trips include request scheduling, structured-clone transfer, scenario execution, and response transfer. The WASM path adds request encoding, allocation/copy, JSON parsing, result serialization, output copy, response decode, and envelope assembly. The internal engine and bridge subphases above let these costs be interpreted separately from the full Worker path.

## Limits

- One host was measured: Linux WSL2 x86_64, AMD Ryzen 7 7700X, and 16 reported hardware threads. Chromium and Firefox were tested, but all captures use this same device; Firefox does not expose `navigator.deviceMemory`.
- Chromium uses Blink/V8; Firefox uses Gecko/SpiderMonkey. Results vary by engine, and the Firefox runs do not show a uniform end-to-end WASM win.
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

For Firefox, install the browser build pinned by Playwright, then run the same report harness:

```sh
npx playwright install firefox
npm run bench:wasm-scenario-browser:firefox > /tmp/native-core-browser-wasm-firefox.json
node scripts/validate-benchmark-report.mjs < /tmp/native-core-browser-wasm-firefox.json
```
