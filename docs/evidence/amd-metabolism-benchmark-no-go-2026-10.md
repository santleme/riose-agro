# Cattle metabolism accelerator benchmark: no-go

Clean recapture: 2026-10-14, source revision `f2bd3dcdf4eade27c174247c6b8bdf237e466ff3`.

**Decision:** no-go for this environment. The runner measured the production
native Rust metabolism batch used by `FarmEngine`, but this WSL2 session has no
usable ROCm device. It reports no accelerator timing or speedup.

The evidence JSON is schema-validated against
`docs/architecture/benchmark-report.schema.json`:
[`amd-metabolism-benchmark-no-go-2026-10.json`](amd-metabolism-benchmark-no-go-2026-10.json).

## Workload

Each animal uses the same packed input consumed by `riose_core::update_metabolism`:
weight in kg, energy percentage, daily intake in kg dry matter, and resting flag.
The runner invokes the existing Rust implementation through its C ABI for 100,
1,000, 10,000, and 100,000 deterministic animal states. The optional accelerator
path evaluates the same formula in float64 through PyTorch's HIP runtime and is
only enabled when PyTorch identifies a ROCm device.

The CPU numbers below are native Rust kernel medians from the clean recapture
over 21 repetitions after 3 warmups, with preallocated host buffers. They are
reference measurements, not GPU results:

| Animals | Native CPU median (ms) |
| ---: | ---: |
| 100 | 0.001155 |
| 1,000 | 0.002017 |
| 10,000 | 0.010221 |
| 100,000 | 0.094877 |

## Hardware probe and rerun

The captured host is WSL2. The clean report confirms `/dev/kfd` and `/dev/dri`
are absent; `rocminfo`, `rocm-smi`, `hipcc`, and `nvidia-smi` are unavailable;
PyTorch is not installed. The report records source revision
`f2bd3dcdf4eade27c174247c6b8bdf237e466ff3` with `dirty: false`.
This is insufficient to execute or claim an AMD benchmark. A future run on a
ROCm-enabled host can use:

```bash
python3 scripts/benchmark_metabolism_accelerator.py > report.json
node scripts/validate-benchmark-report.mjs < report.json
```

The report keeps initialization, host-to-device copy, resident steady-state,
device-to-host copy, and total-run timing separate. It checks float64 outputs
against native Rust with relative and absolute tolerances of `1e-12`; speedup is
only reported if a real HIP backend ran and results passed that comparison.
No production dependency or backend change is introduced by this prototype.
