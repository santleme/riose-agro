# Product farm scene: asset audit and composition

## Asset library and runtime

`assets/` remains the reviewable source library: `source/` has originals, `candidates/` has isolated generated items, `approved/` has accepted sprites, `atlases/` and `manifests/` organize the library, and `modules/livestock-dairy/` packages a separate dairy set. Its library manifest describes 47 entries.

`public/assets/` is the runtime distribution. Its manifest exposes 76 sprite IDs through 10 atlases, with frame rectangles, anchors, footprints, layers, allowed zones, and placement hints. The product scene loads these published frames; it does not draw a full-farm image.

| Scene group | Library/runtime examples | Composition use |
| --- | --- | --- |
| Terrain and ground | `grass-light`, `grass-mid`, `soil-dry`, `soil-damp`; `pasture.grass.medium.tile-01`, `pasture.grass.native.imagegen.v1`, `terrain.soil.dry.imagegen.v1`, `terrain.mud.imagegen.v1` | Ground cells and meadow/soil variation |
| Fences and gates | `fence.wood.modular.straight.ne.v1`, `fence.wood.gate.closed.ne.v1`, `fence.wire.wood-post.imagegen.v1`, `fence.gate.wood.imagegen.v1` | Grid-edge boundaries, gates and corral edges |
| Trees and vegetation | `shade-tree`, `fruit-tree`, `shrub`, `vegetation.tree.shade.imagegen.v1` | Orchard clusters, shelter rows, pond banks and edge dressing |
| Water | `water.pond.imagegen.v1`, `water.trough.round.imagegen.v1`, `water.reservoir.imagegen.v1`, `water.trough.cattle.galvanized.01` | Selectable pond, pasture trough and service water |
| Buildings and corrals | `building.farmhouse.imagegen.v1`, `building.shed.imagegen.v1`, `building.workshop.imagegen.v1`, `corral.wood.standard.imagegen.v1`, handling chute and alley | Farmstead, barn yard and cattle handling |
| Roads and paths | `road.rural.dirt.imagegen.v1`, `road-straight`, `road-turn` | Curved route connectors layered over terrain cells |
| Agriculture | `field-prepared`, soybean and maize growth stages, `field-harvested`, `field-irrigated` | Crop blocks, growth variation and field boundaries |
| Animals | Approved Nelore idle sprite plus Nelore, Angus, crossbred and dairy sprites | Separate moving herd entities, selected by animal ID |
| Vehicles and props | Tractor, pickup, livestock truck, feeders, scale, reader, ear tag, gateway and monitor station | Service yard, feeding, handling and traceability details |
| Dairy module | Four dairy animal sprites, barn, parlor, waiting pen, chilling tank and activity collar | Reusable dairy-specific scene kit; kept separate from the beef demo composition |

## Isometric map rules

- Tile dimensions: 32 × 16 logical pixels, with a 2:1 diamond projection.
- Grid: 20 columns × 12 rows. `(0,0)` is the far corner at `(224,30)` in the 576 × 336 scene canvas.
- Projection: `screenX = originX + (col − row) × 16`; `screenY = originY + (col + row) × 8`.
- Ground is a cell map. Cell tops use published grass frames clipped to their diamond; roads and crop states are overlays, while water, fences, structures, trees and machinery stay separate sprites/entities.
- The land mass has a soft shadow, a layered soil skirt on exposed south/east edges, and a fine top rim. No farm-wide bitmap is used.
- Tile cells snap to whole cells; object anchors use half-cell snapping and fence edges snap to cell boundaries. Simulated cattle keep continuous positions and project into the pasture grid.
- Painter order is far-to-near by `col + row`; fences, props and moving cattle share this depth queue. The soil faces render below the ground surface.

## Prefabs and composition

`src/client/product-scene.js` defines the reusable recipes and their instances:

- **Pasture block:** grass cells, one pasture zone, wire boundaries and a gate. Four blocks form two loose pairs for herd movement.
- **Farmstead block:** farmhouse, workshop, fruit trees and shade at the edge of the yard.
- **Pond block:** pond sprite and planted banks.
- **Barn/corral block:** cattle shed, handling corral, hay feeder and gate.
- **Crop block:** adjacent soybean and maize plots with separate stage sprites.
- **Tree cluster:** shade trees, fruit trees and lower shrubs with deterministic offsets.
- **Road/path connector:** curved dirt routes linking pasture, yard, pond and handling areas.
- **Fence boundary:** a snapped wire run or an individual gate segment with its own hit target.
- **Service block:** silo, water reservoir and herd-monitor antenna.

This layout makes the livestock area read first, then leads along the service road toward the farmstead and water. The handling yard sits at the route junction, with crop plots on the front edge. Ground color shifts are subtle; gates, paths and fence runs identify zones without outlining every tile.

## Interaction wiring

`productFarmEntityAt()` resolves object bounds, fence segments, pasture cells, crop cells and road cells. `pointermove` drives the hover highlight and cursor; `pointerup` first checks moving cattle, then selects the farm entity. Animal selection keeps the simulator's animal ID and timeline behavior. Selecting another object dispatches `riose:entity-selected` with its ID/type/name and current pasture/config state, which opens the existing contextual panel. `riose:agent-selected` keeps the animal detail panel; the chat and timeline remain connected to live simulation state.

The 47-entry review manifest also contains these exact IDs:

- **Buildings:** `building.farmhouse.imagegen.v1`, `building.shed.imagegen.v1`, `building.workshop.imagegen.v1`.
- **Corral and handling:** `corral.wood.standard.module-01`, `corral.wood.standard.imagegen.v1`, `handling.chute.cattle.imagegen.v1`, `handling.alley.cattle.imagegen.v1`.
- **Feed:** `feed.trough.supplement.wood.01`, `feed.trough.hay.imagegen.v1`, `feed.salt.roofed.imagegen.v1`.
- **Fence:** `fence.wood.modular.straight.ne.v1`, `fence.wood.gate.closed.ne.v1`, `fence.gate.wood.imagegen.v1`, `fence.wire.wood-post.imagegen.v1`.
- **Road / infrastructure:** `road.rural.dirt.imagegen.v1`.
- **Livestock:** `livestock.nelore.adult.idle.ne.v1`, `livestock.nelore.adult.walking.ne.v1`, `livestock.nelore.adult.grazing.ne.v1`, `livestock.nelore.calf.idle.ne.v1`, `livestock.nelore.adult.idle.imagegen.v1`, `livestock.nelore.cow.idle.imagegen.v1`, `livestock.nelore.calf.idle.imagegen.v1`, `livestock.nelore.heifer.idle.imagegen.v1`, `livestock.nelore.bull.idle.imagegen.v1`, `livestock.angus.cow.idle.imagegen.v1`, `livestock.crossbred.cow.idle.imagegen.v1`.
- **Pasture / soil:** `pasture.grass.medium.tile-01`, `pasture.grass.native.imagegen.v1`, `terrain.soil.dry.imagegen.v1`, `terrain.mud.imagegen.v1`.
- **Vegetation:** `vegetation.tree.shade.imagegen.v1`.
- **Technology:** `technology.ear-tag.rfid-candidate.v1`, `technology.reader-station.corral-rfid-candidate.v1`, `technology.scale.electronic.imagegen.v1`, `technology.ear-tag.rfid.imagegen.v1`, `technology.reader.handheld.imagegen.v1`, `technology.gateway.antenna.imagegen.v1`, `technology.monitor.station.imagegen.v1`, `technology.scale.electronic.full.imagegen.v1`, `technology.traceability.system.imagegen.v1`.
- **Vehicles:** `vehicle.pickup.rural.imagegen.v1`, `vehicle.livestock-truck.imagegen.v1`, `vehicle.tractor.imagegen.v1`.
- **Water:** `water.trough.cattle.galvanized.01`, `water.trough.round.imagegen.v1`, `water.pond.imagegen.v1`, `water.reservoir.imagegen.v1`.
