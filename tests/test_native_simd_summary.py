import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[1]
SUMMARIZER = REPOSITORY / "scripts" / "benchmarks" / "summarize-native-simd.py"
RUNNER = REPOSITORY / "scripts" / "benchmarks" / "run-native-simd-study.sh"


class NativeSimdSummaryTests(unittest.TestCase):
    def write_complete_capture_set(self, directory):
        measurements = []
        datasets = ("existing-native-benchmark", "mixed-clamps-resting")
        populations = (1_000, 10_000, 100_000)
        implementations = ("current", "explicit-avx2-direct", "runtime-dispatch", "forced-fallback")
        for dataset in datasets:
            for population in populations:
                for metric in ("metabolismBatch", "allocateFillKernelRelease"):
                    for implementation in implementations:
                        measurements.append({
                            "dataset": dataset,
                            "population": population,
                            "metric": metric,
                            "implementation": implementation,
                            "statistics": {"median": 1.0},
                        })
                measurements.append({
                    "dataset": dataset,
                    "population": population,
                    "metric": "allocateFillRelease",
                    "implementation": "shared-setup",
                    "statistics": {"median": 1.0},
                })
        report = {
            "benchmark": {"source": {"revision": "study-revision", "dirty": False}},
            "hardware": {"cpu": "test-cpu"},
            "configuration": {
                "repetitions": 31,
                "warmupRuns": 5,
                "flags": "",
                "implementationOrderRotation": 0,
                "avx2Available": True,
            },
            "results": {
                "equivalence": {"bitwiseEqual": True},
                "selectionOverheadMs": {"median": 0.001},
            },
            "phases": {"engine": {"measurements": measurements}},
        }
        for profile in ("generic", "native", "scalar"):
            for run in range(1, 5):
                report["configuration"]["flags"] = f"{profile}: "
                report["configuration"]["implementationOrderRotation"] = (run - 1) % 4
                (Path(directory) / f"{profile}-run-{run}.json").write_text(
                    json.dumps(report)
                )

    def test_rejects_incomplete_capture_matrix_before_aggregation(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "generic-run-1.json").write_text("{}")
            result = subprocess.run(
                [sys.executable, str(SUMMARIZER), directory],
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("capture set mismatch", result.stderr)
        self.assertIn("missing=", result.stderr)

    def test_rejects_fewer_than_four_runs_even_when_requested(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [sys.executable, str(SUMMARIZER), directory, "--runs", "3"],
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--runs must be at least four", result.stderr)

    def test_optimized_python_keeps_capture_provenance_validation(self):
        invalid_cases = (
            (("benchmark", "source", "dirty"), True, "capture source must be clean"),
            (("hardware", "cpu"), "different-cpu", "capture hardware"),
            (("configuration", "repetitions"), 30, "expected 31 timed repetitions"),
            (("configuration", "warmupRuns"), 4, "expected five warmup runs"),
            (("configuration", "avx2Available"), False, "AVX2 unavailable"),
            (("results", "equivalence", "bitwiseEqual"), False,
             "failed bitwise equivalence"),
        )
        for key_path, invalid_value, expected_error in invalid_cases:
            with self.subTest(key_path=key_path), tempfile.TemporaryDirectory() as directory:
                self.write_complete_capture_set(directory)
                report_path = Path(directory) / "native-run-2.json"
                report = json.loads(report_path.read_text())
                value = report
                for key in key_path[:-1]:
                    value = value[key]
                value[key_path[-1]] = invalid_value
                report_path.write_text(json.dumps(report))
                result = subprocess.run(
                    [sys.executable, "-O", str(SUMMARIZER), directory],
                    check=False,
                    capture_output=True,
                    text=True,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected_error, result.stderr)

    def test_rejects_incomplete_measurement_matrix_before_pairing(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write_complete_capture_set(directory)
            report_path = Path(directory) / "generic-run-2.json"
            report = json.loads(report_path.read_text())
            report["phases"]["engine"]["measurements"] = [
                item for item in report["phases"]["engine"]["measurements"]
                if not (
                    item["dataset"] == "existing-native-benchmark"
                    and item["population"] == 1_000
                    and item["metric"] == "metabolismBatch"
                    and item["implementation"] == "current"
                )
            ]
            report_path.write_text(json.dumps(report))
            result = subprocess.run(
                [sys.executable, "-O", str(SUMMARIZER), directory],
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("engine measurement matrix mismatch", result.stderr)

    def test_capture_runner_rejects_fewer_than_four_runs(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {
                **os.environ,
                "SIMD_STUDY_RUNS": "3",
                "SIMD_STUDY_TARGET_ROOT": str(Path(directory) / "targets"),
            }
            result = subprocess.run(
                ["bash", str(RUNNER), str(Path(directory) / "captures")],
                check=False,
                capture_output=True,
                text=True,
                env=environment,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("At least four captures", result.stderr)

    def test_capture_runner_refuses_existing_output_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "captures"
            output.mkdir()
            (output / "generic-run-4.json").write_text("stale")
            environment = {
                **os.environ,
                "SIMD_STUDY_RUNS": "4",
                "SIMD_STUDY_TARGET_ROOT": str(Path(directory) / "targets"),
            }
            result = subprocess.run(
                ["bash", str(RUNNER), str(output)],
                check=False,
                capture_output=True,
                text=True,
                env=environment,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must not already exist", result.stderr)

if __name__ == "__main__":
    unittest.main()
