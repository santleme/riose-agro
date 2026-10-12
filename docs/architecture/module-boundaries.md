# Module boundaries

| Module | Owns | Must not own | Current implementation / boundary |
| --- | --- | --- | --- |
| Simulation Core | Time, deterministic execution, entity IDs, command/event ordering, snapshot lifecycle and metrics | UI, animal-specific equations, rendering, persistence backend | `engine.js` and `worker.js`; future Rust core starts with a pure batch kernel |
| Livestock domain | Animal state and domain transitions | DOM, pixels, network/storage | Animal records currently live inside `FarmEngine`; behavior/feed rules remain JS in this prototype |
| Scientific Models | Versioned equations and metadata for units, inputs, provenance, limitations and validation | Rendering and UI claims | Existing ADG/pasture case remains demonstrative and unvalidated |
| World System | Paddocks, world coordinates, topology, obstacles and scenario generation | Weight/energy equations and UI layout | Four pasture stocks and movement coordinates currently share the engine state |
| Visual Adapter / Renderer | Visual IDs, draw state, interpolation, culling, camera and asset resolution | Scientific calculations and authoritative model state | `app.js` canvas renderer; preserve current style/assets, evaluate PixiJS after parallel art review |
| Data Platform | Scenario inputs, reproducible results, imports/exports, provenance and retention | Animal model math | JSON, schemas, browser localStorage, local server; no database |
| Asset System | Asset manifests, IDs, variants, atlas layout, licensing and pipeline | Simulation state | Baseline artwork plus uncommitted V7 asset work in the `d99d` worktree |
| Hardware Adapters | Device-specific decode, clock sync, quality and observation ingestion | Direct mutation of model state without provenance | No runtime integration observed; design only when a device is selected |

## Dependency direction

Domain and scientific kernels depend on stable core value types, not the browser, PixiJS or storage. Adapters depend on those contracts. The app may depend on visual/data adapters; simulation core must not import app modules. Python tools exchange versioned files or batches and are not invoked per animal or per frame. No microservices are needed for these in-process modules.

## First cut boundary

The Rust crate provides clock, ID, seed, metrics, command/event and JSON snapshot primitives. These are reusable foundations, not a replacement for JS scenario orchestration or the existing farm snapshot schema.

The metabolism batch receives a packed array of four `f64` values per animal—weight kg, energy score, energy intake kg DM/hour, and resting flag—and writes two values—updated weight kg and energy score. ABI v1 is checked at initialization and errors are explicit status codes. Behavior choice, forage allocation, pasture depletion, feed-cost accounting, movement and activity logs stay in the JS engine. This boundary is narrow enough to compare results and replace the implementation without changing scenario or visual contracts.
