# Graphics, scene composition and progressive integration

## Recommendation

Keep Canvas 2D as the default and PixiJS 8 as an optional renderer adapter in the isolated `graphics-poc` app. Promote Pixi only if measurements on supported devices show a repeatable gain for real scenes at the same viewport. The app remains vanilla JavaScript; this PoC does not require React or TypeScript.

The PixiJS PoC uses `Application.init`, `Assets.load`, `Texture` atlas frames, containers for terrain/depth/overlays, and explicit application-level culling. Both renderers use sprite-rectangle intersection against the same CSS-pixel viewport; culling includes the Nelore sprite's maximum vertical motion envelope so renderer timing cannot change the visible set. Livestock has three visual LODs: near animals use the full Nelore image and update motion at up to 60 Hz, medium animals use a downsampled image with a distance-scaled cadence from about 30 Hz to 8 Hz, and far animals are grouped into count markers. Each marker retains the stable IDs of its members, so selection can zoom into an animal while all animals remain in the Worker. The LOD layer only changes presentation and does not alter engine coordinates or state.

## Contracts

`schemas/visual-scene.schema.json` is a renderer-independent scene contract. It contains:

- stable entity IDs and positions in grid-cell or world-meter units;
- simulation scenario ID, seed, population, production system and initial conditions;
- scientific module ID, version and status;
- 2:1 isometric grid dimensions;
- zones, their footprints, terrain IDs and optional transition IDs;
- semantic asset references resolved by a versioned manifest;
- prefab IDs, asset IDs, footprints, layer, state, rotation and blocking policy;
- stable event envelopes and optional versioned snapshot digest references.

The live Worker view uses three aligned transferable arrays: `animalIds` (`Uint32Array`), `animalValues` (`Float64Array`, stride 4: x, y, weight, initial weight) and `animalActions` (`Uint8Array`). The index in each buffer refers to the same stable engine ID. The renderer projects those values into scene space; it does not copy simulation animals into editable scene layout or write visual coordinates back to the engine.

The scene schema intentionally has no Canvas/Pixi names, atlas rectangles, texture objects, camera transform, GPU properties or frame timing. Existing farm snapshots and comparison manifests remain the reproducible simulation contracts; layout JSON is separate from both. Scene editing changes layout, not authoritative model state.

## Composer behavior in the PoC

- Isometric projection is 2:1 and exactly invertible for grid snapping.
- Beef and dairy layouts are reproducible adapters of the committed main Scenario Composer exports. The pinned source snapshots live under `graphics-poc/source/main-composer-v1/`; `scripts/build-composer-scenes.mjs` writes both scenes using `main-composer-adapter.js`.
- Both layouts preserve their 36×24 grid, 864 individually assigned terrain tiles and Composer provenance. Beef retains its source zones and 219 expanded prefab placements. The dairy adapter subdivides the two source pasture areas into four editable visual paddocks, adds 18 internal fence segments and two gates, and emits 247 prefab placements. Its 14 visual representatives remain linked to groups totaling 200 animals; beef keeps its Worker population as the sole operational animal source.
- Dairy's four paddock groups are a renderer-independent layout aid, not a rotational-grazing simulation: they do not model schedules, animal transfers, forage recovery or stocking decisions. The adapter assigns each representative to the subzone containing its position and places one east-paddock sample where the source export had no representative. Original Composer snapshots remain unchanged and rebuild the adapted scenes deterministically.
- Source terrain assignment is retained directly rather than reconstructed from zones. This preserves the Composer's detailed terrain distribution and prevents rebuilding transitions from erasing authored cells.
- Terrain sprites are drawn back-to-front by isometric depth, with screen-x as the stable tie-break for cells on one depth diagonal. This order is computed when a scene changes, not on every render refresh; the reproducible scene JSON and Composer-authored terrain sequence are unchanged.
- Worker coordinates are adapted into the Composer pasture and service zones for display. The renderer does not write these visual coordinates back to the simulation.
- The import preserves prefab IDs, composition provenance, rotation, footprints, blocking policy, zone types and semantic asset IDs. A schema test checks the imported outputs against the pinned source snapshots.
- Editor-created assets are canonicalized through the renderer manifest or the source asset registry on save/export. Legacy farmhouse, pond and feeding-tool IDs map to current semantic IDs; unmapped legacy art stays explicitly `UNRESOLVED`.
- Selected prefabs can rotate by 90° in the inspector; bounds, blocking collisions, zone containment and adjacency use the rotated grid footprint.
- Prefab placement snaps to cells and checks bounds, blocking collisions, allowed zone kinds, adjacency and row/column alignment when those rules are declared.
- The `Núcleo de ordenha` composition places an aligned dairy barn, parlor, tank and waiting pen as one validated group.
- The editor palette can add a corral, water/feed troughs, dairy barns and milking equipment, plus shared electronic-scale, gateway and traceability technology prefabs. Shared technology tools stay available in both production-system scenes; placements resolve through the renderer manifest and retain its review status.
- Far-herd count badges are compact, float above their representative sprite and use the same screen-space dimensions in Canvas and PixiJS, so they remain readable without covering the animal or growing with camera zoom.
- “Distribuir árvores” uses seeded loose clusters with a minimum separation rather than near-uniform blue-noise spacing. With the fixed scene seed, the two beef paddocks received 14 positions each; nearest-neighbor distance CVs were 0.33 and 0.24, versus 0.11–0.20 in the prior spacing rule. Placement remains deterministic and collision-checked.
- The beef and dairy scenes use the same `visual-scene` JSON schema. Both remain editable, persist separately in browser storage and export as renderer-independent JSON.
- The “Seleção e zonas” overlay draws grid-aligned, labeled pasture boundaries in Canvas and Pixi with screen-sized outlines and labels. Newly drawn paddocks paint their ground and transition ring into editable terrain tiles, leaving unrelated authored tiles unchanged.
- Worker animal coordinates are adapted to scene coordinates and rendered as a separate layer.
- Renderer, camera, zoom and asset visibility never mutate the Worker snapshot.
- Canvas and Pixi share the same scene, view data, camera, culling bounds, LOD policy and layer visibility.

The source assets are pinned to committed main revision `2a360cd60bfd3f98d598e12ad5774f5ff4bb8fb7`; each copied atlas's SHA-256 matches that revision. The renderer manifest joins source semantic records by ID and keeps each review status. In this snapshot, 28 entries are `REVIEW` and seven runtime terrain entries are `UNRESOLVED`; none is promoted by previewing. The separately used Nelore sprite keeps its existing approval provenance in `graphics-poc/asset-sources.json`. The dairy catalog remains `in-progress`, and its scene is a visual layout with no dairy simulation results.

## Measurement method

Run `npm run bench:graphics-poc` with the local app server available at `http://127.0.0.1:8000/`. It builds the bundle, opens local Chromium with WebGL enabled, starts a fresh Worker and seed per page, and measures Canvas 2D and PixiJS at 100, 1,000 and 10,000 simulated animals. Each renderer uses the same zoom, scene, visible area, culling rule and atlas frames. The report records frame interval mean FPS/p95, scene update/culling/sort time, render submission time, simulated and bounds-visible animals, LOD draw units and clusters, post-GC JS heap, one-hour Worker round-trip, asset load time and Pixi initialization time. Browser GPU memory is not exposed by the harness and is not inferred from JS heap.

To measure only atlas bytes and browser fetch/decode time, start the local server with `npm start`, then run `npm run bench:graphics-atlas-load` in another terminal. It checks SHA-256 against the current renderer manifest and makes three cache-disabled sequential loads per atlas in local Chromium. The versioned benchmark report records seven atlases totaling 17,309,191 bytes (16.507 MiB); per-atlas raw fetch/decode samples and review statuses are in [`docs/evidence/graphics-atlas-load-2026-10-12.json`](../evidence/graphics-atlas-load-2026-10-12.json). This loopback measurement is a development-host baseline, not a CDN/device estimate. The current `REVIEW` and `UNRESOLVED` assets remain unapproved, and the measurement does not compare renderers.

The synthetic culling/LOD/grouping microbenchmark is recorded in the shared report [`herd-visual-model-benchmark-2026-10.json`](../evidence/herd-visual-model-benchmark-2026-10.json). Its `layout` timings exclude FarmEngine, Canvas/Pixi, GPU draw, and asset work; they are not end-to-end renderer measurements.

The current results are exploratory, not a performance sign-off. With the imported 36×24 scene at map-fit zoom 0.28 and 10,000 simulated animals, a two-repeat headless run accounted for all 10,000 as visible and reduced them to 325 animal draw units (40 far clusters). It measured median 83.7 FPS Canvas / 60.0 FPS Pixi, 33.4 ms / 16.7 ms frame p95, 2.7 MB / 7.2 MB post-GC JS heap, and 43.0 ms / 53.8 ms Worker round-trip. A separate close-up run centers on stable animal #1; at zoom 3.2 it showed 771 of 10,000 animals, culled 9,229 and represented the visible set in 435 draw units. LOD distance is measured from the viewport center in screen pixels, so camera panning does not change an animal's tier by itself. Both are short headless samples; repeat with 30+ samples and released assets on target devices before a production renderer decision. PixiJS batching and GPU rendering may help fill-bound scenes, while per-object culling, scene-graph mutation and depth sorting can increase CPU work.

## Integration sequence

1. Reuse the committed asset pipeline and Composer scenes from main revision `2a360cd60bfd3f98d598e12ad5774f5ff4bb8fb7`; verify atlas hashes and source manifest status. Preserve review candidates as `REVIEW` until the visual review gate changes.
2. Choose one released visual manifest revision. Preserve semantic IDs and rights/review metadata; generate a renderer-specific graphics manifest at build time.
3. Integrate `visual-scene` as layout data alongside (not inside) existing farm snapshot and comparison manifest JSON.
4. Add a shared view adapter from Worker numeric arrays to stable entity IDs, domain visual state and world coordinates.
5. Let the existing Scenario Studio open or attach a scene layout without changing its scenario-comparison workflow.
6. Run renderer parity and performance benchmarks with released assets and real camera/zoom workloads.
7. If PixiJS wins on supported workloads, move one map surface at a time behind the renderer contract and retain Canvas as a fallback until regression coverage passes.
8. Keep the dairy layout available as a visual/editor fixture while the module is `in-progress`; connect dairy simulation outputs only after its scientific model has an explicit version/status and validation status.

## Known gaps

- The V2 Graphics Lab remains a separate PoC rather than the main product editor. Its adapter now provides a reproducible bridge to main's compact diorama Composer at `public/assets/scenario-editor/`; the two runtime contracts still differ.
- The current Canvas renderer uses a simple 2D world and the current engine positions are not native isometric world coordinates; the PoC adapts them for display only.
- The farm atlas asset statuses are not consistently represented in its runtime manifest. Production integration needs a manifest-status join/gate, not an assumption from atlas presence.
- `livestock-dairy` remains an unfinished visual/domain module and current FarmEngine is beef-oriented and demonstrative.
- There is one approved static Nelore image and no approved animation set. Its subtle bob and zoom/distance LOD changes are presentation effects, not modeled animal behavior.
