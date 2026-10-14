# Physical NVIDIA GPU metabolism benchmark

**Decision: NO_GO for accelerator adoption.** The CUDA kernel executed on the physical GTX 1060 and matched the native Rust implementation at all tested sizes. End-to-end GPU medians were slower than the CPU medians at every population, including 100,000 animals. The kernel-only result at 100,000 animals was 2.54× faster, but it does not include transfers, synchronization, allocation, or host input setup.

This is the NVIDIA vendor-specific evidence for issue #111 under the vendor-neutral accelerator research objective in #77. It makes no claim about AMD/ROCm or cross-vendor performance.

## Setup and method

- GPU: NVIDIA GeForce GTX 1060 6GB, compute capability 6.1, driver 580.88, CUDA Driver API 13.0; physical device exposed to Ubuntu 24.04 through WSL2.
- CPU: Intel Core i5-10400F @ 2.90GHz. Runtime: Python 3.12.3, Linux x86_64, WSL2 kernel 6.6.87.2.
- Workload: same native Rust metabolism batch ABI and formula, with an isolated PTX CUDA implementation. Float64 inputs and outputs; deterministic input state; relative and absolute correctness tolerances each 1e-12.
- Populations: 100, 1,000, 10,000, and 100,000. The last case is numeric-kernel-only; FarmEngine and renderer limits remain 10,000.
- Three warmups and 21 measured repetitions per population. Reported cells are median [minimum–maximum] milliseconds; the JSON retains every raw observation.
- The GPU path was gated by a real 100-animal CUDA execution and comparison with native Rust. Correctness also passed at every population and each measured repetition. No CPU fallback is used to claim GPU execution.
- Common deterministic host input creation is timed separately. CPU end-to-end includes that common setup, its CPU output allocation, and the native batch call. GPU total includes the same common input setup, device allocation, its own host output allocation, H2D, launch, synchronization, and D2H. The separate preallocated steady-state measurement reuses device buffers but still includes host output allocation, transfers, and synchronization.
- CUDA event time measures the kernel. Host synchronization is reported separately because it includes waiting for queued GPU work; do not add the two as independent costs.

## Results

| Animals | CPU kernel | CPU end-to-end | Device allocation | H2D | Host launch | GPU kernel | Synchronization | D2H | GPU warm total | GPU steady state with transfers | Kernel-only speedup | Warm end-to-end speedup |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.0109 [0.0078–0.0202] | 0.0809 [0.0664–0.1362] | 0.4257 [0.3839–0.5456] | 0.0258 [0.0211–0.0444] | 0.0152 [0.0116–0.0283] | 0.0154 [0.0051–0.0686] | 0.0391 [0.0221–0.1136] | 0.0520 [0.0413–0.1195] | 0.6725 [0.5786–0.9871] | 0.1838 [0.1198–0.3152] | 0.71× | 0.12× |
| 1,000 | 0.0323 [0.0198–0.0490] | 0.9017 [0.5806–1.1170] | 0.7004 [0.5955–0.8957] | 0.0583 [0.0431–0.1674] | 0.0316 [0.0227–0.1120] | 0.0501 [0.0061–0.1823] | 0.0641 [0.0183–0.1488] | 0.0655 [0.0533–0.1493] | 1.8924 [1.4319–2.2990] | 0.1848 [0.1415–0.4229] | 0.64× | 0.48× |
| 10,000 | 0.0505 [0.0442–0.1006] | 5.6145 [5.2320–6.9042] | 0.5592 [0.4706–0.7650] | 0.0604 [0.0504–0.0976] | 0.0272 [0.0224–0.0629] | 0.1047 [0.0539–0.1281] | 0.1133 [0.0518–0.1953] | 0.0834 [0.0633–0.1438] | 6.4495 [6.1395–7.7409] | 0.3179 [0.2187–0.4865] | 0.48× | 0.87× |
| 100,000* | 0.3666 [0.3071–0.8501] | 57.6402 [52.4726–65.5525] | 1.1970 [0.9941–1.4481] | 0.4686 [0.3975–0.5952] | 0.0292 [0.0263–0.0910] | 0.1445 [0.1297–0.1960] | 0.1851 [0.1244–0.2569] | 0.3515 [0.2900–0.4821] | 59.4607 [54.4712–67.0872] | 1.2730 [0.9472–2.1422] | 2.54× | 0.97× |

*The 100,000-animal case is isolated numeric-kernel research, beyond the current FarmEngine and renderer limits. It is not evidence of a production workload.

First-run GPU total, including CUDA driver/device/context/PTX initialization, had a median of 382.30 ms, 383.52 ms, 388.08 ms, and 441.09 ms for 100, 1,000, 10,000, and 100,000 animals respectively. The corresponding CPU end-to-end medians were 0.08 ms, 0.90 ms, 5.61 ms, and 57.64 ms.

## Interpretation and limits

The isolated GPU kernel was faster only at 100,000 animals in this capture. That kernel-only result does not offset allocation, copy, synchronization, and host overhead. End-to-end GPU medians lost at every tested size, so the evidence does not justify adding an accelerator path or changing defaults. No product dependency or production integration is proposed.

The harness creates deterministic input arrays in Python and includes that preparation in both end-to-end paths; it does not measure FarmEngine orchestration, state packing, feeding, weather, snapshots, worker scheduling, UI, or rendering. The CUDA kernel is a separate PTX translation of the existing Rust formula and is not integrated into production. Only one GTX 1060/driver/runtime combination was measured. This benchmark does not replace or extend the prior AMD evidence.

## Reproduction and provenance

```bash
python3 scripts/benchmark_nvidia_metabolism.py --output /tmp/nvidia-metabolism-report.json
python3 -m unittest discover -s tests -p test_benchmark_nvidia.py
```

The command requires the NVIDIA CUDA driver library and a real usable NVIDIA device. If the backend is unavailable, it emits a blocked result with `gpuExecutionClaim: false`; it does not fall back to CPU as GPU evidence. The generated report is [nvidia-metabolism-benchmark-2026-10.json](nvidia-metabolism-benchmark-2026-10.json) and validates against the shared benchmark report schema.

- Baseline `main`: `0d79e416a5297b846274001d3b3281a1e674c674`
- Fresh branch: `codex/issue-111-vendor-neutral-gpu`; benchmark implementation and capture source: clean worktree at `30a5e87c8614d3bbc3c2f57ac7f392abb4c768a8`
- Input payload SHA-256: `e14abf40b600aa4eab044bce048423287d5585e594067f8a7e7e5cea374daa8b`
