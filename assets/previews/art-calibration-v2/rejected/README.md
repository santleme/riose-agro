# Art calibration v2 — rejected candidates

All six generated files are **rejected** for production, atlas, and runtime use. They were generated as one-sprite transparent PNGs with the urban master as style authority and farm V7 as rural content/scale reference. They still diverge from the master through heavy continuous outlines, soft volumetric bands, glossy/rendered light, and coarse or repeated clusters. This review does not promote any candidate.

## Technical evidence

All files are 1536×1024 except the tractor (1484×1060). Alpha counts show that none has a fully opaque pixel except 399 isolated pixels in the tractor. Partially transparent values span about 30.0–43.0% of each image; several content bounds touch the canvas edge. The dark vignettes and cast shadows are part of the non-binary alpha image, so this is not a clean transparent sprite edge and cannot be fixed by simple trimming.

| Candidate | Partial alpha | Fully opaque | Bounds | SHA-256 | Decision |
|---|---:|---:|---|---|---|
| farmhouse-candidate.png | 567,143 (36.0%) | 0 | x=0..1511, y=19..999 | `82f99dcbcc0254fed9dbebe652485678650be2124c758c026abf5ef8919a3907` | Reject: heavy roof/wall shading and outline; baked stone base; halo |
| shade-tree-candidate.png | 675,877 (42.9%) | 0 | x=0..1529, y=0..1023 | `8e4ce0239e86aa02f42f6945633df91f4841d391391ae90e85d92552b8002445` | Reject: repetitive bulb clusters, volume highlights, heavy outlines; no clear ground anchor |
| tractor-candidate.png | 574,187 (36.5%) | 399 | x=0..1445, y=21..1043 | `cfab3c2f1a1fb6659a85b9b4efe6360391a690cd6223a6b283adcba98920f537` | Reject: glossy bevels, thick contours, saturated material blocks, perspective/footprint unclear |
| nelore-bull-candidate.png | 471,204 (30.0%) | 0 | x=0..1513, y=41..999 | `7d04beeb8622d447052487b2a7557c25d642bbce99dbed991019604bed0685a1` | Reject: soft body volume bands, rounded rendering, heavy black outline; no ground anchor |
| dirt-road-candidate.png | 616,655 (39.2%) | 0 | x=0..1535, y=9..1023 | `b76bb3e166ef9cbd7bfdd3aa3ed9c1ded2ddb4bba93caa77b2d2cba290933a34` | Reject: elevated organic edge, soft surface shading; end connectors and seams unproven |
| pasture-tile-candidate.png | 604,463 (38.4%) | 0 | x=0..1519, y=0..1023 | `083b7a4d3ec8231b6e54df5b56abcf9cc1fff67e6274c767a9e723482465f2a6` | Reject: repeated noisy tufts, soft gradients and heavy edge; tile connectivity unproven |

Opaque/transparent/partial counts and bounding boxes are computed from each original RGBA file by Pillow. The contact sheet [comparison-sheet.png](../comparison-sheet.png) composites the alpha over a checkerboard to expose the baked fringe. It is only a review image.

## Independent art review

The parallel art-direction review agreed: **reject all six as production sprites**. The urban reference has thinner selective contours, smaller clusters, denser architectural detail, and flatter value planes. The farm V7 contributes rural layout and scale but should not contribute its saturated palette or heavy outlines. Road and pasture do not establish seamless connectors.

## Next calibration attempt

Generate only a single farmhouse again with the urban image as the sole style reference. Specify 1 px material-colored contours, 3–4 flat tones per material, compact detail clusters and no ground base or cast shadow. Do not generate the remaining family assets until this one sample passes native-resolution style review and binary-alpha inspection. If the generator still returns broad soft volume or alpha fringe, stop image-generation retries for this batch and prepare controlled native-pixel authoring; do not posterize, downsample, or recolor these rejected images into pretend pixel art.


## Single-reference redraw attempt

The farmhouse was generated once more with the urban master as the sole style reference, a stricter native-pixel prompt, 1 px contours, 3–4 flat material tones and no baked base or shadows. It was independently reviewed and **rejected**: roof tiles remain large and repetitive, outlines/clusters are thicker than the master, architectural microdetails are too sparse, and a soft vignette/volume remains. RGBA facts: 1536×1024, 952,149 transparent pixels, 620,715 partial-alpha pixels, 0 fully opaque pixels, alpha bounds `(0,31,1520,1024)`, SHA-256 ``01e229b875a6ad81ded03806b68c191dcf5aaab6fd8b54615ad8e24487a73b48`.

This confirms that prompt tightening and removing the rural visual reference did not resolve style or alpha fidelity. No additional family assets should be generated from this recipe. The next action is to use a real pixel-art authoring path that provides direct grid and alpha control; do not clean these renders with downscaling, posterization, or threshold filters.
