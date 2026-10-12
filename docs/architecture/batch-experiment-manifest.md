# Batch experiment manifest v1

`riose-batch-experiment` v1 identifies a batch of independent, reproducible scenario runs. It is a separate contract from `agroville-comparison` v1/v2 and farm snapshots; it does not change either older persisted format. The JSON Schema is [batch-experiment-manifest-v1.schema.json](../../schemas/batch-experiment-manifest-v1.schema.json), and the Node reader/writer helpers are [experiments/batch-manifest.js](../../experiments/batch-manifest.js).

Each run records a canonical SHA-256 digest of its scenario inputs, seed, exact engine/model identity and version when available, dataset and evidence references, unit-tagged inputs and outputs, execution status, and a digest/reference to the result record. Missing provenance is represented explicitly with `status: "missing"` and null identity fields. `unverified` means a supplied value exists but has not been independently confirmed. A reader rejects an unknown manifest `type` or `version`; it never substitutes the currently installed version.

The manifest is the batch index. Result records live separately as line-oriented JSON (`riose-experiment-result` v1), one record per completed run. The digest is calculated over canonical UTF-8 JSON with object keys sorted recursively and array order preserved. The manifest digest covers the whole manifest excluding `manifestDigest`; scenario and result digests cover their respective complete JSON objects. Non-JSON values, non-finite numbers, and cycles are rejected to prevent different readers from hashing different representations. `verifyExperimentResults` checks manifest digest, duplicate/missing/unlinked run IDs, output hashes, and optionally the resolved result reference. Result references should identify a stable line in a JSONL file, such as `results.jsonl#12`.

An experiment is reproducible only when its scenario digest, seed, exact engine/model versions, referenced dataset bytes, and output record are retained. A digest verifies identity, not scientific validity, and a reference with `unverified` status does not become validated by being included in the manifest.

## Isolated serialization measurement

Run `node scripts/benchmark-batch-manifest.mjs`. The script reports manifest and JSONL result bytes and their construction/serialization time separately. It deliberately does not run a simulation, so those timings are metadata overhead and cannot be interpreted as engine performance. Workload size and repetition count can be set with `RIOSE_EXPERIMENT_RUNS` (1–10,000) and `RIOSE_EXPERIMENT_REPETITIONS` (1–100).
