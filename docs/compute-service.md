# Compute service (contract v1)

This is a standalone Python endpoint for reproducible compute operations. The CPU path uses only the Python standard library; optional PyTorch runtimes provide CUDA or ROCm execution when a usable device is available. No LLM or internet access is required. Product population comparisons, checkpoint branches, and scenario replay continue to use their existing engines; they do not call this service.

## Run

```bash
python3 src/server/compute_service.py
```

The service listens on `127.0.0.1:8766` by default. Set `COMPUTE_HOST` or `COMPUTE_PORT` to override the bind address or port. `GET /health` returns the service and contract version. `GET /api/compute/backends` reports CPU availability, CUDA/ROCm availability and reasons, device and runtime versions, PyTorch version, and the automatic selection order.

## Compute request

`POST /api/compute/v1` accepts JSON with this versioned shape:

```json
{
  "contract_version": "1",
  "operation": "scale_vector",
  "payload": {"values": [1, -2.5, 4], "factor": 2},
  "preferred_backend": "auto"
}
```

`preferred_backend` is `auto`, `cpu`, `cuda`, or `rocm`; `amd` remains an alias for `rocm`. It defaults to `auto`. The operation multiplies each finite number in `values` by the finite `factor`. The array must be non-empty and contain at most 100,000 values. CPU and PyTorch both use IEEE-754 `float64`; integer inputs outside ±2^53 are rejected because they cannot all be represented exactly. Invalid JSON or contract/input fields return HTTP 400. Requests are limited to 1 MiB.

An example response is:

```json
{
  "contract_version": "1",
  "status": "ok",
  "backend_requested": "cpu",
  "backend_used": "cpu",
  "backend_selected": "cpu",
  "hardware_available": false,
  "fallback_used": false,
  "mode": "cpu",
  "result": {"values": [2, -5, 8]},
  "execution_metadata": {
    "operation": "scale_vector",
    "runtime": "python",
    "torch_version": null,
    "rocm_version": null,
    "cuda_version": null,
    "device_name": null,
    "backend_selected": "cpu",
    "fallback_reason": null,
    "deterministic": true
  }
}
```

The example shows an explicit CPU request. Responses also include `backend_availability` with runtime detection details; a CPU request reports accelerator detection as `not_requested` and does not initialize PyTorch.

## Livestock metabolism batch

The second operation exposes the existing illustrative metabolism kernel, with four inputs per animal in the original animal order:

```json
{
  "contract_version": "1",
  "operation": "livestock_metabolism_batch",
  "payload": {"count": 2, "values": [330, 75, 0.4, 0, 360, 98, 1.2, 1]},
  "preferred_backend": "auto"
}
```

Each input group is `[weightKg, energy, intakeKgDM, resting]`; a nonzero resting value selects the resting energy update. `count` must be an integer from 1 to 10,000, and `values` must contain exactly `count * 4` finite numbers. `result.values` contains `[nextWeightKg, nextEnergy]` for each animal, and `execution_metadata.animal_count` reports the batch size. The formulas retain maintenance `5.3`, gain factor `0.22`, minimum weight `200`, and energy bounds `0–100` from the client kernel. This numeric operation does not advance feeding, pastures, behavior, costs, or population timelines and does not add scientific validation.

## Backend detection and fallback

CUDA or ROCm is reported as available only when the active PyTorch build exposes the corresponding runtime, `torch.cuda.is_available()` reports a device, and a float64 allocation/reduction probe succeeds. Both runtimes use PyTorch's `cuda` device API. A CUDA build without ROCm is not reported as AMD. Detection describes the active PyTorch runtime; it does not inventory every GPU installed on the host.

`auto` chooses an available CUDA runtime, then ROCm, then CPU. An unavailable requested runtime or an accelerator execution failure completes on CPU and reports `status: "fallback"`, `backend_used: "cpu"`, `hardware_available: false`, `fallback_used: true`, and `mode: "cpu_fallback"`. Automatic selection without any available accelerator also reports this explicit fallback. `execution_metadata.fallback_reason` records the cause; it is `null` when no fallback was needed. Successful accelerator results use `backend_used: "cuda"` or `"amd_rocm"`. `backend_selected` records the selected/requested runtime even when execution falls back, while `backend_used` identifies the actual executor. An explicit CPU request always stays on CPU.

## Capture livestock parity

With the service running, execute:

```bash
npm run verify:compute-livestock
```

The verifier calls the Python service directly, using `COMPUTE_SERVICE_URL` or `http://127.0.0.1:8766`. It captures one ordered metabolism batch from `FarmEngine` (seed 2026, 24 animals, one hour), compares CPU/Auto/CUDA/ROCm outputs with the JavaScript kernel using absolute and relative tolerances of `1e-12`, and repeats each non-CPU selection three times to check reproducibility. It records input/output SHA-256 digests, device/runtime identity, fallback reasons, and whether each accelerator actually executed. Unavailable hardware is recorded as CPU fallback. Available hardware that unexpectedly falls back causes verification to fail. Request timings describe local HTTP latency and are not a speedup claim. Numerical parity does not establish scientific model validity or full population replay parity.

## Tests

Run the CPU-only service tests with:

```bash
python3 -m unittest tests/test_compute_service.py
```

They do not require PyTorch or GPU hardware. Accelerator unit cases use simulated adapters; physical execution evidence requires a verifier run on the corresponding runtime and device.

## CPU versus AMD benchmark

Run the reproducible benchmark from the repository root:

```bash
npm run benchmark:amd
```

It measures the existing `scale_vector` operation by calling `compute_service.execute_compute` directly. This reuses the service's CPU and ROCm adapters while excluding HTTP transport and server queueing. Both requests use contract version 1, the same 16,384-element deterministic input (`values[i] = ((i * 17 % 2001) - 1000) / 1000`), and factor `1.125`; the JSON includes a SHA-256 digest of that payload. The operation is a small numeric kernel, not the farm simulation.

The benchmark runs three warmups and 15 measured repetitions per backend by default. Set `BENCH_WARMUP` or `BENCH_REPETITIONS` to change those counts. It validates CPU/AMD result equivalence first with relative and absolute tolerances of `1e-12`. It reports individual elapsed times, run count, mean, median, minimum, maximum, population standard deviation, and elements per second at the median. Speedup is `median_cpu_ms / median_amd_ms` and is emitted only after the service reports `backend_used: "amd_rocm"` for the AMD probe and every measured AMD call, and correctness passes.

AMD availability uses the service's compatibility wrapper `detect_amd_backend`, including the runtime/device probe described above. If detection or AMD execution is unavailable, the CPU benchmark still runs; AMD is reported as unavailable with its reason, no AMD timing is emitted, and speedup is `null`. If AMD falls back to CPU during a run, those timings are discarded. Tests inject a simulated adapter and do not require physical AMD hardware; simulated values are never used in a real benchmark report.

The JSON report on stdout records the timestamp, commit, OS, architecture, CPU and Python runtime, ROCm/PyTorch versions when exposed, workload digest, backend metadata, correctness result, timings, speedup and limitations. Results describe this operation and environment only; benchmark de software/hardware não implica validação científica do modelo.
