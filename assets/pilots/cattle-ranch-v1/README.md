# Riose Brazilian cattle ranch pilot V1

The pilot selects 12 real PNG assets from the canonical semantic manifest; it does not duplicate their metadata. `pilot.json` is the ID index. Run `python3 scripts/assets/build_pilot_contact_sheet.py` to rebuild the individual sprite sheet.

The review scene is the renderer-neutral JSON in `sourceScene`: 82 placements reference 26 semantic asset IDs. The 12 IDs in `pilot.json` are the selected sprite kit; the scene also contains assets outside that kit. Its V4 review-matrix state snapshot predates the pilot decision and is not a current status source. Resolve current art, technical, and rights states by semantic ID in `assets/manifests/manifest.json`.

## Review decision — 2026-10-13

The user approved the visual appearance of all 12 pilot sprites and the composed scene. This passes the **Fase B art gate for this pilot**. Evidence is recorded in `pilot.json`, with the side-by-side comparison and contact sheet under `assets/previews/pilot-v3/`. The decision is scoped to this kit and scene; it does not establish a global style lock or production/release approval.

All 12 selected entries have `review.art: pass` and `review.technical: pass`; all are marked `APPROVED`, none `RELEASED`. This pilot-scoped decision does not approve the other assets referenced by the 26-ID review scene: those keep their individual manifest statuses, including 13 entries still marked `REVIEW`. It also does not clear public or commercial rights: the pilot entries retain `rights.licenseState: project-generated-review`. Three animal PNGs and the pasture base received an embedded sRGB profile with unchanged pixel values, verified by `scripts/assets/assign_srgb_profile.py`. The pasture V4 asset is approved only as a single ground plate: its 3×3 proof has tonal joins, so it must not be auto-repeated. The current composed scene uses the separate unified ground V2 plate. The compacted-grounding V2 overlay approval remains a separate decision.

The current Composer adapter accepts Composer export and generated-layout source formats only. The ranch pilot scene is retained as a lossless JSON fixture until explicit mappings are defined for its pixel-space anchors, terrain plate, composition blocks, animal lots, and review metadata. Fixture coverage verifies placement/asset identity and manifest states without promoting or treating the pilot as a release manifest.
