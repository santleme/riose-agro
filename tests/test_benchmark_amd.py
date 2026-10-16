import json
import unittest

from scripts.benchmarks.benchmark_amd import (
    calculate_speedup,
    calculate_statistics,
    make_values,
    run_benchmark,
)


class AmdBenchmarkTests(unittest.TestCase):
    @staticmethod
    def available_detector():
        return {
            "available": True,
            "reason": None,
            "torch_version": "test-torch",
            "rocm_version": "test-rocm",
            "device_name": "AMD Radeon test",
        }

    @staticmethod
    def unavailable_detector():
        return {
            "available": False,
            "reason": "pytorch_unavailable",
            "torch_version": None,
            "rocm_version": None,
        }

    @staticmethod
    def fake_executor(request, *, amd_detector):
        values = request["payload"]["values"]
        factor = request["payload"]["factor"]
        detection = amd_detector()
        requested = request["preferred_backend"]
        used = "amd_rocm" if requested == "amd" and detection["available"] else "cpu"
        return {
            "backend_requested": requested,
            "backend_used": used,
            "result": {"values": [float(value) * float(factor) for value in values]},
            "execution_metadata": {"fallback_reason": None if used == "amd_rocm" or requested == "cpu" else detection["reason"]},
        }

    def test_statistics_calculate_mean_median_minimum_maximum_and_spread(self):
        stats = calculate_statistics([1.0, 2.0, 3.0, 4.0], elements_per_run=100)
        self.assertEqual(stats["runs"], 4)
        self.assertEqual(stats["mean_ms"], 2.5)
        self.assertEqual(stats["median_ms"], 2.5)
        self.assertEqual(stats["min_ms"], 1.0)
        self.assertEqual(stats["max_ms"], 4.0)
        self.assertAlmostEqual(stats["standard_deviation_ms"], 1.118033988749895)
        self.assertEqual(stats["elements_per_second_at_median"], 40_000)

    def test_speedup_requires_real_amd_and_successful_correctness(self):
        cpu = {"median_ms": 8.0}
        amd = {"median_ms": 2.0}
        self.assertEqual(calculate_speedup(cpu, amd, correctness_passed=True, amd_backend_used=True), 4.0)
        self.assertIsNone(calculate_speedup(cpu, amd, correctness_passed=False, amd_backend_used=True))
        self.assertIsNone(calculate_speedup(cpu, amd, correctness_passed=True, amd_backend_used=False))
        self.assertIsNone(calculate_speedup(cpu, None, correctness_passed=True, amd_backend_used=True))

    def test_cpu_only_run_is_structured_and_does_not_claim_amd(self):
        calls = []

        def executor(request, *, amd_detector):
            calls.append(request["preferred_backend"])
            return self.fake_executor(request, amd_detector=amd_detector)

        report = run_benchmark(
            repetitions=2,
            warmup_runs=1,
            vector_length=8,
            amd_detector=self.unavailable_detector,
            executor=executor,
            timestamp_utc="2026-10-12T12:00:00Z",
            project_commit="a1b2c3d",
        )
        serialized = json.dumps(report, allow_nan=False)
        self.assertIn('"schema_version": 1', serialized)
        self.assertEqual(report["schemaVersion"], 2)
        for phase in ("coldStartup", "warmStartup", "bridgeMarshaling", "fullScenario", "uiEndToEnd", "memory"):
            self.assertEqual(report["phases"][phase]["status"], "not-measured")
        self.assertEqual(report["cpu"]["backend_used"], "cpu")
        self.assertEqual(report["cpu"]["statistics"]["runs"], 2)
        self.assertEqual(report["amd"]["status"], "unavailable")
        self.assertIsNone(report["amd"]["backend_used"])
        self.assertIsNone(report["amd"]["timings_ms"])
        self.assertIsNone(report["speedup"])
        self.assertEqual(report["correctness_check"]["status"], "not_compared")
        self.assertEqual(report["amd"]["reason"], "pytorch_unavailable")
        self.assertIn("PyTorch", report["amd"]["reason_message"])
        self.assertEqual(calls, ["cpu"] * 4)
        self.assertEqual(report["workload"]["seed"], "deterministic-vector-no-rng")
        self.assertEqual(report["workload"]["populations"], [{
            "count": 8,
            "unit": "numeric-vector-elements",
            "scope": "numeric-kernel-only",
        }])
        self.assertTrue(report["timingBoundaries"][0]["timed"])
        measurement = report["phases"]["engine"]["measurements"][0]
        self.assertEqual(measurement["population"]["count"], 8)
        self.assertTrue(measurement["source"])
        self.assertEqual(len(measurement["statistics"]["rawObservations"]), 2)

    def test_available_simulated_backend_uses_same_deterministic_payload(self):
        payloads = []

        def executor(request, *, amd_detector):
            payloads.append((request["operation"], request["payload"], request["preferred_backend"]))
            return self.fake_executor(request, amd_detector=amd_detector)

        report = run_benchmark(
            repetitions=2,
            warmup_runs=1,
            vector_length=8,
            amd_detector=self.available_detector,
            executor=executor,
            timestamp_utc="2026-10-12T12:00:00Z",
            project_commit="a1b2c3d",
        )
        self.assertEqual(report["correctness_check"]["status"], "passed")
        self.assertTrue(report["correctness_check"]["equivalent"])
        self.assertEqual(report["amd"]["status"], "measured")
        self.assertEqual(report["amd"]["backend_used"], "amd_rocm")
        self.assertEqual(report["amd"]["statistics"]["runs"], 2)
        self.assertEqual(report["amd"]["hardware_detection"]["device_name"], "AMD Radeon test")
        self.assertEqual(report["environment"]["amd"]["device_name"], "AMD Radeon test")
        self.assertIsNotNone(report["speedup"])
        self.assertEqual(len({report["workload"]["payload_sha256"]}), 1)
        self.assertEqual({item[0] for item in payloads}, {"scale_vector"})
        self.assertEqual({json.dumps(item[1], sort_keys=True) for item in payloads}, {json.dumps(payloads[0][1], sort_keys=True)})
        self.assertEqual({item[2] for item in payloads}, {"cpu", "amd"})
        measurements = report["phases"]["engine"]["measurements"]
        self.assertEqual({measurement["backend"] for measurement in measurements}, {"cpu", "amd_rocm"})
        for measurement in measurements:
            self.assertEqual(measurement["population"]["count"], 8)
            self.assertTrue(measurement["source"])
            self.assertEqual(len(measurement["statistics"]["rawObservations"]), 2)

    def test_new_detector_reasons_have_specific_benchmark_messages(self):
        expected_messages = {
            "runtime_unavailable": "ROCm/HIP runtime",
            "device_unavailable": "no usable AMD device",
            "runtime_initialization_failed": "driver failed during device initialization",
        }
        for reason, expected_message in expected_messages.items():
            with self.subTest(reason=reason):
                def detector(reason=reason):
                    return {
                        "available": False,
                        "reason": reason,
                        "torch_version": "test-torch",
                        "rocm_version": None,
                        "device_name": None,
                    }

                report = run_benchmark(
                    repetitions=1,
                    warmup_runs=0,
                    vector_length=4,
                    amd_detector=detector,
                    executor=self.fake_executor,
                    project_commit="a1b2c3d",
                )

                self.assertEqual(report["amd"]["reason"], reason)
                self.assertIn(expected_message, report["amd"]["reason_message"])

    def test_correctness_mismatch_prevents_amd_timing_and_speedup(self):
        def mismatching_executor(request, *, amd_detector):
            result = self.fake_executor(request, amd_detector=amd_detector)
            if request["preferred_backend"] == "amd":
                result["result"]["values"][0] += 1
            return result

        report = run_benchmark(
            repetitions=2,
            warmup_runs=1,
            vector_length=8,
            amd_detector=self.available_detector,
            executor=mismatching_executor,
            project_commit="a1b2c3d",
        )
        self.assertFalse(report["correctness_check"]["equivalent"])
        self.assertEqual(report["correctness_check"]["status"], "failed")
        self.assertEqual(report["amd"]["status"], "correctness_failed")
        self.assertIsNone(report["amd"]["timings_ms"])
        self.assertIsNone(report["amd"]["statistics"])
        self.assertIsNone(report["speedup"])
        self.assertEqual(report["cpu"]["statistics"]["runs"], 2)

    def test_backend_fallback_is_never_reported_as_amd_measurement(self):
        def fallback_executor(request, *, amd_detector):
            result = self.fake_executor(request, amd_detector=amd_detector)
            if request["preferred_backend"] == "amd":
                result["backend_used"] = "cpu"
                result["execution_metadata"]["fallback_reason"] = "amd_execution_failed"
            return result

        report = run_benchmark(
            repetitions=2,
            warmup_runs=1,
            vector_length=8,
            amd_detector=self.available_detector,
            executor=fallback_executor,
            project_commit="a1b2c3d",
        )
        self.assertTrue(report["environment"]["amd"]["available"])
        self.assertEqual(report["amd"]["status"], "unavailable")
        self.assertEqual(report["amd"]["reason"], "amd_execution_failed")
        self.assertIsNone(report["amd"]["backend_used"])
        self.assertIsNone(report["amd"]["statistics"])
        self.assertIsNone(report["speedup"])

    def test_workload_generation_is_deterministic(self):
        self.assertEqual(make_values(8), make_values(8))
        self.assertEqual(make_values(8), [-1.0, -0.983, -0.966, -0.949, -0.932, -0.915, -0.898, -0.881])


if __name__ == "__main__":
    unittest.main()
