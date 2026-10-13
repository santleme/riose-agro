# Handling asset review — modular cattle gate V2

- `gate-v1-v2-review.png` compares the existing gate sprite and the new V2 sprite, then shows each at the matching entrance placement in the ranch scene.
- `modular-cattle-gate-v2-alpha-proof.png` verifies the exported V2 silhouette on checker, magenta, cyan and warm-white mattes.
- Raw generated source is retained at `assets/source/handling/modular-cattle-gate-v2-raw.png`.
- Candidate export: `assets/candidates/handling/modular-cattle-gate-v2-hard-alpha.png`; manifest ID `fence.gate.wood.imagegen.v2`.
- V2 is technically clean (binary alpha, 2px padding, embedded sRGB) but remains `REVIEW` until its artistic fit and fence/corral connectors are approved.
- Scene integration is a separate renderer-neutral JSON variant at `assets/previews/ranch-composition-v4/rural-diorama-scene-v4-grounding-v2-gate-v2-review.json`; the approved composition baseline remains unchanged.
- `water-trough-cattle-v2-alpha-proof.png` verifies the transparent export of the new rectangular trough. Raw V1 and edited V2 are preserved at `assets/source/handling/water-trough-metal-v1-raw.png` and `water-trough-metal-v2-raw.png`.
- Candidate export: `assets/candidates/handling/water-trough-cattle-v2-hard-alpha.png`; manifest ID `water.trough.cattle.galvanized.imagegen.v2`, currently REVIEW.
- The latest ranch review JSON replaces the four round-trough placements with this rectangular variant while preserving the approved V4 baseline.
- `feed-trough-hay-v2-alpha-proof.png` verifies the transparent cocho export. Candidate ID `feed.trough.hay.imagegen.v2` replaces the two feed troughs only in the latest scene-review variant; it remains REVIEW.
- `handling-v2-review-sheet.png` groups the three new V2 handling candidates for one visual review.
- The latest ranch composition review, including monitoring station V2, is `assets/previews/ranch-composition-v4/rural-diorama-grounding-v2-gate-v2-water-v2-feed-v2-tech-v2-review.png`; the renderer resolves 82 placements and 6 grounding overlays.
