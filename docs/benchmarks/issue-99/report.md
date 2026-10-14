# Issue #99 — Canvas vs Pixi on GTX 1060

Decision: **CONDITIONAL_GO**. Pixi was faster in the corrected RAF samples at both populations: at 1k the frame median tied while Pixi had a narrower p95 and higher observed FPS; at 10k the FPS median was 56.99 for Canvas and 161.01 for Pixi. The single-device result and mismatch between Windows' reported 75Hz display mode and RAF cadence do not justify a product-default change. Keep Canvas as the product default.

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

All values show median across five fresh pages, with the observed min–max spread. Frame p95 is the median of each page's p95 RAF interval. Culling execution count is measured independently from render-frame sample count; repeated cached culling values are excluded.

| Renderer | Population | FPS | Frame median ms | Frame p95 ms | Submission median ms | Scene update ms | Culling ms | Culling executions/run | Render frames/run | Worker tick ms | Asset load ms | Pixi init ms | JS heap bytes | Visible / culled | Draw units |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| canvas | 1,000 | 131.26 (88.35–131.33) | 6.10 (6.10–12.10) | 12.20 (12.20–18.20) | 3.10 (2.70–3.40) | 5.40 (3.90–8.70) | 0.50 (0.50–0.90) | 2.00 (2.00–2.00) | 393.00 (264.00–394.00) | 18.60 (15.90–27.70) | 78.80 (31.20–148.80) | — | 34444546.00 (14988693.00–39320614.00) | 342 / 658 | 129 |
| canvas | 10,000 | 56.99 (38.61–72.56) | 18.20 (12.20–24.30) | 24.20 (18.20–36.60) | 5.90 (4.40–7.90) | 39.00 (25.50–51.90) | 2.50 (1.30–3.80) | 2.00 (2.00–2.00) | 172.00 (117.00–219.00) | 75.20 (63.90–99.70) | 78.80 (31.20–148.80) | — | 38889278.00 (19229249.00–44690671.00) | 3,296 / 6,704 | 842 |
| pixi | 1,000 | 161.01 (159.00–162.33) | 6.10 (6.10–6.10) | 6.20 (6.20–6.20) | 0.30 (0.20–0.30) | 5.50 (3.70–49.70) | 0.40 (0.30–0.50) | 2.00 (2.00–2.00) | 484.00 (478.00–488.00) | 17.50 (14.00–22.80) | 78.80 (31.20–148.80) | 180.00 (90.40–391.60) | 23799177.00 (21288204.00–40404673.00) | 342 / 658 | 129 |
| pixi | 10,000 | 161.01 (160.01–163.00) | 6.10 (6.10–6.10) | 6.20 (6.20–6.20) | 0.30 (0.20–0.40) | 50.00 (35.60–56.00) | 1.90 (1.40–3.20) | 2.00 (2.00–2.00) | 483.00 (479.00–490.00) | 54.70 (32.60–94.70) | 78.80 (31.20–148.80) | 180.00 (90.40–391.60) | 30872908.00 (30573805.00–37759872.00) | 3,296 / 6,704 | 842 |

Visible + culled equaled population on every run; visible/culled stable-ID digests were identical between Canvas and Pixi, and animal 1 remained selected. Draw-unit counts matched for both renderers at each population.

## Relative comparison

Percentages compare Pixi median to Canvas median.

| Population | FPS change | Frame median change | Frame p95 change | Frame-median speedup |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 22.7% | -0.00 ms (-0.0%) | -6.00 ms (-49.2%) | 1.00× |
| 10,000 | 182.5% | -12.10 ms (-66.5%) | -18.00 ms (-74.4%) | 2.98× |

## Interpretation

- **1k:** both renderers had a 6.10ms median frame interval, but Canvas' median p95 was 12.20ms versus Pixi's 6.20ms; RAF-derived FPS medians were 131.26 and 161.01 respectively. This indicates more consistent Pixi callbacks in this capture set, though RAF cadence is not physical presentation timing.
- **10k:** Pixi's FPS median was 161.01 versus Canvas' 56.99; p95 frame intervals were 6.20ms and 24.20ms. Pixi's JavaScript submission was lower, but it does not measure completed GPU work.
- **Complexity:** evidence supports keeping Pixi available as an option, but not changing the product default from this single browser/GPU profile.

## Limitations

- One GTX 1060 and one Chromium-family in-app browser only; no iGPU, AMD, mobile, or other display profiles.
- WebGL identifies the physical NVIDIA adapter. GPU duration, utilization and allocated VRAM were not available through permitted browser page APIs. The product model name includes 6GB; allocated VRAM is not measured.
- Frame timing is requestAnimationFrame callback interval. Renderer submission is JavaScript call time, not GPU completion. The 75Hz Windows mode and 160+ RAF observations do not align.
- Browser cache stayed enabled between fresh-page runs. Heap is browser-reported `performance.memory` when available, without forced GC.
- Scene update and culling timings overlap; do not sum them. Worker time is a separate one-hour tick.
- The screenshot regression runner was unavailable because Node could not spawn local Chromium on Windows (spawn UNKNOWN). Its baseline covers Canvas product scenes, not this fixture or Pixi; no Canvas-vs-Pixi pixel diff is claimed.

## Decision

**CONDITIONAL_GO** — retain Pixi as an optional path for dense scenes and consider further product analysis after collecting results on additional GPUs and browser/display profiles. Keep Canvas as the product default.
