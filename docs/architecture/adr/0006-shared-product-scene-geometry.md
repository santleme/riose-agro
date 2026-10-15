# ADR 0006: Resolve Product scene geometry once for its renderers

- Status: accepted
- Date: 2026-10-14

## Context

Canvas and Pixi consume the same versioned Product scene, but each renderer was projecting the terrain outline, connected paths and fence endpoints on its own. Projection now has a shared implementation, and the authored data has a schema, yet these repeated scene-to-screen conversions could still drift between renderers.

## Decision

Add `productSceneGeometry(scene)` in `src/client/product/scene-geometry.js`. It resolves the outline, terrain front edges, route polylines, fence runs and gate endpoints used by the Product renderers. World-space route and fence records remain available alongside their screen-space coordinates so drawing and hit testing can use the same authored geometry.

Canvas and Pixi remain separate renderer adapters. They own their own drawing styles, layering and interactions, while scene geometry and its projection are resolved through this shared module.

## Consequences

- A change to route, fence or terrain projection is visible to both renderers through one seam.
- Renderer-specific drawing remains local to Canvas or Pixi.
- The geometry module is derived output; `scene.json` remains the authored source of truth.
- Future renderer-specific spatial behavior should be added to this interface only when both adapters need the same result.
