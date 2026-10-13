# Native CLI performance evidence

Observed measurements for issue #85. These are environment-specific timing samples, not a performance claim or a comparison with another engine.

## Environment

- Date: 2026-10-13
- Runner: GitHub Actions hosted `ubuntu-24.04`, Linux x86_64
- Rust: `rustc 1.95.0 (59807616e 2026-04-14)`
- Build profile: release (`cargo build --locked --workspace --release`)
- Engine version: `0.1.0`
- Build ID: `riose-core@0.1.0` (#84 fallback; no source-commit provenance claim)
- PR source head measured: `99df121426a7a9553de80e414c56ad1d3d87308e`
- GitHub Actions PR merge checkout SHA reported by the runner: `a9872f355b75673aebc1838a79a536c623982e53`
- Workflow run: CI #104, run ID `38401590624`

## Method

The harness is [`native_cli_performance.rs`](../../crates/riose-core/examples/native_cli_performance.rs) and runs after the release build in the Rust CI job. It performs three warm-up runs and records 20 samples per measurement. It reports median, minimum, and maximum without thresholds.

**CLI startup / end-to-end process invocation** launches `riose-run --input -`, writes a minimal valid one-animal, one-hour baseline request to stdin, redirects stdout and stderr to null, then measures from immediately before process spawn until exit. This includes process startup, stdin delivery, JSON parsing and validation, the minimal scenario, result serialization, and stdout write. It is intentionally an end-to-end invocation measurement; it is not a pure process-loader measurement.

**Scenario runtime** starts the timer immediately around `run_native_scenario(...)`. Requests are decoded before timing; process creation, JSON input parsing, result serialization, and output are excluded. Baseline uses the versioned `tests/scenarios/baseline-pasture.json` fixture mapped to the native request. Housing comparison uses the baseline snapshot in the official `tests/scenario-goldens/housing-comparison.json` replay manifest and `days: 30`.

All durations below are observed on this single hosted runner. The startup and scenario measurements use different request sizes/workloads by design; they must not be combined or interpreted as a speed comparison.

## Measurements

| Measurement | Runs (after warm-up) | Median | Minimum | Maximum |
| --- | ---: | ---: | ---: | ---: |
| CLI startup / end-to-end process invocation | 20 | 876,221 ns (0.876221 ms) | 833,276 ns (0.833276 ms) | 970,279 ns (0.970279 ms) |
| Baseline native scenario runtime | 20 | 3,667 ns (3.667 µs) | 3,446 ns (3.446 µs) | 4,528 ns (4.528 µs) |
| Housing-comparison native scenario runtime | 20 | 1,684,476 ns (1.684476 ms) | 1,617,521 ns (1.617521 ms) | 1,730,151 ns (1.730151 ms) |

## Limitations

- These are samples from one CI run and one shared hosted runner class; scheduling noise and runner variation apply.
- Startup includes a minimal scenario and the complete JSON stdin/stdout path as described above.
- Scenario measurements exclude transport and time only the native API call using pre-decoded requests.
- No speed claim, comparison, or performance guarantee is made.
