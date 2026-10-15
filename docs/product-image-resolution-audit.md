# Product scene rendering audit

## Current runtime

The Product world is composed in `src/client/product/scene.js`. Terrain, pasture zones, paths, fences, gates, structures, water, and crop beds are drawn as Canvas geometry and remain separate selectable scene entities. The scene does not render those objects from sprite atlas frames.

`src/client/product/app.js` reads `/assets/manifest.json` to resolve the approved Nelore frame and loads the `livestock-approved` atlas. That is the only published atlas currently drawn in the Product scene. Other sprite IDs and atlases remain available in the asset library and validation metadata for later approved bindings; their presence in the manifest does not mean the Product scene renders them.

The visual appearance and object sizes are therefore defined by the geometry in `scene.js` and the entity footprints in `spatial.js`, not by the source-image dimensions or display-size hints in the asset manifest. The animal sprite is drawn at its configured scene size from the approved atlas frame.

## Canvas sampling

Product keeps logical scene coordinates at 800 × 416. The backing canvas follows its rendered CSS size multiplied by `devicePixelRatio`, while pointer coordinates are converted back to the same logical scene space. Canvas image smoothing is enabled for the approved animal sprite. The source sprite itself is unchanged.

## Runtime asset use

| Runtime asset | Product scene use |
| --- | --- |
| `/assets/manifest.json` | Resolves sprite metadata and atlas paths |
| `livestock-approved` atlas | Approved Nelore animal sprite |
| Other published atlases | Not loaded or drawn by the current Product scene |
| `assets/` source, candidate, and preview files | Review and authoring library; not fetched by the Product runtime |

The scene remains interactive: terrain zones, paths, structures, gates, fences, and animals retain independent hit targets or selection behavior. The existing screenshot files predate the current geometry-based Product scene and should be refreshed when browser capture is available.
