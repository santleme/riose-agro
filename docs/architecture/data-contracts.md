# Data contracts

## Compatibility policy

Existing `agroville-comparison` manifest v1, farm snapshot schema and outcome-record schema remain unchanged in this prototype. New fields are additive only where existing consumers ignore them; breaking changes require a new schema/manifest version and an explicit migration. A saved comparison must keep its original implementation/model provenance when replayed.

## Message categories

| Contract | Initial encoding | Version / validation |
| --- | --- | --- |
| Scenario configuration and UI commands | JSON | Existing enums and validation; command envelope should gain an explicit protocol version before external clients appear |
| Farm snapshot and comparison manifest | JSON | Current JSON Schemas and manifest `type`/`version`; preserve exact manifest bytes for digest links |
| Small Worker state envelope | Structured clone / JSON-compatible values | Include engine implementation metadata; current state payload still contains descriptive objects |
| Dense metabolism input | `Float64Array`, packed `[weight, energy, intake, resting]` per animal | ABI `riose-metabolism-batch/1`, count ≤ 100,000, all buffers are `f64` values; reserved field expansion requires a new ABI version |
| Dense metabolism output | `Float64Array`, packed `[weight, energy]` per animal | Same order and count as input, finite numeric values expected for valid model state |
| Scientific results / large analytical exports | CSV today; Arrow/Parquet candidate | Include scenario ID, seed, model/version, units, source/provenance, timestamps and validation status |
| Errors | Worker `error` message or negative ABI status | Do not silently return default scientific values; JS fallback is a runtime choice and is reported separately |

## Memory and lifetime

For each WASM batch, JS packs the current values into a typed array. `metabolism-wasm.js` copies the used prefix into WASM linear memory, invokes one batch call, and copies the result prefix back into a reusable JS result buffer. Calls are not zero-copy. Pointers allocated by `riose_alloc_f64` are owned by the adapter until `dispose()` or Worker termination. They are valid only with their matching capacity and ABI instance. Do not retain a result view past the next kernel call; the engine consumes it synchronously.

## Scientific metadata

Every future scientific-model package must declare model ID/version, domain, required input names and physical units, parameter definitions and provenance, time resolution, assumptions, limitations, uncertainty method, validation status, evidence references, and software build. A computation returning a value does not imply calibration or validity.
