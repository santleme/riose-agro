# Riose rural diorama composition V1

This is a reference-led composition candidate built from the current Riose image library and one continuous generated terrain plate.

- `rural-diorama-zone-blockout-v1.png`: spatial blockout on the final footprint.
- `rural-diorama-refined-v1.png`: composed rural diorama using library sprites.
- `rural-diorama-scene-v1.json`: renderer-neutral coordinates, zones, composition blocks, ten prefab groups with relative offsets, and visual animal budget.
- The final preview is rendered from this JSON by `scripts/assets/render_scene_json.py`; replaying the saved scene produces a pixel-identical PNG.
- `scripts/assets/scene_prefab.py` moves or duplicates a prefab from its relative offsets; temporary move and duplicate renders were successfully checked.
- `asset-contact-sheet.png`: the 20 unique scene sprites plus the ground plate, with current review states.
- `review-report.md`: Fase A/B evidence, validation, and remaining approval gate.
- `reference-synthesis-comparison.png`: side-by-side source roles and resulting scene.

Reference roles are deliberately separated: the urban reference informs composition and hierarchy; Fazenda V7 informs rural content, scale, and density; Riose V2 informs terrain transitions, vegetation control, and grounding. No urban buildings or theme were copied.

The scene shows 14 Nelore sprites as a representative visual sample. Their count is not linked to scientific population or individual identities. Existing asset approval and rights states remain unchanged; this composition is for visual review, not a production approval claim.

Regenerate the scene and blockout with:

```sh
python3 scripts/assets/compose_ranch_composition_v1.py
```

Render an existing scene JSON independently with:

```sh
python3 scripts/assets/render_scene_json.py assets/previews/ranch-composition-v1/rural-diorama-scene-v1.json /tmp/riose-scene.png
```
