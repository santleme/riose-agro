# ADR 0005: Version the Product world scene as data

- Status: accepted
- Date: 2026-10-14

## Context

The Product world layout was an object literal inside `spatial.js`. Canvas, Pixi, the composition tool and the spatial validator already consumed that object, but there was no schema for its terrain outline, zones, paths, gates, structures or vegetation. The broader `visual-scene` contract does not yet represent the Product's land contour and connected routes without losing information.

## Decision

Store the Product layout in `src/client/product/scene.json` and define its versioned shape in `schemas/product-world-scene.schema.json`. Keep `PRODUCT_BLOCKOUT`, `PRODUCT_WORLD` and `PRODUCT_WORLD_OUTLINE` as compatibility exports from `spatial.js`. The existing Product validation command checks the schema before its spatial and asset rules.

Keep renderer-facing adapters responsible for converting this complete Product scene into any broader visual scene contract. Do not discard or flatten paths, gates or landform geometry just to fit the current `visual-scene` schema.

## Consequences

- Product scene data is reviewable separately from projection, hit testing and validation algorithms.
- Current Canvas/Pixi/editor consumers keep using the same compatibility shape and shared source data.
- Interoperability with Graphics Lab remains an explicit adapter task; the two renderers are not unified by this change.
- Schema changes must increment `schemaVersion` and preserve the prior reader or provide an adapter when a breaking field change is required.
