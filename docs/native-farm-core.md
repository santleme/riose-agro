# Native FarmEngine core

`riose-core` exposes a headless Rust implementation of the current demonstrative
FarmEngine path. JavaScript remains the browser implementation and behavioral
oracle. Native output reports `modelStatus: demonstrative_unvalidated` and
`validated: false`; its assumptions are illustrative and do not establish
biological validity.

The v1 input supports the baseline run, pasture-versus-barn housing
comparison, and the scalar BR-CORTE 2023 Eq. 2.6 calculation. The configured
comparison request has its own v2 contract. The scalar
equation is limited to growing Zebu cattle grazing tropical pasture with
supplementation; it is not an adult-cow model and does not independently
validate Riose predictions. It preserves the four-paddock model, the existing diet, housing,
weather, and supplement values, stable animal order and IDs, the model RNG state,
activity and event ordering, and the scientific snapshot fields emitted by
`FarmEngine.snapshot()`. Serde DTOs reject unknown fields so an input that
requires a model the native core does not implement fails with the field name.

Weather values `normal`, `hot`, and `rain` are valid configuration inputs. The
separate `heat` intervention preset remains unsupported, as do reduced-feed and
limited-trough-access interventions, additional paddocks, time-series climate,
and scientific observed-farm snapshots. Legacy map coordinates are accepted when reading old engine snapshots and discarded; they are not part of new simulation state.

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
The configured comparison variant is
`{"type":"configured-comparison","version":2,"snapshot":<FarmSnapshot>,"days":2,"referenceConfig":<FarmConfig>,"scenarioConfig":<FarmConfig>}`.
Both complete configurations start from the same snapshot and must differ in
exactly one factor: diet, housing, weather, or supplement. Each arm advances
the configured number of simulated days from the same initial model RNG state. This reproduces the demonstrative JS comparison
contract; it does not establish scientific validation.
The scalar BR-CORTE variant is
`{"type":"br-corte-pasture-dmi","version":1,"bodyWeightKg":300,"adgKgPerDay":0.5,"supplementKgDMPerDay":1.6}`.
Its inclusive request ranges are 133–474 kg body weight, −0.18–1.34 kg/day
assumed ADG, and 0–5.32 kg DM/day supplement. It returns the same scalar fields
as `predictPastureDmi` in `scientific/br_corte_pasture_dmi.js` and identifies
the source, units, production system, validation ranges, and Riose limitation.
The scalar request has no seed because the equation is deterministic.
The response has `{version, engine, result}`. `engine` contains `engineVersion`,
`buildId`, `modelStatus`, `provenance`, and `validated`. The tagged `result` is
either `{type:"baseline", snapshot, metrics}`,
`{type:"housing-comparison", comparison}`,
`{type:"configured-comparison", comparison}`, or
`{type:"br-corte-pasture-dmi", metadata, prediction}`. The baseline snapshot is also the
snapshot output format: current JS camel-case fields, including `initialSeed` and `*KgDM` intake names. Legacy `locomotionSeed` and per-animal coordinate fields are accepted on input and omitted from output. Snapshot JSON helpers are
`encode_farm_snapshot(&FarmSnapshot) -> Result<String, serde_json::Error>` and
`decode_farm_snapshot(&str) -> Result<FarmSnapshot, FarmSnapshotDecodeError>`;
the decode error distinguishes malformed JSON from invalid snapshot contents.
The scenario entry point returns descriptive `String` errors for unsupported
request versions, invalid counts, hours, days, and configuration values.

`engineVersion` is the crate's exact `CARGO_PKG_VERSION` value. `buildId` uses the
`RIOSE_BUILD_ID` compile-time value when supplied; otherwise it is the
reproducible `riose-core@<crate-version>` identifier. The fallback identifies
the crate version and does not claim a source commit. `provenance` identifies
the native Rust implementation only; `validated` remains false.

The snapshot top-level fields are `hour`, `animals`, `pastures`, `intake`,
`config`, `cost`, `events`, `seed`, and `initialSeed`. Animal objects contain
`id`, `name`, `weight`, `initialWeight`, `energy`, `thirst`, `action`, `patch`,
and `history`. The decoder accepts and discards the historical `locomotionSeed`,
`x`, `y`, `targetX`, and `targetY` properties. The intake
object contains `pastureKgDM`, `barnBaseKgDM`, `supplementKgDM`, and
`dietExtraKgDM`; config contains `diet`, `housing`, `weather`, and `supplement`;
events contain `hour`, `text`, and optional `animalId`. Metrics contain
`weight`, `gain`, `cost`, `pasture`, `pastureByPaddock`, `intake`, and `stress`;
metric intake adds `totalKgDM` to the four snapshot intake fields. The concrete
JS-generated compatibility fixture is
[`farm-engine-snapshot.json`](../crates/riose-core/tests/fixtures/farm-engine-snapshot.json).

Baseline execution, a single housing comparison (pasture versus barn), and a
configured one-factor comparison are supported. Housing comparison changes
housing only and preserves other configuration values. The accepted
configuration enums are diets `pasture`, `balanced`, and
`concentrate`; housing `pasture` and `barn`; weather `normal`, `hot`, and `rain`;
and supplement values from 0 through 4 kg DM per animal per day. Unknown JSON
fields are rejected at the request, configuration, snapshot, and nested snapshot
DTO boundaries. The separate `heat` intervention, reduced-feed and limited-trough
interventions, and observed scientific snapshots are unsupported.

The seed is an explicit unsigned 32-bit integer, and baseline initialization
allocates stable animal IDs in order, starting at 1. The model RNG uses the JS
LCG recurrence `state = (state * 1664525 + 1013904223) mod 2^32`, with
`next_f64 = state / 2^32`. It starts at `seed` and initialization consumes one
draw for each animal weight, in animal order. The simulation does not consume
random values for presentation or movement. Historical visual RNG metadata is
ignored when decoding older snapshots; it does not influence scientific replay.

The Rust integration tests consume the official
[`baseline-pasture`](../tests/scenario-goldens/baseline-pasture.json) and
[`housing-comparison`](../tests/scenario-goldens/housing-comparison.json)
fixtures, plus frozen JS configured-comparison vectors across all four factors.
They compare scientific fields in the complete supported baseline snapshot,
metrics, 30-day comparison output, and endpoint projections. Archived golden
files may contain historical visual coordinates; those fields are excluded
from scientific parity while model values and event ordering remain checked. They also rerun each
request to verify deterministic output. The Rust CI job runs formatting,
workspace tests, and a release build; JavaScript remains the browser authority
and executable fallback.

Run Rust unit tests with `cargo test --workspace`. Run the local timing harness
with `cargo run --release -p riose-core --bin bench-farm-core`.
