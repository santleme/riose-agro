# Calibration v2 — generation request and review evidence

Date: 2026-10-12
Status: REJECTED — do not use in atlas or runtime.

## Reference roles

- `docs/assets/pixel-art-urban-reference.png`: dominant authority for pixel density, selective fine contours, cluster scale, restrained palette, and graphic shading.
- `docs/assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png`: subject matter and rural scale only; not an art-style authority.

## Shared prompt sent to the image generator

```text
Generate ONE standalone production game sprite only. Use the two reference images with distinct roles: Image 1 (urban master) is the dominant authority for fine pixel density, delicate dark outlines, crisp controlled pixel clusters, stepped graphic shading, restrained colors, and refined architectural detail; Image 2 (approved Brazilian farm V7) is only the authority for rural subject matter, Brazilian materials and scale relationships. Do not copy city buildings or the farm's thicker outlines. Handcrafted native isometric pixel art, consistent 2:1 ground projection, one-pixel dark material-aware outlines at the sprite's native pixel scale, small intentional clusters, few stepped tones, moderate desaturation, clear silhouette, high craft detail at useful zoom. No painterly brush texture, no gradients, no 3D render, no anti-aliased edges, no soft ambient shadows, no micro-noise, no labels, no text, no logo, no frame. Isolated centered asset, transparent background, clean alpha edges, enough transparent padding; do not bake a ground shadow except a small hard-edged contact shadow if needed. This is an art calibration candidate, not final approved art.
```

The per-asset subject text is recorded in `rejected/README.md`. All six requests asked for a single asset and transparent output.

## Outputs

The six original generator outputs were copied byte-for-byte into `assets/previews/art-calibration-v2/rejected/`. Source copies remain in the Codex generated-images folder. Their full SHA-256 hashes and alpha counts are recorded in `rejected/README.md`.

`comparison-sheet.png` is a review-only contact sheet: urban master and rural V7 above the six candidates, alpha-composited over a checkerboard. It is not a sprite and was resampled only for this visual sheet.

## Exact per-asset subject prompts

- **House:** A modest Brazilian cattle ranch farmhouse, white limewashed walls, terracotta roof tiles with carefully grouped individual tile pixels, shaded veranda with slender timber posts, small wooden door, several tiny dark window panes, stone steps and two potted plants; compact, richly detailed, no surrounding terrain.
- **Tree:** A single mature Brazilian pasture shade tree with a distinctive broad, asymmetrical canopy built from fine crisp leaf clusters, visible branching trunk, a few small vines and roots; nuanced greens, no flowers or fruit, no terrain base.
- **Tractor:** A small unbranded green farm tractor in a three-quarter isometric view, visibly readable cab, roof, hood, exhaust, steering lights, articulated front axle, front and rear tires with restrained yellow hubs; precise mechanical pixel details, no trailer, no soil base.
- **Nelore:** One adult white Nelore zebu bull in a clean three-quarter isometric side view facing lower-right, recognizable shoulder hump and dewlap, long pendulous ears, short dark horns, compact hoof clusters, calm standing pose; anatomically legible at game scale, no tag, no terrain.
- **Road:** One straight modular Brazilian ranch dirt-road tile segment, true 2:1 isometric diamond footprint, road runs along the long axis and connects cleanly at both ends, subtle wheel-worn ochre earth, tiny stones and grass edge tufts kept sparse, flat tile top without thick beveled slab sides.
- **Pasture:** One seamless-connectable 2:1 isometric diamond tile of Brazilian cattle pasture, crisp controlled clusters of distinct short and medium grass, restrained olive and sage greens with occasional ochre soil peeking through, no flowers, no rocks, no beveled dirt slab sides, tile must read clearly at game zoom.

## Exact single-reference farmhouse retest prompt

```text
Use Image 1 only as the visual style reference, not as subject matter. Create ONE isolated Brazilian ranch farmhouse sprite in the SAME refined handcrafted isometric pixel-art language as Image 1. Match the urban master’s fine native pixel scale, small architectural details, thin selective material-colored contours, crisp stepped geometry, compact flat color planes, and restrained palette. Keep the visual finish at the level of Image 1's small houses and street fixtures; do not imitate the urban composition.

Subject: modest Brazilian cattle-farm farmhouse, white lime plaster, a restrained terracotta tiled roof, small shaded veranda with thin wooden posts, readable door and small window panes. Single building only, no terrain tile or stone plinth, no plants, no furniture, no cast shadow, no labels. Fixed clean 2:1 isometric ground axes, bottom-center ground anchor. Build native pixel art with square hard-edged pixels, mostly 1-pixel dark warm-brown contours, short deliberate internal lines, exactly 3–4 flat stepped tones per material, small clusters that retain detail at native resolution. PNG RGBA with hard alpha 0/255 and clean transparent padding.

Avoid: thick uniform outlines, broad soft shading, airbrush, gradients, vignette, glow, ambient occlusion, glossy highlights, 3D bevels, painterly textures, photo detail, soft shadows, antialiasing, background fill, fake pixelation, and any details larger than needed for a small game asset.
```

The urban-master-only retest failed despite removing the V7 image input. Technical facts and its review are in `assets/previews/art-calibration-v2/rejected/README.md`.
