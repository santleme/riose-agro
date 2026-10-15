# Scene authoring and renderer formats

This inventory distinguishes the scene formats that meet at the visual layer. Similar subject matter does not make their geometry or authoring rules interchangeable.

| Flow | Authored format and owner | Persistence / validation | Main consumers |
| --- | --- | --- | --- |
| Product runtime farm | `src/client/product/scene.json`, schema `product-world-scene` v1.0.0 | Source JSON is checked by `validate:product-scene` in CI. | Product spatial model, Canvas scene, Pixi renderer and Product Composer. |
| Product Composer | Same Product-world v1.0.0 shape; edits structures within the fixed Product grid. | Opens a local JSON only when it matches the Product world/projection and passes the existing spatial/asset validation; downloads `scene.json` for review and replacement in source control. | Human-authored changes to the Product scene. It does not write to the repository from the browser. |
| Scenario Editor | Grid Composer v1 (`metadata`, `grid`, `layers`, `placements`, `zones`, `prefabInstances`, `visualGroups`). Generation and validation live in `src/client/scenario-editor/scene-layout.js`. | Saves drafts in browser localStorage; save/open supports JSON files with the Composer's own validation. | Standalone asset and layout authoring; the historical `public/assets/scenario-editor/scene-layout.js` path re-exports the source module. |
| Graphics Lab | Renderer-independent `visual-scene` v1.0.0, defined in `schemas/visual-scene.schema.json`. | Scene validation and screenshot/scene CI cover its current examples. Source adapters preserve exact source documents with digests. | Graphics PoC Canvas and Pixi renderers, simulation view adapters and benchmark workflows. |
| Main Composer and Ranch source adapters | Composer grid v1 and Ranch pixel-composition v4 are adapted to `visual-scene` v1.0.0 by separate adapters. | Adapter documents keep `authoredSource` and integrity digests. Unsupported data is reported; canonical edits cannot be restored to those source formats unless field mappings cover them. | Graphics Lab's renderer-independent scenes and workflows. |

## Data flow

```text
Product scene.json
  -> Product schema + spatial/asset validator
  -> Product spatial model
  -> shared projected geometry
  -> Canvas and Pixi adapters

Scenario Editor grid scene ──> main-composer adapter ──┐
Ranch pixel scene ────────────> ranch-source adapter ──┴─> visual-scene v1.0.0
                                                         -> Graphics Lab renderers
```

The Product scene describes a fixed farm world with an irregular terrain outline, connected route cells, gate edges, vegetation and operational structures. `visual-scene` describes a simulation-linked renderer view with assets, entities, zones and prefabs. The current `visual-scene` schema does not encode the complete Product world shape. A conversion must therefore preserve the Product source document and explicitly represent its unsupported geometry before it can be treated as a round trip.

`tools/product-composer` now reads and downloads the Product-world scene shape directly. The browser cannot write to `src/`, so review and source-control replacement remain explicit human steps.

## Next adapter decision

Do not convert the Product scene into `visual-scene` by dropping its outline, route cells, gates or vegetation. First define and validate any representation needed by a concrete consumer, then add a round-trip check against the authored source. Keep generated Composer layouts, Product world data and Graphics Lab's visual scene as distinct contracts until that mapping exists.
