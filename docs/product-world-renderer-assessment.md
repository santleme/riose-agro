# Product world renderer: research and implementation assessment

**Date:** 2026-10-14
**Scope:** the current Product farm renderer and the isometric game reference supplied in the conversation.

## Finding

The supplied screenshot is evidence of an isometric, tile-based scene, but it is not enough to identify the exact engine or authoring tool. The useful pattern to reproduce is the scene structure: a ground tile layer, paths and terrain overlays, placed props and buildings, characters, and a deliberate depth order. It is not evidence that the reference uses Unity, Godot, Phaser, or any other particular stack.

The repo already has a suitable web renderer: PixiJS 8, bundled for Product and running with WebGL. The Worker owns simulation state; the Pixi renderer projects that state into a canvas and emits stable entity selections. That boundary is sound. The larger structural problem is duplicated rendering/composition code: Product has a bespoke renderer while Graphics Lab and Scenario Composer already have richer Pixi renderers, layered scenes, atlas handling, placements, terrain cells, and auto-tiling logic. Product's `PRODUCT_BLOCKOUT` is now loaded from the versioned `src/client/product/scene.json` and validated by `schemas/product-world-scene.schema.json`; it remains a separate scene representation until a lossless adapter to the broader visual scene contract exists.

## What the research says

There are two different jobs in this kind of interface: **authoring the scene** (laying out terrain, roads, fences, buildings, objects and their metadata) and **rendering/interacting with it in the browser** (camera, depth order, animation, selection). Established tools often separate those jobs instead of implementing both in one custom drawing loop.

| Tool / approach | What its primary documentation confirms | Fit for Riose |
| --- | --- | --- |
| **Tiled + JSON** for authoring | Tiled supports projected isometric maps, tile/object/image/group layers, configurable draw order, tilesets and custom metadata. Its terrain brush connects edges and corners, and Automapping applies repeatable placement rules. Phaser documents loading Tiled JSON and rendering isometric tile layers. | Strong option if we want a dedicated map editor and author-authored terrain. But it introduces another scene format that must be adapted to Riose entity IDs, zones and atlas manifest. |
| **PixiJS** for browser rendering | PixiJS provides the renderer and scene graph; its containers support transforms and ordered drawing via `zIndex`/sorting. Its current renderer docs mark WebGL as stable/recommended and WebGPU as experimental. | Best fit to keep: PixiJS 8 is already in `package.json`, Product uses it, and Graphics Lab already has camera, atlas, terrain, culling and interaction code. PixiJS itself is a renderer, so the project still needs an explicit scene format/editor. |
| **Phaser** for browser game runtime | Phaser documents isometric tilemaps, camera handling and isometric tile culling; its Tiled workflow is JSON map + tileset + tile layers. | Technically capable, but replacing Pixi would duplicate browser runtime and camera/scene code while Product's real UI and simulation are already wired to Pixi/Worker. Worth reconsidering only if the product becomes a conventional game runtime. |
| **Godot** for full 2D game authoring/runtime | Godot's TileSet/TileMapLayer workflow supports isometric tiles, painting maps, large tile layers and Y sorting. | Good when the game/editor is the product. It implies moving or embedding a second app/runtime, and is disproportionate for a map inside the existing web Product. |
| **Unity** for full game authoring/runtime | Unity's isometric Tilemap guidance uses dedicated grids and custom transparency sorting so objects farther back render before objects in front. | Also viable for a standalone game; costly integration and deployment change for this embedded web interface. |
| **C++ + Emscripten/WebAssembly** | Emscripten compiles C/C++ to WebAssembly and supports JavaScript bindings; it can also target WebGL through OpenGL ES. | Useful if the simulation later proves CPU-bound or if a portable C++ model is required. It does not replace browser scene authoring, sprite composition, camera or hit testing, so it is not a reason by itself to add a second rendering runtime. |

The research did **not** establish Simile's implementation stack. Its public article describes the what-if simulation concept and model validation, but does not identify a rendering engine or scene authoring tool. The screenshot alone cannot identify that either. So any claim that the reference uses a specific engine would be guesswork. What can be compared reliably is the visible design pattern: build a scene from authored ground, terrain transitions, paths and placed sprites; then provide a separate camera and interaction layer.

The Simile source is about its model inputs and confidence/validation process, not a game renderer. It says the product combines observed behavior with surveys, interviews and experiments, and validates simulations against real outcomes. That supports the decision-exploration flow, but gives no basis for copying its UI technology. This is a meaningful research result: the implementation recommendation below comes from the repository and engine documentation, not an invented attribution to Simile.

The supplied city image is consistent with an isometric 2D tile scene: a diamond-shaped ground plane, connected road/terrain artwork, placed buildings and props, and sprites sorted by their ground contact. This is a visual classification, not a claim about the source game's engine. Riose's farm sprites use a different painted 2.5D style, so copying that city look requires a coherent farm tile kit; choosing an engine alone cannot turn the current art into pixel art.

The supplied earlier Product capture shows three separate defects in our own scene: one oversized/cropped cow sprite, fences crossing because a perspective fence illustration was rotated like a flat line segment, and a uniform rectangular green board. Those are defects in our implementation and composition; the reference image does not explain how to fix them. A later capture shows the continuous fence runs and irregular island contour, but also revealed tree ground contacts outside the contour. Those placements have now been moved inside and covered by a geometry test.

This is the practical workflow shown by the official authoring/runtime documentation: author reusable terrain and layers in a map tool when hand-editing is valuable; export a data representation; let a rendering runtime load it; compute depth and camera behavior there; keep application-specific simulation state outside the visual map. For Riose, that should mean **a stable visual scene whose IDs refer to model entities**, with camera/animation remaining presentation-only.

## Mapping that research to this repository

This project already contains most of that pipeline, but in separate, overlapping implementations:

- `src/client/scenario-editor/scene-layout.js` creates/validates deterministic farm layouts, layers, zones, placements and isometric projection. `composer.js` is the scene composer around it.
- `graphics-poc/contract.js` already has isometric projection/unprojection, terrain-cell expansion/sorting, zone painting, visual LOD and coordinate mapping from simulation positions. `graphics-poc/app.js` is its Pixi runtime, including camera, atlas frames, terrain/props/animals, culling and input.
- `src/client/product/spatial.js` and `src/client/product/world-renderer.js` introduce a third Product-specific scene representation and renderer.
- `package.json` lists `pixi.js` 8.22; it does not list Phaser or an embedded Godot/Unity runtime.

This means the research changes the recommendation from “pick an engine and build a renderer” to “choose one scene contract and adapt the existing Pixi runtime.” Specifically, reuse proven projection/terrain/asset logic and extract a Product-facing renderer interface from Graphics Lab; do not import its whole editing UI. Keep the Worker authoritative for simulation values and stable entity IDs. Tiled is an authoring-tool decision, not a replacement for the renderer: adopt it only if product/design needs to compose maps visually more often than the existing composer supports.

The supplied farm image also exposes a specific scene bug. `fence-wire-wood-post-imagegen-v1` is one 416×299 frame containing four posts and three rail bays; the atlas assigns a 92×58 display size and only 90-degree rotation modes. Its review status is `REVIEW`. The old Product fallback placed rails and posts on every one-cell edge, producing dense rectangular frames. A Pixi experiment with the complete multi-post illustration still crowded the paddocks: its baked isometric perspective is not a reusable one-cell edge tile, and mirroring it does not produce a reliable second axis. Correct construction is to model continuous boundary runs, subtract gate openings, and render each rail continuously with posts deduplicated at vertices. Keep the asset's review state unchanged and reserve it for an authored prefab unless new direction-specific fence pieces are reviewed.

The sprite catalog is a constraint, not a set of interchangeable tiles. The grass assets are small 2.5D chunks with visible soil edges; farmhouse, shed, pond and trees are detailed cutouts with their own baked bases. Several of these records are `REVIEW` or `UNRESOLVED`. The scene leaves approval states unchanged. It lacks the coherent edge/corner/transition set that the city reference's seamless ground construction suggests; this pass therefore keeps one continuous procedural ground and draws the pond and crop rows as site features on it instead of stamping their atlas dioramas as separate platforms.

## Defect map

| Finding | Evidence in the current code | Confidence |
| --- | --- | --- |
| The Manifesto was compositing two different maps over each other | `manifesto-world.js` first called `drawProductFarm()` (ground, fences and placeholder structures), then painted the farmhouse, shed, pond, field, and trees again with independent hard-coded coordinates and dimensions. | High; this directly explains oversized/cropped layers and the visual mismatch in the attached Manifesto capture. |
| Fence pieces can overlap and read as crossing frames | The renderer places a multi-post fence sprite for every single grid edge, then rotates that isometric illustration by `atan2` as if it were a flat line. The fence atlas frame contains several posts and perspective already. | High |
| Scene composition is hard to tune | Terrain, paths, paddocks and props are generated in separate code paths; trees were a list of coordinates in the renderer instead of placements in scene data. Tree placements now live in `PRODUCT_BLOCKOUT.vegetation`. | High |
| Several scene/rendering systems exist without one Product-facing contract | `graphics-poc/contract.js`, the Scenario Composer's scene layout/renderer, and Product's renderer each handle scene geometry and rendering separately. The Composer schema and adapter already provide layers, placements, terrain cells, IDs, and asset references. | High |
| Depth sorting is only an approximation | Pixi sorts by `zIndex`, while sprites use screen Y and hand-added offsets. Large objects have footprints, but the renderer does not sort by the footprint's ground contact point and footprint overlap together. | High |
| It does not yet have the tilemap construction style in the reference | The map currently has a single polygon ground surface, not connected terrain tiles with authored variation and layers. | High |
| Existing art cannot exactly match the reference image | The current farm sprites are painted, high-detail 2.5D cutouts; the reference is pixel-art-like. Reusing their positions and scene organization is possible, but matching its art style requires a coherent new/converted tile set. | High for the visible mismatch; medium for the exact style requirements. |
| Exact engine used in the reference | A screenshot contains no reliable runtime or asset metadata. | Low / unknown. |

## Stack recommendation

For this project, keep **PixiJS 8 + WebGL + the existing Worker/model**. Pixi is already integrated into the DOM Product, supports a scene graph and ordered layers, and its documented stable production renderer is WebGL. Its current documentation lists WebGPU as experimental and Canvas rendering as coming soon. The Product fallback is a separate application Canvas renderer, so it should be tested as its own path rather than described as a Pixi Canvas backend.

Do **not add Tiled yet**. The repo already has an authored scene model and editor in Scenario Composer, plus the Graphics Lab's terrain ordering, atlas frames, camera, culling, and herd presentation. A second map format would duplicate layers and asset references before we have unified the existing scene contract. The better next step is to adapt the existing scene format/renderer path for Product and keep the Worker authoritative for animal/model state. Tiled JSON remains a reasonable import/export option if external map editing becomes a concrete need; its isometric layers and object groups are a good standard, but they do not solve the current renderer duplication by themselves.

If this were a new game application with scenes, physics, input systems, and editor workflows, Phaser is a reasonable browser-game engine: its tilemap layer documentation covers isometric maps and camera culling. Switching the existing Product to Phaser now would duplicate scene/camera ownership and require re-integrating its UI and model events. Godot or Unity make sense if the project becomes a standalone game and needs their full editors/export pipeline; they are a larger fit for an embedded page. C++ is not a visual engine choice: it can compile to WebAssembly via Emscripten, but this small map and current simulation do not justify a second runtime for rendering.

## What changed in this pass

Tree placements have moved from a renderer-only array into `PRODUCT_BLOCKOUT.vegetation`, with stable IDs and asset IDs. Ground cells now derive deterministically from the managed zones, use the existing `grass-light` / `grass-mid` atlas tiles, and are drawn only inside those zones; this keeps atlas detail from turning the entire island into noisy carpet. The renderer consumes these scene-derived tile records. This does not change Worker state, asset approval statuses, or simulation behavior.

The one-cell fence stamping is replaced with continuous runs, split at gate openings. Both renderers consume the same run geometry; Pixi and Canvas draw connected rails and deduplicate posts at shared vertices. The multi-post fence asset remains in the catalog with status `REVIEW`, but is not used to construct every paddock edge because its baked perspective makes the map visibly incorrect. No asset review statuses changed.

The rectangular extruded slab is also removed. Both Pixi and Canvas now draw the same irregular world perimeter with a transparent page background, so the farm reads as a landform rather than a square board. The perimeter is scene geometry; it does not alter pasture bounds or model state. A fresh desktop browser capture confirms that the current Pixi renderer loads the irregular perimeter and sprites.

Two selection defects were then fixed. Tree picking referenced an undefined `TREE_POINTS` symbol and could throw while hovering/clicking the map; it now tests the same stable-ID vegetation placements used to draw the trees. Animal picking used a 19-pixel radius even though the scaled sprite is roughly 27×21 logical pixels, allowing cows to steal clicks from pasture space; selection now follows the sprite bounds and asset anchor. A new test also ensures the decorative tree ground contacts stay within the island polygon. The focused renderer tests pass 8/8 and the full repository suite passed 608/608.

The attached Manifesto capture exposed a separate compositing error. `manifesto-world.js` called the hand-drawn Canvas `drawProductFarm()` scene and then painted the atlas buildings, pond, crop block, and trees over that scene using a second set of hard-coded positions/scales. This both repeated the same world content and made sprite depth/size disagree with the map. The page now mounts the same `createProductWorldRenderer()` scene used by Product, seeds it with a small illustrative herd, disables input, and draws each scene element once. It does not start a Worker or present simulated outputs as live on the Manifesto. The wrapper background is transparent.

The next browser comparison found another source of the disconnected-world effect: the pond and growing soybean atlas frames contain complete soil-and-grass pads, so positioning them on top of a continuous island still leaves visible miniature platforms. The renderer now draws those two features directly on the shared land surface (pond bank/water, and crop rows) and textures the whole island with deterministic, restrained grass marks. A trial that tiled the existing grass atlas across the whole island was rejected after a capture showed strong checkerboard seams. The final capture is [riose-manifesto-continuous.png](/tmp/riose-manifesto-continuous.png). This makes the terrain continuous, but does not make the illustration style or asset density equivalent to the pixel-art city reference; that requires modular, compatible art. No sprite approval statuses changed.

The desktop and narrow captures of the unified Manifesto composition are [riose-manifesto-final-desktop.png](/tmp/riose-manifesto-final-desktop.png) and [riose-manifesto-final-mobile.png](/tmp/riose-manifesto-final-mobile.png). The latest ground-composition captures are [riose-manifesto-continuous.png](/tmp/riose-manifesto-continuous.png) and [riose-manifesto-continuous-mobile.png](/tmp/riose-manifesto-continuous-mobile.png); the map remains legible on the narrow viewport, though necessarily smaller than desktop. The desktop DOM confirms `data-renderer="pixi"`, one `#product-world-pixi` canvas, `tabindex="-1"`, and disabled pointer input. Blocking the asset manifest in the browser confirms Product falls back to the visible 2D map canvas when the Pixi renderer cannot load required assets. The no-WebGL-specific path is still unverified: browser flags and an attempted context override did not prevent Pixi initialization, so they were not counted as passes.

## C++ and current runtime audit

The production UI is JavaScript/HTML/CSS with PixiJS 8 for the Product canvas and a Web Worker for the model. The production `scripts/build-wasm.sh` compiles the `riose-core` Rust crate to `wasm32-unknown-unknown`. This repository has a C++ metabolism kernel in `experiments/cpp-metabolism`, linked into a Rust benchmark harness for parity and timing; that experiment explicitly does not time FarmEngine, Worker messaging, UI or rendering. It is not the Product runtime. Emscripten would make a C++ module callable from JS/Wasm, but that is a runtime choice for model code, not a scene authoring or sprite-composition solution. No rendering profile currently motivates it.

The Product renderer in this pass is still a Product-specific adapter and scene blockout. The Manifesto now reuses it, but it does **not yet** satisfy the architectural part of the plan that promotes the Graphics Lab renderer behind a shared Product-facing interface. Graphics Lab and Scenario Composer already have richer but separate scene contracts; replacing the current adapter with a shared one remains the main integration task. This distinction is recorded rather than claiming the renderer architecture is unified.

## Recommended vertical slice

1. Select the existing canonical scene contract shared by the Scenario Composer / Graphics Lab as the Product map source; stop extending a second independent blockout format.
2. Build the Product Pixi adapter from scene layers, terrain cells, zones, placements, and stable IDs; sort sprites by ground contact and footprint, with selection UI in its own overlay layer.
3. Keep only useful terrain variation in the current atlas and document missing X/Y fence art and other style gaps without changing asset review states.
4. Keep hit metadata mapped to stable Product/Worker IDs; camera and decorative animation stay outside simulation state.
5. Compare desktop, narrow viewport, and Canvas fallback captures; then exercise configure → advance → save → compare before calling the world complete.

## Confidence assessment

These are engineering confidence estimates based on the screenshot, source code, documented tool behavior, and the current asset catalog. They are not statistical probabilities.

| Outcome | Confidence | Evidence / remaining work |
| --- | ---: | --- |
| Remove the broken double-composition on the Manifesto | **95%** | The old source duplicated the base map and separately overlaid the props. The page now mounts one Pixi scene; desktop/narrow captures show one canvas and the oversized/cropped sprite is gone. The current asset style still differs from the city reference. |
| Identify and remove the crossed-frame fence defect | **95%** | The atlas frame and metadata, old one-cell drawing loop, and browser captures all agree. Continuous gate-aware runs now render in both Pixi and Canvas. |
| Build a stable interactive isometric farm with the current web stack | **70%** | Desktop Pixi capture and automated scene/selection tests are available; earlier browser clicks selected paddock/tree/structure, and the animal picking bound now has a focused test. Fresh narrow-viewport, current pointer and Canvas fallback evidence are missing; renderer consolidation is incomplete. |
| Match the supplied pixel-art city style using the current farm assets | **20%** | The current catalog is painted 2.5D farm art rather than a cohesive pixel-art tileset. No engine switch can close that art gap. A new, reviewed tile kit would materially raise this estimate. |
| Gain a practical rendering benefit from C++ in this page | **10%** | There is no measured rendering/model bottleneck. C++ through Emscripten is possible, but the UI still needs JS/HTML integration and the existing Worker already owns simulation state. Reconsider only after profiling or a requirement to port a C++ model. |

## Primary references

- [Simile: Building the What-If Machine](https://www.simile.com/blog/what-if-machine) — their public explanation of the product, with no disclosed rendering stack.
- [Tiled: introduction](https://doc.mapeditor.org/en/stable/manual/introduction/) and [layers](https://doc.mapeditor.org/en/latest/manual/layers/) — isometric maps and layer composition.
- [Tiled: using terrains](https://doc.mapeditor.org/en/latest/manual/terrain/) and [automapping](https://doc.mapeditor.org/en/latest/manual/automapping/) — connected terrain and repeatable placement rules.
- [Tiled: JSON map format](https://doc.mapeditor.org/en/stable/reference/json-map-format/) — map export structure.
- [Phaser: Tiled map workflow](https://docs.phaser.io/phaser-editor/scene-editor/game-objects/tilemap-object), [isometric tilemap API](https://docs.phaser.io/api-documentation/3.88.2/class/tilemaps-tilemap), and [cameras](https://docs.phaser.io/phaser/concepts/cameras) — browser runtime alternative.
- [PixiJS: scene graph/render order](https://pixijs.com/8.x/guides/concepts/scene-graph) and [renderer support](https://pixijs.com/8.x/guides/components/renderers) — current repo runtime.
- [Godot: Using TileSets](https://docs.godotengine.org/en/stable/tutorials/2d/using_tilesets.html) — isometric tile authoring and Y-sort.
- [Unity: isometric tilemaps](https://docs.unity3d.com/es/2018.4/Manual/Tilemap-Isometric-CreateIso.html) — isometric creation and custom sort axis.
- [Emscripten: compiling to WebAssembly](https://emscripten.org/docs/compiling/WebAssembly.html), [C++/JavaScript interoperability](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/index.html), and [OpenGL/WebGL support](https://emscripten.org/docs/optimizing/Optimizing-WebGL) — C++ option if a measured compute need emerges.
- [SDL3: Emscripten](https://wiki.libsdl.org/SDL3/README-emscripten) — a lower-level C/C++ route to browser WebAssembly/WebGL; it still leaves map authoring, sprite layout, depth order, UI integration and input behavior to the application.
