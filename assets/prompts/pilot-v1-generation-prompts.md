# Pilot v1 generation prompts and provenance

All six draft sprites were generated separately on 2026-10-11 with the built-in image generation tool. The tool did not expose a model/version identifier. Each call attached the full urban master (`docs/assets/pixel-art-urban-reference.png`) as dominant style reference and the user-approved rural V7 (`docs/assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png`) as content/scale reference. Animal calls also attached the existing Nelore candidate as a subject/pose reference only. This records the prompts sent; it does not certify resulting style or usage rights.

## Shared prompt prefix

```text
Create a production-ready isolated sprite as crisp handcrafted isometric game pixel art. Use reference 1 as the dominant style authority: match its fine precise dark outlines, stepped 2:1 isometric geometry, controlled pixel clusters, compact material details, restrained graphic shading and balanced moderately desaturated palette. Use reference 2 only for Brazilian ranch content, proportions and rural scale; do not copy its thicker outline weight. Native pixel construction, no anti-aliasing, gradients, soft shadows, painting, photorealism, or 3D render. Transparent RGBA background, no colored fringe/halo, no labels, no frame, no unrelated objects, centered and fully inside canvas, crisp edges.
```

## Subject prompts

### `livestock.nelore.adult.walking.ne.v1`
One adult white-gray Brazilian Nelore beef bull walking slowly, clean side three-quarter isometric view aligned to reference camera. Clearly readable characteristic shoulder hump, loose dewlap, short pale coat, dark hooves, small horns and simple ear. Use compact clusters and a fine material-colored outline. Show one clear walking pose with four legs separated; no duplicated limbs, no ground plane, no shadow.

### `livestock.nelore.adult.grazing.ne.v1`
One adult white-gray Brazilian Nelore beef bull grazing with head lowered toward ground, side three-quarter isometric view aligned to reference camera. Clearly readable shoulder hump, loose dewlap, short pale coat, dark hooves, small horns. Keep all body parts legible and silhouette compact. No grass tile or ground plane, no shadow.

### `livestock.nelore.calf.idle.ne.v1`
One young Nelore calf, small compact juvenile proportions, white-gray coat, short legs, small shoulder hump just beginning, tiny ears and dark hooves; standing in a calm side three-quarter isometric pose. Clearly a calf and same species family as the existing Nelore reference. Fine outline, few clean shade tones. No adult cow, no ground plane, no shadow.

### `fence.wood.gate.closed.ne.v1`
One closed wooden cattle paddock gate with four horizontal rails and diagonal brace, two timber gateposts with simple metal hinges/latch, viewed in consistent 2:1 isometric diagonal orientation. Make both endpoints align logically with modular ranch fence segments, show clear connection points, compact fine wood grain clusters and metal fittings. No terrain base or grass.

### `technology.ear-tag.rfid-candidate.v1`
One small plausible electronic cattle ear tag, two-piece livestock ear tag with a muted mustard-yellow front button and small dark green-gray reader module, one tiny red/amber status pixel only, simple readable silhouette, slight three-quarter view. No lettering, no numbers, no logo, no animal, no hand, no ground shadow. Fine pixels, transparent background, centered.

### `technology.reader-station.corral-rfid-candidate.v1`
One compact credible cattle RFID reading station for a Brazilian corral, a sturdy waist-high metal post with a small weatherproof reader box, one short antenna panel and a tiny indicator light, with a bolted rectangular footplate. Isometric three-quarter view, consistent rural scale, restrained olive-gray and galvanized metal palette, delicate seams and connectors. No screen text, no logo, no animals, no terrain, no extra objects.
```

## Provenance limits

The generator/model version is unavailable in the tool response. The six originals are stored under `assets/source/` unchanged. The legacy files linked by the pilot manifest predate this prompt/provenance format; their exact original prompts and model versions are unknown. Check the current tool terms before public/commercial release and record the applicable license review.

## Nelore idle refinement experiments (rejected)

These are prompt/provenance records for attempts to fix the contour and shading after the first pilot review. All used the built-in image generation tool; its model/version was not exposed. Raw outputs are preserved under `assets/previews/pilot-v1/rejected/`.

### Refinement v2

References, in order: urban master (dominant style), approved farm V7 (rural content/scale), legacy Nelore (breed anatomy only). Prompt required a fresh isolated adult Nelore, fixed 2:1 isometric view, 1-pixel material-colored line, 2-pixel overlap separation only, 3–4 hard-edged fur tones, no gradients/glow/shadow, and clean transparent RGBA. Output: `nelore-adult-idle-refinement-v2.png`.

### Refinement v3

References: urban master (style) and legacy Nelore (anatomy only), omitting V7 to avoid style contamination. Prompt specified mostly one-pixel warm-gray selective contour, sparse 2–5 pixel clusters, 3–4 flat fur tones, no continuous gradient, binary opaque silhouette edge, and no background effects. Output: `nelore-adult-idle-refinement-v3.png`.

### Refinement v4

Same two references as v3. Prompt explicitly required every subject pixel to have alpha 255, every background pixel alpha 0, and no other alpha value, with no soft transitions or antialiasing. Output: `nelore-adult-idle-refinement-v4.png`.

The checkerboard reviews and measured alpha counts are in `assets/previews/pilot-v1/rejected/README.md`. All three trials remain rejected; they do not replace or modify the pilot manifest sources.

## Nelore walking edit v2 — 2026-10-12

The approved idle sprite was the edit target, not just an anatomy reference. Prompt: “Edit Image 1, which is the exact approved Riose Nelore sprite. Change only the leg pose so the same adult animal is clearly walking slowly: one front hoof lifted and moving forward, the opposite front leg planted, hind legs in a natural staggered step. Keep its head, face, ears, horns, shoulder hump, dewlap, body silhouette and proportions as close as possible to Image 1. Keep the exact same small-scale isometric pixel-art finish, pixel cluster scale, outline, palette, shading, canvas scale, camera angle, and ground-contact convention as Image 1. Image 2 is only an additional style reference; Image 3 is only rural-content context. Isolated single animal, transparent background. Do not add ground, shadow, glow, labels, objects, other animals, or scenery. Do not change anything except leg pose.”

Inputs: approved Nelore idle PNG (edit target), urban master (style authority), V7 (rural context only). Built-in ImageGen did not expose model version. Original output is preserved in `assets/source/livestock/nelore-adult-walking-edit-v2-raw.png`. Candidate export uses `scripts/assets/normalize_hard_edge_alpha.py` with threshold 128; it changes only alpha and zeroes hidden RGB. This is a candidate pending human art review, not an approval.

## Nelore grazing edit v2 — 2026-10-12

The approved idle sprite was the edit target. Prompt: “Edit Image 1, the approved Riose adult Nelore sprite. Change only the head and neck pose so the same adult animal is clearly grazing: lower and extend its head toward the ground, nose close to an implied pasture surface, with a natural curved neck. Keep all four legs planted in a quiet standing stance. Keep the exact same body, recognizable hump, coat, face, ears, proportions, silhouette scale, pixel-art cluster size, outline, palette, shading and camera angle as Image 1. Image 2 is the dominant style authority; Image 3 is only Brazilian farm context. Isolated single animal, transparent background. No grass, ground, cast shadow, glow, text, frame, equipment or other animals. Do not change anything except the head/neck pose.”

Inputs: approved Nelore idle PNG (edit target), urban master (style authority), V7 (rural context only). Built-in ImageGen did not expose model version. Original output is preserved in `assets/source/livestock/nelore-adult-grazing-edit-v2-raw.png`. Candidate export uses `scripts/assets/normalize_hard_edge_alpha.py` with threshold 128; it changes only alpha and clears hidden RGB. Candidate remains pending art and full technical review.

## Nelore calf edit v2 — 2026-10-12

The approved adult Nelore sprite was the edit target. Prompt: “Edit Image 1, the approved Riose adult Nelore, into a clearly juvenile Nelore calf. Change the animal's scale and proportions to a small young calf: shorter legs, smaller body, rounded juvenile face, smaller ears, only a very slight developing shoulder hump, no adult dewlap or bull-like mass. Keep the recognizable pale white-gray Nelore coat, dark hooves, calm side three-quarter isometric camera, same pixel-art cluster scale, selective outline, palette and graphic shading as Image 1. Image 2 remains the dominant style authority. Image 3 is only Brazilian farm content/scale context. One complete isolated calf, centered, feet visible, transparent background. No adult animal, ground tile, shadow, grass, glow, text, frame, or props. Do not add additional elements.”

Inputs: approved Nelore idle PNG (edit target), urban master (style authority), V7 (rural content/scale context). Built-in ImageGen did not expose model version. Original output is preserved in `assets/source/livestock/nelore-calf-edit-v2-raw.png`. Candidate export uses `scripts/assets/normalize_hard_edge_alpha.py` with threshold 128; it changes only alpha and clears hidden RGB. Candidate remains pending art and full technical review.
