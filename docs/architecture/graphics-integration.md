# Graphics, scene composition and progressive integration

## Recommendation

Keep Canvas 2D as the default and PixiJS 8 as an optional renderer adapter in the isolated `graphics-poc` app. Promote Pixi only if measurements on supported devices show a repeatable gain for real scenes at the same viewport. The app remains vanilla JavaScript; this PoC does not require React or TypeScript.

The PixiJS PoC uses `Application.init`, `Assets.load`, `Texture` atlas frames, containers for terrain/depth/overlays, and explicit application-level culling. Both renderers use sprite-rectangle intersection against the same CSS-pixel viewport; culling includes the Nelore sprite's maximum vertical motion envelope so renderer timing cannot change the visible set. Livestock has three visual LODs: near animals use the full Nelore image and per-frame motion, medium animals use a downsampled image and motion at about 9 Hz, and far animals are grouped into count markers. Each marker retains the stable IDs of its members, so selection can zoom into an animal while all animals remain in the Worker. The LOD layer only changes presentation and does not alter engine coordinates or state.

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
- Terrain fills are resolved from zone footprints; edge cells use declared transition assets.
- Zone edges add a one-cell terrain transition fringe, and seeded prefab distribution places shade trees with irregular spacing while checking blocking footprints.
- Fence runs use the source atlas orientation on one iso axis and horizontal mirroring on the other; segment spacing is bounded so each pasture reads as a connected enclosure with an explicit gate.
- Prefab placement snaps to cells and checks bounds, blocking collisions, allowed zone kinds, adjacency and row/column alignment when those rules are declared.
- The `Núcleo de ordenha` composition places an aligned dairy barn, parlor, tank and waiting pen as one validated group.
- The beef and dairy scenes use the same `visual-scene` JSON schema. Both remain editable, persist separately in browser storage and export as renderer-independent JSON.
- Worker animal coordinates are adapted to scene coordinates and rendered as a separate layer.
- Renderer, camera, zoom and asset visibility never mutate the Worker snapshot.
- Canvas and Pixi share the same scene, view data, camera, culling bounds, LOD policy and layer visibility.

The source environment atlas comes from d99d's runtime manifest; its individual entries remain review-state/approval-unknown. The only individually approved cattle sprite is `livestock.nelore.adult.idle.imagegen.v1`, with source hash and provenance in `graphics-poc/asset-sources.json`. The dairy scene integrates nine real sprites from d99d as `REVIEW` candidates and preserves their hashes and source paths. The dairy catalog remains `in-progress`, and the scene is a visual layout with no dairy simulation results.

## Measurement method

Run `npm run bench:graphics-poc` with the local app server available at `http://127.0.0.1:8000/`. It builds the bundle, opens local Chromium with WebGL enabled, starts a fresh Worker and seed per page, and measures Canvas 2D and PixiJS at 100, 1,000 and 10,000 simulated animals. Each renderer uses the same zoom, scene, visible area, culling rule and atlas frames. The report records frame interval mean FPS/p95, scene update/culling/sort time, render submission time, simulated and bounds-visible animals, LOD draw units and clusters, post-GC JS heap, one-hour Worker round-trip, asset load time and Pixi initialization time. Browser GPU memory is not exposed by the harness and is not inferred from JS heap.

The current two-repetition run is exploratory, not a performance sign-off. Repeat with 30+ samples and representative released assets on target devices before a production renderer decision. PixiJS batching and GPU rendering may help fill-bound scenes, while per-object culling, scene-graph mutation and depth sorting can increase CPU work.

## Integration sequence

1. Review and commit the d99d asset pipeline separately; do not cherry-pick its dirty working tree. Preserve the nine dairy art candidates as `REVIEW` until the visual review gate changes.
2. Choose one released visual manifest revision. Preserve semantic IDs and rights/review metadata; generate a renderer-specific graphics manifest at build time.
3. Integrate `visual-scene` as layout data alongside (not inside) existing farm snapshot and comparison manifest JSON.
4. Add a shared view adapter from Worker numeric arrays to stable entity IDs, domain visual state and world coordinates.
5. Let the existing Scenario Studio open or attach a scene layout without changing its scenario-comparison workflow.
6. Run renderer parity and performance benchmarks with released assets and real camera/zoom workloads.
7. If PixiJS wins on supported workloads, move one map surface at a time behind the renderer contract and retain Canvas as a fallback until regression coverage passes.
8. Keep the dairy layout available as a visual/editor fixture while the module is `in-progress`; connect dairy simulation outputs only after its scientific model has an explicit version/status and validation status.

## Known gaps

- The Graphics Lab is a first Composer path, not yet integrated into the main Scenario Studio.
- The current Canvas renderer uses a simple 2D world and the current engine positions are not native isometric world coordinates; the PoC adapts them for display only.
- The farm atlas asset statuses are not consistently represented in its runtime manifest. Production integration needs a manifest-status join/gate, not an assumption from atlas presence.
- `livestock-dairy` remains an unfinished visual/domain module and current FarmEngine is beef-oriented and demonstrative.
- There is one approved static Nelore image and no approved animation set. Its subtle bob and medium/far LOD changes are presentation effects, not modeled animal behavior.
