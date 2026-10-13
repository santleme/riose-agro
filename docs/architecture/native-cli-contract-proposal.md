# Native scenario CLI contract proposal

Status: reconciled against the stable #84 API merged by PR #122 at `8f7f304746098a8443d984abc6bb4be9ae5a1ed6`.

## Contract deltas after #84 merge

| Proposal field | Merged API behavior | Delta | Action |
| --- | --- | --- | --- |
| Request tagged by `type` and `version` | `NativeScenarioRequest` is a strict tagged enum with `baseline` and `housing-comparison`, version 1 | Names and fields are now frozen; unknown nested fields are rejected by Serde DTOs | Deserialize the request directly into the public enum after duplicate-key and version checks |
| Baseline seed and configuration | Baseline requires `seed: u32`, `animalCount`, `configuration`, and `hours`; configuration fields default in the core DTO | The CLI must not invent defaults for seed or required top-level request fields | Preserve input request bytes and let the core validate the typed request |
| Housing snapshot | Snapshot DTO validates 1–10,000 animals, exactly four paddocks, finite model values, and supported configuration | Snapshot `initialSeed` and `locomotionSeed` may be omitted and derived by the core | Use the native DTO and core validation; report validation failure without rewriting snapshot state |
| Result envelope | `NativeRunResult` carries `version`, `engine`, and tagged `result`; engine has `engineVersion`, `buildId`, `modelStatus`, `provenance`, `validated` | `buildId` is `RIOSE_BUILD_ID` or reproducible `riose-core@0.1.0`; fallback makes no commit provenance claim | Embed the typed native result once in the CLI record; do not duplicate engine metadata |
| `--input` | Transport is independent of the scenario API | The proposal required a flag although the task requires stdin fallback | Omitted `--input` and `--input -` both read stdin |
| Supported scenarios | Only baseline and pasture-versus-barn housing comparison are supported | Heat intervention, reduced feed, limited trough access, other paddock models, and observed-farm snapshots are unsupported | Reject unsupported scenario/type values; never translate them |
| Errors and exit codes | Core returns descriptive `String` errors for invalid versions, counts, hours, days, and configuration | Core messages are not a stable CLI contract | Map failures to fixed CLI codes/messages and stable exit codes |

The main branch also merged #123 after #84. Its changes are confined to visual assets and the pilot page; they do not change the native request/result API or the #84 scenario goldens.

## Scope

`riose-run` is a one-shot, local process around the native core. It accepts one versioned request, validates it before execution, and emits one versioned result. It does not discover directories, resume batches, execute concurrent jobs, or translate an experiment manifest.

The CLI owns transport and error classification. The #84 core owns the accepted scenario fields, their defaults, and simulation behavior. The CLI must reject fields the core does not support; it must not map them to approximate behavior.

## Invocation

```text
riose-run [--input PATH] [--output PATH]
riose-run --input - [--output PATH]
```

If `--input PATH` is supplied, read one UTF-8 JSON document from that file; `--input -` reads stdin. If `--input` is absent, read stdin. If `--output` is omitted or is `-`, write the result to stdout. If `--output PATH` is supplied, stdout is empty and the result is written to that file. Reject input/output aliases. For file output, complete request validation, execution, and serialization before opening a temporary sibling file, then replace the destination only after the full result has been written. Duplicate/unknown flags and positional arguments are usage errors. Help and version are separate human-readable modes.

On success, machine output is compact UTF-8 JSON with exactly one trailing LF. A file result and stdout result use the same bytes. Diagnostics never go to stdout.

## Request contract (stable binding to #84)

The input serializes the public #84 `NativeScenarioRequest` directly, rather than inventing a second scenario schema. It is a tagged request with `type` variants `baseline` and `housing-comparison`, each carrying `version: 1`. Baseline carries its seed, animal count, configuration and hours; housing comparison carries a snapshot and days. The authoritative DTOs and supported values are documented in [`native-farm-core.md`](../native-farm-core.md).

Before typed deserialization, inspect the request discriminator and version so an unknown future version is reported as unsupported even if its payload no longer matches the current struct. Do not classify it as malformed JSON or silently try a different version.

Conceptual shape:

```json
{
  "type": "baseline",
  "version": 1,
  "seed": 917,
  "animalCount": 2,
  "configuration": { "...": "validated by the #84 native scenario contract" },
  "hours": 24
}
```

No seed coercion or defaulting is allowed for baseline runs. Snapshot-based runs retain the seed and RNG state in the typed snapshot. Unknown request or scenario fields fail explicitly. The final schema should reject unknown keys at every declared object boundary.

## Result envelope

The success result has a versioned type, a deterministic run identity, the input-byte digest, an explicit native engine/build identity, and the core's declared deterministic outputs. It does not echo raw input bytes or include paths, timestamps, host details, process IDs, or runtime measurements.

```json
{
  "type": "riose-native-result",
  "version": 1,
  "requestVersion": 1,
  "scenario": "baseline",
  "seed": 917,
  "status": "success",
  "runId": "sha256:…",
  "inputSha256": "sha256:…",
  "nativeResult": {
    "version": 1,
    "engine": { "engineVersion": "…", "buildId": "…", "modelStatus": "…", "validated": false },
    "result": {}
  }
}
```

The `requestVersion` and `scenario` fields identify the consumed request; `seed` is the explicit baseline seed or the snapshot's `initialSeed` for a housing comparison. `nativeResult` contains #84's typed `NativeRunResult`, including authoritative engine metadata. Elapsed time must not enter the result or any deterministic digest. `runId` is deterministic: SHA-256 over the UTF-8 bytes `riose-run-id-v1\n`, followed by the lowercase hex input digest, `\n`, the exact native `buildId`, `\n`, and decimal result protocol version `1` (without a final newline). Do not generate a random run UUID.

## Determinism profile

Hash the exact input bytes with SHA-256, excluding no bytes; file and stdin inputs with identical bytes therefore have the same digest. Whitespace or key-order changes produce a different digest. This identifies the received artifact without inventing a canonical JSON algorithm. Keep the typed result DTO field order fixed and preserve core-defined array order. Reject duplicate keys, unknown keys, and non-finite numeric outputs. Emit no BOM and exactly one LF. Do not claim compatibility with the JavaScript manifest canonicalization in #103 until independently reconciled.

The digest is over the exact received input bytes. The output's trailing LF is transport framing and is not part of either digest. The #84 build identity is the compile-time `RIOSE_BUILD_ID` when supplied, otherwise `riose-core@0.1.0`; the fallback identifies the crate version and does not claim source commit provenance. It does not depend on runtime working directory, wall clock, hostname, or Git HEAD observed at runtime.

## Failure contract

Failures produce no success record. Emit one stable JSON diagnostic line on stderr with a fixed code and, for field errors, a JSON Pointer. Do not include raw OS or serde error strings in the stable message.

```json
{"type":"riose-cli-error","version":1,"status":"error","code":"INVALID_REQUEST","field":"/seed","message":"seed must be an unsigned 32-bit integer."}
```

Use fixed diagnostic messages and validation order. Syntax diagnostics may include stable numeric line/column fields. An output path that is syntactically invalid is a usage error; a valid path that cannot be created or written is an output error. The Rust release profile currently uses `panic = "abort"`; the CLI can guarantee structured errors for returned failures, but not for process aborts or external signals.

| Exit code | Meaning |
| ---: | --- |
| 0 | Successful run, help, or version |
| 2 | CLI usage error |
| 3 | Input read failure |
| 4 | Invalid JSON text |
| 5 | Invalid request values: missing required fields, wrong types, or out-of-range values |
| 6 | Unsupported request version, field, profile, or native capability |
| 7 | Native execution or result serialization failure |
| 8 | Output creation, write, or commit failure |

Validation order is fixed: CLI arguments, input read, JSON syntax and duplicate-key check, request type/version dispatch, required-field and supported-value validation, unsupported-field/capability screening, cross-field validation, core execution, result serialization, output write. This determines which error is reported when a request has multiple faults. Unsupported version/profile/field/capability errors receive stable codes and JSON Pointers. Missing or malformed supported fields receive invalid-request codes. Do not fall back to JavaScript or silently reinterpret unsupported fields.

## Integration boundaries

- #84 supplies the only authoritative native scenario API and supported-field list. The merged API is stable for #85 integration.
- #86 may consume the committed input/result fixture after the CLI and #84 API are stable; it owns cross-language trajectory comparison.
- #103 may add an adapter later, but #85 does not consume or redefine the manifest contract.
- #104 may reference deterministic run identity later; resume state and checkpoint semantics are out of scope.
