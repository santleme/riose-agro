# Riose rural diorama composition v2

This is a new, renderer-neutral scene composition authored from the existing semantic asset manifest. The prior v1 preview is preserved.

- `rural-diorama-zone-blockout-v2.png`: territorial blockout for crop, headquarters, services, handling, water, three pasture zones, and monitoring.
- `rural-diorama-refined-v2.png`: actual image assets rendered from the saved JSON scene.
- `rural-diorama-scene-v2.json`: source of truth; 65 placements, 10 reusable prefab groups, 9 zones, and 14 deterministic representative cattle sprites.
- `reference-role-comparison-v2.png`: direct comparison with the urban composition reference, approved Fazenda V7, and Riose V2 terrain treatment.

Reference roles are deliberately separated: urban reference = composition only; V7 = rural content and scale; Riose V2 = terrain transitions, vegetation control, and grounding. No assets were promoted and no scientific population data is bound to the representative animal sprites.

Rebuild with `python3 scripts/assets/compose_ranch_composition_v2.py`. The script writes the blockout and scene JSON, then renders the refined image through `scripts/assets/render_scene_json.py`. This scene is a review candidate; artistic approval remains with the project owner.
