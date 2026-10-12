# Native scenario CLI contract proposal

Status: transport and result behavior are proposed for issue #85. The input scenario fields and executable fixture remain unfinalized until issue #84 provides a stable native scenario API.

## Scope

`riose-run` is a one-shot, local process around the native core. It accepts one versioned request, validates it before execution, and emits one versioned result. It does not discover directories, resume batches, execute concurrent jobs, or translate an experiment manifest.

The CLI owns transport and error classification. The #84 core owns the accepted scenario fields, their defaults, and simulation behavior. The CLI must reject fields the core does not support; it must not map them to approximate behavior.

## Invocation

```text
riose-run --input PATH [--output PATH]
riose-run --input - [--output PATH]
```

`--input PATH` is required; `--input -` reads one UTF-8 JSON document from stdin through EOF. If `--output` is omitted or is `-`, the result is written to stdout. If `--output PATH` is supplied, stdout is empty and the result is written to that file. Reject input/output aliases. For file output, complete request validation, execution, and serialization before opening a temporary sibling file, then replace the destination only after the full result has been written. Duplicate/unknown flags and positional arguments are usage errors. Help and version are separate human-readable modes.

On success, machine output is compact UTF-8 JSON with exactly one trailing LF. A file result and stdout result use the same bytes. Diagnostics never go to stdout.

## Request contract (provisional binding to #84)

The input should serialize the stable #84 `NativeScenarioRequest` directly, rather than inventing a second scenario schema. Its current uncommitted proposal is a tagged request with `type` variants for `baseline` and `housing-comparison`, each carrying `version: 1`. Baseline carries its seed, animal count, configuration and hours; housing comparison carries a snapshot and days. Those names and fields are observations from the active #84 worktree, not a frozen contract. Do not integrate them or claim the fixture is executable until #84 publishes a stable commit.

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
  "runId": "sha256:…",
  "inputSha256": "sha256:…",
  "engine": { "engineVersion": "…", "buildId": "…", "modelStatus": "…", "validated": false },
  "result": {}
}
```

The `result` field contains #84's typed `NativeRunResult`. The exact output projection and build fingerprint must be finalized against the stable #84 API. In particular, any elapsed time is diagnostic data and must not enter the result or any deterministic digest. `runId` is deterministic: hash a versioned identity tuple of `inputSha256`, the stable native `buildId`, and the result contract version. Do not generate a random run UUID.

## Determinism profile

Hash the exact input bytes with SHA-256, excluding no bytes; file and stdin inputs with identical bytes therefore have the same digest. Whitespace or key-order changes produce a different digest. This identifies the received artifact without inventing a canonical JSON algorithm. Keep the typed result DTO field order fixed and preserve core-defined array order. Reject duplicate keys, unknown keys, and non-finite numeric outputs. Emit no BOM and exactly one LF. Do not claim compatibility with the JavaScript manifest canonicalization in #103 until independently reconciled.

The digest is over the exact received input bytes. The output's trailing LF is transport framing and is not part of either digest. `runId` is a hash over a versioned identity record containing the input digest, deterministic engine/build identity, and result-contract version. Build identity must not depend on runtime working directory, wall clock, hostname, or the Git HEAD observed when the executable is run. The current #84 draft's `buildId: "unspecified"` is not sufficient to identify the built native engine; #84 must provide a stable build identity before #85 can claim this acceptance criterion.

## Failure contract

Failures produce no success record. Emit one stable JSON diagnostic line on stderr with a fixed code and, for field errors, a JSON Pointer. Do not include raw OS or serde error strings in the stable message.

```json
{"type":"riose-cli-error","version":1,"code":"SEED_INVALID","field":"/seed","message":"seed must be an unsigned 32-bit integer."}
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

- #84 supplies the only authoritative native scenario API and supported-field list. The current dirty #84 worktree is useful design evidence only; its API is not stable for #85 integration.
- #86 may consume the committed input/result fixture after the CLI and #84 API are stable; it owns cross-language trajectory comparison.
- #103 may add an adapter later, but #85 does not consume or redefine the manifest contract.
- #104 may reference deterministic run identity later; resume state and checkpoint semantics are out of scope.
