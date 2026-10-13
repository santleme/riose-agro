# Data contracts

## Compatibility policy

Existing `agroville-comparison` manifest v1, farm snapshot schema and outcome-record schema remain unchanged in this prototype. New fields are additive only where existing consumers ignore them; breaking changes require a new schema/manifest version and an explicit migration. A saved comparison must keep its original implementation/model provenance when replayed. The internal `riose-core-snapshot` v1 is a separate checkpoint contract; it does not replace or reinterpret those existing schemas.

### Reader/writer compatibility matrix

The version below belongs to the serialized artifact, not to the biological model. Readers dispatch on both `type` and `version` where those fields exist. A missing or unknown version is rejected; readers must not infer a producer version from the current engine.

| Artifact | Supported persisted version(s) | Reader behavior | Writer behavior | Unsupported or malformed input |
| --- | --- | --- | --- | --- |
| Farm snapshot (`schemas/farm-snapshot.schema.json`) | `schemaVersion: "0.1.0"` | Validate the declared snapshot schema and semantic invariants. `manifestReference` may point to comparison v1 or v2. | Write the current schema version; do not change existing saved bytes in place. | Reject unknown/missing `schemaVersion`, malformed entities, and unsupported manifest references. |
| Comparison manifest (`agroville-comparison`) | v1 and v2 | Dispatch by `type` and `version`. Validate v1 with its original shape; validate v2 with the scenario contract validator. | New scenarios write v2. Existing v1 files remain v1. | Reject unknown type/version and malformed fields; do not guess an engine version. |
| Adapted v1 scenario contract | v2 in memory, sourced from v1 | `upgradeComparisonManifestToScenarioContract` validates v1 before adapting it. Missing producer identity is recorded as `engine_version: "legacy-unspecified"`. | Do not persist this adaptation over the original v1 file automatically. | `legacy-unspecified` is accepted only for an adapted v1 contract; other unsupported engine identifiers fail closed. |
| Comparison result archive (`agroville-comparison-result`) | v1 | Validate its own type/version and its manifest reference; verify the exact manifest digest before comparing. | Archive creation writes v1 and records the referenced manifest version/hash. | Reject unknown archive type/version or mismatched reference; do not replay as a different manifest. |
| Outcome record (`agroville-outcome-record`) | v1 | Validate the schema version, archive/manifest/snapshot hashes and projection link. | Write v1 sidecars; observations do not modify the archived projection. | Reject unknown type/version and any hash or link mismatch. |
| Browser run history (`agroville-run-history-v1`) | v1 | Validate the history envelope version; a completed run is replayable only when its declared history provenance, comparison engine and manifest versions are supported. | Store run records with `provenance.historyVersion: 1`; preserve the source manifest used by the run. | Reject unknown envelope or record provenance versions and unsupported engine/manifest versions before replay. |
| Rust checkpoint (`riose-core-snapshot`) | v1 | Decode only the internal checkpoint contract version. It is not an app farm snapshot. | Core runtime writes v1 checkpoints. | Reject unknown type/version; never reinterpret it as an app snapshot. |

This matrix describes the current persisted readers and writers. Any new version needs a valid fixture and an unsupported/malformed fixture at its reader boundary before it is advertised. There is no automatic migration of stored browser data or contract bytes.

The shared JavaScript reader-boundary fixtures are table-driven in `tests/persisted-contract-compatibility.test.js`; that test covers the farm snapshot, both persisted comparison-manifest versions, comparison-result archive, outcome record and browser run-history envelope. The internal Rust checkpoint is covered at its decoder boundary by `snapshot_decoder_rejects_unknown_versions` and `snapshot_decoder_rejects_duplicate_ids_and_unversioned_components` in `crates/riose-core/src/runtime.rs`. Contract-specific tests remain responsible for deeper field and semantic invariants. The table test checks acceptance of a valid artifact and rejection of an unsupported version without rewriting or adapting the persisted bytes.

## Message categories

| Contract | Initial encoding | Version / validation |
| --- | --- | --- |
| Worker commands and responses | Flat structured-clone envelope | Worker protocol v1 uses `protocolVersion: 1`; known unversioned messages pass through a narrow legacy adapter. Protocol version is independent of snapshot and comparison-manifest versions. |
| Farm snapshot and comparison manifest | JSON | Current JSON Schemas and manifest `type`/`version`; preserve exact manifest bytes for digest links |
| Small Worker state envelope | Structured clone / JSON-compatible values | State, view and comparison responses carry protocol version and engine implementation identity. Errors carry a stable code and readable message. |
| Worker packed view | Three transferred typed-array buffers | V1 declares array element types, element counts, stride, value fields and action codes; the client validates the complete view before applying it by stable animal ID. Legacy views are adapted only when they match the current typed-array layout. |
| Dense metabolism input | `Float64Array`, packed `[weight, energy, intake, resting]` per animal | ABI `riose-metabolism-batch/1`, count ≤ 100,000, all buffers are `f64` values; reserved field expansion requires a new ABI version |
| Dense metabolism output | `Float64Array`, packed `[weight, energy]` per animal | Same order and count as input, finite numeric values expected for valid model state |
| Rust core snapshot | JSON `riose-core-snapshot` | Internal core format v1; carries tick, initial seed and both current RNG states, next ID, metrics, entity/component values, pending commands and recent events. Decoder rejects unsupported type/version. Not used for app persistence yet. |
| Core command/event envelope | JSON object with version, sequence, tick, optional entity ID, type and payload | Each record carries its own schema version. Current Worker messages remain the JS command contract until an explicit adapter migration. |
| Scientific results / large analytical exports | CSV today; Arrow/Parquet candidate | Include scenario ID, seed, model/version, units, source/provenance, timestamps and validation status |
| Errors | Worker `error` message or negative ABI status | Do not silently return default scientific values; JS fallback is a runtime choice and is reported separately |

## Worker command protocol v1

Commands and responses use flat structured-clone objects with `protocolVersion: 1` and the existing `type` and payload fields. This version belongs only to the client/Worker boundary; it does not version farm snapshots, comparison manifests, simulation outputs or engine implementations.

| Command | Payload | Success response |
| --- | --- | --- |
| `reset` | Optional `seed`, `count` (defaults 2026 and 24) | `state` |
| `load` | Required current engine `snapshot`, optional `selectedAnimalId` (defaults 1) | `state` |
| `configure` | Required `patch` | `view` |
| `select` | Required `animalId` | `view` |
| `tick` | Optional `hours` (defaults 1) | `view` |
| `compare` | Optional `snapshot`, `days` (defaults to live snapshot and 30) | `comparison` |
| `replayComparison` | Required `manifest` | `comparison` |
| `snapshot` | No payload | `state` |

`state`, `view` and `comparison` responses retain their existing flat payloads and add `protocolVersion` and `engineImplementation`. `view` declares `viewLayout.version: 1`, `animalCount`, each array's element type/count/stride/exact byte length, the four `animalValues` fields and units, and action codes. The client verifies each typed array and its backing buffer are densely packed to that layout before applying it. The three array buffers remain transferred in the same ID/value/action order.

An unversioned message is legacy only when the version property is absent and its type is one of the known commands or response types. The adapter preserves documented defaults, validates the known legacy shape, and returns a v1 response. A present but malformed version, an unsupported version, an unknown command or a malformed legacy payload returns a structured `error` with a stable code and readable message. Unversioned commands remain supported throughout protocol v1; removing them requires a separately documented protocol transition.

## Memory and lifetime

For each WASM batch, JS packs the current values into a typed array. `src/client/metabolism-wasm.js` copies the used prefix into WASM linear memory, invokes one batch call, and copies the result prefix back into a reusable JS result buffer. Calls are not zero-copy. Pointers allocated by `riose_alloc_f64` are owned by the adapter until `dispose()` or Worker termination. They are valid only with their matching capacity and ABI instance. Do not retain a result view past the next kernel call; the engine consumes it synchronously.

## Scientific metadata

Every future scientific-model package must declare model ID/version, domain, required input names and physical units, parameter definitions and provenance, time resolution, assumptions, limitations, uncertainty method, validation status, evidence references, and software build. A computation returning a value does not imply calibration or validity.
