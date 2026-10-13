# JavaScript ↔ Rust trajectory parity

This harness checks the authoritative headless JavaScript simulation against the `riose-run` native CLI for the two versioned scenarios supported by the current golden fixtures. It records exact software behavior; it makes no production, calibration, or scientific-validity claim.

## Trajectory and checkpoints

A trajectory is the ordered sequence of authoritative simulation snapshots and metrics after each elapsed simulation hour. Checkpoint labels use elapsed time from the scenario's initial hour; baseline starts at hour 6, so `hour-1` is state hour 7. The baseline runs seed `417`, three animals, and 24 hours. The housing comparison runs seed `2026`, 24 animals, and 30 days. It has independent pasture baseline and barn intervention arms initialized from the same official housing snapshot.

The harness compares all 24 baseline hourly checkpoints and all 720 hourly checkpoints in each housing arm. It also runs the `housing-comparison` CLI request and compares all 31 daily comparison rows, including day 0. This hourly cadence avoids hiding a transient mismatch between day boundaries. The CLI does not expose the configured initial state as a baseline result; initial inputs are the versioned JavaScript golden/preset state, and the native housing request consumes the exact official snapshot. Initial full-state snapshots are therefore recorded on the JS side but are not counted as independent native output checkpoints.

The simulation state is authoritative. Renderer, animation, and visual-position caches are not read by the harness. The engine's state coordinates and RNG-driven targets remain in the snapshots because they are part of `FarmEngine` state and use the locomotion RNG stream.

## Compared data and policy

At every hourly checkpoint the harness compares the complete serialized state and metrics: hour, stable animal IDs and array order, names, weights, energy, thirst, actions, patch, coordinates, activity histories, pasture stocks, intake totals, cost, config, ordered events, model RNG state, initial seed, locomotion RNG state, and all metric fields. Housing daily rows and the comparison summary are compared structurally as well.

Object key order is ignored. Object field sets, JSON types, array lengths and array order must match. Animals, events, and histories are never sorted before comparison. Numbers compare by exact JavaScript numeric value: JSON `0` and `0.0` are the same value; `0` and `0.0000000001` differ. No rounding, epsilon, or tolerance is used.

The first mismatch is reported with scenario, seed, checkpoint, JSON Pointer, values, previous matching checkpoint, and a divergence class. The harness does not emit a full diff before the first mismatch.

## Artifacts and integrity

`npm run test:parity` writes one report per scenario under `artifacts/parity/` and gzip-compressed JS/Rust hourly trajectory artifacts. The trajectory bytes use recursive lexicographic object-key ordering, preserve array order, use UTF-8 `JSON.stringify` number serialization, and end with one LF before gzip. Gzip timestamps are set to zero. Each report records SHA-256 over the exact compressed artifact bytes, the Rust build ID, native CLI input digests, checkpoint counts, compared-field counts, result, and first divergence. The report's `metadata.generatedAt` is informational and excluded from parity comparisons and trajectory hashes.

The `inputSha256` recorded by `riose-run` is preserved for each checkpoint request. It hashes the exact compact JSON bytes sent on stdin, as defined by the #85 CLI contract; it is not a canonicalized digest. The housing comparison's full request digest is also included in its report.

## Running

Build the release CLI, then run the cross-engine harness:

```sh
cargo build --locked --workspace --release
npm run test:parity
```

Set `RIOSE_RUNNER` to use a CLI binary at another path. Comparator unit tests run with `npm test`. The Rust CLI contract and existing native golden tests remain separate checks.

## Limits

The harness covers only the versioned baseline and housing comparison fixtures. It does not add scenarios, modify the #80 goldens, use visual state, change simulation formulas, or claim scientific validation. Housing arm checkpoints use the baseline request supported by `riose-run` with the same seed and selected housing configuration; the separate housing-comparison CLI request verifies the public daily comparison rows and exact official snapshot input. A future change to #103/#104/#113 or the native result contract requires integration reconciliation and focused revalidation before parity claims are reused.
