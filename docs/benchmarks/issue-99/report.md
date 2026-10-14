# Issue #99 — Canvas vs Pixi on GTX 1060

Decision: **CONDITIONAL_GO**. Pixi is a credible option for the 10k fixture: median RAF-derived FPS was 96.05 for Canvas and 164.99 for Pixi. At 1k both were at the browser's observed refresh cadence. Keep Canvas as the product default; this single-device fixture does not justify a default change.

## Environment

- Base SHA: `9c5838e2a1fbafbf5d3c3a73c3613338dc70261f`
- OS / CPU: Windows 11 Home 10.0.26200; Intel Core i5-10400F @ 2.90GHz, 6 cores / 12 threads.
- GPU: NVIDIA GeForce GTX 1060 6GB, driver 32.0.15.8088 (NVIDIA 580.88).
- Browser: Codex In-app Browser, Chromium / Chrome 155.0.0.0.
- GPU evidence: standard WebGL reports vendor `Google Inc. (NVIDIA)`, renderer `ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB (0x00001C03) Direct3D11 vs_5_0 ps_5_0, D3D11)`, `unmasked=true`, `softwareFallback=false`, `identifiesGtx1060=true`.
- Windows display mode reports 1024×768 at 75Hz; page viewport was 923×971.5 CSS pixels, DPR 1. The mismatch with measured RAF cadence is a limitation; RAF timing is not physical presentation timing.
- Power mode: Desempenho Máximo.

## Method

Five sequential fresh-page captures. Every page ran Canvas and Pixi at 1,000 and 10,000 animals using fixture `approved-livestock-v1`, asset `nelore-adult`, seed 20261012, zoom 2, camera anchor/selected stable ID 1, same viewport, culling, LOD and clustering. Each case used an 800ms warmup and 3,000ms measurement interval. Browser cache remained enabled between pages. Full JSON measurements, including raw frame/submission/update/culling arrays and per-run summaries, are in [report.json](./report.json) and [raw captures](./raw/).

## Results

All values show median across five fresh pages, with the observed min–max spread. Frame p95 is the median of each page's p95 RAF interval.

| Renderer | Population | FPS | Frame median ms | Frame p95 ms | Submission median ms | Scene update ms | Culling ms | Worker tick ms | Asset load ms | Pixi init ms | JS heap bytes | Visible / culled | Draw units |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| canvas | 1,000 | 165.00 (147.66–165.33) | 6.10 (6.10–6.10) | 6.20 (6.20–12.10) | 1.30 (1.30–2.90) | 1.70 (1.30–2.70) | 0.30 (0.20–0.60) | 12.00 (6.80–16.70) | 37.70 (31.90–59.50) | — | 33407123.00 (17993912.00–47609529.00) | 342 / 658 | 129 |
| canvas | 10,000 | 96.05 (59.76–99.74) | 12.10 (12.10–18.10) | 18.10 (12.20–24.20) | 3.10 (3.00–5.00) | 12.70 (11.50–25.40) | 1.60 (1.40–4.30) | 27.70 (26.20–38.80) | 37.70 (31.90–59.50) | — | 34096136.00 (17556828.00–49746099.00) | 3,296 / 6,704 | 842 |
| pixi | 1,000 | 164.99 (164.99–165.00) | 6.10 (6.10–6.10) | 6.20 (6.20–6.20) | 0.20 (0.10–0.20) | 1.40 (1.20–2.50) | 0.20 (0.20–0.30) | 6.80 (4.90–7.10) | 37.70 (31.90–59.50) | 100.10 (81.10–168.90) | 43649763.00 (27581843.00–46755763.00) | 342 / 658 | 129 |
| pixi | 10,000 | 164.99 (164.66–164.99) | 6.10 (6.10–6.10) | 6.20 (6.10–6.20) | 0.20 (0.20–0.20) | 13.20 (11.40–16.10) | 1.70 (1.30–1.80) | 21.20 (19.60–21.50) | 37.70 (31.90–59.50) | 100.10 (81.10–168.90) | 49979053.00 (48648422.00–50044474.00) | 3,296 / 6,704 | 842 |

Visible + culled equaled population on every run; visible/culled stable-ID digests were identical between Canvas and Pixi, and animal 1 remained selected. Draw-unit counts matched for both renderers at each population.

## Relative comparison

Percentages compare Pixi median to Canvas median.

| Population | FPS change | Frame median change | Frame p95 change | Frame-median speedup |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | -0.0% | -0.00 ms (-0.0%) | 0.00 ms (0.0%) | 1.00× |
| 10,000 | 71.8% | -6.00 ms (-49.6%) | -11.90 ms (-65.7%) | 1.98× |

## Interpretation

- **1k:** Canvas and Pixi both reached approximately 165 RAF callbacks per second, so Pixi did not demonstrate a material frame-rate advantage at this population. Pixi's JavaScript submission call was shorter, but it does not measure completed GPU work.
- **10k:** Pixi reached a stable refresh-cadence ceiling while Canvas median FPS and p95 intervals varied across pages. This supports keeping Pixi available for dense populations, but the browser/display cadence mismatch and absence of GPU-completion timing make the size of the real presentation gain uncertain.
- **Complexity:** the data supports a conditional renderer option, not a product-default switch.

## Limitations

- One GTX 1060 and one Chromium-family in-app browser only; no iGPU, AMD, mobile, or other display profiles.
- WebGL identifies the physical NVIDIA adapter. GPU duration, utilization and allocated VRAM were not available through permitted browser page APIs. The product model name includes 6GB; allocated VRAM is not measured.
- Frame timing is requestAnimationFrame callback interval. Renderer submission is JavaScript call time, not GPU completion. The 75Hz Windows mode and near-165Hz RAF observations do not align.
- Browser cache stayed enabled between fresh-page runs. Heap is browser-reported `performance.memory` when available, without forced GC.
- Scene update and culling timings overlap; do not sum them. Worker time is a separate one-hour tick.
- The screenshot regression runner was unavailable because Node could not spawn local Chromium on Windows (spawn UNKNOWN). Its baseline covers Canvas product scenes, not this fixture or Pixi; no Canvas-vs-Pixi pixel diff is claimed.

## Decision

**CONDITIONAL_GO** — retain Pixi as an optional path for dense 10k scenes, keep Canvas as the product default, and repeat on additional browser/GPU/display profiles before considering a default change.
