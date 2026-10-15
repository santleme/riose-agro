# Compute service and backend selection

The compute service runs the existing deterministic livestock metabolism batch. It does not replace the scenario engine or change its equations, feeding rules, snapshots, or replay contract. Contract version `1` accepts `livestock_metabolism_batch` with ordered Float64 inputs `[weight, energy, intake, resting]` and returns `[next weight, next energy]` for each animal.

## Start and inspect capabilities

```bash
python3 src/server/compute_service.py
```

The service listens on `127.0.0.1:8766`. `GET /health` reports service health. `GET /api/compute/backends` reports CPU, CUDA, and ROCm capability using the loaded PyTorch build, runtime/device availability, a device name, and runtime version. Accelerator detection imports PyTorch only when an accelerator is requested or capability metadata is queried; the CPU computation itself has no PyTorch dependency.

PyTorch CUDA and ROCm builds both expose their device as `torch.cuda`. The detector distinguishes CUDA from ROCm using `torch.version.cuda` versus `torch.version.hip`, then requires an available device, a readable device name, and a successful Float64 allocation/synchronization probe. A failed probe is reported as unavailable. Merely seeing a vendor or GPU name does not select an accelerator.

## Backend policy

`preferred_backend` accepts `auto`, `cpu`, `cuda`, and `rocm`; legacy `amd` maps to `rocm` for the #137 runbook. `auto` tries CUDA first, then ROCm, then CPU. An explicit accelerator request that is unavailable or fails during execution returns a CPU result with `fallback_used: true`, the actual `backend_used: "cpu"`, and a reason. It never labels CPU work as GPU execution. CPU requests run the Python reference path directly and do not initialize PyTorch.

Accelerator results use Float64 tensors and the same metabolism operation order and constants as the existing client kernel: maintenance `5.3`, gain factor `0.22`, weight floor `200 kg`, and energy clamp `[0,100]`. Result metadata identifies the requested and selected backend, actual backend, device, runtime, fallback reason, and whether fallback occurred. Product displays availability from the service and reports the backend actually used after each tick.

The Product calls the generic `/api/compute/livestock-metabolism` proxy. The existing `/api/amd/metabolism-batch` route and `runAmdMetabolismBatch` helper remain for the #137 AMD runbook and continue to reject CPU fallback as AMD proof.

## Reproduce livestock parity

With the Node Product server and Python compute service available, run:

```bash
npm run verify:compute-livestock
```

This uses `FarmEngine(seed=2026)` to construct a 24-animal, one-hour metabolism input, records the exact Float64 fixture and SHA-256, runs the CPU reference and three repetitions for Auto, CUDA, and ROCm preferences, compares weight and energy outputs at absolute and relative tolerance `1e-12`, verifies deterministic repeats, and records observed backend identity and local service latency. It fails if an available accelerator is detected but the execution silently falls back. Its output is parity/runtime evidence; reported request latency is not an acceleration claim.

The #137 physical AMD verifier remains separate:

```bash
npm run verify:amd-livestock
```

That command requests ROCm explicitly and fails unless the service reports `backend_used: "amd_rocm"` with no CPU fallback. Mocked adapter tests are not physical execution evidence.

## Tests

```bash
python3 -m unittest tests.test_compute_service
node --test tests/amd-metabolism.test.js tests/worker-protocol.test.js
```

These tests exercise backend selection, capability failures, reporting, deterministic CPU parity, and fallback. Simulated CUDA/ROCm tests validate control flow only; hardware claims require a recorded run on the corresponding device/runtime.
