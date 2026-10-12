# Rejected Nelore refinement trials

These three raw outputs test whether the available image generator can make a finer, native-looking Nelore idle sprite when given the urban master directly and increasingly explicit pixel/alpha constraints. Originals were copied unchanged from the generated-images output; the adjacent `*-alpha-check.png` files composite them on a checkerboard for inspection.

| Trial | References | Alpha result | Decision |
|---|---|---|---|
| [v2 source](nelore-adult-idle-refinement-v2.png) / [alpha check](nelore-adult-idle-refinement-v2-alpha-check.png) | Urban master + farm V7 + Nelore anatomy candidate | RGBA 1536×1024; 496,594 partial-alpha pixels; no fully opaque pixels | Reject: V7 was unnecessary in this style-only re-render; outline and volumetric fur shading remain heavy. |
| [v3 source](nelore-adult-idle-refinement-v3.png) / [alpha check](nelore-adult-idle-refinement-v3-alpha-check.png) | Urban master + Nelore anatomy candidate | RGBA 1536×1024; 340,356 partial-alpha pixels; alpha maximum 254; no fully opaque pixels | Reject: still has broad volume bands and continuous dark contour; fails binary alpha target. |
| [v4 source](nelore-adult-idle-refinement-v4.png) / [alpha check](nelore-adult-idle-refinement-v4-alpha-check.png) | Urban master + Nelore anatomy candidate; explicit alpha 0/255 instruction | RGBA 1536×1024; 449,565 partial-alpha pixels; alpha maximum 254; no fully opaque pixels | Reject: same rendering pattern despite stronger instruction. It did not satisfy the requested opacity contract. |

The checkerboard previews do not show a broad colored fringe around the silhouette; the rejection is based on visual mismatch and the measured alpha values, not a claim that a halo was proven. Do not threshold, downscale, posterize, or otherwise convert these paintings into production pixel art. Preserve the trial images as evidence of the generation limit, and continue with a native-pixel authoring method or a generator that exposes and reliably honors pixel-grid and opacity controls.
