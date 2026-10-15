# Module boundaries

| Module | Owns | Must not own | Current implementation / boundary |
| --- | --- | --- | --- |
| Simulation Core | Time, deterministic execution, entity IDs, command/event ordering, snapshot lifecycle and metrics | UI, animal-specific equations, rendering, persistence backend | `src/client/engine.js` and `src/client/worker.js`; future Rust core starts with a pure batch kernel |
| Livestock domain | Animal state and domain transitions | DOM, pixels, network/storage | Animal records currently live inside `FarmEngine`; behavior/feed rules remain JS in this prototype |
| Scientific Models | Versioned equations and metadata for units, inputs, provenance, limitations and validation | Rendering and UI claims | Existing ADG/pasture case remains demonstrative and unvalidated |
| World System | Paddocks, world coordinates, topology, obstacles and scenario generation | Weight/energy equations and UI layout | Four pasture stocks and movement coordinates currently share the engine state |
| Visual Adapter / Renderer | Visual IDs, draw state, interpolation, viewport culling, camera and asset resolution | Scientific calculations and authoritative model state | `src/client/worker.js` transfers compact view buffers; `src/client/app.js` canvas resolves state to the preserved art and presentation |
| Shared Visualization Geometry | Renderer-independent projection and inverse projection for isometric grid coordinates | Scene ownership, assets, simulation state and camera policy | `src/client/visualization/isometric.js`; Product, Graphics PoC and Scenario Editor keep their own scene and renderer behavior |
| Scenario Editor | UI orchestration for grid-scene authoring, deterministic layout generation, prefab-aware validation, session undo, local scene storage and Canvas/Pixi adapter coordination | Product's irregular world data, simulation state and Product renderer behavior | `src/client/scenario-editor/` owns the Composer, layout model, scene validation, storage, Canvas scene renderer and session history; `public/assets/scenario-editor/index.html`, CSS and assets keep the static entry stable, while `composer.js` and `scene-layout.js` remain compatibility modules at their old URLs |
| Product Experience | Product-specific UI orchestration, farm scene composition, spatial layout and renderer adapters | Simulation rules, scientific equations and shared worker protocol | `src/client/product/` owns the Product app, versioned `scene.json`, spatial model, shared `scene-geometry.js`, Canvas `scene.js`, Pixi orchestration in `world-renderer.js`, static Pixi drawing in `static-world-renderer.js`, world contract and interaction; `schemas/product-world-scene.schema.json` defines the scene contract and CI validates it |
| Data Platform | Scenario inputs, reproducible results, imports/exports, provenance and retention | Animal model math | JSON, schemas, browser localStorage, local server; no database |
| Asset System | Asset manifests, IDs, variants, atlas layout, licensing and pipeline | Simulation state | Committed visual assets and the standalone Composer under `public/assets/`; approval remains tracked per asset |
| Hardware Adapters | Device-specific decode, clock sync, quality and observation ingestion | Direct mutation of model state without provenance | No runtime integration observed; design only when a device is selected |

## Dependency direction

Domain and scientific kernels depend on stable core value types, not the browser, PixiJS or storage. Adapters depend on those contracts. The app may depend on visual/data adapters; simulation core must not import app modules. Python tools exchange versioned files or batches and are not invoked per animal or per frame. No microservices are needed for these in-process modules.

## First cut boundary

The Rust crate provides clock, ID, seed, metrics, command/event and JSON snapshot primitives. These are reusable foundations, not a replacement for JS scenario orchestration or the existing farm snapshot schema.

The metabolism batch receives a packed array of four `f64` values per animal—weight kg, energy score, energy intake kg DM/hour, and resting flag—and writes two values—updated weight kg and energy score. ABI v1 is checked at initialization and errors are explicit status codes. Behavior choice, forage allocation, pasture depletion, feed-cost accounting, movement and activity logs stay in the JS engine. This boundary is narrow enough to compare results and replace the implementation without changing scenario or visual contracts.

Routine Worker ticks return compact, transferable view buffers; full, chronologically ordered snapshots are requested for save, compare, reset and load. The simulation processes the entire modeled herd, while the visual adapter owns camera-space interpolation, viewport visibility and asset selection. Camera, culling, frame rate and animation must not feed back into model rules or deterministic random streams. The interaction layer maps rendered hits to stable entity IDs and sends commands; the renderer does not write authoritative model state.

The initial asset library has a ceiling of 80 semantic visual sets. Variants, animation frames and state overlays belong to a reusable set and do not consume separate IDs. See [visual-asset-budget.md](visual-asset-budget.md).

The Product page remains at the repository root to preserve its public URL. Its implementation is grouped under `src/client/product/`; legacy module paths re-export from that directory while existing tools and downstream consumers transition. `scene.json` owns the Product's versioned farm layout, while `scene-layout.js` owns generated Composer layouts; they are distinct formats and have no lossless adapter between them yet. The generated Product renderer bundle remains at its existing output path so current world imports and build consumers keep working.
