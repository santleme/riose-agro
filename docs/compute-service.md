# AMD compute service (contract v1)

This is a small, standalone Python endpoint for reproducible compute operations. It does not replace or change the JavaScript simulation engine, its snapshots, replay, manifests, or scenario contracts. The CPU path uses only the Python standard library; PyTorch is detected at runtime and is needed only to use an available AMD ROCm device. No LLM or internet access is required.

## Run

```bash
python3 src/server/compute_service.py
```

The service listens on `127.0.0.1:8766` by default. Set `COMPUTE_HOST` or `COMPUTE_PORT` to override the bind address or port. `GET /health` returns the service and contract version.

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

`preferred_backend` is `auto`, `cpu`, or `amd`; it defaults to `auto`. The operation multiplies each finite number in `values` by the finite `factor`. The array must be non-empty and contain at most 100,000 values. CPU and PyTorch both use IEEE-754 `float64`; integer inputs outside ±2^53 are rejected because they cannot all be represented exactly. Invalid JSON or contract/input fields return HTTP 400.

An example response is:

```json
{
  "contract_version": "1",
  "status": "ok",
  "backend_requested": "auto",
  "backend_used": "cpu",
  "hardware_available": false,
  "fallback_used": false,
  "mode": "cpu",
  "result": {"values": [2, -5, 8]},
  "execution_metadata": {
    "operation": "scale_vector",
    "runtime": "python",
    "torch_version": null,
    "rocm_version": null,
    "fallback_reason": null,
    "deterministic": true
  }
}
```

## Backend detection and fallback

AMD is reported as available only when PyTorch is installed, exposes a ROCm/HIP version, and `torch.cuda.is_available()` reports an available device. The service then runs this operation on PyTorch's `cuda` device, which is the device name PyTorch uses for ROCm. A CUDA build without ROCm is not reported as AMD.

When AMD is unavailable, `auto` runs on CPU and reports `backend_used: "cpu"`. An explicit `preferred_backend: "amd"` request also completes on CPU, but reports `status: "fallback"`, `backend_used: "cpu"`, `hardware_available: false`, `fallback_used: true`, and `mode: "cpu_fallback"`. `execution_metadata.fallback_reason` reports why AMD was unavailable or why its execution failed; it is `null` when no fallback was needed. It never labels a CPU result as AMD. A CPU request always stays on CPU.

This endpoint currently supports only the simple vector-scaling operation. It does not run the farm simulation, add scientific models, or measure performance. Benchmarking CPU against AMD belongs to issue #35.

## Tests

Run the CPU-only service tests with:

```bash
python3 -m unittest tests/test_compute_service.py
```

They do not require PyTorch or AMD hardware.

## CPU versus AMD benchmark

Run the reproducible benchmark from the repository root:

```bash
npm run benchmark:amd
```

It measures the existing `scale_vector` operation by calling `compute_service.execute_compute` directly. This reuses the service's CPU and ROCm adapters while excluding HTTP transport and server queueing. Both requests use contract version 1, the same 16,384-element deterministic input (`values[i] = ((i * 17 % 2001) - 1000) / 1000`), and factor `1.125`; the JSON includes a SHA-256 digest of that payload. The operation is a small numeric kernel, not the farm simulation.

The benchmark runs three warmups and 15 measured repetitions per backend by default. Set `BENCH_WARMUP` or `BENCH_REPETITIONS` to change those counts. It validates CPU/AMD result equivalence first with relative and absolute tolerances of `1e-12`. It reports individual elapsed times, run count, mean, median, minimum, maximum, population standard deviation, and elements per second at the median. Speedup is `median_cpu_ms / median_amd_ms` and is emitted only after the service reports `backend_used: "amd_rocm"` for the AMD probe and every measured AMD call, and correctness passes.

AMD availability uses the service's `detect_amd_backend`: PyTorch must expose a ROCm/HIP version and `torch.cuda.is_available()` must report a device. If detection or AMD execution is unavailable, the CPU benchmark still runs; AMD is reported as unavailable with its reason, no AMD timing is emitted, and speedup is `null`. If AMD falls back to CPU during a run, those timings are discarded. Tests inject a simulated adapter and do not require physical AMD hardware; simulated values are never used in a real benchmark report.

The JSON report on stdout records the timestamp, commit, OS, architecture, CPU and Python runtime, ROCm/PyTorch versions when exposed, workload digest, backend metadata, correctness result, timings, speedup and limitations. The endpoint does not return an AMD device model, so that field remains `null`. Results describe this operation and environment only; benchmark de software/hardware não implica validação científica do modelo.
