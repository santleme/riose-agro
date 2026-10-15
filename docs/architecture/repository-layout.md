# Repository layout

The repository keeps browser page URLs at the project root for static-host compatibility. Their implementation files live under `src/client/`; the optional HTTP service and standalone Python compute service live under `src/server/`. The current full inventory and migration priorities are in [repository-architecture-audit-2026-10-14.md](repository-architecture-audit-2026-10-14.md). The accepted Product decisions group its implementation, share projection math and scene geometry, version its world data and isolate static Pixi drawing ([ADRs 0003–0007](adr/0003-product-module-layout.md)).

```text
index.html, home.html, product.html, lab.html, *-data.html   browser entry points
src/client/                                                   browser modules and stylesheets
  product/                                                   Product experience: app, versioned world scene, shared geometry, static world drawing, Pixi orchestration, spatial model and interaction
  visualization/                                             shared presentation geometry and visual adapters
src/server/                                                   local HTTP and Python compute services
crates/                                                       Rust core and WASM adapters
assets/, public/                                              shipped browser assets
data/, schemas/, scientific/                                  input data and domain contracts
scripts/, tests/, tools/, experiments/, graphics-poc/, docs/ development and project material
```

`index.html` and `/` lead to the Riose landing page. `product.html` is the canonical farm experience. `lab.html` preserves the former Agroville research interface for embedded and specialist workflows; `simulator.html` is a compatibility redirect to Product. The root HTML pages load implementation assets through relative `src/client/` URLs, preserving deployment under a repository subpath. Product-specific implementation belongs in `src/client/product/`; shared simulation, worker and view-state modules remain in `src/client/`. Renderer-independent projection utilities belong in `src/client/visualization/`; each scene and renderer remains owned by its feature. The old top-level Product module paths are temporary compatibility facades for scripts and consumers. Browser module imports are relative to their owning modules. `npm start` remains the supported entry point for the Node server.
