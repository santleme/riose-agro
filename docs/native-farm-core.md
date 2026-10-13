# Native FarmEngine core

`riose-core` exposes a headless Rust implementation of the current demonstrative
FarmEngine path. JavaScript remains the browser implementation and behavioral
oracle. Native output reports `modelStatus: demonstrative_unvalidated` and
`validated: false`; its assumptions are illustrative and do not establish
biological validity.

The v1 input supports the baseline run and pasture-versus-barn housing
comparison. It preserves the four-paddock model, the existing diet, housing,
weather, and supplement values, stable animal order and IDs, both RNG states,
activity and event ordering, and the snapshot fields currently emitted by
`FarmEngine.snapshot()`. Serde DTOs reject unknown fields so an input that
requires a model the native core does not implement fails with the field name.

Weather values `normal`, `hot`, and `rain` are valid configuration inputs. The
separate `heat` intervention preset remains unsupported, as do reduced-feed and
limited-trough-access interventions, additional paddocks, time-series climate,
and scientific observed-farm snapshots. Map coordinates remain in the state
snapshot for deterministic compatibility; rendering stays in JavaScript.

The typed entry points are `FarmEngine::new`, `FarmEngine::from_snapshot`,
`FarmEngine::configure`, `FarmEngine::tick`, `FarmEngine::snapshot`,
`compare_housing`, and the strict JSON DTO `NativeScenarioRequest`. The optional
`bench-farm-core` binary reports 24-hour tick and snapshot materialization
timings separately for 100, 1,000, and 10,000 animals; it excludes engine
construction from both timed regions.

## Native scenario API

The stable library entry point is
`riose_core::run_native_scenario(NativeScenarioRequest) -> Result<NativeRunResult, String>`.
JSON callers deserialize into `NativeScenarioRequest` and serialize the returned
`NativeRunResult`. The request is a tagged union (`type`, kebab-case variant):

```json
{"type":"baseline","version":1,"seed":2026,"animalCount":24,"configuration":{"diet":"pasture","housing":"pasture","weather":"normal","supplement":0},"hours":24}
```

The housing-comparison variant has the fields
`{"type":"housing-comparison","version":1,"snapshot":<FarmSnapshot>,"days":30}`.
A valid snapshot must contain 1–10,000 animals, exactly four paddock stocks,
and all required fields.
The response has `{version, engine, result}`. `engine` contains `engineVersion`,
`buildId`, `modelStatus`, `provenance`, and `validated`. The tagged `result` is
either `{type:"baseline", snapshot, metrics}` or
`{type:"housing-comparison", comparison}`. The baseline snapshot is also the
snapshot output format: current JS camel-case fields, including `initialSeed`,
`locomotionSeed`, and `*KgDM` intake names. Snapshot JSON helpers are
`encode_farm_snapshot(&FarmSnapshot) -> Result<String, serde_json::Error>` and
`decode_farm_snapshot(&str) -> Result<FarmSnapshot, FarmSnapshotDecodeError>`;
the decode error distinguishes malformed JSON from invalid snapshot contents.
The scenario entry point returns descriptive `String` errors for unsupported
request versions, invalid counts, hours, days, and configuration values.

The snapshot top-level fields are `hour`, `animals`, `pastures`, `intake`,
`config`, `cost`, `events`, `seed`, `initialSeed`, and `locomotionSeed`. Animal
objects contain `id`, `name`, `weight`, `initialWeight`, `energy`, `thirst`,
`action`, `patch`, `x`, `y`, `targetX`, `targetY`, and `history`. The intake
object contains `pastureKgDM`, `barnBaseKgDM`, `supplementKgDM`, and
`dietExtraKgDM`; config contains `diet`, `housing`, `weather`, and `supplement`;
events contain `hour`, `text`, and optional `animalId`. Metrics contain
`weight`, `gain`, `cost`, `pasture`, `pastureByPaddock`, `intake`, and `stress`;
metric intake adds `totalKgDM` to the four snapshot intake fields. The concrete
JS-generated compatibility fixture is
[`farm-engine-snapshot.json`](../crates/riose-core/tests/fixtures/farm-engine-snapshot.json).

Only baseline execution and a single housing comparison (pasture versus barn)
are supported. The latter changes housing only and preserves other configuration
values. The accepted configuration enums are diets `pasture`, `balanced`, and
`concentrate`; housing `pasture` and `barn`; weather `normal`, `hot`, and `rain`;
and supplement values from 0 through 4 kg DM per animal per day. Unknown JSON
fields are rejected at the request, configuration, snapshot, and nested snapshot
DTO boundaries. The separate `heat` intervention, reduced-feed and limited-trough
interventions, and observed scientific snapshots are unsupported.

The seed is an unsigned 32-bit integer. The model and locomotion streams use the
JS LCG recurrence `state = (state * 1664525 + 1013904223) mod 2^32`, with
`next_f64 = state / 2^32`. The model stream starts at `seed`; locomotion starts
at the first LCG successor of `seed XOR 0x9e3779b9`. Initialization consumes
one model draw for each animal weight and two locomotion draws per animal for
coordinates, in animal order. Each simulated hour consumes two locomotion draws
per animal, in animal order. The snapshot records both current stream states;
legacy snapshots missing `initialSeed` or `locomotionSeed` use the current
`seed` and the same locomotion derivation, respectively.

This Rust surface is implemented but has not yet passed native compilation or
tests in the current environment. The API and RNG contract above describe the
implemented boundary; JS-side fixtures are useful for comparison but do not
prove that the Rust code executes correctly.

Run Rust unit tests with `cargo test --workspace`. Run the local timing harness
with `cargo run --release -p riose-core --bin bench-farm-core`.
