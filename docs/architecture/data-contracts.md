# Data contracts

## Compatibility policy

Existing `agroville-comparison` manifest v1, farm snapshot schema and outcome-record schema remain unchanged in this prototype. New fields are additive only where existing consumers ignore them; breaking changes require a new schema/manifest version and an explicit migration. A saved comparison must keep its original implementation/model provenance when replayed. The internal `riose-core-snapshot` v1 is a separate checkpoint contract; it does not replace or reinterpret those existing schemas.

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
