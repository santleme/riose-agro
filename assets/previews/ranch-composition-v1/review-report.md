# RIOSE pilot — Fase A/B evidence and open art gate

## Fase A — art bible

Evidence present in the repository:

- `docs/art/riose-art-bible-v1.md`: reference roles, isometric geometry/scale, outline and light hypotheses, measured palette evidence, scene grammar, reusable prompt and rejection rules.
- `assets/style/style-tokens.json`: structured projection, palette, materials, anchors, filters, shadow and density tokens.
- `docs/art/reference-measurements-v1.json`: reproducible source dimensions, hashes, palette samples and orientation probes.
- `assets/prompts/templates/isometric-pixel-sprite-v1.md` and `docs/art/asset-quality-standard.md`: generation and review criteria.

**Document/reference gate:** evidence is present. Numerical style values remain explicitly provisional where native-size calibration has not established them; this report does not claim a production style lock.

## Fase B — pilot image kit and composition

- The semantic manifest has individual PNGs, stable IDs, source lineage, dimensions, anchors, footprints, tags, rights state and review decision for the cattle and ranch asset families.
- `asset-contact-sheet.png` shows the 21 unique sprite assets used in the new scene plus its continuous ground plate (21 visual items). Candidate approval state is shown per item.
- `rural-diorama-refined-v1.png` is composed from those library PNGs and one registered full-footprint ground plate; no code-drawn substitute art is used.
- `rural-diorama-scene-v1.json` records 53 placements, 14 representative cattle, zones, renderer-neutral pixel anchors, ten prefab groups with relative offsets and explicit terrain-plate ID. The cattle sprites are not bound to scientific individual identities or population counts.
- The final preview is rendered by `scripts/assets/render_scene_json.py` from the saved JSON. An independent replay to a second output path was pixel-identical to the committed preview (`ImageChops.difference` bounding box: empty).
- `reference-synthesis-comparison.png` places the urban composition reference, Fazenda V7, Riose V2 pilot, and current candidate together.

### Validation evidence

- Scene JSON and semantic manifest parse successfully.
- Prefab references cover all 53 placements exactly once; each asset ID resolves to a local manifest-backed image.
- `scripts/assets/scene_prefab.py` was exercised on temporary JSON copies: a six-placement pasture prefab duplicated at a new origin and a west-paddock prefab moved by `(16, 8)` pixels. Both preserved relative offsets and rendered successfully; the review scene itself was not changed by these checks.
- All 51 placed asset IDs resolve to manifest records and local files.
- All placement anchors lie on the ground plate.
- Ground plate source is retained separately from its alpha-cleaned candidate export; candidate alpha is binary and hidden RGB is cleared.
- `scripts/assets/validate_library.py`: zero structural/integrity errors after registering this plate. Remaining warnings concern existing candidate ICC/alpha/hidden-RGB review items and do not constitute visual approval.
- `git diff --check` passes.

### Open Fase B gate

The composition and sprite contact sheet are review candidates. Individual asset review statuses have not been promoted here, and the scene has not been granted a human style approval. The scene still has less architectural microdetail and density than Fazenda V7/urban master at matched display size. This is the remaining approval decision before advancing beyond Fase B.
