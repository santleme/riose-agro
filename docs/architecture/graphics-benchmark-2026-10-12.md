# Graphics PoC benchmark — 2026-10-12

## Setup

- Browser: Headless Chrome 156.0.8078.4, Linux, WebGL with SwiftShader.
- Scene: fixed iso demo, same asset images, Worker model, zoom (3.2×), viewport and culling bounds for both renderers.
- Loads: 100, 1,000 and 10,000 simulated animals; 600 ms warm-up and 2,500 ms capture for each renderer/load pair.
- Engine: existing JavaScript FarmEngine Worker fallback. A one-hour Worker tick is measured separately from render frames.
- Shared image loading: 33.3 ms. Pixi initialization and texture setup: 127.4 ms.
- Run with `npm run bench:graphics-poc`; override the URL and sample settings with `RIOSE_GRAPHICS_URL`, `BENCH_DURATION_MS`, `BENCH_WARMUP_MS` and `BENCH_CAMERA_ZOOM`.

## Observed results

| Renderer | Simulated | Visible animals / sprites | Mean FPS | Frame p95 (ms) | Draw submission median (ms) | Scene update median (ms) | Post-GC JS heap (MB) | Worker tick (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Canvas | 100 | 53 / 95 | 120.0 | 16.7 | 0.1 | 0.1 | 2.4 | 0.9 |
| Canvas | 1,000 | 521 / 563 | 120.0 | 16.7 | 0.3 | 0.5 | 2.6 | 1.8 |
| Canvas | 10,000 | 5,131 / 5,173 | 18.2 | 116.7 | 44.4 | 3.6 | 3.3 | 113.7 |
| PixiJS | 100 | 53 / 95 | 60.0 | 16.7 | 0.1 | 1.3 | 9.3 | 13.7 |
| PixiJS | 1,000 | 521 / 563 | 17.1 | 66.7 | 0.1 | 1.0 | 9.4 | 55.4 |
| PixiJS | 10,000 | 5,131 / 5,173 | 2.1 | 516.6 | 0.1 | 4.4 | 10.1 | 525.3 |

The same camera rendered 5,131 of 10,000 animals at the largest load. This demonstrates that the scene adapter can keep the full herd in simulation while culling off-screen animals from the draw list. Both renderers reported identical simulated, visible and sprite counts.

## Interpretation and limits

This run does **not** show a PixiJS performance win. In this software-rendered, headless environment, Canvas held a higher frame rate at all three loads, while Pixi's JavaScript draw submission stayed low but its RAF interval degraded sharply at 1,000 and 10,000 sprites. The frame interval includes browser/render-pipeline delays; JavaScript submission duration is not GPU completion time. The 10,000-animal Worker round-trip also rose to 113.7 ms on Canvas and 525.3 ms on Pixi; those are end-to-end main-thread-observed round trips and can include delays while the browser is overloaded.

Post-GC heap was about 3.3 MB for Canvas and 10.1 MB for Pixi at 10,000 animals. Image load and Pixi initialization are reported separately above and are one-time startup costs. Layout duration deltas were below 1.3 ms in this pass. Chromium does not expose GPU texture memory through this harness, so no GPU memory figure is claimed.

This is one exploratory pass on SwiftShader, not a device-level performance sign-off. Repeat on supported hardware with representative released assets, several repetitions, and production camera workloads. Keep Canvas as the product default until those measurements show a repeatable Pixi advantage.
