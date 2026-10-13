# Riose terrain family V1 (candidate)

## Shared art direction

Use the urban pixel-art master as the dominant style reference; match the user-approved farmhouse, tree, tractor, and Nelore in scale, contour delicacy, light direction, and palette. Terrain uses quiet olive/sage grass, forest-green vegetation, muted umber/clay soil, broad low-contrast value clusters, sparse tufts, and generous calm zones. Ground supports the scene; it must not compete with buildings or animals.

## Family roles

- `pasture.grass.premium.imagegen.v1`: calm base ground, few asymmetrical grass masses, very few flowers.
- `road.rural.dirt.imagegen.v3`: compacted umber/clay track, faint wheel wear, irregular edges with grass tongues and soil scuffs; transition is part of the tile.
- `terrain.soil.worn.imagegen.v1`: alternate dry/worn pasture state with broad compacted patches and flattened vegetation, blending back into the base.
- `terrain.soil.cultivated.imagegen.v1`: optional understated cultivated soil state with broad, shallow, low-contrast furrows.

## Layer and transition rules

The layer order and current placement contract are in `assets/manifests/terrain-family.v1.json`: base ground → secondary surfaces → transition details → asset grounding → objects. Current transition edges are baked into road/worn/cultivated tile art. Do not place a solid rectangular brown block over grass. Use worn ground beneath active animals/vehicles and the road beneath movement; keep contact marks subordinate. House and tree assets already include their own stone/root grounding.

## Shared processing

Preserve raw ImageGen outputs. Review on contrasting backgrounds. Export hard-edge alpha at threshold 128; clear hidden RGB; trim to the visible diamond; standardize the content to a 2:1 footprint and restore 2px transparent padding. Keep output as a review candidate until ICC profile, edge joins, repeat test, and scene fit are approved.


## Path transition overlay

`terrain.road.dirt-overlay.imagegen.v1` is a path-only transparent ribbon. It retains compacted umber soil, faint wheel-wear lanes, and irregular grass/soil fringe; all pixels outside that transition are transparent so it can sit over the base ground without a hard tile diamond. The earlier complete road tile is retained as a candidate/reference but is not used for the scene preview because it reads as a slab when layered.
