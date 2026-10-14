# Optional OR-Tools macro placement

`npm run solve:spatial-macro -- --input=<spec.json>` compiles a serializable V6
assembly specification to macro placements. The `auto` engine uses OR-Tools
CP-SAT when the selected Python has it and otherwise uses the existing bounded
JavaScript search. Select `--engine=cpsat` to require CP-SAT or
`--engine=javascript` to force the fallback. Results include `solverEngine`,
solver status and whether the answer is proven optimal (`optimal`) or merely
feasible at the time limit (`feasible-time-limit`).

## Install and run

Python 3.12.5 and pip 24.0 were present in the development environment. OR-Tools
was not initially installed. The pinned optional dependency is
`scripts/spatial/requirements.txt` (OR-Tools 9.15.6755). Install it in an
isolated environment and select its interpreter:

```sh
python3 -m venv .venv-spatial
.venv-spatial/bin/python -m pip install -r scripts/spatial/requirements.txt
RIOSE_SPATIAL_PYTHON=.venv-spatial/bin/python npm run solve:spatial-macro -- --input=assembly-spec.json --engine=cpsat --seed=42
```

Input structures must provide a measured `collisionPolygon`, in world-cell
units. CP-SAT enumerates each structure's bounded candidate domain (up to
`candidateLimit`, 28 by default), applies terrain bounds, optional serialized
`slopeGrid` and zones, then enforces polygon separating-axis non-overlap and
incompatible-tag clearance. An optional `access` field on a structure can
specify a world-cell `offset`, candidate `targets`, and `maxDistance`; candidates
outside that access radius are excluded, and its approach point may not be
inside another blocking footprint. This models an accessible approach socket,
while actual route connectivity is still verified downstream. The objective minimizes deterministic distance to
semantic target regions, edge balance and seed variation. One worker is used
by default for reproducibility. `--time-limit` and `--workers` can be supplied.

This integration targets the small macro layer. `npm run compile:spatial-scene`
serializes a slope grid, calls the CLI, then feeds the returned placements into
the normal scene post-processor. Fence topology, A* road routing and paddock
access remain downstream and reject the compiled scene if mandatory checks
fail. Browser-only generation still uses the deterministic JavaScript fallback
because Python is an offline authoring dependency. Neither solver converts
art-review candidate polygons into approved physical measurements.

For an end-to-end CP-SAT compilation and browser capture, set
`RIOSE_SPATIAL_PYTHON` to the interpreter that has the pinned package, then run
`npm run capture:spatial-assembly-v6:cpsat`. The capture imports the resulting
JSON into the Pixi debug renderer and records the solver status in the toolbar.
