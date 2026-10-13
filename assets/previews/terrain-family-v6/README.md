# Grounding overlays — V2 selected

- Raw ImageGen output is preserved at `assets/source/terrain-family-v6/compacted-grounding-v1-raw.png`.
- Candidate export is `assets/candidates/terrain-family-v6/compacted-grounding-v1-hard-alpha.png`, registered as `terrain.soil.compacted-patch.imagegen.v3` in the semantic manifest.
- The original had a soft alpha halo. The candidate uses alpha threshold 128, crop to visible art with 2px padding, cleared hidden RGB, and an sRGB profile tag; visible RGB values were not changed.
- Binary alpha and dimensions pass technical checks. V1 remains a superseded review candidate.
- `compacted-grounding-v1-alpha-proof.png` shows the candidate on checker, magenta, cyan, and warm-white mattes.
- `grounding-scene-side-by-side.png` compares the unchanged approved V4 layout with a temporary preview using the candidate overlay in place of the existing compaction overlay. The saved V4 scene JSON remains unchanged.

V2's raw edit is preserved as `compacted-grounding-v2-raw.png`; the cleaned export is registered as `terrain.soil.compacted-patch.imagegen.v4`. The user selected V2 over V1 (“V2 melhor!”) on 2026-10-13, so the manifest records this overlay variant as APPROVED. This approval applies to this asset only; it does not approve the full terrain family or lock the global art direction.

- `compacted-grounding-v2-alpha-proof.png` documents the cleaned transparency.
- `grounding-candidates-scene-comparison.png` compares the base scene, V1 and V2.
- `assets/previews/ranch-composition-v4/rural-diorama-scene-v4-grounding-v2.json` is a renderer-neutral review variant that uses V2 in all six grounding placements.
- `assets/previews/ranch-composition-v4/rural-diorama-grounding-v2-selected.png` is rendered from that JSON and the semantic manifest. The approved V4 source scene remains unchanged.
