# Visual asset budget and simulation/rendering boundary

## Budget

The initial library has a hard ceiling of **80 reusable visual sets** across the product. The budget counts semantic archetype IDs in the shared asset registry, including candidates in review. It does not count PNG files, atlas frames, animation frames, color variants or state overlays as separate sets when they belong to an existing archetype.

One set can define a reusable base asset with:

- species, age, coat, equipment or season variants;
- animation states and their frames;
- permitted overlays, such as selection, thirst, health or operational status;
- anchor, logical footprint, draw layer and scale rules;
- source, license, review status and manifest metadata.

Reusing a set in another scenario or map does not consume another slot. A new slot is needed when the visual has a distinct silhouette, role, interaction or compositing behavior that cannot be expressed as a variant of the existing set. Count IDs, not files, and keep the counter in the canonical registry when the separate asset pipeline is integrated. Do not mark a candidate approved merely because it is present in an atlas.

These category allocations are planning ceilings, not requirements to fill every category. Teams may move slots among categories while keeping the total at 80.

| Category | Planning allocation |
| --- | ---: |
| Livestock archetypes | 20 |
| Terrain, vegetation and water | 18 |
| Fences, gates and paths | 10 |
| Buildings and farm facilities | 10 |
| Machinery and vehicles | 8 |
| Equipment and technology | 6 |
| Reusable props and decoration | 8 |
| **Total maximum** | **80** |

The budget controls semantic variety, not pixel quality. Prefer a smaller number of reviewed archetypes with coherent variants and animations. Keep high-resolution sources, atlas packing, texture dimensions and frame counts under separate technical budgets because they affect download and GPU memory even when they do not use a new semantic slot.

## Simulation and rendering remain independent

- The simulation advances every modeled animal and owns authoritative state, time, deterministic rules and events.
- The view packet contains the fields needed to display and select entities. The current Worker transfers packed position, weight and action buffers; it does not send a full snapshot on every tick.
- The renderer resolves semantic visual IDs to asset sets, interpolates movement, applies camera transforms and draws only entities in the visible area. Canvas culls entities outside camera bounds before interpolation and sprite draw; it still scans the herd to test bounds. At map-fit, all 10,000 animals may be visible, so zoom-aware LOD and far-herd clusters reduce individual draw units while retaining every stable simulation ID.
- Camera position, zoom, frame rate, asset availability and animation timing must not change simulation results or random streams.
- Input resolves a rendered hit to a stable entity ID and sends a command to the simulation. Rendering never writes model state directly.
- Asset manifests, atlases, style tokens and approval metadata stay in the Asset System. Neither the simulation engine nor scientific models import browser graphics libraries.

This boundary allows the model to process 10,000 animals while the view draws only visible sprites or aggregated visual representatives, and allows different renderers or low-detail modes without changing scientific calculations. A one-repeat headless map-fit sample at 10,000 animals produced 325 animal draw units and 40 far-herd clusters; it is exploratory and not a production performance guarantee. The existing `app.js` canvas and parallel asset pipeline remain the current presentation; this policy does not migrate or rewrite either one.

## Acceptance checks for a new set

1. Search for an existing archetype or variant before allocating a new ID.
2. Define its role, anchor, footprint, scale, layers and allowed state variants in the manifest.
3. Reuse approved style, provenance, licensing and technical-review gates from the asset pipeline.
4. Confirm the set remains readable at the map's common zoom levels and does not require duplicated full sprites for transient state changes.
5. Update the registry's used-slot count; reject additions above 80 until a set is consolidated or the budget is explicitly revised.
