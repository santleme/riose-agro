"""Reproducible CPU versus AMD benchmark for compute_service.scale_vector."""

from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter_ns
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.server.compute_service import detect_amd_backend, execute_compute  # noqa: E402


DEFAULT_REPETITIONS = 15
DEFAULT_WARMUP_RUNS = 3
VECTOR_LENGTH = 16_384
FACTOR = 1.125
ABS_TOLERANCE = 1e-12
REL_TOLERANCE = 1e-12


def make_values(length: int = VECTOR_LENGTH) -> list[float]:
    """Build a fixed, deterministic vector without a random seed or dependency."""
    if not isinstance(length, int) or isinstance(length, bool) or length <= 0:
        raise ValueError("vector_length_must_be_positive_integer")
    return [((index * 17 % 2001) - 1000) / 1000 for index in range(length)]


def payload_sha256(values: list[float], factor: float = FACTOR) -> str:
    canonical = json.dumps(
        {"factor": factor, "values": values},
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def calculate_statistics(timings_ms: list[float], elements_per_run: int) -> dict[str, float | int | None]:
    if not timings_ms:
        raise ValueError("timings_must_not_be_empty")
    if any(not math.isfinite(value) or value < 0 for value in timings_ms):
        raise ValueError("timings_must_be_finite_nonnegative_numbers")
    if not isinstance(elements_per_run, int) or isinstance(elements_per_run, bool) or elements_per_run <= 0:
        raise ValueError("elements_per_run_must_be_positive_integer")
    median_ms = statistics.median(timings_ms)
    return {
        "runs": len(timings_ms),
        "mean_ms": statistics.fmean(timings_ms),
        "median_ms": median_ms,
        "min_ms": min(timings_ms),
        "max_ms": max(timings_ms),
        "standard_deviation_ms": statistics.pstdev(timings_ms),
        "elements_per_second_at_median": elements_per_run / (median_ms / 1000) if median_ms > 0 else None,
    }


def calculate_speedup(
    cpu_statistics: dict[str, Any],
    amd_statistics: dict[str, Any] | None,
    *,
    correctness_passed: bool,
    amd_backend_used: bool,
) -> float | None:
    if not correctness_passed or not amd_backend_used or amd_statistics is None:
        return None
    cpu_median = cpu_statistics.get("median_ms")
    amd_median = amd_statistics.get("median_ms")
    if not isinstance(cpu_median, (int, float)) or not isinstance(amd_median, (int, float)):
        return None
    if not math.isfinite(cpu_median) or not math.isfinite(amd_median) or cpu_median <= 0 or amd_median <= 0:
        return None
    return cpu_median / amd_median


def compare_results(cpu_result: dict[str, Any], amd_result: dict[str, Any]) -> dict[str, Any]:
    cpu_values = cpu_result.get("result", {}).get("values")
    amd_values = amd_result.get("result", {}).get("values")
    if not isinstance(cpu_values, list) or not isinstance(amd_values, list):
        return {"equivalent": False, "reason": "result_values_missing"}
    if len(cpu_values) != len(amd_values):
        return {
            "equivalent": False,
            "reason": "result_length_mismatch",
            "cpu_length": len(cpu_values),
            "amd_length": len(amd_values),
        }
    for index, (cpu_value, amd_value) in enumerate(zip(cpu_values, amd_values)):
        if not isinstance(cpu_value, (int, float)) or not isinstance(amd_value, (int, float)):
            return {"equivalent": False, "reason": "result_value_not_numeric", "first_mismatch_index": index}
        if not math.isclose(cpu_value, amd_value, rel_tol=REL_TOLERANCE, abs_tol=ABS_TOLERANCE):
            return {
                "equivalent": False,
                "reason": "result_value_mismatch",
                "first_mismatch_index": index,
                "cpu_value": cpu_value,
                "amd_value": amd_value,
                "absolute_difference": abs(cpu_value - amd_value),
            }
    return {"equivalent": True, "tolerance": {"relative": REL_TOLERANCE, "absolute": ABS_TOLERANCE}}


def _request(values: list[float], preferred_backend: str) -> dict[str, Any]:
    return {
        "contract_version": "1",
        "operation": "scale_vector",
        "payload": {"values": values, "factor": FACTOR},
        "preferred_backend": preferred_backend,
    }


def _used_backend(result: Any) -> str | None:
    if isinstance(result, dict):
        return result.get("backend_used")
    return None


def _measure(
    *,
    values: list[float],
    preferred_backend: str,
    expected_backend: str,
    reference_result: dict[str, Any],
    repetitions: int,
    warmup_runs: int,
    amd_detector: Callable[[], dict[str, Any]],
    executor: Callable[..., dict[str, Any]],
    clock_ns: Callable[[], int],
) -> tuple[list[float] | None, dict[str, Any] | None, str | None]:
    request = _request(values, preferred_backend)
    for _ in range(warmup_runs):
        result = executor(request, amd_detector=amd_detector)
        if _used_backend(result) != expected_backend:
            return None, result, "requested_backend_not_used_during_warmup"
        if not compare_results(reference_result, result)["equivalent"]:
            return None, result, "result_changed_during_warmup"

    timings_ms: list[float] = []
    for _ in range(repetitions):
        started = clock_ns()
        result = executor(request, amd_detector=amd_detector)
        elapsed_ns = clock_ns() - started
        if elapsed_ns < 0:
            return None, result, "monotonic_clock_moved_backwards"
        if _used_backend(result) != expected_backend:
            return None, result, "requested_backend_not_used_during_measurement"
        if not compare_results(reference_result, result)["equivalent"]:
            return None, result, "result_changed_during_measurement"
        timings_ms.append(elapsed_ns / 1_000_000)
    return timings_ms, None, None


def _project_commit() -> str | None:
    try:
        completed = subprocess.run(
            ["git", "-c", "safe.directory=*", "rev-parse", "--short", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return completed.stdout.strip() or None


def _project_dirty() -> bool:
    try:
        completed = subprocess.run(
            ["git", "-c", "safe.directory=*", "status", "--porcelain"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return False
    return bool(completed.stdout.strip())


def _amd_reason_message(reason: str | None) -> str:
    return {
        "pytorch_unavailable": "PyTorch is not installed or could not be imported.",
        "pytorch_rocm_unavailable": "PyTorch does not expose a ROCm/HIP runtime.",
        "amd_device_unavailable": "PyTorch ROCm is present, but no AMD device is available to it.",
        "amd_execution_failed": "The compute service fell back because AMD execution failed.",
        "amd_backend_not_used": "The service did not report an AMD backend for the request.",
        "result_values_missing": "The AMD response did not include comparable result values.",
        "result_length_mismatch": "CPU and AMD returned different numbers of result values.",
        "result_value_not_numeric": "CPU and AMD returned a non-numeric result value.",
        "result_value_mismatch": "CPU and AMD results differ beyond the documented tolerance; no speedup is reported.",
        "result_changed_during_warmup": "AMD results changed during warmup; no speedup is reported.",
        "result_changed_during_measurement": "AMD results changed during measurement; no speedup is reported.",
    }.get(reason or "", "AMD execution was not available for this benchmark.")


def run_benchmark(
    *,
    repetitions: int = DEFAULT_REPETITIONS,
    warmup_runs: int = DEFAULT_WARMUP_RUNS,
    vector_length: int = VECTOR_LENGTH,
    amd_detector: Callable[[], dict[str, Any]] = detect_amd_backend,
    executor: Callable[..., dict[str, Any]] = execute_compute,
    clock_ns: Callable[[], int] = perf_counter_ns,
    timestamp_utc: str | None = None,
    project_commit: str | None = None,
) -> dict[str, Any]:
    if not isinstance(repetitions, int) or isinstance(repetitions, bool) or repetitions < 1:
        raise ValueError("repetitions_must_be_positive_integer")
    if not isinstance(warmup_runs, int) or isinstance(warmup_runs, bool) or warmup_runs < 0:
        raise ValueError("warmup_runs_must_be_nonnegative_integer")

    values = make_values(vector_length)
    payload_hash = payload_sha256(values)
    cpu_request = _request(values, "cpu")
    cpu_probe = executor(cpu_request, amd_detector=lambda: {"available": False, "reason": None})
    if _used_backend(cpu_probe) != "cpu":
        raise RuntimeError("cpu_request_did_not_use_cpu_backend")

    try:
        detection = amd_detector()
    except Exception:
        detection = {
            "available": False,
            "reason": "amd_detection_failed",
            "torch_version": None,
            "rocm_version": None,
        }
    amd_available = detection.get("available") is True
    amd_probe: dict[str, Any] | None = None
    correctness: dict[str, Any] = {
        "status": "not_compared",
        "equivalent": None,
        "reason": "amd_backend_unavailable",
    }
    amd_status = "unavailable"
    amd_reason = detection.get("reason") if not amd_available else None

    if amd_available:
        try:
            amd_probe = executor(_request(values, "amd"), amd_detector=lambda: detection)
        except Exception:
            amd_reason = "amd_execution_failed"
        else:
            if _used_backend(amd_probe) != "amd_rocm":
                amd_reason = (
                    amd_probe.get("execution_metadata", {}).get("fallback_reason")
                    or "amd_backend_not_used"
                )
            else:
                correctness = compare_results(cpu_probe, amd_probe)
                correctness["status"] = "passed" if correctness["equivalent"] else "failed"
                amd_status = "ready" if correctness["equivalent"] else "correctness_failed"
                if not correctness["equivalent"]:
                    amd_reason = correctness.get("reason")

    cpu_timings, cpu_failure_result, cpu_failure = _measure(
        values=values,
        preferred_backend="cpu",
        expected_backend="cpu",
        reference_result=cpu_probe,
        repetitions=repetitions,
        warmup_runs=warmup_runs,
        amd_detector=lambda: {"available": False, "reason": None},
        executor=executor,
        clock_ns=clock_ns,
    )
    if cpu_timings is None:
        raise RuntimeError(f"cpu_benchmark_failed:{cpu_failure or _used_backend(cpu_failure_result)}")

    cpu_statistics = calculate_statistics(cpu_timings, len(values))
    amd_timings: list[float] | None = None
    amd_statistics: dict[str, Any] | None = None
    amd_backend_used = False

    if amd_status == "ready":
        amd_timings, amd_failure_result, amd_failure = _measure(
            values=values,
            preferred_backend="amd",
            expected_backend="amd_rocm",
            reference_result=cpu_probe,
            repetitions=repetitions,
            warmup_runs=warmup_runs,
            amd_detector=lambda: detection,
            executor=executor,
            clock_ns=clock_ns,
        )
        if amd_timings is None:
            correctness_failed = bool(amd_failure and amd_failure.startswith("result_changed"))
            amd_status = "correctness_failed" if correctness_failed else "unavailable"
            amd_reason = amd_failure or (
                amd_failure_result.get("execution_metadata", {}).get("fallback_reason")
                if isinstance(amd_failure_result, dict)
                else None
            ) or "amd_backend_not_used"
            if correctness_failed:
                correctness = {"status": "failed", "equivalent": False, "reason": amd_reason}
        else:
            amd_statistics = calculate_statistics(amd_timings, len(values))
            amd_backend_used = True
            amd_status = "measured"

    speedup = calculate_speedup(
        cpu_statistics,
        amd_statistics,
        correctness_passed=correctness.get("equivalent") is True,
        amd_backend_used=amd_backend_used,
    )
    if speedup is not None:
        correctness["status"] = "passed"

    detection_for_output = {
        "available": amd_available,
        "reason": detection.get("reason") if not amd_available else None,
        "torch_version": detection.get("torch_version"),
        "rocm_version": detection.get("rocm_version"),
        "device_name": None,
    }
    amd_output: dict[str, Any] = {
        "status": amd_status,
        "backend_requested": "amd",
        "backend_used": "amd_rocm" if amd_backend_used else None,
        "correctness_probe_backend_used": _used_backend(amd_probe),
        "timing_backend_used": "amd_rocm" if amd_backend_used else None,
        "hardware_detection": detection_for_output,
        "reason": amd_reason,
        "reason_message": _amd_reason_message(amd_reason),
        "timings_ms": amd_timings,
        "statistics": amd_statistics,
    }

    if not amd_available and amd_reason == "amd_detection_failed":
        amd_output["reason_message"] = "AMD availability detection raised an error."

    now = timestamp_utc or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    cpu_name = platform.processor() or None
    legacy_report = {
        "schema_version": 1,
        "timestamp_utc": now,
        "project_commit": project_commit if project_commit is not None else _project_commit(),
        "workload": {
            "operation": "scale_vector",
            "contract_version": "1",
            "vector_length": len(values),
            "factor": FACTOR,
            "input_definition": "values[i] = ((i * 17 % 2001) - 1000) / 1000",
            "payload_sha256": payload_hash,
            "deterministic": True,
        },
        "configuration": {"repetitions": repetitions, "warmup_runs": warmup_runs},
        "environment": {
            "os": platform.system(),
            "os_release": platform.release(),
            "architecture": platform.machine(),
            "cpu": cpu_name,
            "python": platform.python_version(),
            "amd": detection_for_output,
        },
        "cpu": {
            "status": "measured",
            "backend_requested": "cpu",
            "backend_used": "cpu",
            "timings_ms": cpu_timings,
            "statistics": cpu_statistics,
        },
        "amd": amd_output,
        "correctness_check": correctness,
        "speedup": speedup,
        "speedup_formula": "median_cpu_ms / median_amd_ms; only when AMD was used and correctness passed",
        "limitations": [
            "This benchmark measures the compute_service scale_vector operation, not a scientific model or the full farm simulation.",
            "Timings call the service compute function directly and exclude HTTP transport and server queueing.",
            "The compute service does not expose an AMD device model, so device_name is null when unavailable from its contract.",
            "Benchmark de software/hardware não implica validação científica do modelo.",
        ],
    }
    def phase_statistics(statistics: dict[str, Any] | None) -> dict[str, Any]:
        if statistics is None:
            return {"sampleCount": 0, "median": None, "spread": None}
        minimum, maximum = statistics["min_ms"], statistics["max_ms"]
        return {
            "sampleCount": statistics["runs"],
            "median": statistics["median_ms"],
            "spread": {"min": minimum, "max": maximum, "range": maximum - minimum},
        }

    compute_measurements = [{
        "phase": "engine",
        "metric": "scale_vector",
        "unit": "ms",
        "statistics": phase_statistics(cpu_statistics),
        "scope": "numeric-vector-elements",
        "elements": len(values),
        "backend": "cpu",
        "memory": None,
    }]
    if amd_statistics is not None:
        compute_measurements.append({
            "phase": "engine",
            "metric": "scale_vector",
            "unit": "ms",
            "statistics": phase_statistics(amd_statistics),
            "scope": "numeric-vector-elements",
            "elements": len(values),
            "backend": "amd_rocm",
            "memory": None,
        })
    not_measured = {"status": "not-measured", "measurements": []}
    cpu_name = platform.processor() or None
    return {
        "schemaVersion": 1,
        "benchmark": {
            "name": "compute-service-scale-vector",
            "source": {"revision": legacy_report["project_commit"], "dirty": _project_dirty()},
        },
        "runtime": {"platform": sys.platform, "python": platform.python_version()},
        "hardware": {
            "os": platform.system(),
            "architecture": platform.machine(),
            "cpu": cpu_name,
            "gpuMemoryBytes": None,
        },
        "workload": {
            "seed": None,
            "populations": [],
            "numericWorkload": {"elements": len(values), "operation": "scale_vector"},
        },
        "configuration": {"warmupRuns": warmup_runs, "repetitions": repetitions},
        "limits": {
            "farmEngineMaxAnimals": None,
            "rendererMaxAnimals": None,
            "numericKernelMaxAnimalsMeasured": None,
        },
        "phases": {
            "engine": {"status": "measured", "measurements": compute_measurements},
            "snapshot": not_measured,
            "serialization": not_measured,
            "worker": not_measured,
            "ui": not_measured,
            "layout": not_measured,
            "render": not_measured,
            "startup": not_measured,
        },
        "results": legacy_report,
        "limitations": legacy_report["limitations"],
        # Keep the original v1 fields at the top level for existing report consumers.
        **legacy_report,
    }


def _positive_env_int(name: str, default: int, *, allow_zero: bool = False) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name}_must_be_integer") from error
    minimum = 0 if allow_zero else 1
    if value < minimum:
        requirement = "nonnegative" if allow_zero else "positive"
        raise ValueError(f"{name}_must_be_{requirement}_integer")
    return value


def main() -> None:
    report = run_benchmark(
        repetitions=_positive_env_int("BENCH_REPETITIONS", DEFAULT_REPETITIONS),
        warmup_runs=_positive_env_int("BENCH_WARMUP", DEFAULT_WARMUP_RUNS, allow_zero=True),
    )
    print(json.dumps(report, allow_nan=False, indent=2))


if __name__ == "__main__":
    main()
