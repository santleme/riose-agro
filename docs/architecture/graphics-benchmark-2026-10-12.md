# Graphics PoC benchmark — 2026-10-12

## Setup

- Browser: Headless Chrome 156.0.8078.4, Linux, WebGL with SwiftShader.
- Scene: fixed iso demo, same asset images, Worker model, zoom (3.2×), 735×378 CSS-pixel viewport and sprite-bounds culling for both renderers.
- Loads: 100, 1,000 and 10,000 simulated animals; two fresh-page repetitions per renderer/load pair, 600 ms warm-up and 2,500 ms capture per sample.
- Engine: existing JavaScript FarmEngine Worker fallback. A one-hour Worker tick is measured separately from render frames.
- The culling predicate tests sprite rectangle/viewport intersection, so partially visible edge sprites are included. Livestock LOD uses near ≤100 px, medium ≤220 px, and far beyond 220 px. Far animals render in 48×36 px herd cells; member IDs remain on each group.
- Median image load: 50.1 ms in Canvas contexts and 57.6 ms in Pixi contexts (browser cache is shared after the first navigation). Median Pixi initialization and texture setup: 175.3 ms.
- Run with `npm run bench:graphics-poc`; override URL and sample settings with `RIOSE_GRAPHICS_URL`, `BENCH_DURATION_MS`, `BENCH_WARMUP_MS`, `BENCH_CAMERA_ZOOM` and `BENCH_REPEATS`.

## Observed results

| Renderer | Simulated | Visible animals / visual units (far groups) | Mean FPS | Frame p95 (ms) | Draw submission median (ms) | Scene update median (ms) | Motion update median (ms) | Post-GC JS heap (MB) | Worker tick (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Canvas | 100 | 50 / 39 (23) | 120.0 | 16.7 | 0.40 | 0.15 | 0.00 | 2.0 | 1.7 |
| Canvas | 1,000 | 475 / 266 (58) | 120.0 | 16.7 | 1.10 | 0.85 | 0.00 | 2.1 | 1.9 |
| Canvas | 10,000 | 4,643 / 2,065 (81) | 54.3 | 41.7 | 3.65 | 9.10 | 0.25 | 2.6 | 54.3 |
| PixiJS | 100 | 50 / 39 (23) | 30.7 | 41.7 | 0.10 | 0.20 | 0.00 | 13.7 | 45.6 |
| PixiJS | 1,000 | 475 / 266 (58) | 5.4 | 200.0 | 0.35 | 1.40 | 0.20 | 15.1 | 195.0 |
| PixiJS | 10,000 | 4,643 / 2,065 (81) | 0.7 | 1,383.3 | 0.70 | 5.95 | 0.90 | 17.3 | 1,486.6 |

At 10,000, 4,643 sprite bounds intersect the viewport; 2,065 draw units represent those animals, with 81 far-herd clusters. The benchmark reports the same number of accounted animal IDs as visible animals, so clustering does not lose entities. The previous 5,131 count came from testing animal centers against a viewport padded by 70 px, which included off-screen sprites. Rectangle intersection with the visual motion envelope provides the corrected visible count.

## Interpretation and limits

This run does **not** show a PixiJS performance win. In this software-rendered, headless environment, Canvas held a higher frame rate at all three loads. Pixi's JavaScript draw submission stayed low but its RAF interval degraded sharply at 1,000 and 10,000 sprites. The frame interval includes browser/render-pipeline delays; JavaScript submission duration is not GPU completion time. At 10,000, the Worker round-trip was 37.2 ms on Canvas and 1,188.2 ms on Pixi; these end-to-end round-trips include browser scheduling delays while the renderer is overloaded. Two repetitions reduce one-off noise but remain exploratory, not a stable device benchmark.

Post-GC heap was about 2.6 MB for Canvas and 17.3 MB for Pixi at 10,000 animals. Heap is measured in separate fresh page contexts so Pixi's scene and library allocations do not contaminate Canvas measurements. Image load and Pixi initialization are reported separately above and are one-time startup costs. Chromium does not expose GPU texture memory through this harness, so no GPU memory figure is claimed.

This is one exploratory pass on SwiftShader, not a device-level performance sign-off. Repeat on supported hardware with representative released assets, several repetitions, and production camera workloads. Keep Canvas as the product default until those measurements show a repeatable Pixi advantage.
