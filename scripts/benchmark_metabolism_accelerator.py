#!/usr/bin/env python3
"""Compare the production native metabolism kernel with a real ROCm device.

The workload is the packed four-value-per-animal input consumed by
riose_core::update_metabolism from FarmEngine::tick.  PyTorch is optional and
is only used when it identifies an actual HIP/ROCm device.  CPU fallback is
never represented as accelerator execution.
"""

from __future__ import annotations

import array
import ctypes
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
SIZES = (100, 1_000, 10_000, 100_000)
REPETITIONS = int(os.environ.get("METABOLISM_BENCH_REPETITIONS", "21"))
WARMUPS = int(os.environ.get("METABOLISM_BENCH_WARMUPS", "3"))
ABS_TOL = 1e-12
REL_TOL = 1e-12


def elapsed_ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000.0


def source_info() -> dict:
    revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True)
    status = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True)
    return {"revision": revision.stdout.strip() or None, "dirty": bool(status.stdout.strip())}


def native_library() -> ctypes.CDLL:
    build = subprocess.run(["cargo", "build", "--release", "-p", "riose-core"], cwd=ROOT, capture_output=True, text=True)
    if build.returncode:
        raise RuntimeError(f"cargo build failed: {build.stderr[-2000:]}")
    candidates = [ROOT / "target/release/libriose_core.so", ROOT / "target/release/libriose_core.dylib"]
    path = next((candidate for candidate in candidates if candidate.exists()), None)
    if path is None:
        raise RuntimeError("could not find built riose_core shared library")
    library = ctypes.CDLL(str(path))
    library.riose_update_metabolism_batch.argtypes = [ctypes.c_size_t, ctypes.POINTER(ctypes.c_double), ctypes.POINTER(ctypes.c_double)]
    library.riose_update_metabolism_batch.restype = ctypes.c_int
    return library


def cattle_input(count: int) -> array.array:
    # Deterministic, physiologically plausible per-animal state. Each row is
    # [weight kg, energy %, daily intake kg DM, resting flag], matching FarmEngine.
    data = array.array("d")
    for i in range(count):
        data.extend((330.0 + (i * 17 % 700) / 10.0, 50.0 + (i * 13 % 500) / 10.0,
                     0.25 + (i * 19 % 500) / 1000.0, float(i % 4 == 0)))
    return data


def native_call(library: ctypes.CDLL, count: int, source: array.array, target: array.array) -> None:
    status = library.riose_update_metabolism_batch(
        count,
        (ctypes.c_double * len(source)).from_buffer(source),
        (ctypes.c_double * len(target)).from_buffer(target),
    )
    if status != 0:
        raise RuntimeError(f"native metabolism ABI returned {status}")


def stats(samples: list[float]) -> dict:
    return {"sampleCount": len(samples), "median": median(samples),
            "spread": {"min": min(samples), "max": max(samples), "range": max(samples) - min(samples)},
            "rawObservations": samples, "samples": samples}


def phase_measurement(phase: str, metric: str, samples: list[float], population: int, source: str) -> dict:
    return {"phase": phase, "metric": metric, "unit": "ms", "statistics": stats(samples),
            "population": population, "source": source}


def try_rocm():
    started = time.perf_counter()
    try:
        import torch
        import_ms = elapsed_ms(started)
    except Exception as exc:
        return None, {"available": False, "reason": "pytorch_unavailable", "detail": str(exc), "setupMs": elapsed_ms(started)}
    hip = getattr(torch.version, "hip", None)
    try:
        available = bool(hip and torch.cuda.is_available())
    except Exception as exc:
        available = False
        reason = f"device_detection_failed: {exc}"
    else:
        reason = "no_rocm_device" if hip else "pytorch_is_not_rocm_build"
    if not available:
        return None, {"available": False, "reason": reason, "torchVersion": torch.__version__,
                      "rocmVersion": hip, "setupMs": import_ms}
    try:
        torch.cuda.init()
        torch.cuda.synchronize()
        properties = torch.cuda.get_device_properties(0)
        info = {"available": True, "backend": "rocm_hip", "device": properties.name,
                "torchVersion": torch.__version__, "rocmVersion": hip,
                "gpuTotalMemoryBytes": int(properties.total_memory), "setupMs": elapsed_ms(started)}
        return torch, info
    except Exception as exc:
        return None, {"available": False, "reason": f"rocm_initialization_failed: {exc}",
                      "torchVersion": torch.__version__, "rocmVersion": hip, "setupMs": elapsed_ms(started)}


def gpu_kernel(torch, tensor):
    weight, energy, intake, resting = tensor.unbind(dim=1)
    gain = (intake - 5.3 * (weight / 360.0) / 24.0) * 0.22
    out_weight = torch.clamp(weight + gain, min=200.0)
    out_energy = torch.clamp(energy + torch.where(resting != 0, 5.0, intake * 4.0 - 1.5), min=0.0, max=100.0)
    return torch.stack((out_weight, out_energy), dim=1)


def report() -> dict:
    if REPETITIONS < 1 or WARMUPS < 0:
        raise ValueError("repetitions must be >= 1 and warmups >= 0")
    library = native_library()
    torch, gpu = try_rocm()
    measurements = []
    outcomes = []
    rows = []
    max_animals = 0
    for count in SIZES:
        max_animals = count
        host_input = cattle_input(count)
        host_output = array.array("d", [0.0]) * (count * 2)
        native_call(library, count, host_input, host_output)
        cpu_samples = []
        for _ in range(WARMUPS):
            native_call(library, count, host_input, host_output)
        for _ in range(REPETITIONS):
            start = time.perf_counter()
            native_call(library, count, host_input, host_output)
            cpu_samples.append(elapsed_ms(start))
        measurements.append(phase_measurement("cpu_steady_state", "nativeMetabolismBatch", cpu_samples, count, "riose_core::update_metabolism via C ABI; preallocated host buffers"))
        row = {"animals": count, "cpu": {"backend": "native_rust", "steadyState": stats(cpu_samples)},
               "accelerator": {"backend": "rocm_hip" if gpu["available"] else None, "available": gpu["available"]}}
        if torch is not None:
            # Transfer/setup costs are measured separately. Steady-state reuses
            # resident input/output tensors and synchronizes each timed call.
            start = time.perf_counter()
            host_tensor = torch.tensor(list(host_input), dtype=torch.float64).reshape(count, 4)
            device_input = host_tensor.to("cuda")
            torch.cuda.synchronize()
            h2d_ms = elapsed_ms(start)
            for _ in range(WARMUPS):
                device_output = gpu_kernel(torch, device_input)
            torch.cuda.synchronize()
            gpu_samples = []
            for _ in range(REPETITIONS):
                start = time.perf_counter()
                device_output = gpu_kernel(torch, device_input)
                torch.cuda.synchronize()
                gpu_samples.append(elapsed_ms(start))
            start = time.perf_counter()
            actual = device_output.to("cpu").reshape(-1).tolist()
            torch.cuda.synchronize()
            d2h_ms = elapsed_ms(start)
            expected = list(host_output)
            max_abs = max((abs(a - b) for a, b in zip(expected, actual)), default=0.0)
            equivalent = len(actual) == len(expected) and all(abs(a - b) <= ABS_TOL + REL_TOL * abs(b) for a, b in zip(expected, actual))
            measurements.extend([
                phase_measurement("accelerator_setup", "rocmInitialization", [gpu["setupMs"]], count, "PyTorch ROCm init, device discovery and synchronization"),
                phase_measurement("host_to_device_transfer", "inputCopy", [h2d_ms], count, "CPU Float64 input creation and H2D copy"),
                phase_measurement("accelerator_steady_state", "metabolismBatch", gpu_samples, count, "resident device input; synchronized PyTorch HIP tensor operations"),
                phase_measurement("device_to_host_transfer", "outputCopy", [d2h_ms], count, "D2H output copy and synchronization"),
                phase_measurement("accelerator_total_run", "setupTransferKernelAndReturn", [gpu["setupMs"] + h2d_ms + median(gpu_samples) + d2h_ms], count, "setup + H2D + median steady state + D2H"),
            ])
            row["accelerator"].update({"steadyState": stats(gpu_samples), "hostToDeviceMs": h2d_ms,
                                       "deviceToHostMs": d2h_ms, "setupMs": gpu["setupMs"],
                                       "totalRunMedianMs": gpu["setupMs"] + h2d_ms + median(gpu_samples) + d2h_ms,
                                       "correctness": {"equivalent": equivalent, "relativeTolerance": REL_TOL,
                                                       "absoluteTolerance": ABS_TOL, "maxAbsoluteDifference": max_abs},
                                       "speedupSteadyState": median(cpu_samples) / median(gpu_samples) if equivalent else None})
            outcomes.append(equivalent)
        else:
            row["accelerator"].update({"reason": gpu["reason"], "setupMs": gpu.get("setupMs"), "steadyState": None,
                                       "hostToDeviceMs": None, "deviceToHostMs": None, "totalRunMedianMs": None,
                                       "correctness": {"status": "not-measured", "reason": "no actual ROCm device"},
                                       "speedupSteadyState": None})
        measurements.append(phase_measurement("cpu_reference", "nativeMetabolismBatch", [median(cpu_samples)], count, "same cattle input used for accelerator comparison"))
        row["accelerator"]["speedupEndToEnd"] = (median(cpu_samples) / row["accelerator"]["totalRunMedianMs"]
                                                         if row["accelerator"].get("totalRunMedianMs") and row["accelerator"].get("correctness", {}).get("equivalent") else None)
        rows.append(row)
    engine_phase = {"status": "measured", "measurements": measurements}
    unavailable = {"status": "not-measured", "measurements": []}
    is_go = bool(gpu["available"] and all(outcomes))
    result = {
        "schemaVersion": 2,
        "benchmark": {"name": "cattle-metabolism-cpu-rocm", "source": source_info()},
        "runtime": {"platform": sys.platform, "python": platform.python_version(), "torch": gpu.get("torchVersion"), "rocm": gpu.get("rocmVersion")},
        "hardware": {"os": platform.platform(), "architecture": platform.machine(), "cpu": platform.processor() or None,
                     "gpuMemoryBytes": None, "accelerator": gpu,
                     "deviceNodeProbe": {"/dev/kfd": Path("/dev/kfd").exists(), "/dev/dri": Path("/dev/dri").exists()},
                     "toolProbe": {name: shutil.which(name) for name in ("rocminfo", "rocm-smi", "hipcc", "nvidia-smi")}},
        "workload": {"seed": "deterministic-animal-state-index-v1", "populations": [{"animals": n, "scope": "numeric-kernel-only", **({"limit": "isolated kernel only; not FarmEngine or full simulation"} if n == 100_000 else {})} for n in SIZES],
                     "inputLayout": ["weightKg", "energyPercent", "intakeKgDMPerDay", "restingFlag"], "outputLayout": ["weightKg", "energyPercent"]},
        "configuration": {"warmupRuns": WARMUPS, "repetitions": REPETITIONS, "dtype": "float64", "correctnessTolerance": {"relative": REL_TOL, "absolute": ABS_TOL}},
        "limits": {"farmEngineMaxAnimals": 10000, "numericKernelMaxAnimalsMeasured": max_animals},
        "phases": {"engine": engine_phase, "snapshot": unavailable, "serialization": unavailable, "worker": unavailable,
                    "ui": unavailable, "layout": unavailable, "render": unavailable,
                    "coldStartup": unavailable, "warmStartup": unavailable, "bridgeMarshaling": unavailable,
                    "fullScenario": unavailable, "uiEndToEnd": unavailable, "memory": unavailable,
                    "startup": {"status": "measured" if gpu["available"] else "unavailable",
                                "measurements": [phase_measurement("accelerator_setup", "rocmInitialization", [gpu["setupMs"]], 0, "PyTorch ROCm initialization") ] if gpu["available"] else []}},
        "timingBoundaries": [{"phase": "engine", "timed": ["Native Rust metabolism kernel; optional actual ROCm tensor kernel, with setup and transfers separately recorded."],
                              "notTimed": ["FarmEngine orchestration, feeding, weather, snapshot, worker scheduling, UI and rendering."],
                              "whatIsTimed": ["Native Rust metabolism kernel; optional actual ROCm tensor kernel, with setup and transfers separately recorded."],
                              "whatIsNotTimed": ["FarmEngine orchestration, feeding, weather, snapshot, worker scheduling, UI and rendering."]}],
        "results": {"decision": "go" if is_go else "no-go", "reason": "validated actual ROCm comparison" if is_go else gpu.get("reason", "correctness_failed"),
                    "rows": rows, "correctness": {"status": "passed" if torch is not None and all(outcomes) else "not-measured" if torch is None else "failed",
                                                     "reason": None if torch is not None else "accelerator unavailable; no CPU fallback is counted as accelerator"},
                    "speedupReportedOnlyAfterActualROCmAndCorrectness": True},
        "limitations": ["This profiles the exact packed numeric metabolism kernel called by FarmEngine, not a full farm simulation.",
                        "A CPU-only environment is an explicit no-go; CPU measurements are never labeled as GPU results.",
                        "The PyTorch HIP implementation evaluates the same formula but is not integrated into production."]
    }
    validator = ROOT / "scripts" / "validate-benchmark-report.mjs"
    validation = subprocess.run(["node", str(validator)], input=json.dumps(result, allow_nan=False),
                                text=True, capture_output=True)
    if validation.returncode:
        raise ValueError(f"shared_benchmark_report_schema_validation_failed: {validation.stderr.strip()}")
    return result


if __name__ == "__main__":
    print(json.dumps(report(), indent=2, allow_nan=False))
