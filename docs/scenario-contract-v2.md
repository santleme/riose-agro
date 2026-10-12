# Scenario contract v2

The v2 contract evolves the existing `agroville-comparison` manifest. The v1 comparison format remains readable and replayable; no stored manifest or farm snapshot is migrated automatically.

## Version policy

The integer `version` identifies the serialized contract. Version 1 keeps its existing `initialSnapshot`, `periodDays`, `factor`, and `scenarios` fields. Version 2 uses the same `type` and adds explicit scenario identity, baseline snapshot, intervention, scope, duration, engine identifier, inputs, and output names. Readers must dispatch by both `type` and `version`; unknown versions fail with an unsupported-version error.

`validateScenarioContract` validates v2. `upgradeComparisonManifestToScenarioContract` validates v1 before adapting it. Because v1 did not record an engine identifier, the adapter writes `engine_version: "legacy-unspecified"`; it does not guess which engine build produced it. V1 remains unchanged on disk and can still be passed to `replayScenarioContract`.

`engine_version: "agroville-engine/1"` identifies the current replay contract implementation. It is not a version of a calibrated biological model. A v2 contract must use that supported identifier; the explicit value `legacy-unspecified` is reserved for adapted v1 files whose producer version is unknown. Other engine versions are rejected rather than replayed with potentially different semantics.

## Fields

- `scenario_id`: caller-provided stable label; the builder's default (`scenario-<seed>-<days>`) is deterministic but is not guaranteed unique.
- `baseline`: full initial `FarmEngine` snapshot, preserving the exact existing replay input and both random streams when present.
- `intervention`: the supported demonstrative change, housing to `barn`.
- `target_scope`: `whole-herd` plus the ordered animal IDs from `baseline`; validation rejects omitted, added, reordered, or duplicated IDs.
- `duration`: an integer from 1 to 365 with unit `day`.
- `seed`: the unsigned 32-bit original seed in the baseline snapshot.
- `inputs`: baseline and scenario configurations. The validator requires the configs to differ only in the declared factor and to preserve the baseline's other settings.
- `expected_outputs`: one or more output groups (`weight`, `cost`, `pasture`, `intake`). These name model outputs; they are not measured values or scientific expectations.
- `validated`: must remain `false`. The scenario engine is illustrative and has not been scientifically validated.

The JSON Schema is `schemas/scenario-contract.schema.json`. The semantic validator additionally checks the complete engine snapshot and cross-field invariants by adapting v2 to the existing v1 comparison validator. Missing required data fails with a field-specific message. The builder's optional `scenarioId` uses a deterministic seed-and-duration default; callers can provide a stable ID.

## Reproducible example

Run `npm run example:scenario-contract` (or `node examples/scenario-contract-v2.js`). It creates a deterministic initial snapshot, serializes and reloads the v2 contract, validates it, and asserts that two replays are identical. Output remains demonstrative; this example does not test or claim biological validity.

## Compatibility boundary

Farm snapshots and existing v1 comparison manifests retain their current bytes and schemas. V2 is an additive contract version using the same manifest type, not a replacement farm snapshot format. The adapter can only preserve facts recorded in v1; `legacy-unspecified` makes the missing engine version visible. No scientific input, source, or model assumption is fabricated to fill absent v1 fields.
