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

`--input -` reads one UTF-8 JSON document from stdin through EOF. If `--output` is omitted or is `-`, the result is written to stdout. If `--output PATH` is supplied, stdout is empty and the result is written to that file. Duplicate/unknown flags and positional arguments are usage errors. Help and version are separate human-readable modes.

On success, machine output is compact UTF-8 JSON with exactly one trailing LF. A file result and stdout result use the same bytes. Diagnostics never go to stdout.

## Request envelope (outer fields only)

The outer request is versioned and requires an explicit unsigned 32-bit seed. It contains one scenario payload whose schema is owned by the stable #84 API. Do not freeze payload field names, scenario IDs, duration units, defaults, or supported feature lists until that API is available.

Conceptual shape:

```json
{
  "type": "riose-native-run",
  "version": 1,
  "seed": 917,
  "scenario": { "...": "validated by the #84 native scenario contract" }
}
```

No seed coercion or defaulting is allowed. Unknown request or scenario fields fail explicitly. The final schema should reject unknown keys at every declared object boundary.

## Result envelope

The success result has a versioned type, a deterministic run identity, the validated-input digest, an explicit native engine/build identity, and the core's declared deterministic outputs. It does not echo raw input bytes or include paths, timestamps, host details, process IDs, or runtime measurements.

```json
{
  "type": "riose-native-result",
  "version": 1,
  "status": "ok",
  "runId": "sha256:…",
  "inputDigest": "sha256:…",
  "engine": { "id": "riose-core/native-v1", "version": "…", "buildId": "sha256:…" },
  "seed": 917,
  "outputs": {}
}
```

The exact output projection and build fingerprint must be finalized against the #84 API. In particular, elapsed time such as `SimulationMetrics.elapsedNanoseconds` is diagnostic data and must not enter the result or any deterministic digest.

## Determinism profile

Use a named native JSON profile. Hash the validated typed request, not its original whitespace or key order. Keep DTO field order fixed and preserve core-defined array order. Reject duplicate keys, unknown keys, and non-finite numeric outputs. Normalize negative zero consistently. Emit no BOM and exactly one LF. Do not claim compatibility with the JavaScript manifest canonicalization in #103 until independently reconciled.

The input digest excludes transport whitespace and the trailing output LF. `runId` is a hash over a versioned identity record containing the input digest, deterministic engine/build identity, and result-contract version. Build identity must not depend on runtime working directory, wall clock, hostname, or the Git HEAD observed when the executable is run.

## Failure contract

Failures produce no success record. Emit one stable JSON diagnostic line on stderr with a fixed code and, for field errors, a JSON Pointer. Do not include raw OS or serde error strings in the stable message.

| Exit code | Meaning |
| ---: | --- |
| 0 | Successful run, help, or version |
| 2 | CLI usage error |
| 3 | Input read failure |
| 4 | Invalid JSON or invalid request values |
| 5 | Unsupported request version, field, or native feature |
| 6 | Native execution failure or non-finite result |
| 7 | Result serialization or output write failure |

Validation order is fixed: CLI arguments, input read, JSON syntax and duplicate-key check, request type/version, unsupported-field screening, field and cross-field validation, core execution, result serialization, output write. This determines which error is reported when a request has multiple faults.

## Integration boundaries

- #84 supplies the only authoritative native scenario API and supported-field list.
- #86 may consume the committed input/result fixture after the CLI and #84 API are stable; it owns cross-language trajectory comparison.
- #103 may add an adapter later, but #85 does not consume or redefine the manifest contract.
- #104 may reference deterministic run identity later; resume state and checkpoint semantics are out of scope.
