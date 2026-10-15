import contextlib
import importlib.util
import io
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "benchmark_nvidia_metabolism", ROOT / "scripts" / "benchmarks" / "benchmark_nvidia_metabolism.py")
benchmark = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(benchmark)


class NvidiaBenchmarkTests(unittest.TestCase):
    def test_correctness_compares_full_native_output_with_tolerance(self):
        expected = benchmark.array.array("d", [330.0, 50.0])
        within_tolerance = benchmark.array.array("d", [330.0 + 1e-13, 50.0])
        outside_tolerance = benchmark.array.array("d", [330.0 + 1e-6, 50.0])

        self.assertTrue(benchmark.compare(expected, within_tolerance)["equivalent"])
        self.assertFalse(benchmark.compare(expected, outside_tolerance)["equivalent"])
        self.assertFalse(benchmark.compare(expected, benchmark.array.array("d", [330.0]))["equivalent"])


    def test_prebuilt_native_library_skips_cargo_and_records_hash(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "libriose_core.so"
            path.write_bytes(b"native-library-fixture")
            fake_function = type("FakeFunction", (), {})()
            fake_library = type("FakeLibrary", (), {"riose_update_metabolism_batch": fake_function})()
            with patch.object(benchmark.ctypes, "CDLL", return_value=fake_library), \
                 patch.object(benchmark.subprocess, "run", side_effect=AssertionError("Cargo should not run")):
                library = benchmark.native_library(path)

        self.assertIs(library, fake_library)
        self.assertEqual(library.benchmark_native_provenance["mode"], "prebuilt")
        self.assertEqual(library.benchmark_native_provenance["sha256"], hashlib.sha256(b"native-library-fixture").hexdigest())

    def test_missing_prebuilt_native_library_fails_with_path(self):
        with self.assertRaises(FileNotFoundError):
            benchmark.native_library(Path("/no/such/libriose_core.so"))

    def test_missing_cuda_backend_is_an_explicit_skip_without_gpu_claim(self):
        output = io.StringIO()
        with patch.object(sys, "argv", ["benchmark_nvidia_metabolism.py"]), \
             patch.object(benchmark, "CudaDriver", side_effect=OSError("no CUDA driver")), \
             contextlib.redirect_stdout(output):
            benchmark.main()

        report = json.loads(output.getvalue())
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["reason"], "nvidia_cuda_driver_unavailable")
        self.assertFalse(report["gpuExecutionClaim"])


if __name__ == "__main__":
    unittest.main()
