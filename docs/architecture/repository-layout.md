# Repository layout

The repository keeps browser page URLs at the project root for static-host compatibility. Their implementation files live under `src/client/`; the optional HTTP service and standalone Python compute service live under `src/server/`. The current full inventory and migration priorities are in [repository-architecture-audit-2026-10-14.md](repository-architecture-audit-2026-10-14.md). The accepted Product decisions group its implementation, share projection math and scene geometry, version its world data and isolate static Pixi drawing ([ADRs 0003–0007](adr/0003-product-module-layout.md)). Scene ownership and format relationships are mapped in [scene-authoring-inventory.md](scene-authoring-inventory.md).

```text
index.html, home.html, product.html, lab.html, *-data.html   browser entry points
src/client/                                                   browser modules and stylesheets
  product/                                                   Product experience: app, versioned world scene, shared geometry, static world drawing, Pixi orchestration, spatial model and interaction
  scenario-editor/                                           standalone Composer UI and shared grid-scene generation/validation
  visualization/                                             shared presentation geometry and visual adapters
src/server/                                                   local HTTP and Python compute services
crates/                                                       Rust core and WASM adapters
assets/, public/                                              shipped browser assets
data/, schemas/, scientific/                                  input data and domain contracts
scripts/, tests/, tools/, experiments/, graphics-poc/, docs/ development and project material
scripts/assets/                                                asset composition, validation and release gates
scripts/graphics/                                              Graphics PoC builds, screenshots and renderer benchmarks
scripts/experiments/                                           scenario runners, experiment-format tools and reusable batch helpers
scripts/benchmarks/                                            simulation, system and scientific benchmark harnesses and report validation
scripts/science/engine-audits/                                  engine-level data checks and cohort-specific comparisons
scripts/science/source-audits/                                  public-source audits and cohort association analyses
scripts/science/source-audits/usda/                             USDA-specific source audits and cohort association analyses
scripts/science/evaluations/                                     cohort and model evaluation harnesses with stable experiment outputs
scripts/science/data_pipelines/                                  public scientific data acquisition, normalization and processing
scripts/science/readiness/                                       evidence-based scientific data readiness reports and gates
```

`index.html` and `/` lead to the Riose landing page. `product.html` is the canonical farm experience. `lab.html` preserves the former Agroville research interface for embedded and specialist workflows; `simulator.html` is a compatibility redirect to Product. The root HTML pages load implementation assets through relative `src/client/` URLs, preserving deployment under a repository subpath. Product-specific implementation belongs in `src/client/product/`; shared simulation, worker and view-state modules remain in `src/client/`. Renderer-independent projection utilities belong in `src/client/visualization/`; each scene and renderer remains owned by its feature. The old top-level Product module paths are temporary compatibility facades for scripts and consumers. Browser module imports are relative to their owning modules. `npm start` remains the supported entry point for the Node server.
`public/assets/scenario-editor/index.html` remains the standalone editor's static entry. Its implementation now lives under `src/client/scenario-editor/`; the former `composer.js` and `scene-layout.js` module URLs re-export those sources for existing browser and tool consumers. The Pixi bundle and prefab catalog remain served assets.

The `scripts/` root retains tools whose ownership has not been grouped yet, including `engine-source-hash.js`, which is shared with comparison archiving and kept at its existing path. Graphics PoC tools live in `scripts/graphics/`; scenario execution and reusable batch-experiment code live in `scripts/experiments/`; benchmark harnesses and their shared report validator live in `scripts/benchmarks/`; engine-level scientific data comparisons live in `scripts/science/engine-audits/`; audits and cohort analyses for public data sources live in `scripts/science/source-audits/`, with USDA-specific audits under `usda/`; model and cohort evaluation harnesses, protocols, and baseline maintenance live in `scripts/science/evaluations/`; public scientific data acquisition and processing scripts live in `scripts/science/data_pipelines/`; evidence-based readiness generation and validation live in `scripts/science/readiness/`. Three files remain at their root paths because the versioned scientific baseline pins their exact source bytes: the CGREC comparator, Mendeley biomass readiness audit, and Perea behavior evaluator. The root `experiments/` directory holds experiment-specific code, protocols, runs, reports and artifacts; reusable JavaScript libraries belong under `scripts/experiments/`.
