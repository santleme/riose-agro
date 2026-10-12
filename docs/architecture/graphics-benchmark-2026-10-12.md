# Graphics PoC benchmark — 2026-10-12

## Setup

- Browser: Headless Chrome 156.0.8078.4, Linux, WebGL with SwiftShader.
- Scene: fixed iso demo, same asset images, Worker model, zoom (3.2×), viewport and culling bounds for both renderers.
- Loads: 100, 1,000 and 10,000 simulated animals; two fresh-page repetitions per renderer/load pair, 600 ms warm-up and 2,500 ms capture per sample.
- Engine: existing JavaScript FarmEngine Worker fallback. A one-hour Worker tick is measured separately from render frames.
- Median image load: 32.7 ms in Canvas contexts and 51.5 ms in Pixi contexts (browser cache is shared after the first navigation). Median Pixi initialization and texture setup: 171.3 ms.
- Run with `npm run bench:graphics-poc`; override URL and sample settings with `RIOSE_GRAPHICS_URL`, `BENCH_DURATION_MS`, `BENCH_WARMUP_MS`, `BENCH_CAMERA_ZOOM` and `BENCH_REPEATS`.

## Observed results

| Renderer | Simulated | Visible animals / sprites | Mean FPS | Frame p95 (ms) | Draw submission median (ms) | Scene update median (ms) | Post-GC JS heap (MB) | Worker tick (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Canvas | 100 | 53 / 95 | 120.0 | 16.7 | 0.1 | 0.15 | 1.5 | 1.6 |
| Canvas | 1,000 | 521 / 563 | 120.0 | 16.7 | 0.4 | 1.1 | 1.7 | 3.9 |
| Canvas | 10,000 | 5,131 / 5,173 | 11.5 | 183.4 | 71.4 | 6.2 | 2.4 | 203.2 |
| PixiJS | 100 | 53 / 95 | 45.5 | 33.4 | 0.1 | 0.1 | 15.4 | 23.6 |
| PixiJS | 1,000 | 521 / 563 | 10.5 | 108.4 | 0.1 | 1.0 | 15.6 | 96.8 |
| PixiJS | 10,000 | 5,131 / 5,173 | 1.4 | 716.7 | 0.1 | 6.0 | 16.1 | 747.8 |

The same camera rendered 5,131 of 10,000 animals at the largest load. This demonstrates that the scene adapter can keep the full herd in simulation while culling off-screen animals from the draw list. Both renderers reported identical simulated, visible and sprite counts.

## Interpretation and limits

This run does **not** show a PixiJS performance win. In this software-rendered, headless environment, Canvas held a higher frame rate at all three loads, while Pixi's JavaScript draw submission stayed low but its RAF interval degraded sharply at 1,000 and 10,000 sprites. The frame interval includes browser/render-pipeline delays; JavaScript submission duration is not GPU completion time. The 10,000-animal Worker round-trip also rose to 203.2 ms on Canvas and 747.8 ms on Pixi; those are end-to-end main-thread-observed round trips and can include delays while the browser is overloaded. Two repetitions reduce one-off noise but remain exploratory, not a stable device benchmark.

Post-GC heap was about 2.4 MB for Canvas and 16.1 MB for Pixi at 10,000 animals. Heap is measured in separate fresh page contexts so Pixi's scene and library allocations do not contaminate Canvas measurements. Image load and Pixi initialization are reported separately above and are one-time startup costs. Chromium does not expose GPU texture memory through this harness, so no GPU memory figure is claimed.

This is one exploratory pass on SwiftShader, not a device-level performance sign-off. Repeat on supported hardware with representative released assets, several repetitions, and production camera workloads. Keep Canvas as the product default until those measurements show a repeatable Pixi advantage.
