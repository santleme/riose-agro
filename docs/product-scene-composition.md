# Product scene: spatial contract and blockout

## Asset audit

The runtime manifest at `public/assets/manifest.json` contains 10 atlases and
assets in the ground, agriculture, fencing, vegetation, water, buildings,
corral, livestock, vehicle, feed, and technology categories. The production
library's approval ledger is stricter: `assets/approved/README.md` lists only
the Nelore sprite as approved; the farmhouse, shed, pond, field, fence, and gate
PNG files are still review candidates. The blockout does not load or draw those
candidate atlases. Their IDs are reserved as future prefab bindings:

| Use | Existing manifest assets | Current blockout use |
|---|---|---|
| Terrain and soil | `grass-light`, `grass-mid`, `soil-dry`, `soil-damp` | Blockout ground is composed from canvas geometry, with a visible soil extrusion. |
| Roads | `road-straight`, `road-turn`, `road-rural-dirt-imagegen-v1` | Logical path-cell routes are connected ground geometry; no candidate road art is loaded. |
| Fences and gates | `fence-wire-wood-post-imagegen-v1`, `fence-gate-wood-imagegen-v1` | Each fence edge and gate opening is an independent vector geometry entity pending art approval. |
| Vegetation | `vegetation-tree-shade-imagegen-v1`, `shade-tree`, `fruit-tree`, `shrub` | Reusable `treeCluster` prefab is defined; there is no vegetation in this blockout. |
| Water | `water-pond-imagegen-v1`, `water-trough-round-imagegen-v1`, `water-reservoir-imagegen-v1` | Pond footprint uses a simple blue blockout surface, not the review PNG. |
| Buildings and handling | `building-farmhouse-imagegen-v1`, `building-shed-imagegen-v1`, `building-workshop-imagegen-v1`, `corral-wood-standard-imagegen-v1`, handling alley and chute assets | House and shed footprints use neutral blockout volumes; the working pen is its own zone. |
| Animals | `nelore-adult` is the approved asset; other listed variants remain in review | Live animals use the approved Nelore atlas frame as separate entities and keep their model IDs and patch fields. |
| Crops | `field-soybean-*`, `field-maize-*`, `field-irrigated`, `field-harvested` | Crop parcel uses simple row geometry until an art asset is approved. |
| Infrastructure | `silo`, vehicle assets, feed troughs, scale, gateway, reservoir | `service` prefab recipe is available for later additions. |

The audit report records atlas-frame resolution and manifest display dimensions
for those reserved candidates; for example, the farmhouse atlas frame is 547 ×
414 px with display size 172 × 128 px, and the pond atlas frame is 444 × 320 px
with display size 130 × 92 px. These values are for provenance/review only and
are not rendered in this blockout. The approved animal is displayed at 23 × 18
px. The runtime does not force `image-rendering: pixelated` on the scene canvas. Generic legacy 1 × 1
manifest footprints are retained as asset metadata, while explicit agricultural
prefab footprints define occupied world area for buildings, water, and crops.

`assets/` remains the production/review library (source, candidates, approved,
and modules); `public/assets/` supplies the published runtime atlases and
manifest. No new art was generated for this blockout.

## Canonical world geometry

`src/client/product/scene.json` is the versioned source of truth for the Product
world. `schemas/product-world-scene.schema.json` defines its shape, while
`src/client/product/spatial.js` retains the `PRODUCT_BLOCKOUT` compatibility
API and derives geometry consumed by the renderer, simulation mapping,
development editor, and validator. The world has
34 columns × 16 rows. A world unit is one logical **cell**; no metres-per-cell
conversion is assumed. The isometric tile basis is 26 × 14 render pixels with
origin (283, 32), but those pixel dimensions only project the cell grid and do
not define the scale of the simulated farm.

For world coordinate `(x, y)`, tile dimensions `(tw, th)`, and origin `(ox, oy)`:

```text
screenX = ox + (x - y) × tw / 2
screenY = oy + (x + y) × th / 2
```

`screenToWorld` is its inverse. `gridToWorld` and `worldToGrid` are explicit
snapping helpers. Entity data keeps these distinct values:

- logical position and occupied footprint in cells;
- manifest pivot/anchor and sprite display dimensions;
- collision metadata and placement rules;
- selection bounds derived from occupied footprint;
- pixel-space projection, which is recalculated for canvas size and DPR.

Objects snap to integer cells. Routes are cell-center graphs. Fences occupy
grid edges; gates replace one edge segment and must share an edge with their
zone. Rendering uses a painter sort on projected world depth. Paths and terrain
are below entities, while separate fence segments, structures, and livestock
are drawn as individual objects.

Physical overlap uses occupied footprints and configured physical clearances.
Visual proximity is reported separately, so a large sprite cannot silently
reserve physical space and a small collision hull cannot hide an occupied
footprint. The current blockout has no visual-proximity warnings.

## Reusable prefab recipes

The reusable recipes in `PRODUCT_PREFAB_RECIPES` cover:

1. `paddock`: pasture rectangle, patch index, edge fencing, and gate openings.
2. `farmstead`: farmhouse footprint and yard clearance.
3. `pond`: water footprint and shore clearance.
4. `barnCorral`: shed, separate holding pen, and corral gate.
5. `crops`: crop-field footprint and row zone.
6. `treeCluster`: deterministic cluster positions and approved variants.
7. `roadConnector`: connected route cells between zones and destinations.
8. `fenceBoundary`: one grid edge, optionally replaced with a gate.
9. `service`: asset selected by service role and a utility connection point.

## Blockout composition

The scene is planned before adding decorative assets. Four 6 × 4 paddocks form
a clear northwest herd block and preserve the simulator's patch order (NW, NE,
SW, SE). A farmhouse and a shed anchor the east service district. The pond is
above the work area; the crop parcel and dedicated working pen sit at its lower
edge. Main, south, yard, and crop connectors form one traversable network.
Four paddock gates align to their respective fence edges; the working pen has a
fifth gate aligned to its north fence. The footprint is a broad 34 × 16 island
with a visible soil side and no decorative tree layer yet.

The blockout is intentionally sparse: it is the geometry review requested
before assets and microdetails are restored. It is not a flattened scene image;
the terrain surfaces are canvas geometry and every structure, fence segment,
gate, route, pasture, and holding pen has its own entity ID and hit target.

## Animals and simulation

`patch-bounds.js` records the simulator's existing four patch rectangles and
confinement rectangle as compatibility frames; these are model coordinates,
not display pixels or a metres conversion. In pasture mode, normalized
simulator coordinates map only into the matching
patch, leaving `animal.x`, `animal.y`, and `animal.patch` unchanged. In barn
mode, the engine's separate confinement bounds map into the working pen. The
animal still carries its original patch assignment as source-state metadata.
The pen is a separate navigable area, not drawn over the shed footprint.

Crowded visual positions use stable ID-ordered placement with screen-space
separation constrained to the assigned pasture/pen. This changes only the
display position; selection, events, weights, action, and patch continue to
refer to the original animal record. Movement validation rejects invalid source
bounds, structure collisions, or a patch transfer that lacks an explicit
transfer operation. Gate geometry and path connectivity are checked before the
scene is drawn.

## Development editor and selection

Run `npm start` in development, then open `/tools/product-composer.html`. The
server returns that path only outside `NODE_ENV=production`, and Product does
not link to it. The editor shows the cell grid, footprints, path graph, gate
points, collisions in red, pointer coordinates, distance to the nearest
structure, and the live validation result. Dragging snaps structures to the
logical grid; the JSON export contains the complete composition.

Runtime hit testing uses separate selection geometry and resolves animals to
their own entities before scene entities. Selections dispatch the existing
`riose:agent-selected` and `riose:entity-selected` events used by the contextual
panel, timeline state, and world UI.

## Validation

Run:

```sh
node --test tests/product-spatial.test.js
node scripts/validate-product-blockout.mjs
```

The validator checks the scene schema before running spatial and asset checks.
Run it as `npm run validate:product-scene` from the repository root.

The generated report is `docs/product-scene-validation.json`. It records asset
source/display dimensions, footprint metadata, world scale contract, route and
gate counts, collision issues, and visual-proximity warnings. Acceptance tests
cover projection/inverse projection, manifest geometry, overlap and bounds,
connected path networks, gate alignment, animal patch/housing placement,
selection projection, editor exposure, and deterministic visual spacing.
