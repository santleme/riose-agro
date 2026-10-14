# Full-core browser WASM evaluation — 2026-10-14

## Decision

**Continue optional evaluation; do not change the product default.** Nine clean Chromium captures show lower full-scenario and Worker medians for WASM at 100, 1,000, and 10,000 animals. Three clean Firefox captures show ties at 100, a slight WASM regression at 1,000, and a modest win at 10,000. Exact A3/B3 fixture parity and missing/malformed-WASM fallback pass in all 12 captures. The measured result depends on browser engine and has not been repeated on another device.

The current `?engine=wasm` product setting still selects the existing metabolism kernel; the experimental full-core Worker is not wired into live product simulation. The UI measurements below use a benchmark-only `?benchRender=1` hook in the existing app to apply equivalent final snapshots and measure presentation separately. This adds evidence about display cost without claiming a live full-core WASM integration.

## Workload and method

The study builds `riose-core` with the isolated `browser-scenario-wasm` feature and runs the same 24-hour pasture baseline through (1) the Rust core compiled to WASM and (2) the JavaScript `FarmEngine`. It uses engine-supported populations of 100, 1,000, and 10,000 animals, seed `20261012`, and fixed pasture configuration. Each browser build was measured in three independent processes with fresh browser contexts; every population used three warmups and 15 timed repetitions, alternating backend order. The runner uses Playwright 1.57.0 for Chromium or Firefox.

Before timing, the harness checks A3 `baseline-pasture` and B3 `housing-comparison` against their official goldens and compares JS with WASM exactly. It also checks a missing WASM file and malformed WASM bytes, verifying that the Worker returns the equivalent JavaScript result with an explicit fallback reason. All 12 reports validate against `docs/architecture/benchmark-report.schema.json` and include source-file hashes.

For the UI phase, each final JS and WASM snapshot is verified equal and applied to the existing app's result view in alternating order. The harness times synchronous metric/list updates and waits for one completed product canvas draw. The animal list remains virtualized to 12 visible rows. Since identical snapshots go through the same renderer, UI timings are pooled as `shared-renderer`, not attributed to either engine. `workerToRenderedResultEstimate` adds the separately measured Worker median, UI update median, and canvas-frame median; it is a derived estimate, not a continuous trace.

All reports identify clean source revision `0939e1f981e2a2271440efd6e6cf6c7b0a969446` (`dirty: false`) and source-tree digest `9e15ab536746662394c32ecc5749b6a9a78da2604e04a5297c41f47da0771317`. `run-1.json` through `run-3.json` cover Chromium 156; `chrome-147-run-1.json` through `chrome-147-run-3.json` and `chrome-153-run-1.json` through `chrome-153-run-3.json` contain the other Chromium captures. `firefox-144-run-1.json` through `firefox-144-run-3.json` contain Firefox 144. The experimental scenario module is 347,758 bytes.

## Full scenario and Worker results

Values are milliseconds. Each cell shows the median of the three process-level medians (range across those medians). Full-scenario time includes the engine or WASM ABI work. Worker time includes request scheduling and structured-clone transfer.

| Browser | Animals | Full scenario JS | Full scenario WASM | Worker JS | Worker WASM |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium 147 | 100 | 1.3 (1.2–1.3) | 0.6 (0.6–0.6) | 1.9 (1.8–1.9) | 1.1 (1.0–1.1) |
| Chromium 147 | 1,000 | 11.5 (11.5–11.5) | 4.4 (4.2–4.5) | 16.2 (16.0–16.3) | 8.2 (8.2–8.4) |
| Chromium 147 | 10,000 | 108.5 (107.8–127.2) | 44.6 (43.2–45.8) | 160.6 (160.4–180.1) | 88.5 (85.7–89.0) |
| Chromium 153 | 100 | 1.3 (1.2–1.3) | 0.6 (0.6–0.6) | 1.9 (1.9–1.9) | 1.0 (1.0–1.0) |
| Chromium 153 | 1,000 | 11.7 (11.3–11.9) | 4.0 (4.0–4.1) | 16.7 (16.5–17.0) | 8.4 (8.2–8.5) |
| Chromium 153 | 10,000 | 111.6 (110.4–114.6) | 42.6 (41.9–42.7) | 168.1 (166.5–171.4) | 87.8 (87.3–87.9) |
| Chromium 156 | 100 | 1.3 (1.2–1.3) | 0.6 (0.6–0.6) | 1.8 (1.8–1.9) | 1.1 (1.0–1.2) |
| Chromium 156 | 1,000 | 11.2 (10.7–11.4) | 4.0 (3.8–4.1) | 15.7 (14.9–15.9) | 7.9 (7.4–7.9) |
| Chromium 156 | 10,000 | 108.8 (105.9–114.9) | 41.1 (40.6–41.5) | 160.5 (157.1–166.3) | 82.0 (81.7–84.1) |
| Firefox 144 | 100 | 2 (1–2) | 1 (1–2) | 2 (2–2) | 2 (2–2) |
| Firefox 144 | 1,000 | 14 (14–14) | 14 (14–14) | 19 (19–20) | 20 (20–20) |
| Firefox 144 | 10,000 | 153 (151–154) | 144 (139–145) | 224 (219–226) | 215 (213–218) |

## Existing UI presentation and Worker-to-display estimate

UI timings and derived totals are milliseconds, again reporting the median and range across three process-level medians. The UI column is shared between JS and WASM because the final snapshots match exactly. The derived total is Worker round trip + DOM/list update + next canvas draw.

| Browser | Animals | UI DOM/list update | UI canvas frame | JS Worker-to-display estimate | WASM Worker-to-display estimate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium 147 | 100 | 1.3 (1.2–1.4) | 15.3 (15.3–15.5) | 18.6 (18.4–18.6) | 17.8 (17.6–17.8) |
| Chromium 147 | 1,000 | 1.7 (1.6–1.7) | 48.2 (48.1–48.3) | 66.0 (65.8–66.2) | 58.0 (58.0–58.3) |
| Chromium 147 | 10,000 | 5.8 (5.8–5.9) | 43.8 (43.5–44.1) | 210.6 (209.8–229.7) | 137.9 (135.3–139.0) |
| Chromium 153 | 100 | 1.3 (1.2–1.3) | 15.4 (15.4–15.4) | 18.6 (18.5–18.6) | 17.7 (17.6–17.7) |
| Chromium 153 | 1,000 | 1.6 (1.6–1.7) | 48.1 (39.8–48.2) | 66.3 (58.4–66.5) | 58.0 (49.8–58.3) |
| Chromium 153 | 10,000 | 4.7 (4.6–4.8) | 44.0 (34.1–45.1) | 217.9 (205.2–220.2) | 136.7 (126.5–137.1) |
| Chromium 156 | 100 | 1.1 (1.0–1.1) | 15.6 (15.5–15.6) | 18.5 (18.4–18.5) | 17.8 (17.6–17.8) |
| Chromium 156 | 1,000 | 1.4 (1.4–1.5) | 48.3 (47.9–48.5) | 65.4 (64.3–65.8) | 57.6 (56.8–57.8) |
| Chromium 156 | 10,000 | 4.7 (4.5–5.0) | 44.3 (44.0–44.7) | 209.3 (205.9–216.0) | 131.7 (130.5–132.8) |
| Firefox 144 | 100 | 2 (2–2) | 15 (15–15) | 19 (19–19) | 19 (19–19) |
| Firefox 144 | 1,000 | 2 (2–2) | 47 (47–47) | 68 (68–69) | 69 (69–69) |
| Firefox 144 | 10,000 | 10 (9.5–10) | 39.5 (39–40) | 274 (268–275) | 265 (262–267) |

Chromium's Worker-to-display estimate favors WASM at all three populations and all three tested Chromium versions. Firefox ties at 100, favors JS at 1,000, and favors WASM at 10,000, so it fails the all-population rule. The UI cost is a large share of the measured time at smaller populations, while the full-core WASM path has its clearest advantage for larger cohorts.

## Startup, memory, and limits

Cold/warm startup medians are milliseconds. Values are the median of the three process-level medians (range shown).

| Browser | Cold WASM | Cold JS | Warm WASM | Warm JS |
| --- | ---: | ---: | ---: | ---: |
| Chromium 147 | 13.9 (12.7–15.0) | 7.0 (6.5–7.2) | 9.3 (8.9–9.3) | 6.1 (5.7–6.2) |
| Chromium 153 | 14.8 (13.5–18.6) | 8.1 (7.2–8.2) | 9.4 (9.4–9.8) | 6.2 (6.2–6.3) |
| Chromium 156 | 10.8 (10.2–11.5) | 5.7 (5.6–5.9) | 7.0 (6.8–8.0) | 4.4 (4.3–4.5) |
| Firefox 144 | 37 (30–41) | 12 (11–13) | 16.3 (15.8–19.9) | 9.5 (9.4–10.3) |

WASM linear memory is 1.44 MiB after 100 animals, 3.50 MiB after 1,000, and 20.88 MiB after 10,000. Chromium also records main-thread JS heap after UI rendering and forced page GC; that reading excludes dedicated Worker heap attribution. Process RSS, GPU memory, transient allocation peaks, GPU compositor presentation, and user interaction are not measured. All captures use one Linux WSL2 x86_64 host (AMD Ryzen 7 7700X, 16 reported hardware threads); Firefox does not expose `navigator.deviceMemory`. The simulated outputs remain demonstrative and unvalidated. Timing and parity establish implementation equivalence to existing fixtures, not scientific accuracy or performance across other machines.

## Reproduce

Build the optional scenario artifact and run a static server in the repository root:

```sh
npm run build:wasm-scenario
python3 -m http.server 8000 --bind 127.0.0.1
```

In a second terminal, capture one Chromium run (set `CHROME_BIN` to select a particular installed version):

```sh
NATIVE_WASM_REPETITIONS=15 NATIVE_WASM_WARMUPS=3 node scripts/benchmark-native-wasm-browser.mjs > /tmp/native-core-browser-wasm.json
node scripts/validate-benchmark-report.mjs < /tmp/native-core-browser-wasm.json
```

The runner uses the local Chromium cache or `CHROME_BIN`, and serves the working tree at `RIOSE_URL` (default `http://127.0.0.1:8000/`). For Firefox, install the Playwright-pinned browser and run:

```sh
npx playwright install firefox
NATIVE_WASM_REPETITIONS=15 NATIVE_WASM_WARMUPS=3 npm run bench:wasm-scenario-browser:firefox > /tmp/native-core-browser-wasm-firefox.json
node scripts/validate-benchmark-report.mjs < /tmp/native-core-browser-wasm-firefox.json
```
