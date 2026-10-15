# ACT III compute backends — Issue #138

## Result

The hardware-agnostic livestock compute path is implemented and its live-service CPU fallback and parity path were exercised. **Physical AMD/ROCm execution remains unverified; Issue #138 must stay open.** This run is not AMD evidence and must not be used to close the physical-hardware acceptance criteria.

## Tested source and workload

- Base release: `release/amd-act-iii` at `e897c53b2d99ae0ae4de9db31ece281375bf96b1` (the latest fetched release head used to create this branch).
- Workload: `FarmEngine(seed=2026)`, 24 animals, one livestock metabolism step, using the #137 input/output contract and existing JavaScript reference kernel.
- Input SHA-256: `745e61c6734e2dc61f577b1c936fa492a0e94e3f581a4cd82bea06f25740f102`.
- CPU output SHA-256: `d49c1dce2ad6f479eeb72dcfef869fbfe0e6acd31ee36e6e9af454d8c47c0eb1`.
- Comparison covers weight and energy in input-animal order, with absolute and relative tolerances of `1e-12`.
- Three repeated requests were made for Auto, CUDA, and ROCm, in addition to the CPU reference request.
- Raw output: [amd-138-compute-run.json](./amd-138-compute-run.json).

## Environment and backend detection

Environment inspection was performed in Ubuntu 24.04.4 LTS under WSL2 on 2026-10-15. The host has an Intel Core i5-10400F and an NVIDIA GeForce GTX 1060 6GB. `nvidia-smi` reports driver 580.88 / CUDA 13.0, but this hardware was not used for this run. The WSL environment has no `/dev/kfd`, `/dev/dri`, or `/dev/nvidia0`; `rocminfo`, `rocm-smi`, and PyTorch are unavailable. The compute service therefore reports both CUDA and ROCm unavailable (`pytorch_unavailable`). No AMD GPU, ROCm runtime, or usable AMD device was detected.

The live service successfully detected the CPU-only fallback and returned explicit fallback metadata for Auto, CUDA, and ROCm. Each repeated output matched the CPU reference exactly (maximum absolute/relative error `0`) and was deterministic. Reported end-to-end local request times are in the raw JSON; they are not accelerator performance measurements.

## Commands and verification

```sh
python3 src/server/compute_service.py
node scripts/verify-compute-livestock.mjs
python3 -m unittest tests.test_compute_service
node --test tests/amd-metabolism.test.js tests/worker-protocol.test.js
npm test
```

The dedicated Python suite passed 21 tests and the focused Node suites passed 21 tests. The repository-wide Node suite completed 633 tests: 632 passed and 1 failed in `tests/benchmark-public-adapters.test.js`, where `scripts/benchmark-animal-layout.mjs` invokes `cargo`, which is not installed in this WSL environment. The other tests completed successfully.

## Limits and next evidence required

- The live parity result exercises CPU fallback only. It does not prove CUDA or ROCm execution.
- No ROCm version, AMD GPU model, or AMD driver version can be recorded because no AMD runtime/device is available.
- Run `npm run verify:amd-livestock` on a Linux host with a usable AMD ROCm GPU to satisfy the remaining physical acceptance gate. Preserve that command's raw JSON and record the GPU, driver/runtime, exact release SHA, backend identity, parity, repetitions, and timings.
- Until that evidence exists, the terminal status for the original hardware gate is `#138_BLOCKED_NO_AMD_RUNTIME`.
