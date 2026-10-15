# RIOSE asset library

This folder is the review and production workspace for the livestock visual system. The current v1 files are **candidates**, not a released/runtime library.

- `style/style-tokens.json` records the measured urban-source color chips and provisional geometry/material rules.
- `source/` preserves generated source PNGs by family.
- `manifests/manifest.json` is the semantic candidate manifest. It is separate from the runtime graphics manifest in `public/assets/manifest.json`.
- `schemas/asset.schema.json` defines the candidate record shape.
- `prompts/` stores reusable direction and the pilot generation record.
- `previews/pilot-v1/` contains the contact sheet, actual-file scene composition, reference comparison, and visual gate report.
- `approved/` and `atlases/` remain empty of production assets until the art, technical, and provenance gates pass.

Candidate PNGs are not wired into the simulator. Do not promote an item based only on schema, alpha-channel presence, or appearance in a composed preview. See [`docs/asset-pipeline/production-workflow.md`](../docs/asset-pipeline/production-workflow.md) and [`docs/art/asset-quality-standard.md`](../docs/art/asset-quality-standard.md).
# Runtime release assets

`synthetic/runtime/` contains project-authored geometric sprite sources for public runtime use. `manifests/actiii-release-v1.json` records each source and release basis. The candidate catalogs remain authoring inputs and are excluded from the public runtime asset set.
