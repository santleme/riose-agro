# Native scenario CLI

`riose-run` executes one supported native scenario per process and reads or
writes JSON only. It calls `riose_core::run_native_scenario` directly; the
JavaScript engine remains the browser authority.

## Invocation

```sh
cargo run --release -p riose-core --bin riose-run -- \
  --input request.json --output result.json
```

Omit `--input` or pass `--input -` to read one UTF-8 JSON document from stdin.
Omit `--output` or pass `--output -` to write the result to stdout. File output
is serialized before a sibling temporary file is opened and replaces the
destination only after the full record has been written. Input and output may
not refer to the same file. `--help` and `--version` print human-readable text
to stdout.

The input is the strict, versioned `NativeScenarioRequest` from the
[`native-farm-core` contract](native-farm-core.md). Its supported variants are
`baseline` and `housing-comparison`. The core defines the accepted fields,
configuration values, and snapshot requirements. Unknown fields, duplicate
JSON keys, unsupported enum values, and unsupported scenario types are rejected.

## Result record

Successful runs emit compact UTF-8 JSON followed by one LF. The record is
ordered as `type`, `version`, `requestVersion`, `scenario`, `seed`, `status`,
`runId`, `inputSha256`, `nativeResult`. The `nativeResult` value is the typed
`NativeRunResult` from #84 and includes the native engine metadata. For a
housing comparison, `seed` is the snapshot's `initialSeed`; the complete
snapshot, including current model and locomotion RNG states, remains inside the
input digest and native request.

`inputSha256` hashes the exact input bytes, including whitespace and key order.
`runId` hashes the UTF-8 identity record
`riose-run-id-v1\n<input SHA-256 hex>\n<buildId>\n1` (no final LF).
The native engine reports `RIOSE_BUILD_ID` when set at compile time, otherwise
`riose-core@0.1.0`. The fallback identifies the crate version and does not
claim source commit provenance. Runtime paths, time, host, and process ID do
not enter either digest.

On failure there is no success record. Stderr receives one compact JSON error
record with a fixed code, message, and JSON Pointer when a field is identified.
No diagnostic text is written to stdout.

| Exit code | Code(s) | Meaning |
| ---: | --- | --- |
| 0 | — | Scenario succeeded; `--help` and `--version` also succeed |
| 2 | `USAGE_ERROR` | Invalid, duplicated, unknown, or positional CLI argument; input/output alias |
| 3 | `INPUT_IO` | Input file or stdin could not be read |
| 4 | `INVALID_JSON` | Malformed JSON or duplicate object key |
| 5 | `INVALID_REQUEST`, `VALIDATION_ERROR` | Missing/wrong request fields or invalid values/snapshot |
| 6 | `UNSUPPORTED_VERSION`, `UNSUPPORTED_FIELD`, `UNSUPPORTED_SCENARIO` | Request requires a version, field, enum value, or scenario the core does not support |
| 7 | `NATIVE_EXECUTION`, `RESULT_SERIALIZATION` | Native execution or result serialization failed |
| 8 | `OUTPUT_IO` | Output could not be written or committed |

The error selection order is CLI arguments, input read, JSON syntax/duplicate
keys, request type/version, required and supported values, unsupported fields
and capabilities, native validation/execution, result serialization, then
output. Error text is fixed and does not include raw OS or Serde messages.

## Performance measurements

Measure process startup with repeated `riose-run --version` invocations. Measure
scenario execution independently with the existing native core benchmark or a
direct `run_native_scenario` timing using the same request. Record the two
measurements separately; do not present them as a speed comparison or claim.
