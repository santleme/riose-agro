# Graphics screenshot regression

`scripts/graphics-screenshot-regression.mjs` captures the Graphics PoC's beef scene, dairy scene, and a deterministic beef paddock-zone overlay in the existing headless Chromium installation. It pins a 1280×900 CSS viewport, device scale factor 1, Canvas 2D, the scene's committed seed, and a fresh browser profile. Only the map canvas is captured, so browser font rendering and surrounding application copy are outside the comparison.

Install no browser package. Run the dedicated regression command:

```sh
npm run test:graphics-screenshots
```

The command builds the checked-in Composer scenes before starting its isolated loopback server. The pull request workflow runs for changes under `graphics-poc/`, `assets/`, and `public/assets/`, including source scenes, renderer atlases, runtime manifests, scenario-editor files, and candidate or approved asset files. It also watches the simulation Worker and its model dependencies in `src/client/`, because their initial herd state determines the rendered animal positions and actions. The workflow path-filter test keeps these inputs covered. Chromium is discovered from `CHROME_BIN`, common system paths, or the existing Playwright cache. The run records the browser build, CSS viewport, device-pixel ratio, canvas bounds, bitmap dimensions, and the CDP `Page.captureScreenshot` request time for each fixture; decoding, comparison, and fixture writes are excluded from `captureMs`. It fails if the pinned 1280×900 CSS viewport or DPR 1 drifts.

Capture timing is printed separately and is not part of the FPS benchmark. Pixel comparison allows per-channel differences up to 18 and at most 0.5% of pixels above that channel tolerance. This permits sparse rasterization variation while still failing when a visible scene element changes across a meaningful region; text is outside the captured canvas, so it needs no mask. A viewport or canvas size change always fails. A known art or layout change should update PNGs with `node scripts/graphics-screenshot-regression.mjs --update` only after reviewing the new captures in the PR.

These PNGs are renderer regression baselines, not approval of the depicted assets. The currently approved Nelore adult remains approved; other Composer items still marked `REVIEW` or `UNRESOLVED` retain those statuses, so these screenshots do not satisfy an all-approved-assets requirement. This workflow does not edit or approve imagery. The baseline does not assert parity across arbitrary GPUs or browser versions, and the existing scene/schema tests remain authoritative for nonvisual contracts.
