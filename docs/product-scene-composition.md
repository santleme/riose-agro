# Product farm scene composition

The Product diorama is an object map rendered into a logical `800 × 416` canvas.
Its isometric grid uses `40 × 18` cells, a `(300, 52)` origin, and a `24 × 14`
footprint. The display canvas is DPR-scaled independently of these world
coordinates, so pointer selection and zoom use the same grid as rendering.

## Blockout

The terrain reads as two connected districts. Four `6 × 4` pasture prefabs form
the northwest herd block. The southeast service campus groups the farmstead,
pond, barn and corral, and crop rows along one curved dirt route. Trees and
shrubs form an irregular green perimeter rather than a uniform row. The
farmhouse and cattle shed are the two hero structures.

The ground is clipped to a chamfered isometric footprint. Separate front faces
draw its soil extrusion and lighter/darker strata. Continuous land-use washes
replace per-cell color changes, avoiding seams that made the old terrain look
like a board game. Small deterministic grass marks add texture without a
repeating image.

## Prefabs and entities

`PRODUCT_SCENE_PREFABS` defines footprints and recipes for pastures, farmstead,
pond, barn/corral, crops, tree clusters, road connectors, fence boundaries, and
service infrastructure. `FARM_BLOCKOUT` sets zone anchors; structures are
placed as offsets from their prefab anchor. Cattle, buildings, pond, crops,
trees, fences, pasture zones, and paths remain separate world entities.

Each entity has an ID and prefab type in `productFarmObjects()`. Hit testing in
`productFarmEntityAt()` keeps selection connected to the existing
`riose:entity-selected` event and the Product context panel. No farm composite
image or newly generated artwork is used; the scene uses the existing atlases
and vector terrain drawing.
