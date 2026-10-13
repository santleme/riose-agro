# Riose Brazilian cattle ranch pilot V1

The pilot selects 12 real PNG assets from the canonical semantic manifest; it does not duplicate their metadata. `pilot.json` is the ID index. Run `python3 scripts/assets/build_pilot_contact_sheet.py` to rebuild the individual sprite sheet.

The review scene is the renderer-neutral JSON in `sourceScene`. It composes the broader V4 ranch from manifest-backed PNGs and uses the separately approved V2 compacted-grounding overlay, plus gate, water-trough, feed-trough, and monitoring-station V2 candidates.

## Review decision — 2026-10-13

The user approved the visual appearance of all 12 pilot sprites and the composed scene. This passes the **Fase B art gate for this pilot**. Evidence is recorded in `pilot.json`, with the side-by-side comparison and contact sheet under `assets/previews/pilot-v3/`. The decision is scoped to this kit and scene; it does not establish a global style lock or production/release approval.

All 12 entries now have `review.art: pass` and `review.technical: pass`; all are marked `APPROVED`, none `RELEASED`. Three animal PNGs and the pasture base received an embedded sRGB profile with unchanged pixel values, verified by `scripts/assets/assign_srgb_profile.py`. The pasture V4 asset is approved only as a single ground plate: its 3×3 proof has tonal joins, so it must not be auto-repeated. The current composed scene uses the separate unified ground V2 plate. The compacted-grounding V2 overlay approval remains a separate decision.
