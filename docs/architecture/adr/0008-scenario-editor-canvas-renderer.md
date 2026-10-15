# ADR 0008: Give the Scenario Editor Canvas renderer an explicit scene interface

- Status: accepted
- Date: 2026-10-14

## Context

The standalone Scenario Editor uses Pixi as its primary renderer and Canvas 2D as its fallback and comparison renderer. The Canvas implementation read scene data, asset indexes, atlas images, camera globals and DOM canvases directly from the Composer's module scope, which made a renderer switch or comparison update depend on the entire editor state.

## Decision

Move Canvas scene drawing into `src/client/scenario-editor/canvas-scene-renderer.js`. The renderer accepts the canvas and viewport, the authored scene, expanded placements, asset lookup, atlas images, optional camera transform and zone visibility. When no camera transform is provided, it fits the scene to the viewport.

The Composer retains ownership of editor state, Canvas/Pixi mode selection and comparison layout. Pixi remains its separate renderer adapter.

## Consequences

- Fallback and comparison Canvas surfaces use one drawing implementation.
- The Canvas renderer can only see scene and presentation data supplied through its call interface.
- Scene editing, asset selection and Pixi interaction remain in the Composer.
- Changes to the Canvas parameters or ordering must preserve both fallback and comparison views.
