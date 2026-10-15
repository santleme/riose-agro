# ADR 0004: Share isometric projection math

- Status: accepted
- Date: 2026-10-14

## Context

The Product scene, Graphics PoC contract and standalone Scenario Editor each implemented the same 2:1 isometric projection and inverse projection. They use different coordinate property names and own different scene/renderer behavior, but the projection equations themselves are identical.

## Decision

Put the pure projection functions in `src/client/visualization/isometric.js`. Keep small wrappers in the Product spatial model, Graphics PoC contract and Scenario Editor layout so each feature retains its current argument and return shapes.

## Consequences

- A correction to the common isometric transform has one implementation point.
- Existing scene formats, serialized coordinates, and renderer responsibilities do not change.
- Scene contracts and renderers are not unified by this extraction; that requires a separate adapter and compatibility plan.
