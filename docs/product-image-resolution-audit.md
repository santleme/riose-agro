# Product scene image-resolution audit

## Findings

The main scenery was not being loaded from thumbnails. Product reads `/assets/manifest.json` and the atlas frame rectangles in that manifest. Before the fix, the canvas itself stayed at 576 × 336 backing pixels while CSS displayed it at up to 1,370 CSS pixels wide. At that size, each logical scene pixel was enlarged about 2.38× on desktop. The 2D context also had `imageSmoothingEnabled = false`, and `product.css` set `image-rendering: pixelated`; both forced nearest-neighbor sampling across every asset, including detailed generated sprites. This compounded the low-resolution canvas and made edges look harsh and detail disappear.

Most building, animal, handling, crop, and water frames are full-size crops from the project’s individual PNGs. The livestock-approved atlas is 1,024 × 1,024 and its Nelore frame is 1,016 × 761; the approved source PNG is 1,536 × 1,024, with transparent margins removed by the atlas crop. The crossbred frame is the full 1,288 × 902 candidate. The previous shade tree was the 384 × 256 `shade-tree` crop in the older farm atlas even though the higher-resolution 492 × 432 `vegetation-tree-shade-imagegen-v1` already existed in the published environment atlas. The scene now uses that published 492 × 432 tree for shade-tree entities.

The grass repetition had a separate cause: two 384 × 256 whole terrain tiles (`grass-light` and `grass-mid`) were alternated with a modulo pattern, then drawn into a 32 × 23 rectangle clipped to each 32 × 16 scene cell. These are full tile illustrations, not seamless tiny texture swatches; shrinking and repeating them over the procedural grid created a regular, compressed pattern. Product terrain now uses the isometric cell map, varied local color, and deterministic irregular grass marks instead of stamping those two images across the ground.

The assets are authored in an isometric pixel-art direction, but that is a property of the source artwork. Nearest-neighbor scaling had been imposed on the entire canvas and could not distinguish those deliberate source pixels from the fine detail in other sprites. The fix uses high-quality Canvas sampling and display-density backing pixels; it does not blur or re-author the source files.

## Runtime atlas files

Product now loads only atlases referenced by entities drawn in this scene. `livestock-equipment-atlas.png` was previously fetched but no Product scene entity used it, so that unnecessary load was removed. The separate dairy module atlas remains isolated.

| Runtime path | Native dimensions | Product scene use |
| --- | ---: | --- |
| `public/assets/atlas/farm-starter-atlas.png` | 1,536 × 1,024 | Silo, fruit tree, shrub |
| `public/assets/atlas/livestock-approved-atlas.png` | 1,024 × 1,024 | Nelore |
| `public/assets/atlas/animals-review-atlas-v1.png` | 3,072 × 2,688 | Crossbred cow |
| `public/assets/atlas/handling-review-atlas-v1.png` | 2,048 × 1,024 | Corral, chute, alley, feeders, trough, gate, scale |
| `public/assets/atlas/environment-review-atlas-v1.png` | 2,048 × 1,024 | Pond, reservoir, shade tree |
| `public/assets/atlas/infrastructure-review-atlas-v1.png` | 2,048 × 1,024 | Farmhouse, shed, workshop, tractor, pickup |
| `public/assets/atlas/crop-stages-atlas.png` | 1,774 × 887 | Soybean and maize field stages |
| `public/assets/atlas/technology-review-atlas-v1.png` | 2,048 × 1,024 | Herd-monitor gateway |

## Frame size versus scene draw size

These draw sizes are in the 576 × 336 logical scene coordinate space. CSS scales the scene to fit the viewport; the canvas now rasterizes at the element’s CSS size × `devicePixelRatio`, while preserving the same logical coordinates for hit testing and selection.

| Entity asset | Runtime source frame | Draw size |
| --- | ---: | ---: |
| `building-farmhouse-imagegen-v1` | 547 × 414 | 70 × 54 |
| `building-workshop-imagegen-v1` | 485 × 392 | 48 × 39 |
| `building-shed-imagegen-v1` | 505 × 407 | 78 × 58 |
| `corral-wood-standard-imagegen-v1` | 580 × 371 | 64 × 45 |
| `handling-alley-cattle-imagegen-v1` | 441 × 357 | 45 × 27 |
| `handling-chute-cattle-imagegen-v1` | 369 × 349 | 36 × 28 |
| `water-pond-imagegen-v1` | 444 × 320 | 63 × 46 |
| `water-trough-round-imagegen-v1` | 462 × 237 | 30 × 23 |
| `feed-trough-hay-imagegen-v1` / `feed-salt-roofed-imagegen-v1` | 423 × 261 / 279 × 314 | 38 × 27 / 34 × 29 |
| `vehicle-tractor-imagegen-v1` / `vehicle-pickup-rural-imagegen-v1` | 393 × 318 / 497 × 287 | 42 × 30 / 39 × 26 |
| `water-reservoir-imagegen-v1` / `technology-gateway-antenna-imagegen-v1` | 437 × 321 / 320 × 507 | 40 × 30 / 24 × 33 |
| `technology-scale-electronic-imagegen-v1` | 462 × 323 | 28 × 21 |
| `field-soybean-growing` / `field-maize-growing` | 443.5 × 443.5 | 47 × 31 / 43 × 29 |
| `vegetation-tree-shade-imagegen-v1` | 492 × 432 | 34–42 × 39–46 |
| `fruit-tree` / `shrub` | 384 × 256 each | 27–31 × 33–37 / 23–25 × 19–21 |
| `nelore-adult` / `livestock-crossbred-cow-idle-imagegen-v1` | 1,016 × 761 / 1,288 × 902 | 27 × 21 resting; 30 × 24 moving |
| `fence-gate-wood-imagegen-v1` / `fence-wire-wood-post-imagegen-v1` | 379 × 303 / 416 × 299 | 29 × 23 for gates; wire runs are primarily Canvas geometry |

Fence runs, paths, terrain cells, soil extrusion, and their hit regions are Canvas geometry rather than flattened imagery. Each remains a separate scene entity and keeps its own selection target.

## Rendering changes

- The backing canvas now follows its rendered width and height at `devicePixelRatio`; drawing and pointer coordinates still use the 576 × 336 scene space.
- Asset sampling is high quality; CSS no longer forces pixelated enlargement. Pixel clusters inside the source sprites remain intact.
- Ground texture no longer alternates two complete grass illustrations at a regular modulo interval.
- Shade trees now use the higher-resolution published environment-atlas frame.
- Static object sizes and scene anchors were retained because, after the canvas is fit to the viewport, they correspond closely to their manifest display-size hints. Selection, hover, movement, and context-panel events remain wired to individual entities.
