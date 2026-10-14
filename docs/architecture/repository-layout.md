# Repository layout

The repository keeps browser page URLs at the project root for static-host compatibility. Their implementation files live under `src/client/`; the optional HTTP service and standalone Python compute service live under `src/server/`.

```text
index.html, home.html, product.html, lab.html, *-data.html   browser entry points
src/client/                                          browser modules and stylesheets
src/server/                                          local HTTP and Python compute services
assets/, public/                                     shipped browser assets
data/, schemas/, scientific/                         input data and domain contracts
scripts/, tests/, examples/, docs/                  development and project material
```

`index.html` and `/` lead to the Riose landing page. `product.html` is the canonical farm experience. `lab.html` preserves the former Agroville research interface for embedded and specialist workflows; `simulator.html` is a compatibility redirect to Product. The root HTML pages load implementation assets through relative `src/client/` URLs, preserving deployment under a repository subpath. Browser module imports within `src/client/` stay relative to that directory. Node scripts and tests import the same modules from their new location. `npm start` remains the supported entry point for the Node server.
