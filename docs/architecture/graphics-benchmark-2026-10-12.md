# Graphics PoC benchmark — 2026-10-12

## Setup

- Browser: Headless Chrome 156.0.8078.4, Linux, WebGL with SwiftShader.
- Scene: fixed iso demo, same asset images, Worker model, zoom (3.2×), 735×378 CSS-pixel viewport and sprite-bounds culling for both renderers.
- Loads: 100, 1,000 and 10,000 simulated animals; two fresh-page repetitions per renderer/load pair, 600 ms warm-up and 2,500 ms capture per sample.
- Engine: existing JavaScript FarmEngine Worker fallback. A one-hour Worker tick is measured separately from render frames.
- The culling predicate tests sprite rectangle/viewport intersection, so partially visible edge sprites are included. Livestock LOD uses near ≤100 px, medium ≤220 px, and far beyond 220 px. Far animals render in 48×36 px herd cells; member IDs remain on each group.
- Animation cadence now follows screen-space distance: near animals update at up to 60 Hz, medium animals slow quadratically from about 30 Hz to 8 Hz toward the far boundary, and far animals are represented by static clusters. The benchmark reports per-LOD visibility and checks that visible plus culled equals the full simulated population, while every visible animal remains represented.
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

## Scene refinement check

After adding connected pasture fences and avoiding transform/bounds work for untransformed sprites, the same harness was run at zoom 3.2× with two fresh-page repetitions, 400 ms warm-up and 1,000 ms capture for 1,000 and 10,000 animals. Canvas measured 121.0 FPS / 14.7 ms Worker round-trip at 1,000 and 37.0 FPS / 85.5 ms at 10,000. At 10,000, 4,643 animals remained visible and accounted for, represented by 2,065 animal draw units and 81 far-herd clusters. Post-GC heap was 2.8 MB; scene-update and render-submission medians were 9.2 ms and 5.1 ms.

Pixi measured 4.4 FPS / 243 ms Worker round-trip at 1,000 and collected no complete RAF interval in either 1-second 10,000-animal sample; the harness therefore reports 0 FPS for that case. Its 10,000-animal Worker round-trip median was 1,717.8 ms and post-GC JS heap was 16.8 MB. This short check confirms the existing renderer decision: Canvas remains default and Pixi stays opt-in. It is an exploratory regression check, not a replacement for the longer two-repetition table above or a supported-device performance sign-off.

## Culling and distance-cadence verification

A follow-up run on the same headless Chrome/SwiftShader setup used 10,000 animals, zoom 3.2×, a 735×378 CSS-pixel viewport, two fresh-page repetitions, 500 ms warm-up and 1,500 ms capture. It reported 4,643 animals whose sprite bounds intersected the viewport and 5,357 culled animals; all 4,643 visible IDs were represented by individual sprites or clusters. The visible population split into 151 near, 1,833 medium and 2,659 far animals; those tiers produced 2,065 animal draw units and 81 far clusters. This confirms why the earlier 5,131 figure was too high: that older center-point test padded the viewport by 70 px and counted off-screen animals. The current check intersects full sprite bounds (including the motion envelope) with the viewport. A subsequent one-repetition run with the automated accounting invariant passed for both renderers, confirming visible + culled = 10,000 and accounted = visible.

Canvas measured 53.2 mean FPS, 7.0 ms median scene update, 3.6 ms median draw submission, 0.35 ms median motion update and 55.6 ms Worker round-trip; post-GC heap was 2.9 MB. At this cadence the progressive policy averaged about 521 per-animal animation updates per frame. Pixi measured 0.33 mean FPS, 7.7 ms scene update, 0.85 ms draw submission, 1.05 ms motion update, 1,510.9 ms Worker round-trip and 15.3 MB post-GC heap; its sparse frame samples caused all 1,984 individual near/medium entries to pass the update gate on each frame. The renderer decision remains Canvas by default. This run verifies accounting and the changed update cadence, but remains a short exploratory headless measurement.

## Composer close-up after camera/LOD correction

The earlier automated camera zoom left the camera centered on the empty service zone in the 36×24 Composer scene, so its later 3.2× run reported zero visible animals. The corrected harness centers on stable simulation animal #1 and fails if a nonempty herd produces zero visible animals. LOD and animation distance now use the viewport center in screen pixels, not the camera's translation offset. This fixes the pan-dependent tiering bug.

One short validation used the same headless Chrome 156/SwiftShader environment, 735×378 viewport, zoom 3.2×, one fresh page per renderer/load, 400 ms warm-up and 1,000 ms capture. All 10,000 animals remained in the Worker; 771 sprite bounds intersected the viewport and 9,229 were culled. All visible IDs were represented by 435 visual draw units (111 herd clusters). The visible tiers were 87 near, 237 medium and 447 far. At 1,000 animals, 73 intersected the viewport and 927 were culled; 67 draw units represented the visible set.

| Renderer | Load | Mean FPS | Frame p95 | Scene update | Draw submission | Visual motion updates/frame | Worker round-trip | Post-GC JS heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Canvas | 1,000 | 121.0 | 16.7 ms | 1.5 ms | 0.3 ms | 5.3 | 7.9 ms | 2.4 MB |
| Canvas | 10,000 | 121.0 | 16.7 ms | 9.5 ms | 2.1 ms | 60.6 | 17.5 ms | 2.5 MB |
| PixiJS | 1,000 | 40.3 | 33.4 ms | 3.0 ms | 0.1 ms | 13.4 | 38.9 ms | 5.9 MB |
| PixiJS | 10,000 | 11.8 | 100.0 ms | 7.4 ms | 0.3 ms | 293.5 | 109.4 ms | 8.5 MB |

This one-repetition run is exploratory, not a release benchmark. Its visibility count is intentionally lower than the 4,643 map-centered count above because the close-up is focused on one animal rather than showing the whole map. It demonstrates correct camera focus, culling accounting, LOD tiering and stable representation; it does not provide a directly comparable performance delta against older runs with different camera targets.

## 100,000-animal boundary check

The existing browser benchmark was also invoked with `BENCH_HERDS=100000`, one repeat, an 800 ms capture, and the 3.2× close-up camera. It stopped during Worker reset with `Animal count must be 1–10000`, before either renderer produced a sample. The application and simulation currently support up to 10,000 animals; this attempt gives no evidence about 100,000-animal rendering performance. Keep 100,000 out of renderer comparisons until the simulation's supported population limit is deliberately expanded and its memory and tick costs are measured separately.

## Zone-overlay verification sample

After adding labeled zone boundaries, the same harness ran at 10,000 animals, zoom 3.2×, 735×378 CSS pixels, one fresh page per renderer, 400 ms warm-up and 1,000 ms capture. It again accounted for all animals: 771 bounds-visible, 9,229 culled, and all 771 visible IDs represented by 435 draw units (111 clusters). Canvas measured 121.0 mean FPS, 16.7 ms frame p95, 6.8 ms scene update, 1.3 ms draw submission, 2.6 MB post-GC JS heap, and 20.7 ms Worker round-trip. Pixi measured 15.7 mean FPS, 83.3 ms frame p95, 4.1 ms scene update, 0.2 ms draw submission, 7.5 MB post-GC heap, and 77.7 ms Worker round-trip. This single repetition verifies the new overlay path and population accounting, not release performance.

## Capturing supported physical GPUs

The default benchmark explicitly selects SwiftShader for repeatable harness checks. Those numbers do not qualify a renderer choice. With the project built and its local server running, capture a supported physical device using its normal hardware-accelerated Chromium installation:

```bash
BENCH_GPU_MODE=hardware BENCH_DEVICE_PROFILE=laptop-amd-radeon BENCH_REPEATS=30 node scripts/benchmark-graphics-poc.mjs > graphics-poc-amd-radeon.json
```

Use a distinct stable profile name for each supported GPU/browser combination and keep the resulting report with the device name, driver and browser version. Hardware mode does not force an ANGLE backend or bypass Chrome's GPU blocklist. It records WebGL vendor/renderer/version/limits and Chrome's device/driver details when exposed, and stops if WebGL reports a known software renderer. The harness still reports JavaScript submission separately from GPU completion; browser WebGL exposes no general GPU completion or texture-memory measurement here. A renderer decision therefore requires repeated captures across the supported profiles, the exact atlas and scene workload, and documented driver/browser versions. A passing hardware capture is evidence for its named profile, not for devices that were not measured.
