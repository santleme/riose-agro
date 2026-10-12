# Riose asset production workflow

**Status:** production procedure for future assets; this document does not approve or create art.  
**Scope:** Brazilian cattle ranch visual library and its optional precision-livestock overlays.  
**Architecture boundary:** preserve the current simulator, renderer, map generation, scenario contract, and runtime manifest. This workflow can prepare review artifacts without wiring them into the runtime.

## 1. Current state and authority

The current app is a vanilla JavaScript project. `app.js` loads PNG atlases and frame metadata from `public/assets/manifest.json`; the rendered map still has procedural/runtime fallbacks. The project does not currently depend on PixiJS, React, TypeScript, Sharp, or Zod. The brief lists those as possible future choices, not installed or approved production dependencies. Do not introduce them as part of asset authoring or documentation work.

The cattle kit at `docs/assets/kit-pecuaria-bovina-v1/` is a planning set. Its 46 IDs and six scenario recipes describe needs and composition; they are not 46 delivered sprites. Existing mixed-farm files and atlases are legacy candidates. Presence in a directory, successful script validation, or appearance in a scene is not artistic approval.

### Audited visual references

| Authority | Source of record | Audit result | Approved use |
|---|---|---|---|
| Urban master | `docs/assets/pixel-art-urban-reference.png` | Original 1257×850 RGBA; confirmed to match the supplied Downloads original. | Dominant authority for pixel-art language, rendering finish, pixel density, outlines, shading, geometry, and detail. |
| Urban comparison crop | `docs/assets/pixel-art-urban-reference-clean.png` | Crop/derived comparison image, not the original master. | Convenient side-by-side crop only; use the full master when available for art decisions. |
| Brazilian farm V7 | `docs/assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png` | 1525×1031 RGB; byte-identical to the generation original. The master brief designates this V7 scene as approved. | Approved at the **scene level** for rural content, property composition, and relative scale. It does not supersede the urban master for style and does not individually approve every object/sprite embedded in the scene. |

Use the urban master as the authority for rendering language and the approved V7 as the authority for rural subject matter, proportions, and composition. Approval of the V7 scene is real and should be recorded as such; it is not blanket approval of each contained asset. Individual assets still require their own review. Consult the review records before reusing earlier rejected scenes or assets.

## 2. Separate two kinds of status

Do not collapse production maturity, AI provenance, and domain/technology maturity into one `status` field. Record each independently.

### Asset production state

Use uppercase values in the semantic asset manifest, following the project's required state flow:

| State | Meaning | May ship? |
|---|---|---|
| `DRAFT` | A source/file is being prepared; it is not ready for review. | No |
| `REVIEW` | A specific file/version is awaiting technical and visual review. | No |
| `APPROVED` | The exact source/export passed the required gates and has recorded reviewers. | Not by itself |
| `REJECTED` | A version failed; retain it with reason and do not promote it. | No |
| `RELEASED` | An approved version was packaged for a named consumer/release. | Yes, for that release |

`APPROVED` describes an exact revision, not a whole family. `RELEASED` is a distribution event and must include package/version/hash/consumer and a graphics manifest. A correction to a released image creates a new revision and returns that revision to `REVIEW`; it must not inherit approval silently. Planning-only records may use `planned` or `experimental` in the planning kit, but those are not semantic asset statuses.

### AI and source provenance

Record the origin in a separate `provenance.kind` field:

| Label | Meaning |
|---|---|
| `human-authored` | Created manually by an artist; name/role and source project are recorded when known. |
| `ai-generated` | Generated from a prompt or image-conditioned generation. Record provider, model/version when available, generation date, prompt, and input references. |
| `ai-assisted` | Human-created source with a material AI edit or generation step; describe which parts were AI-assisted. |
| `derived` | Cropped, cleaned, recolored, trimmed, or otherwise transformed from a named source. Record the parent hash and exact operations. |
| `unknown` | Origin cannot be established. Treat as ineligible for public/commercial release until resolved. |

AI provenance does not imply rejection, and human authorship does not imply approval. The visual gate applies equally. Never describe a model output as manually authored. Preserve the raw generated file; do not overwrite it with cleanup. Record the prompt, negative constraints, seed/job identifier if exposed, provider/model/version if exposed, references and their hashes, operator, date, and each non-destructive and destructive edit. If a tool does not expose a field, record `not-provided`; do not invent it.

For all sources, record licensing/usage basis, attribution requirements, source URL or internal asset ID, and any uncertainty. A missing or unclear rights basis blocks release even when visual review passes. Do not use third-party logos or product-identifying designs without rights clearance.

## 3. Required record for every candidate

The semantic record must identify at minimum:

- stable ID, display name, family/category, intended use, and revision;
- source file path and SHA-256; derived export path and hash when different;
- production state and its review record;
- provenance label, creator/operator, source lineage, AI metadata when applicable, and rights basis;
- reference IDs/hashes and the role of each reference (style authority, rural content/scale, or technical source);
- style version, logical dimensions, final pixel dimensions, footprint, ground anchor, orientation, and transparent padding;
- states/frames/variants, connectors for modular tiles/props, target packages, and scenario compatibility;
- technical validation result, visual review result, reviewer/date, rejection reason or approval rationale;
- for technology depictions: technology maturity class, evidence/source date, depiction limits, and whether visible elements are conceptual.

Keep semantic identity separate from atlas coordinates. Atlas frame, trim, rotation, extrusion, and texture belong to a generated graphics/build record, not to the definition of what the asset represents. The candidate manifest may continue to express planning data; do not call it the production manifest until actual exports have been reviewed and the schema/version are defined.

## 4. Production stages and gates

### Stage 0 — Intake and references

1. Select one family and a small acceptance sample; do not start a broad batch while its calibration sample is failing.
2. Use the audited originals above for the approved urban and rural references. Prefer originals over screenshots or compressed derivatives. Record each reference's path, hash, version, and authority in new candidate metadata. The urban clean crop is only a comparison aid. The farm V7 is approved as a complete rural composition/content/scale reference; individual sprites extracted from or depicted within it remain unapproved unless reviewed separately.
3. If an authority image is missing or its approval cannot be verified, mark the relevant gate `blocked`; do not substitute an unverified image as approved.
4. Define the subject, functional context, materials, style version, 2:1 isometric orientation, logical footprint, anchor, variants, intended zoom, and exclusions before generation.

**Gate:** references and asset specification are traceable. This is a planning gate, not an art approval.

### Stage 1 — Create source art

1. Use the approved style guide plus the universal and family prompt. Attach image references whenever the generation tool supports them; identify which reference controls style and which controls subject/scale.
2. Generate one isolated asset or a tightly related frame set per request. Preserve the original output and generation metadata.
3. Make pixel clusters, silhouettes, contour weight, shading, and material regions deliberate. Do not convert a semirealistic painting into pixel art through downscaling, quantization, or a pixel filter.
4. Do not create final environment art with SVG, CSS, Canvas, Pixi shapes, or geometric code. Code may arrange real image files for comparison, validate metadata/alpha, or build a review contact sheet.
5. If the available generator cannot maintain the reference's pixel-art finish, stop at `experimental`/`rejected`, record the gap, and route to manual pixel-art authoring or a better controlled generation/editing method. A complete generated scene does not bypass per-sprite review.

**Gate:** silhouette and style are plausible enough to spend effort on technical cleanup. Painterly, 3D-like, overly thick-lined, low-detail, noisy, or mismatched work goes back to source art or is rejected. Do not clean alpha on a style failure as a substitute for redraw.

### Stage 2 — Technical art and export

1. Preserve the raw source; create a revisioned export from a copy.
2. Isolate the sprite only when its source supports a clean cut. Remove matte/halo pixels without changing the artwork's clusters. Do not fabricate missing edges or claim a generated transparent background is clean without checking it.
3. Export RGBA PNG with clean alpha and no baked background/ground unless the asset specification explicitly requires a tile. Preserve intended native pixel scale; any resampling must be documented and use an appropriate nearest-neighbor operation.
4. Verify pixel dimensions, color profile, file integrity, transparent padding, anchor, footprint, palette/contour consistency, and absence of colored fringe on light, dark, and checkerboard backgrounds.
5. For tiles, validate exact diamond bounds and declared edge connectors in a repeated 3×3 test. For modular props, connect a representative set at native scale. For animation, check frame alignment, timing metadata, and silhouette continuity.

**Gate:** automatic checks pass. This proves file and metadata integrity only; it does not approve art.

### Stage 3 — Visual review

Review at native size and 100%, then 50% and 25% zoom. Compare side-by-side with the dominant urban reference and the appropriate rural reference. Evaluate:

- isometric axes, camera, logical scale, ground contact, and anchor;
- pixel density, cluster control, selective fine outline, deliberate stepped edges, and material readability;
- light direction, restrained tonal steps, palette, and shadow consistency;
- expected microdetail and visual density at the intended zoom;
- clear Brazilian cattle-ranch subject and functional silhouette;
- transparent-edge quality, no matte halo, no background, no accidental shadow;
- tile seams, modular connections, state/variant consistency, and scene fit.

Record `pass`, `revise`, or `reject` for each criterion, with evidence and a short rationale. Required approvals are: art direction/style; technical art/file integrity; asset library/provenance and rights. One person can perform multiple roles, but the review record must show which checks were made. A script cannot sign the visual gate.

**Gate:** the exact revision is marked `approved` only when every required review passes. Any unresolved style mismatch or licensing uncertainty blocks approval/release. Rejected versions retain their rejection reason and are never quietly replaced in the record.

### Stage 4 — Composition and regression

1. Assemble a small scene from the actual individual candidate files and their declared anchors, not by cropping a single generated scene.
2. Keep a side-by-side comparison with both style and rural-content references. Ensure the composition is connected and dense enough to test the intended map scale.
3. Re-open every sprite in the composition at native size; a scene-level pass cannot promote a sprite that failed individual review.
4. Record scene recipe, input IDs/revisions/hashes, compositor version, and output hash. The preview is a review artifact, not a runtime scene unless separately integrated.
5. For future revisions, compare contact sheets and representative scenes with the approved baseline; investigate style drift before expanding a family.

**Preview limitation:** candidate scene compositors may rescale source files to approximate logical in-world size for layout review. Such a preview proves only that actual files can be arranged into a composition; it is not evidence of native pixel density, edge quality, or sprite approval. Inspect source PNGs at native resolution for those decisions. Never export the preview-resampled image back as an asset.

**Gate:** every component is individually approved and the composition passes visual/scale review. The current cattle scene candidates documented in `docs/assets/review-cattle-pixel/` remain rejected for style; the asset-first legacy composition is a layout/content proof only.

### Stage 5 — Pack and release

1. Build atlas outputs only from individually approved exports. Keep source sprites as the authoritative artwork.
2. Generate a separate graphics manifest for frame geometry, trim, padding/extrusion, texture, and animations. Keep it distinct from the semantic manifest.
3. Verify deterministic packing, frame bounds, alpha bleed, tile edge integrity, target texture limits, and package references.
4. Produce a named versioned package with hashes and an explicit consumer. Only then set the packaged revision to `released`.
5. Runtime integration is a separate task: inspect the current `public/assets/manifest.json` contract and `app.js` loader, prepare a reviewable change, and preserve fallbacks. Do not change renderer architecture or swap runtime art as an incidental part of asset production.

**Gate:** approved source, rights, manifests, package checks, and consumer compatibility all pass. Atlas generation or a successful application load does not grant artistic approval.

## 5. Automated checks versus human decisions

The target pipeline should automate file readability, dimensions, alpha presence, padding, profile, duplicate/hash detection, naming, ID format/duplicates, anchor ranges, connector existence, manifest references, atlas bounds, deterministic build, and package size checks. Temporal ID stability, connector compatibility, atlas bounds, deterministic packing, and package-size checks are not currently implemented. Add halo heuristics only as warnings: a detector cannot decide whether an edge is artistically correct.

Human review decides style identity, visual fidelity, legibility, material treatment, anatomy, Brazilian contextual fit, density, visual balance, reference appropriateness, and whether a technology depiction misleads. Keep these results explicit instead of reducing them to a single quality score.

The current `scripts/assets/validate_library.py` checks the semantic JSON Schema, ID format and duplicates, path containment, file readability/PNG format, declared dimensions, alpha channel and per-asset alpha policy, separate source/export hashes, exact duplicate files, file size/resolution caps, ICC metadata, and sprite padding. Hard-edge alpha, binary tile alpha, profile, and padding findings are warnings for review candidates; they become errors when an asset claims a technical pass. A high diversity of RGB values under fully transparent pixels is only a resampling-bleed heuristic, not a halo detector. Atlas rectangles are deliberately not read from semantic records: atlas geometry, bounds, extrusion, and bleed require a separate graphics/build manifest validator, which does not yet exist. `--promotion-gate` requires every item to be `APPROVED`/`RELEASED`, art and technical gates passed, documented rights with a nonempty basis, known source provenance, a domain-expert reviewer for evidence on technology classes A/B, and an existing graphics-manifest path for `RELEASED`. It is expected to fail while the pilot remains under review.

The checker validates that reference authority files resolve and validates the graphics-manifest path recorded for a released revision, but it does not validate the graphics manifest's contents, technology evidence quality, or claims. Its promotion gate is global across this semantic manifest; it does not yet scope a family/package. It does not judge artistic style, prove clean edges, or validate atlas packing, since no production graphics-manifest validator exists yet. The older `validate_manifest.py`, `validate_candidate_kit.py`, atlas/contact-sheet scripts, and static scene composers remain candidate/planning tools; success is evidence only for the checks each actually performs, not proof that planned assets exist, pass the visual gate, or are runtime-integrated.

## 6. File organization and change control

Use existing repository conventions until an approved library destination is established. Keep planning documents and candidate recipes under `docs/`; keep generated/review material under the existing candidate/review directories; do not create a second runtime asset library just to satisfy a proposed folder diagram. Store raw sources separately from clean exports and atlas outputs. Do not delete or overwrite legacy or rejected art; label its role and preserve its lineage.

For each promotion or rejection, add a review entry with asset ID, revision, file hash, date, decision, reviewer roles, checks, and reason. For changes to scale, anchor, connectors, or semantic identity, version the manifest/schema explicitly and document migration. Keep the simulator's scientific state separate from sprite choice: visuals consume available states and must never create measurements, diagnoses, location, or causality.

## 7. Immediate acceptance path

The next art task is a calibration set of individually authored rural pixel-art sprites (house, tree, Nelore, pasture tile), using the verified urban reference for finish and the approved rural V7 for content/scale. Review the source sprites first, then compose a dense cattle-farm test scene from those files. Existing whole-scene attempts are recorded as rejected, so they do not unlock the 46-ID planned kit or the precision-technology batch.

After the calibration scene passes, proceed in small family batches: core cattle poses; pasture/ground tiles and connectors; water/feed; fence/corral modules; rural buildings; vehicles; then technology and regional variations. Each batch repeats the same source, technical, visual, composition, and release gates.

### Completion reporting vocabulary

Use precise statements in task updates:

- “planned” means a specification/ID exists;
- “generated” means a source image exists, with provenance recorded;
- “technically validated” means named automated checks passed;
- “visually approved” means the exact revision passed human review;
- “composed” means actual files were assembled into a recorded preview;
- “released” means an approved package was built for a named consumer;
- “integrated” means the runtime consumes that released package and the integration was verified.

Never report a later stage based only on an earlier one.
