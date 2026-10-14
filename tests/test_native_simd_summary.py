import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[1]
SUMMARIZER = REPOSITORY / "scripts" / "summarize-native-simd.py"
RUNNER = REPOSITORY / "scripts" / "run-native-simd-study.sh"


class NativeSimdSummaryTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
