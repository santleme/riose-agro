# Graphics, scene composition and progressive integration

## Recommendation

Keep the current Canvas 2D product path and the simulation Worker. Add PixiJS 8 behind a renderer adapter, first as the isolated `graphics-poc` app. Promote it only if Chromium measurements show a repeatable gain for real scenes at the same camera viewport and the asset package can be released. The app remains vanilla JavaScript; this PoC does not require React or TypeScript.

The PixiJS PoC uses `Application.init`, `Assets.load`, `Texture` atlas frames, containers for terrain/depth/overlays, and explicit application-level culling. The official PixiJS performance guide notes that culling is disabled by default and may hurt CPU-bound scenes, so both renderers use the same viewport and the benchmark records simulated and drawn animals separately. Render order is depth-sorted from isometric y; a small visual-only bob uses the approved idle Nelore sprite because the asset library does not yet provide an approved animation frame set.

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
- Terrain fills are resolved from zone footprints; edge cells may use declared transition assets.
- Prefab placement snaps to cells and rejects out-of-bounds or overlapping blocking footprints.
- Prefabs can be selected, positioned through palette tools, saved to browser storage and exported as scene JSON.
- Worker animal coordinates are adapted to scene coordinates and rendered as a separate layer.
- Renderer, camera, zoom and asset visibility never mutate the Worker snapshot.
- Canvas and Pixi share the same scene, view data, approved animal, atlas, camera and layer visibility.

The source environment atlas comes from d99d's runtime manifest but individual entries are still review-state/approval-unknown. It is included only to test real atlas loading and rendering. The only individually approved sprite used by the PoC is `livestock.nelore.adult.idle.imagegen.v1`, whose source hash and provenance are recorded beside the copied asset. No dairy art is presented as approved; the d99d dairy catalog is `in-progress`.

## Measurement method

Run `npm run bench:graphics-poc` with the local app server available at `http://127.0.0.1:8000/`. It builds the bundle, opens local Chromium with WebGL enabled, starts the same Worker and seed, and measures Canvas 2D and PixiJS at 100, 1,000 and 10,000 simulated animals. Each renderer uses the same zoom, scene, visible area, culling rule and atlas frames. The report records frame interval mean FPS/p95, scene update/culling/sort time, render submission time, simulated count, visible animal and sprite counts, post-GC JS heap, one-hour Worker round-trip, asset load time and Pixi initialization time. Browser GPU memory is not exposed by the harness and is not inferred from JS heap.

The first pass is exploratory, not a performance sign-off. Repeat with 30+ samples and representative released assets on target devices before a production renderer decision. PixiJS batching and GPU rendering may help fill-bound scenes, while per-object culling, scene-graph mutation and depth sorting can increase CPU work.

## Integration sequence

1. Review and commit the d99d asset pipeline separately; do not cherry-pick its dirty working tree.
2. Choose one released visual manifest revision. Preserve semantic IDs and rights/review metadata; generate a renderer-specific graphics manifest at build time.
3. Integrate `visual-scene` as layout data alongside (not inside) existing farm snapshot and comparison manifest JSON.
4. Add a shared view adapter from Worker numeric arrays to stable entity IDs, domain visual state and world coordinates.
5. Let the existing Scenario Studio open or attach a scene layout without changing its scenario-comparison workflow.
6. Run renderer parity and performance benchmarks with released assets and real camera/zoom workloads.
7. If PixiJS wins on supported workloads, move one map surface at a time behind the renderer contract and retain Canvas as a fallback until regression coverage passes.
8. Bring in the dairy visual module only after its catalog moves from `in-progress` through asset approval/release and its scientific model has an explicit version/status.

## Known gaps

- Main has a scenario comparison/replay Studio, not an interactive layout Composer. This PoC is the first editor path.
- The current Canvas renderer uses a simple 2D world and the current engine positions are not native isometric world coordinates; the PoC adapts them for display only.
- The farm atlas asset statuses are not consistently represented in its runtime manifest. Production integration needs a manifest-status join/gate, not an assumption from atlas presence.
- `livestock-dairy` remains an unfinished visual/domain module and current FarmEngine is beef-oriented and demonstrative.
- There is one approved static Nelore image and no approved animation set. Motion in this experiment is a subtle visual bob, not a claim of animal behavior animation.
