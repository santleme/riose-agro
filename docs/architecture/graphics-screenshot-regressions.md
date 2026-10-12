# Graphics screenshot regression

`scripts/graphics-screenshot-regression.mjs` captures the Graphics PoC's beef scene, dairy scene, and a deterministic beef animal-selection overlay in the existing headless Chromium installation. It pins a 1280×900 CSS viewport, device scale factor 1, Canvas 2D, the scene's committed seed, and a fresh browser profile. Only the map canvas is captured, so browser font rendering and surrounding application copy are outside the comparison.

Install no browser package: build the current PoC, start the repository server, then run:

```sh
npm run build:graphics-poc
npm start
node scripts/graphics-screenshot-regression.mjs
```

Capture timing is printed separately and is not part of the FPS benchmark. Pixel comparison allows per-channel differences up to 18 and up to 3.5% of pixels above that channel tolerance. The captured area has no text to mask; the threshold absorbs small rasterization variation. A viewport or canvas size change always fails. A known art or layout change should update PNGs with `node scripts/graphics-screenshot-regression.mjs --update` only after reviewing the new captures in the PR.

These PNGs are renderer regression baselines, not approval of the depicted assets. Composer items still marked `REVIEW` or `UNRESOLVED` retain those statuses; this workflow does not edit or approve imagery. The baseline does not assert parity across arbitrary GPUs or browser versions, and the existing scene/schema tests remain authoritative for nonvisual contracts.
