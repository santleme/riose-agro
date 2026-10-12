import json
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from compute_service import create_server, detect_amd_backend, execute_compute


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
        with patch("compute_service.import_module", return_value=SimpleNamespace(
            version=SimpleNamespace(hip=None),
            cuda=SimpleNamespace(is_available=lambda: True),
            __version__="test",
        )):
            self.assertFalse(detect_amd_backend()["available"])
        with patch("compute_service.import_module", return_value=SimpleNamespace(
            version=SimpleNamespace(hip="test-rocm"),
            cuda=SimpleNamespace(is_available=lambda: False),
            __version__="test",
        )):
            self.assertFalse(detect_amd_backend()["available"])
        with patch("compute_service.import_module", return_value=SimpleNamespace(
            version=SimpleNamespace(hip="test-rocm"),
            cuda=SimpleNamespace(is_available=lambda: True),
            __version__="test",
        )):
            self.assertTrue(detect_amd_backend()["available"])

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
