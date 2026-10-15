# Physical NVIDIA GPU metabolism benchmark

**Decision: NO_GO for accelerator adoption.** The CUDA kernel executed on the physical GTX 1060 and matched the native Rust implementation at all tested sizes. End-to-end GPU medians were slower than the CPU medians at every population, including 100,000 animals. The kernel-only result at 100,000 animals was 3.08× faster, but it does not include transfers, synchronization, allocation, host input setup, or device-buffer frees.

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
| 100 | 0.0195 [0.0142–0.0324] | 0.1276 [0.0861–0.2167] | 0.6748 [0.5007–0.8750] | 0.0485 [0.0348–0.0784] | 0.0306 [0.0207–0.1226] | 0.0280 [0.0058–0.2049] | 0.0582 [0.0117–0.1828] | 0.0635 [0.0415–0.1318] | 1.3537 [1.0510–1.7640] | 0.2831 [0.1431–0.8855] | 0.70× | 0.09× |
| 1,000 | 0.0290 [0.0193–0.0832] | 0.8453 [0.6346–1.4162] | 0.6713 [0.5643–0.9117] | 0.0503 [0.0403–0.2156] | 0.0237 [0.0192–0.1557] | 0.0256 [0.0072–0.2316] | 0.0501 [0.0150–0.1251] | 0.0677 [0.0410–0.1549] | 2.1391 [1.7121–2.9991] | 0.1604 [0.1254–0.4216] | 1.13× | 0.40× |
| 10,000 | 0.0928 [0.0606–0.2566] | 8.8464 [7.1736–12.2926] | 0.7582 [0.5901–1.8749] | 0.1026 [0.0765–0.2146] | 0.0480 [0.0339–0.0816] | 0.1501 [0.0750–0.2494] | 0.1116 [0.0611–0.2856] | 0.1054 [0.0831–0.2673] | 10.1344 [8.4538–13.8337] | 0.5208 [0.2937–1.7955] | 0.62× | 0.87× |
| 100,000* | 0.4954 [0.3689–1.0646] | 85.6325 [75.1221–110.4379] | 1.3985 [1.1215–4.5325] | 0.6038 [0.4635–0.8772] | 0.0478 [0.0348–0.1474] | 0.1606 [0.1353–0.2860] | 0.1484 [0.1087–0.2366] | 0.4280 [0.3453–0.6754] | 88.8252 [77.7621–114.3862] | 1.5092 [1.2706–2.0773] | 3.08× | 0.96× |

*The 100,000-animal case is isolated numeric-kernel research, beyond the current FarmEngine and renderer limits. It is not evidence of a production workload.

CUDA Driver API, device discovery, context, and PTX module initialization took 364.14 ms in one observed startup sample. This is a single observation, not a repeated cold-start distribution; per-size warm GPU totals exclude this startup phase.

## Interpretation and limits

The isolated GPU kernel was faster at 1,000 and 100,000 animals in this capture, and slower at 100 and 10,000. Those kernel-only gains do not offset allocation, copy, synchronization, cleanup, and host overhead. End-to-end GPU medians lost at every tested size, so the evidence does not justify adding an accelerator path or changing defaults. No product dependency or production integration is proposed.

The harness creates deterministic input arrays in Python and includes that preparation in both end-to-end paths; it does not measure FarmEngine orchestration, state packing, feeding, weather, snapshots, worker scheduling, UI, or rendering. The CUDA kernel is a separate PTX translation of the existing Rust formula and is not integrated into production. Only one GTX 1060/driver/runtime combination was measured. This benchmark does not replace or extend the prior AMD evidence. The native `riose_core` library was reused via the explicit prebuilt-library option because Cargo is unavailable in this WSL environment; its path and SHA-256 are recorded in the JSON report, and the benchmark branch leaves native Rust sources unchanged.

## Reproduction and provenance

```bash
python3 scripts/benchmark_nvidia_metabolism.py --native-library /path/to/libriose_core.so --output /tmp/nvidia-metabolism-report.json
python3 -m unittest discover -s tests -p test_benchmark_nvidia.py
```

The command requires the NVIDIA CUDA driver library and a real usable NVIDIA device. The example uses `--native-library` to load a compatible prebuilt library without Cargo; the report records its path and SHA-256. Omit that option to build the native library with Cargo. If the backend is unavailable, it emits a blocked result with `gpuExecutionClaim: false`; it does not fall back to CPU as GPU evidence. The generated report is [nvidia-metabolism-benchmark-2026-10.json](nvidia-metabolism-benchmark-2026-10.json) and validates against the shared benchmark report schema.

- Baseline `main`: `0d79e416a5297b846274001d3b3281a1e674c674`
- Fresh branch: `codex/issue-111-vendor-neutral-gpu`; benchmark implementation and capture source: clean worktree at `766ae0e4044a2bf46cbe98c02458044450801b8c`
- Input payload SHA-256: `e14abf40b600aa4eab044bce048423287d5585e594067f8a7e7e5cea374daa8b`
