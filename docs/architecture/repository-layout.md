# Repository layout

The repository keeps browser page URLs at the project root for static-host compatibility. Their implementation files live under `src/client/`; the optional HTTP service and standalone Python compute service live under `src/server/`.

```text
index.html, home.html, simulator.html, *-data.html   browser entry points
src/client/                                          browser modules and stylesheets
src/server/                                          local HTTP and Python compute services
assets/, public/                                     shipped browser assets
data/, schemas/, scientific/                         input data and domain contracts
scripts/, tests/, examples/, docs/                  development and project material
```

The root HTML pages load implementation assets from `/src/client/`. Browser module imports within `src/client/` stay relative to that directory. Node scripts and tests import the same modules from their new location. `npm start` remains the supported entry point for the Node server.
