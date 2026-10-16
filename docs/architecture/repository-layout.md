# Repository layout

```text
home.html, product.html, *-data.html   browser entry points
src/client/                            simulation, worker, product interface, data adapters
src/server/                            local API and static-file allowlist
crates/riose-core/                     deterministic native Rust core and CLI
wasm/                                  browser WASM modules
scientific/, experiments/              model contracts and reproducible experiments
data/, schemas/                         source data, manifests, and data contracts
scripts/, tests/, docs/evidence/       research tooling, validation, and evidence
assets/                                institutional identity and research-page images
```

`/` and `index.html` lead to `home.html`; the institutional header links to `product.html`. `scenario-lab.html` remains a direct entry for multi-scenario and BR-CORTE workflows. The retired `experiments.html` and `simulator.html` routes redirect to Product for old links. Research and observed-data pages remain separate from model-generated results and are not primary navigation tabs. `npm start` starts the local API and serves allowlisted assets; browser modules are loaded from relative paths so deployments can live under a repository subpath.
