# AMD compute service (contract v1)

This is a small, standalone Python endpoint for reproducible compute operations. It does not replace or change the JavaScript simulation engine, its snapshots, replay, manifests, or scenario contracts. The CPU path uses only the Python standard library; PyTorch is detected at runtime and is needed only to use an available AMD ROCm device. No LLM or internet access is required.

## Run

```bash
python3 compute_service.py
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

`preferred_backend` is `auto`, `cpu`, or `amd`; it defaults to `auto`. The operation multiplies each finite number in `values` by the finite `factor`. The array must be non-empty and contain at most 100,000 values. Invalid JSON or contract/input fields return HTTP 400.

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
