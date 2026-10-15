# ADR 0007: Isolate static Product world rendering

- Status: accepted
- Date: 2026-10-14

## Context

The Pixi world renderer coordinated asset loading, interactive entities, camera input and the complete static landscape. Ground detail, route, fence, gate, pond and crop drawing formed a coherent rendering responsibility, but their implementation sat inside the orchestration module.

## Decision

Move static landscape and infrastructure drawing into `src/client/product/static-world-renderer.js`, exposed through `drawProductLandscape(terrainLayer, depthLayer, scene, geometry)`. The Pixi renderer continues to own canvas setup, sprite assets, dynamic animals, overlays, hit testing and camera interaction.

## Consequences

- Static terrain drawing and its procedural details live in one module.
- The renderer orchestration module is smaller and focuses on loading assets and updating interactive state.
- Pixi drawing stays renderer-specific; Canvas and Pixi only share authored scene geometry and projection data.
- Keep static terrain ordering in the renderer's sortable depth layer when adding new landscape elements.
