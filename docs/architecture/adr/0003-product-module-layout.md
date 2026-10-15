# ADR 0003: Group the Product experience by feature

- Status: accepted
- Date: 2026-10-14

## Context

Product-specific browser code was split between the repository root and the flat `src/client/` directory. The app, scene composition, spatial model, world contract, renderer, interaction handler and stylesheet form one discoverable feature, but their names and location obscured that relationship. The Product page is also hosted at a stable root URL, and existing scripts/tests import some of the old module paths.

## Decision

Keep `product.html` at the root and group its implementation in `src/client/product/`. The Product folder owns Product page orchestration, scene and spatial contracts, rendering, interaction and styles. Shared simulation engine, Worker protocol, view-state conversion and scientific modules stay in their current shared/domain locations.

Keep small compatibility facades at previous module and stylesheet paths while in-repository consumers migrate. Keep the generated world-renderer bundle at its established path because the Product app and manifesto page load that build output. The local server serves relative module paths under `src/client/`, including the newly nested Product files.

## Consequences

- The Product feature has one obvious implementation directory without moving its public page URL.
- Existing imports and stylesheet links can transition without a coordinated breaking change.
- The Product Canvas scene and Pixi world renderer remain separate implementations for now. Their overlapping ownership is recorded in the repository audit and needs a separate scene-contract/renderer integration decision.
- Removing the compatibility facades requires checking scripts, tests, static hosting and downstream consumers first.
