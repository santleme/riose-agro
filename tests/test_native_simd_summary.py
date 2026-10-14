import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[1]
SUMMARIZER = REPOSITORY / "scripts" / "summarize-native-simd.py"


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


if __name__ == "__main__":
    unittest.main()