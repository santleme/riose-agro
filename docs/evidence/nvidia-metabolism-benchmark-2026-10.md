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
| 100 | 0.0144 [0.0110–0.0445] | 0.1073 [0.0810–0.1621] | 0.5068 [0.3671–0.6581] | 0.0342 [0.0281–0.1574] | 0.0254 [0.0180–0.1129] | 0.0172 [0.0051–0.1772] | 0.0600 [0.0204–0.1317] | 0.0623 [0.0425–0.1239] | 1.1340 [0.9380–1.5697] | 0.1669 [0.1062–0.2881] | 0.83× | 0.09× |
| 1,000 | 0.0210 [0.0157–0.0391] | 0.6803 [0.5831–0.8097] | 0.5439 [0.4148–0.6259] | 0.0475 [0.0314–0.1325] | 0.0266 [0.0174–0.0999] | 0.0184 [0.0051–0.1782] | 0.0576 [0.0229–0.1071] | 0.0577 [0.0424–0.1087] | 2.0979 [1.7632–2.9121] | 0.1963 [0.1205–0.3199] | 1.14× | 0.32× |
| 10,000 | 0.0771 [0.0567–0.1544] | 8.4421 [6.5009–13.1866] | 0.5700 [0.4768–0.7666] | 0.0955 [0.0709–0.2173] | 0.0453 [0.0308–0.2194] | 0.1289 [0.0528–0.2828] | 0.1169 [0.0319–0.1612] | 0.1097 [0.0731–0.1810] | 15.4278 [11.2743–19.6936] | 0.4103 [0.2822–0.6238] | 0.60× | 0.55× |
| 100,000* | 0.3982 [0.3247–0.5970] | 67.8686 [61.3404–79.8814] | 1.1017 [0.8689–1.9020] | 0.5207 [0.3800–0.9477] | 0.0361 [0.0261–0.1248] | 0.1442 [0.1270–0.2283] | 0.1516 [0.1128–0.2330] | 0.4053 [0.3010–0.6014] | 107.0122 [96.4745–124.3610] | 1.4326 [0.8838–2.0610] | 2.76× | 0.63× |

*The 100,000-animal case is isolated numeric-kernel research, beyond the current FarmEngine and renderer limits. It is not evidence of a production workload.

First-run GPU total, including CUDA driver/device/context/PTX initialization, had a median of 324.00 ms, 324.97 ms, 338.30 ms, and 429.88 ms for 100, 1,000, 10,000, and 100,000 animals respectively. The corresponding CPU end-to-end medians were 0.11 ms, 0.68 ms, 8.44 ms, and 67.87 ms.

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
- Benchmark implementation: `3fe0773b5b8b9e323a7916fa0947ba7d3786ce6e`
- Benchmark capture source: clean worktree at `3fe0773b5b8b9e323a7916fa0947ba7d3786ce6e`
- Input payload SHA-256: `e14abf40b600aa4eab044bce048423287d5585e594067f8a7e7e5cea374daa8b`
