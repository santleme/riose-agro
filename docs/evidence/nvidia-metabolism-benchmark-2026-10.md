# Physical NVIDIA GPU metabolism benchmark

**Decision: NO_GO for accelerator adoption.** The CUDA kernel executed on the physical GTX 1060 and matched the native Rust implementation at all tested sizes. End-to-end GPU medians were slower than the CPU medians at every population, including 100,000 animals. The kernel-only result at 100,000 animals was 2.76× faster, but it does not include transfers, synchronization, allocation, or host input setup.

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
| 100 | 0.0116 [0.0078–0.0195] | 0.0806 [0.0679–0.1290] | 0.4373 [0.3491–0.5387] | 0.0290 [0.0204–0.0996] | 0.0195 [0.0131–0.0853] | 0.0164 [0.0051–0.1597] | 0.0595 [0.0250–0.2120] | 0.0460 [0.0354–0.0935] | 0.7176 [0.5619–1.0745] | 0.0888 [0.0747–0.1349] | 0.71× | 0.11× |
| 1,000 | 0.0150 [0.0128–0.0259] | 0.6016 [0.5607–0.6837] | 0.4294 [0.3683–0.5312] | 0.0336 [0.0240–0.0657] | 0.0191 [0.0128–0.0783] | 0.0164 [0.0051–0.1328] | 0.0564 [0.0048–0.1390] | 0.0499 [0.0381–0.1103] | 1.2421 [1.1111–1.5406] | 0.1579 [0.1512–0.2421] | 0.92× | 0.48× |
| 10,000 | 0.0512 [0.0411–0.0765] | 5.5460 [5.1983–6.0123] | 0.6488 [0.5205–0.7969] | 0.0864 [0.0485–0.1699] | 0.0317 [0.0222–0.1105] | 0.1078 [0.0533–0.1956] | 0.0921 [0.0435–0.1706] | 0.1081 [0.0637–0.1442] | 6.4710 [6.0692–7.2591] | 0.4715 [0.2105–0.6625] | 0.48× | 0.86× |
| 100,000* | 0.3728 [0.3206–0.8406] | 59.3722 [54.3296–82.2026] | 1.2898 [0.9975–1.4355] | 0.5035 [0.3966–0.8533] | 0.0310 [0.0264–0.0607] | 0.1462 [0.1298–0.2090] | 0.1895 [0.1293–0.2890] | 0.3719 [0.3053–0.6627] | 61.4428 [56.3224–85.0332] | 1.3733 [0.8065–1.6409] | 2.55× | 0.97× |

*The 100,000-animal case is isolated numeric-kernel research, beyond the current FarmEngine and renderer limits. It is not evidence of a production workload.

First-run GPU total, including CUDA driver/device/context/PTX initialization, had a median of 447.87 ms, 448.39 ms, 453.62 ms, and 508.59 ms for 100, 1,000, 10,000, and 100,000 animals respectively. The corresponding CPU end-to-end medians were 0.08 ms, 0.60 ms, 5.55 ms, and 59.37 ms.

## Interpretation and limits

The measured isolated GPU kernel has some advantage only at the largest population. That does not offset allocation, copy, synchronization, and host overhead in this workload. End-to-end GPU medians lost at every tested size, so the evidence does not justify adding an accelerator path or changing defaults. No product dependency or production integration is proposed.

The harness creates deterministic input arrays in Python and includes that preparation in both end-to-end paths; it does not measure FarmEngine orchestration, state packing, feeding, weather, snapshots, worker scheduling, UI, or rendering. The CUDA kernel is a separate PTX translation of the existing Rust formula and is not integrated into production. Only one GTX 1060/driver/runtime combination was measured. This benchmark does not replace or extend the prior AMD evidence.

## Reproduction and provenance

```bash
python3 scripts/benchmark_nvidia_metabolism.py --output /tmp/nvidia-metabolism-report.json
python3 -m unittest discover -s tests -p test_benchmark_nvidia.py
```

The command requires the NVIDIA CUDA driver library and a real usable NVIDIA device. If the backend is unavailable, it emits a blocked result with `gpuExecutionClaim: false`; it does not fall back to CPU as GPU evidence. The generated report is [nvidia-metabolism-benchmark-2026-10.json](nvidia-metabolism-benchmark-2026-10.json) and validates against the shared benchmark report schema.

- Baseline `main`: `0d79e416a5297b846274001d3b3281a1e674c674`
- Benchmark implementation and capture source: clean worktree at `77304faa4b8500ed7179a2cdf53dabb78cab79e6`
- Input payload SHA-256: `e14abf40b600aa4eab044bce048423287d5585e594067f8a7e7e5cea374daa8b`
