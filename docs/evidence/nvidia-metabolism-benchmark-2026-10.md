# Physical NVIDIA GPU metabolism benchmark

**Decision: NO_GO for accelerator adoption.** The CUDA kernel executed on the physical GTX 1060 and matched the native Rust implementation at all tested sizes. End-to-end GPU medians were slower than the CPU medians at every population, including 100,000 animals. The kernel-only result at 100,000 animals was 1.99× faster, but it does not include transfers, synchronization, allocation, or host input setup.

This is the NVIDIA vendor-specific evidence for issue #111 under the vendor-neutral accelerator research objective in #77. It makes no claim about AMD/ROCm or cross-vendor performance.

## Setup and method

- GPU: NVIDIA GeForce GTX 1060 6GB, compute capability 6.1, driver 580.88, CUDA Driver API 13.0; physical device exposed to Ubuntu 24.04 through WSL2.
- CPU: Intel Core i5-10400F @ 2.90GHz. Runtime: Python 3.12.3, Linux x86_64, WSL2 kernel 6.6.87.2.
- Workload: same native Rust metabolism batch ABI and formula, with an isolated PTX CUDA implementation. Float64 inputs and outputs; deterministic input state; relative and absolute correctness tolerances each 1e-12.
- Populations: 100, 1,000, 10,000, and 100,000. The last case is numeric-kernel-only; FarmEngine and renderer limits remain 10,000.
- Three warmups and 21 measured repetitions per population. Reported cells are median [minimum–maximum] milliseconds; the JSON retains every raw observation.
- The GPU path was gated by a real 100-animal CUDA execution and comparison with native Rust. Correctness also passed at every population and each measured repetition. No CPU fallback is used to claim GPU execution.
- CPU end-to-end includes deterministic host input creation, CPU output allocation, and native batch call. GPU total includes equivalent host input preparation, device allocation, H2D, launch, synchronization, and D2H. The separate preallocated steady-state measurement reuses device buffers but still includes transfers and synchronization.
- CUDA event time measures the kernel. Host synchronization is reported separately because it includes waiting for queued GPU work; do not add the two as independent costs.

## Results

| Animals | CPU kernel | CPU end-to-end | Device allocation | H2D | Host launch | GPU kernel | Synchronization | D2H | GPU warm total | GPU steady state with transfers | Kernel-only speedup | Warm end-to-end speedup |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.0085 [0.0072–0.0124] | 0.0721 [0.0640–0.0941] | 0.3281 [0.2946–0.5314] | 0.0215 [0.0176–0.0943] | 0.0134 [0.0099–0.0357] | 0.0072 [0.0049–0.1089] | 0.0372 [0.0034–0.2294] | 0.0352 [0.0305–0.0720] | 0.5407 [0.4681–0.8497] | 0.1392 [0.1105–0.1977] | 1.19× | 0.13× |
| 1,000 | 0.0133 [0.0099–0.0215] | 0.5824 [0.5235–0.9070] | 0.4181 [0.3260–0.6091] | 0.0310 [0.0220–0.1125] | 0.0210 [0.0119–0.1284] | 0.0174 [0.0051–0.1475] | 0.0459 [0.0130–0.1260] | 0.0445 [0.0350–0.0885] | 1.1732 [1.0157–1.5662] | 0.1846 [0.1217–0.4742] | 0.76× | 0.50× |
| 10,000 | 0.0687 [0.0521–0.2338] | 6.1405 [5.5067–7.6884] | 0.5766 [0.4525–1.0464] | 0.0773 [0.0570–0.1535] | 0.0294 [0.0243–0.1338] | 0.1178 [0.0552–0.2297] | 0.1126 [0.0071–0.1410] | 0.0964 [0.0629–0.2305] | 6.9552 [6.2394–9.0986] | 0.4179 [0.1883–0.6149] | 0.58× | 0.88× |
| 100,000* | 0.3339 [0.3003–0.5730] | 61.0289 [57.8622–78.7464] | 1.2691 [1.0485–1.4597] | 0.5081 [0.3966–0.7442] | 0.0342 [0.0248–0.0919] | 0.1681 [0.1330–0.2917] | 0.1808 [0.1262–0.3286] | 0.4152 [0.2982–0.6110] | 62.9542 [59.8394–80.7959] | 1.2392 [1.0147–1.9259] | 1.99× | 0.97× |

*The 100,000-animal case is isolated numeric-kernel research, beyond the current FarmEngine and renderer limits. It is not evidence of a production workload.

First-run GPU total, including CUDA driver/device/context/PTX initialization, had a median of 178.67 ms, 179.31 ms, 185.09 ms, and 241.09 ms for 100, 1,000, 10,000, and 100,000 animals respectively. The corresponding CPU end-to-end medians were 0.07 ms, 0.58 ms, 6.14 ms, and 61.03 ms.

## Interpretation and limits

The isolated GPU kernel was faster at 100 and 100,000 animals in this capture, while slower at 1,000 and 10,000. Those kernel-only results do not offset allocation, copy, synchronization, and host overhead. End-to-end GPU medians lost at every tested size, so the evidence does not justify adding an accelerator path or changing defaults. No product dependency or production integration is proposed.

The harness creates deterministic input arrays in Python and includes that preparation in both end-to-end paths; it does not measure FarmEngine orchestration, state packing, feeding, weather, snapshots, worker scheduling, UI, or rendering. The CUDA kernel is a separate PTX translation of the existing Rust formula and is not integrated into production. Only one GTX 1060/driver/runtime combination was measured. This benchmark does not replace or extend the prior AMD evidence.

## Reproduction and provenance

```bash
python3 scripts/benchmark_nvidia_metabolism.py --output /tmp/nvidia-metabolism-report.json
python3 -m unittest discover -s tests -p test_benchmark_nvidia.py
```

The command requires the NVIDIA CUDA driver library and a real usable NVIDIA device. If the backend is unavailable, it emits a blocked result with `gpuExecutionClaim: false`; it does not fall back to CPU as GPU evidence. The generated report is [nvidia-metabolism-benchmark-2026-10.json](nvidia-metabolism-benchmark-2026-10.json) and validates against the shared benchmark report schema.

- Baseline `main`: `0d79e416a5297b846274001d3b3281a1e674c674`
- Fresh branch: `codex/issue-111-vendor-neutral-gpu`; benchmark implementation and capture source: clean worktree at `505c21def382fcb226b29b8f68fbba28dd00a4f5`
- Input payload SHA-256: `e14abf40b600aa4eab044bce048423287d5585e594067f8a7e7e5cea374daa8b`
