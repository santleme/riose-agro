# Physical NVIDIA GPU metabolism benchmark

**Decision: NO_GO for accelerator adoption.** The CUDA kernel executed on the physical GTX 1060 and matched the native Rust implementation at all tested sizes. End-to-end GPU medians were slower than the CPU medians at every population, including 100,000 animals. The kernel-only result at 100,000 animals was 3.64× faster, but it does not include transfers, synchronization, allocation, host input setup, or device-buffer frees.

This is the NVIDIA vendor-specific evidence for issue #111 under the vendor-neutral accelerator research objective in #77. It makes no claim about AMD/ROCm or cross-vendor performance.

## Setup and method

- GPU: NVIDIA GeForce GTX 1060 6GB, compute capability 6.1, driver 580.88, CUDA Driver API 13.0; physical device exposed to Ubuntu 24.04 through WSL2.
- CPU: Intel Core i5-10400F @ 2.90GHz. Runtime: Python 3.12.3, Linux x86_64, WSL2 kernel 6.6.87.2.
- Workload: same native Rust metabolism batch ABI and formula, with an isolated PTX CUDA implementation. Float64 inputs and outputs; deterministic input state; relative and absolute correctness tolerances each 1e-12.
- Populations: 100, 1,000, 10,000, and 100,000. The last case is numeric-kernel-only; FarmEngine and renderer limits remain 10,000.
- Three warmups and 21 measured repetitions per population. Reported cells are median [minimum–maximum] milliseconds; the JSON retains every raw observation.
- The GPU path was gated by a real 100-animal CUDA execution and comparison with native Rust. Correctness also passed at every population and each measured repetition. No CPU fallback is used to claim GPU execution.
- Common deterministic host input creation is timed separately. CPU end-to-end includes that common setup, its CPU output allocation, and the native batch call. GPU total includes the same common input setup, device allocation, its own host output allocation, H2D, launch, synchronization, D2H, and both device-buffer frees. The separate preallocated steady-state measurement reuses device buffers but still includes host output allocation, transfers, and synchronization.
- CUDA event time measures the kernel. Host synchronization is reported separately because it includes waiting for queued GPU work; do not add the two as independent costs.

## Results

| Animals | CPU kernel | CPU end-to-end | Device allocation | H2D | Host launch | GPU kernel | Synchronization | D2H | GPU warm total | GPU steady state with transfers | Kernel-only speedup | Warm end-to-end speedup |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.0208 [0.0148–0.0292] | 0.1440 [0.0892–0.2469] | 0.6164 [0.4965–0.9475] | 0.0542 [0.0355–0.1192] | 0.0326 [0.0184–0.0621] | 0.0175 [0.0051–0.0891] | 0.0460 [0.0118–0.3021] | 0.0637 [0.0561–0.1570] | 1.2967 [1.1453–1.6748] | 0.1786 [0.1393–0.8884] | 1.19× | 0.11× |
| 1,000 | 0.0381 [0.0215–0.0755] | 0.9786 [0.6986–1.2545] | 0.7104 [0.6049–1.4982] | 0.0609 [0.0378–0.1647] | 0.0315 [0.0209–0.1655] | 0.0266 [0.0061–0.2765] | 0.0463 [0.0090–0.1533] | 0.0726 [0.0470–0.1462] | 2.3028 [1.7698–2.9236] | 0.2450 [0.1454–0.5192] | 1.43× | 0.42× |
| 10,000 | 0.0672 [0.0513–0.1563] | 7.4606 [6.2867–13.7589] | 0.6869 [0.4920–1.2257] | 0.0817 [0.0611–0.1852] | 0.0391 [0.0265–0.1700] | 0.1383 [0.0649–0.4238] | 0.1100 [0.0060–0.2010] | 0.0978 [0.0771–0.3598] | 8.6594 [7.3309–15.1734] | 0.3709 [0.2101–0.4884] | 0.49× | 0.86× |
| 100,000* | 0.5370 [0.3518–3.3947] | 79.2662 [64.7575–154.3270] | 1.1282 [0.9182–3.8503] | 0.5296 [0.4018–0.9673] | 0.0475 [0.0294–0.1095] | 0.1476 [0.1131–0.2333] | 0.1478 [0.0080–0.2535] | 0.4034 [0.3251–0.6959] | 81.6764 [66.8063–156.9059] | 1.3689 [1.1312–1.7684] | 3.64× | 0.97× |

*The 100,000-animal case is isolated numeric-kernel research, beyond the current FarmEngine and renderer limits. It is not evidence of a production workload.

First-run GPU total, including CUDA driver/device/context/PTX initialization, had a median of 280.98 ms, 281.99 ms, 288.34 ms, 361.36 ms for 100, 1,000, 10,000, and 100,000 animals respectively. The corresponding CPU end-to-end medians were 0.14 ms, 0.98 ms, 7.46 ms, 79.27 ms.

## Interpretation and limits

The isolated GPU kernel was faster at 100, 1,000, and 100,000 animals in this capture, and slower at 10,000. Those kernel-only gains do not offset allocation, copy, synchronization, cleanup, and host overhead. End-to-end GPU medians lost at every tested size, so the evidence does not justify adding an accelerator path or changing defaults. No product dependency or production integration is proposed.

The harness creates deterministic input arrays in Python and includes that preparation in both end-to-end paths; it does not measure FarmEngine orchestration, state packing, feeding, weather, snapshots, worker scheduling, UI, or rendering. The CUDA kernel is a separate PTX translation of the existing Rust formula and is not integrated into production. Only one GTX 1060/driver/runtime combination was measured. This benchmark does not replace or extend the prior AMD evidence. The final recapture reused the existing native riose_core shared library because Cargo is unavailable in this WSL environment; the benchmark branch leaves the native Rust sources unchanged.

## Reproduction and provenance

```bash
python3 scripts/benchmark_nvidia_metabolism.py --output /tmp/nvidia-metabolism-report.json
python3 -m unittest discover -s tests -p test_benchmark_nvidia.py
```

The command requires the NVIDIA CUDA driver library and a real usable NVIDIA device. If the backend is unavailable, it emits a blocked result with `gpuExecutionClaim: false`; it does not fall back to CPU as GPU evidence. The generated report is [nvidia-metabolism-benchmark-2026-10.json](nvidia-metabolism-benchmark-2026-10.json) and validates against the shared benchmark report schema.

- Baseline `main`: `0d79e416a5297b846274001d3b3281a1e674c674`
- Fresh branch: `codex/issue-111-vendor-neutral-gpu`; benchmark implementation and capture source: clean worktree at `dd52ab99d2ab58942ab0820a66ce1bfc112d5f41`
- Input payload SHA-256: `e14abf40b600aa4eab044bce048423287d5585e594067f8a7e7e5cea374daa8b`
