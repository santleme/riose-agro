import json
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from src.server.compute_service import create_server, detect_amd_backend, detect_compute_backends, execute_compute


UNAVAILABLE = {
    "available": False,
    "reason": "pytorch_unavailable",
    "torch_version": None,
    "rocm_version": None,
}


class ComputeServiceTests(unittest.TestCase):
    def setUp(self):
        self.server = create_server(port=0, amd_detector=lambda: UNAVAILABLE)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def post(self, body):
        request = Request(
            f"{self.base_url}/api/compute/v1",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request) as response:
            return response.status, json.load(response)

    def test_health_endpoint_is_accessible(self):
        with urlopen(f"{self.base_url}/health") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.load(response), {"status": "ok", "contract_version": "1"})

    def test_valid_cpu_request_is_deterministic_and_names_backend(self):
        body = {
            "contract_version": "1",
            "operation": "scale_vector",
            "payload": {"values": [1, -2.5, 4], "factor": 2},
            "preferred_backend": "cpu",
        }
        status, first = self.post(body)
        _, second = self.post(body)
        self.assertEqual(status, 200)
        self.assertEqual(first, second)
        self.assertEqual(first["result"], {"values": [2, -5, 8]})
        self.assertEqual(first["backend_requested"], "cpu")
        self.assertEqual(first["backend_used"], "cpu")
        self.assertFalse(first["fallback_used"])

    def test_livestock_metabolism_batch_matches_the_client_kernel_and_preserves_order(self):
        values = [
            330.0, 75.0, 0.4, 0.0,
            360.0, 98.0, 1.2, 1.0,
            500.0, 10.0, 0.7, 0.0,
        ]
        body = {
            "contract_version": "1", "operation": "livestock_metabolism_batch",
            "payload": {"count": 3, "values": values}, "preferred_backend": "cpu",
        }
        _, first = self.post(body)
        _, second = self.post(body)
        expected = []
        for index in range(3):
            weight, energy, intake, resting = values[index * 4:index * 4 + 4]
            gain = (intake - 5.3 * (weight / 360) / 24) * 0.22
            expected.extend((max(200, weight + gain), max(0, min(100, energy + (5 if resting != 0 else intake * 4 - 1.5)))))
        self.assertEqual(first["result"]["values"], expected)
        self.assertEqual(first, second)
        self.assertEqual(first["execution_metadata"]["animal_count"], 3)
        self.assertEqual(first["execution_metadata"]["operation"], "livestock_metabolism_batch")
        self.assertEqual(first["backend_used"], "cpu")

    def test_livestock_metabolism_rejects_batch_length_mismatch(self):
        with self.assertRaisesRegex(ValueError, "metabolism_values_must_match_animal_count"):
            execute_compute({
                "contract_version": "1", "operation": "livestock_metabolism_batch",
                "payload": {"count": 2, "values": [330, 75, 1, 0]}, "preferred_backend": "cpu",
            }, amd_detector=lambda: UNAVAILABLE)

    def test_rocm_adapter_executes_the_livestock_batch_and_reports_its_device(self):
        class Tensor:
            def __init__(self, values): self.values = list(values)
            def __getitem__(self, selection): return Tensor(self.values[selection])
            def __add__(self, other): return Tensor([a + b for a, b in zip(self.values, _values(other, len(self.values)))])
            def __sub__(self, other): return Tensor([a - b for a, b in zip(self.values, _values(other, len(self.values)))])
            def __mul__(self, other): return Tensor([a * b for a, b in zip(self.values, _values(other, len(self.values)))])
            def __rmul__(self, other): return self * other
            def __truediv__(self, other): return Tensor([a / b for a, b in zip(self.values, _values(other, len(self.values)))])
            def __ne__(self, other): return Tensor([a != other for a in self.values])
            def reshape(self, *_): return self
            def tolist(self): return self.values

        def _values(value, length):
            return value.values if isinstance(value, Tensor) else [value] * length

        class FakeTorch:
            float64 = object()
            @staticmethod
            def tensor(values, *, dtype, device):
                if device != "cuda": raise AssertionError("expected ROCm's PyTorch device")
                return Tensor(values)
            @staticmethod
            def clamp(value, min=None, max=None):
                bounded = []
                for item in value.values:
                    lower = item if min is None or item >= min else min
                    bounded.append(lower if max is None or lower <= max else max)
                return Tensor(bounded)
            @staticmethod
            def where(condition, yes, no):
                return Tensor([a if c else b for c, a, b in zip(condition.values, _values(yes, len(condition.values)), _values(no, len(condition.values)))])
            @staticmethod
            def stack(values, dim):
                return Tensor([item for pair in zip(*(value.values for value in values)) for item in pair])

        values = [330.0, 75.0, 0.4, 0.0, 360.0, 98.0, 1.2, 1.0]
        hardware = {"available": True, "reason": None, "torch_version": "test", "rocm_version": "test-rocm", "device_name": "test AMD device"}
        result = execute_compute({
            "contract_version": "1", "operation": "livestock_metabolism_batch",
            "payload": {"count": 2, "values": values}, "preferred_backend": "amd",
        }, amd_detector=lambda: hardware, torch_module=FakeTorch)
        expected = []
        for index in range(2):
            weight, energy, intake, resting = values[index * 4:index * 4 + 4]
            gain = (intake - 5.3 * (weight / 360) / 24) * 0.22
            expected.extend((max(200, weight + gain), max(0, min(100, energy + (5 if resting != 0 else intake * 4 - 1.5)))))
        self.assertEqual(result["backend_used"], "amd_rocm")
        self.assertFalse(result["fallback_used"])
        self.assertEqual(result["result"]["values"], expected)
        self.assertEqual(result["execution_metadata"]["device_name"], "test AMD device")

    def test_requested_amd_falls_back_explicitly_when_unavailable(self):
        body = {
            "contract_version": "1",
            "operation": "scale_vector",
            "payload": {"values": [2, 3], "factor": 4},
            "preferred_backend": "amd",
        }
        status, result = self.post(body)
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "fallback")
        self.assertEqual(result["backend_requested"], "amd")
        self.assertEqual(result["backend_used"], "cpu")
        self.assertFalse(result["hardware_available"])
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["mode"], "cpu_fallback")
        self.assertNotEqual(result["backend_used"], "amd_rocm")

    def test_invalid_request_is_rejected(self):
        with self.assertRaises(HTTPError) as raised:
            self.post({"contract_version": "1", "operation": "scale_vector", "payload": {"values": [float("nan")], "factor": 2}})
        self.assertEqual(raised.exception.code, 400)
        self.assertEqual(json.load(raised.exception), {"error": "values_must_be_finite_numbers"})

    def test_direct_execution_reports_cpu_without_amd_claim(self):
        result = execute_compute(
            {
                "contract_version": "1",
                "operation": "scale_vector",
                "payload": {"values": [1], "factor": 1},
                "preferred_backend": "auto",
            },
            amd_detector=lambda: UNAVAILABLE,
        )
        self.assertEqual(result["backend_used"], "cpu")
        self.assertFalse(result["hardware_available"])

    def test_simulated_rocm_execution_is_reported_only_after_tensor_execution(self):
        class Tensor:
            def __init__(self, values):
                self.values = values

            def __mul__(self, factor):
                return Tensor([value * factor for value in self.values])

            def tolist(self):
                return self.values

        class FakeTorch:
            float64 = object()

            @staticmethod
            def tensor(values, *, dtype, device):
                if device != "cuda":
                    raise AssertionError("expected PyTorch ROCm device")
                return Tensor(values)

        result = execute_compute(
            {
                "contract_version": "1",
                "operation": "scale_vector",
                "payload": {"values": [3], "factor": 2},
                "preferred_backend": "amd",
            },
            amd_detector=lambda: {"available": True, "reason": None, "torch_version": "test", "rocm_version": "test"},
            torch_module=FakeTorch,
        )
        self.assertEqual(result["backend_used"], "amd_rocm")
        self.assertEqual(result["result"], {"values": [6]})
        self.assertTrue(result["hardware_available"])
        self.assertFalse(result["fallback_used"])

    def test_amd_detection_requires_rocm_and_an_available_device(self):
        class Probe:
            def sum(self): return self
            def item(self): return 0
        def fake_torch(*, hip=None, cuda=None, available=True):
            return SimpleNamespace(version=SimpleNamespace(hip=hip, cuda=cuda),
                cuda=SimpleNamespace(is_available=lambda: available, get_device_name=lambda _: "test GPU"),
                empty=lambda *_, **__: Probe(), float64=object(), __version__="test")
        with patch("src.server.compute_service.import_module", return_value=fake_torch(cuda="12.4")):
            self.assertFalse(detect_amd_backend()["available"])
        with patch("src.server.compute_service.import_module", return_value=fake_torch(hip="test-rocm", available=False)):
            self.assertFalse(detect_amd_backend()["available"])
        with patch("src.server.compute_service.import_module", return_value=fake_torch(hip="test-rocm")):
            self.assertTrue(detect_amd_backend()["available"])

    def test_cuda_detection_requires_a_cuda_runtime_and_successful_device_probe(self):
        class Probe:
            def sum(self): return self
            def item(self): return 0
        torch = SimpleNamespace(version=SimpleNamespace(hip=None, cuda="12.4"),
            cuda=SimpleNamespace(is_available=lambda: True, get_device_name=lambda _: "GTX test"),
            empty=lambda *_, **__: Probe(), float64=object(), __version__="test")
        with patch("src.server.compute_service.import_module", return_value=torch):
            result = detect_compute_backends()
        self.assertTrue(result["cuda"]["available"])
        self.assertEqual(result["cuda"]["device_name"], "GTX test")
        self.assertFalse(result["rocm"]["available"])

    def test_device_probe_failure_is_reported_as_unavailable(self):
        torch = SimpleNamespace(version=SimpleNamespace(hip=None, cuda="12.4"),
            cuda=SimpleNamespace(is_available=lambda: True, get_device_name=lambda _: "GTX test"),
            empty=lambda *_, **__: (_ for _ in ()).throw(RuntimeError("driver unavailable")),
            float64=object(), __version__="test")
        with patch("src.server.compute_service.import_module", return_value=torch):
            result = detect_compute_backends()
        self.assertFalse(result["cuda"]["available"])
        self.assertEqual(result["cuda"]["reason"], "runtime_initialization_failed")

    def test_availability_check_exception_is_reported_as_runtime_initialization_failure(self):
        def fail_availability_check():
            raise RuntimeError("driver initialization failed")

        for backend, runtime_versions in (("cuda", {"hip": None, "cuda": "12.4"}),
                                          ("rocm", {"hip": "7.1", "cuda": None})):
            with self.subTest(backend=backend):
                torch = SimpleNamespace(version=SimpleNamespace(**runtime_versions),
                    cuda=SimpleNamespace(is_available=fail_availability_check), __version__="test")
                with patch("src.server.compute_service.import_module", return_value=torch):
                    result = detect_compute_backends()
                self.assertFalse(result[backend]["available"])
                self.assertEqual(result[backend]["reason"], "runtime_initialization_failed")

    def test_cpu_request_does_not_initialize_optional_accelerator_runtime(self):
        result = execute_compute({"contract_version": "1", "operation": "scale_vector",
            "payload": {"values": [2], "factor": 3}, "preferred_backend": "cpu"},
            backend_detector=lambda: (_ for _ in ()).throw(AssertionError("must not detect GPU")))
        self.assertEqual(result["backend_used"], "cpu")
        self.assertFalse(result["fallback_used"])

    def test_runtime_detection_exception_falls_back_truthfully(self):
        result = execute_compute({"contract_version": "1", "operation": "scale_vector",
            "payload": {"values": [2], "factor": 3}, "preferred_backend": "cuda"},
            backend_detector=lambda: (_ for _ in ()).throw(RuntimeError("broken CUDA runtime")))
        self.assertEqual(result["backend_used"], "cpu")
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["backend_availability"]["cuda"]["reason"], "runtime_detection_failed")
        self.assertEqual(result["result"]["values"], [6])

    def test_auto_prefers_cuda_then_rocm_and_reports_cpu_fallback(self):
        class Tensor:
            def __init__(self, values): self.values = values
            def __mul__(self, factor): return Tensor([value * factor for value in self.values])
            def tolist(self): return self.values
        class FakeTorch:
            float64 = object()
            @staticmethod
            def tensor(values, **_): return Tensor(values)
        available = {"available": True, "reason": None, "device_name": "test GPU", "runtime_version": "test"}
        unavailable = {"available": False, "reason": "runtime_unavailable", "device_name": None, "runtime_version": None}
        body = {"contract_version": "1", "operation": "scale_vector",
            "payload": {"values": [2], "factor": 3}, "preferred_backend": "auto"}
        both = {"torch_version": "test", "cuda": available, "rocm": available}
        cuda_result = execute_compute(body, backend_detector=lambda: both, torch_module=FakeTorch)
        self.assertEqual(cuda_result["backend_selected"], "cuda")
        self.assertEqual(cuda_result["backend_used"], "cuda")
        rocm_only = execute_compute(body, backend_detector=lambda: {"torch_version": "test",
            "cuda": unavailable, "rocm": {**available, "device_name": "AMD test"}}, torch_module=FakeTorch)
        self.assertEqual(rocm_only["backend_selected"], "rocm")
        self.assertEqual(rocm_only["backend_used"], "amd_rocm")

        fallback = execute_compute(body, backend_detector=lambda: {"torch_version": None,
            "cuda": unavailable, "rocm": {**unavailable, "reason": "pytorch_unavailable"}})
        self.assertEqual(fallback["backend_used"], "cpu")
        self.assertTrue(fallback["fallback_used"])
        self.assertEqual(fallback["execution_metadata"]["fallback_reason"], "no_accelerator_available")

    def test_explicit_cuda_and_rocm_unavailable_report_cpu_fallback(self):
        unavailable = {"available": False, "reason": "device_unavailable", "device_name": None, "runtime_version": None}
        hardware = {"torch_version": "test", "cuda": unavailable, "rocm": unavailable}
        for backend in ("cuda", "rocm"):
            with self.subTest(backend=backend):
                result = execute_compute({"contract_version": "1", "operation": "scale_vector",
                    "payload": {"values": [2], "factor": 3}, "preferred_backend": backend},
                    backend_detector=lambda: hardware)
                self.assertEqual(result["backend_requested"], backend)
                self.assertEqual(result["backend_used"], "cpu")
                self.assertTrue(result["fallback_used"])
                self.assertEqual(result["execution_metadata"]["fallback_reason"], "device_unavailable")

    def test_failed_accelerator_execution_reports_cpu_fallback(self):
        class FailingTorch:
            float64 = object()

            @staticmethod
            def tensor(*_, **__):
                raise RuntimeError("device disappeared")

        result = execute_compute(
            {
                "contract_version": "1",
                "operation": "scale_vector",
                "payload": {"values": [3], "factor": 2},
                "preferred_backend": "auto",
            },
            amd_detector=lambda: {"available": True, "reason": None, "torch_version": "test", "rocm_version": "test"},
            torch_module=FailingTorch,
        )
        self.assertEqual(result["backend_used"], "cpu")
        self.assertEqual(result["status"], "fallback")
        self.assertEqual(result["execution_metadata"]["fallback_reason"], "amd_execution_failed")
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["result"], {"values": [6]})

    def test_oversized_integer_is_rejected_as_invalid_input(self):
        with self.assertRaisesRegex(ValueError, "values_must_be_finite_numbers"):
            execute_compute(
                {
                    "contract_version": "1",
                    "operation": "scale_vector",
                    "payload": {"values": [10**1000], "factor": 1},
                },
                amd_detector=lambda: UNAVAILABLE,
            )

    def test_inexact_integer_is_rejected_before_backend_selection(self):
        with self.assertRaisesRegex(ValueError, "integer_outside_exact_float64_range"):
            execute_compute(
                {
                    "contract_version": "1",
                    "operation": "scale_vector",
                    "payload": {"values": [9_007_199_254_740_993], "factor": 1},
                },
                amd_detector=lambda: UNAVAILABLE,
            )

    def test_accepted_integer_uses_float64_on_cpu(self):
        result = execute_compute(
            {
                "contract_version": "1",
                "operation": "scale_vector",
                "payload": {"values": [9_007_199_254_740_992], "factor": 1},
                "preferred_backend": "cpu",
            },
            amd_detector=lambda: UNAVAILABLE,
        )
        self.assertEqual(result["result"]["values"], [9_007_199_254_740_992.0])

    def test_non_finite_computed_result_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "result_must_be_finite"):
            execute_compute(
                {
                    "contract_version": "1",
                    "operation": "scale_vector",
                    "payload": {"values": [1e308], "factor": 1e308},
                },
                amd_detector=lambda: UNAVAILABLE,
            )


if __name__ == "__main__":
    unittest.main()
