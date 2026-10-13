# Seeded farm layout generation

`public/assets/scenario-editor/scene-layout.js` generates editable beef and dairy starter scenes from a seed, the prefab catalog, the asset manifest, and optional adjacency constraints. The Composer uses the same generator for its regenerate action. Invalid constraints, collisions, and out-of-bounds structures fail validation; missing asset references remain visible in the generation provenance.

Run the representative generation benchmark with:

```sh
npm run bench:farm-layout
```

It warms each system twice, then records 15 end-to-end generator timings at seed 417, placement and prefab counts, validation diagnostics, and the input fingerprint. Timings include placement, constraint solving, and validation. Browser rendering, asset loading, and interactive editing are excluded. The command writes [`farm-layout-generation-2026-10.json`](../evidence/farm-layout-generation-2026-10.json); results are machine-specific and are not a performance threshold.
