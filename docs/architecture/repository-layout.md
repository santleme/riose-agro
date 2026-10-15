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

`/` and `index.html` lead to `home.html`. `product.html` hosts the quantitative experiment workspace, and `simulator.html` redirects there for old links. Research and observed-data pages remain separate from model-generated results. `npm start` starts the local API and serves allowlisted assets; browser modules are loaded from relative paths so deployments can live under a repository subpath.
