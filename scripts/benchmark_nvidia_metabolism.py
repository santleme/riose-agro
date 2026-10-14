#!/usr/bin/env python3
"""Compare the native cattle metabolism kernel with a real NVIDIA CUDA device.

The isolated prototype uses CUDA's Driver API and driver JIT compilation of
PTX, so it does not add a production or Python GPU dependency. It never treats
a CPU result as a GPU result. ``--preflight-only`` runs the real metabolism
kernel once and checks parity before any benchmark timings are collected.
"""

from __future__ import annotations

import argparse
import array
import ctypes
import hashlib
import json
import math
import os
import platform
import statistics
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIZES = (100, 1_000, 10_000, 100_000)
WARMUPS = int(os.environ.get("METABOLISM_BENCH_WARMUPS", "3"))
REPETITIONS = int(os.environ.get("METABOLISM_BENCH_REPETITIONS", "21"))
ABS_TOLERANCE = 1e-12
REL_TOLERANCE = 1e-12

PTX = r""".version 6.0
.target sm_60
.address_size 64
.visible .entry metabolism_batch(
    .param .u64 input_ptr,
    .param .u64 output_ptr,
    .param .u32 count
) {
    .reg .pred %p<5>;
    .reg .b32 %r<5>;
    .reg .b64 %rd<8>;
    .reg .f64 %fd<13>;
    ld.param.u64 %rd1, [input_ptr];
    ld.param.u64 %rd2, [output_ptr];
    ld.param.u32 %r1, [count];
    mov.u32 %r2, %ctaid.x;
    mov.u32 %r3, %ntid.x;
    mov.u32 %r4, %tid.x;
    mad.lo.u32 %r4, %r2, %r3, %r4;
    setp.ge.u32 %p1, %r4, %r1;
    @%p1 bra DONE;
    mul.wide.u32 %rd3, %r4, 32;
    add.s64 %rd4, %rd1, %rd3;
    ld.global.f64 %fd1, [%rd4];
    ld.global.f64 %fd2, [%rd4+8];
    ld.global.f64 %fd3, [%rd4+16];
    ld.global.f64 %fd4, [%rd4+24];
    div.rn.f64 %fd5, %fd1, 0d4076800000000000;
    mul.rn.f64 %fd5, %fd5, 0d4015333333333333;
    div.rn.f64 %fd5, %fd5, 0d4038000000000000;
    sub.rn.f64 %fd5, %fd3, %fd5;
    mul.rn.f64 %fd5, %fd5, 0d3fcc28f5c28f5c29;
    add.rn.f64 %fd6, %fd1, %fd5;
    setp.gt.f64 %p2, %fd6, 0d4069000000000000;
    selp.f64 %fd6, %fd6, 0d4069000000000000, %p2;
    mul.rn.f64 %fd7, %fd3, 0d4010000000000000;
    sub.rn.f64 %fd7, %fd7, 0d3ff8000000000000;
    add.rn.f64 %fd7, %fd2, %fd7;
    add.rn.f64 %fd8, %fd2, 0d4014000000000000;
    setp.ne.f64 %p3, %fd4, 0d0000000000000000;
    selp.f64 %fd8, %fd8, %fd7, %p3;
    setp.lt.f64 %p4, %fd8, 0d0000000000000000;
    selp.f64 %fd8, 0d0000000000000000, %fd8, %p4;
    setp.gt.f64 %p4, %fd8, 0d4059000000000000;
    selp.f64 %fd8, 0d4059000000000000, %fd8, %p4;
    mul.wide.u32 %rd5, %r4, 16;
    add.s64 %rd6, %rd2, %rd5;
    st.global.f64 [%rd6], %fd6;
    st.global.f64 [%rd6+8], %fd8;
DONE:
    ret;
}
"""


def cattle_input(count: int) -> array.array:
    values = array.array("d")
    for index in range(count):
        values.extend((330.0 + (index * 17 % 700) / 10.0,
                       50.0 + (index * 13 % 500) / 10.0,
                       0.25 + (index * 19 % 500) / 1000.0,
                       float(index % 4 == 0)))
    return values


def statistics_for(samples: list[float]) -> dict:
    return {"sampleCount": len(samples), "median": statistics.median(samples),
            "min": min(samples), "max": max(samples), "range": max(samples) - min(samples),
            "rawObservations": samples}


def source_info() -> dict:
    revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT,
                              check=True, capture_output=True, text=True).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                                check=True, capture_output=True, text=True).stdout)
    return {"revision": revision, "dirty": dirty}


def cpu_model() -> str | None:
    try:
        for line in Path("/proc/cpuinfo").read_text(encoding="utf-8").splitlines():
            if line.lower().startswith("model name"):
                return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or None


def native_library() -> ctypes.CDLL:
    build = subprocess.run(["cargo", "build", "--release", "-p", "riose-core"], cwd=ROOT,
                           capture_output=True, text=True)
    if build.returncode:
        raise RuntimeError(f"cargo build failed: {build.stderr[-2000:]}")
    library = ctypes.CDLL(str(ROOT / "target/release/libriose_core.so"))
    library.riose_update_metabolism_batch.argtypes = [
        ctypes.c_size_t, ctypes.POINTER(ctypes.c_double), ctypes.POINTER(ctypes.c_double)]
    library.riose_update_metabolism_batch.restype = ctypes.c_int
    return library


def native_call(library: ctypes.CDLL, values: array.array, count: int) -> array.array:
    output = array.array("d", [0.0]) * (count * 2)
    status = library.riose_update_metabolism_batch(
        count, (ctypes.c_double * len(values)).from_buffer(values),
        (ctypes.c_double * len(output)).from_buffer(output))
    if status != 0:
        raise RuntimeError(f"native metabolism ABI returned {status}")
    return output


class CudaDriver:
    """Minimal, dependency-free CUDA Driver API binding for this experiment."""

    def __init__(self) -> None:
        self.lib = ctypes.CDLL("libcuda.so.1")
        self._bind()
        self._check(self.lib.cuInit(0), "cuInit")
        device = ctypes.c_int()
        self._check(self.lib.cuDeviceGet(ctypes.byref(device), 0), "cuDeviceGet")
        self.device = device.value
        name = ctypes.create_string_buffer(256)
        self._check(self.lib.cuDeviceGetName(name, len(name), self.device), "cuDeviceGetName")
        self.name = name.value.decode("utf-8", "replace")
        major, minor = ctypes.c_int(), ctypes.c_int()
        self._check(self.lib.cuDeviceComputeCapability(ctypes.byref(major), ctypes.byref(minor), self.device),
                    "cuDeviceComputeCapability")
        self.compute_capability = f"{major.value}.{minor.value}"
        self.context = ctypes.c_void_p()
        self._check(self.lib.cuCtxCreate_v2(ctypes.byref(self.context), 0, self.device), "cuCtxCreate")
        self.module = ctypes.c_void_p()
        ptx = PTX.encode("ascii") + b"\0"
        self._check(self.lib.cuModuleLoadData(ctypes.byref(self.module), ctypes.c_char_p(ptx)), "cuModuleLoadData")
        self.function = ctypes.c_void_p()
        self._check(self.lib.cuModuleGetFunction(ctypes.byref(self.function), self.module,
                                                 b"metabolism_batch"), "cuModuleGetFunction")
        self.start_event, self.stop_event = ctypes.c_void_p(), ctypes.c_void_p()
        self._check(self.lib.cuEventCreate(ctypes.byref(self.start_event), 0), "cuEventCreate(start)")
        self._check(self.lib.cuEventCreate(ctypes.byref(self.stop_event), 0), "cuEventCreate(stop)")
        self._check(self.lib.cuDriverGetVersion(ctypes.byref(self.driver_version)), "cuDriverGetVersion")

    def _bind(self) -> None:
        lib = self.lib
        lib.cuInit.argtypes = [ctypes.c_uint]; lib.cuInit.restype = ctypes.c_int
        lib.cuDeviceGet.argtypes = [ctypes.POINTER(ctypes.c_int), ctypes.c_int]; lib.cuDeviceGet.restype = ctypes.c_int
        lib.cuDeviceGetName.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_int]; lib.cuDeviceGetName.restype = ctypes.c_int
        lib.cuDeviceComputeCapability.argtypes = [ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.c_int]; lib.cuDeviceComputeCapability.restype = ctypes.c_int
        lib.cuCtxCreate_v2.argtypes = [ctypes.POINTER(ctypes.c_void_p), ctypes.c_uint, ctypes.c_int]; lib.cuCtxCreate_v2.restype = ctypes.c_int
        lib.cuCtxDestroy_v2.argtypes = [ctypes.c_void_p]; lib.cuCtxDestroy_v2.restype = ctypes.c_int
        lib.cuModuleLoadData.argtypes = [ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]; lib.cuModuleLoadData.restype = ctypes.c_int
        lib.cuModuleUnload.argtypes = [ctypes.c_void_p]; lib.cuModuleUnload.restype = ctypes.c_int
        lib.cuModuleGetFunction.argtypes = [ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p, ctypes.c_char_p]; lib.cuModuleGetFunction.restype = ctypes.c_int
        lib.cuMemAlloc_v2.argtypes = [ctypes.POINTER(ctypes.c_uint64), ctypes.c_size_t]; lib.cuMemAlloc_v2.restype = ctypes.c_int
        lib.cuMemFree_v2.argtypes = [ctypes.c_uint64]; lib.cuMemFree_v2.restype = ctypes.c_int
        lib.cuMemcpyHtoD_v2.argtypes = [ctypes.c_uint64, ctypes.c_void_p, ctypes.c_size_t]; lib.cuMemcpyHtoD_v2.restype = ctypes.c_int
        lib.cuMemcpyDtoH_v2.argtypes = [ctypes.c_void_p, ctypes.c_uint64, ctypes.c_size_t]; lib.cuMemcpyDtoH_v2.restype = ctypes.c_int
        lib.cuLaunchKernel.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint,
                                       ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint,
                                       ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_void_p)]
        lib.cuLaunchKernel.restype = ctypes.c_int
        lib.cuCtxSynchronize.argtypes = []; lib.cuCtxSynchronize.restype = ctypes.c_int
        lib.cuDriverGetVersion.argtypes = [ctypes.POINTER(ctypes.c_int)]; lib.cuDriverGetVersion.restype = ctypes.c_int
        lib.cuEventCreate.argtypes = [ctypes.POINTER(ctypes.c_void_p), ctypes.c_uint]; lib.cuEventCreate.restype = ctypes.c_int
        lib.cuEventDestroy_v2.argtypes = [ctypes.c_void_p]; lib.cuEventDestroy_v2.restype = ctypes.c_int
        lib.cuEventRecord.argtypes = [ctypes.c_void_p, ctypes.c_void_p]; lib.cuEventRecord.restype = ctypes.c_int
        lib.cuEventSynchronize.argtypes = [ctypes.c_void_p]; lib.cuEventSynchronize.restype = ctypes.c_int
        lib.cuEventElapsedTime.argtypes = [ctypes.POINTER(ctypes.c_float), ctypes.c_void_p, ctypes.c_void_p]; lib.cuEventElapsedTime.restype = ctypes.c_int
        self.driver_version = ctypes.c_int()

    @staticmethod
    def _check(code: int, operation: str) -> None:
        if code != 0:
            raise RuntimeError(f"CUDA Driver API {operation} failed with CUresult {code}")

    def allocate(self, byte_count: int) -> int:
        pointer = ctypes.c_uint64()
        self._check(self.lib.cuMemAlloc_v2(ctypes.byref(pointer), byte_count), "cuMemAlloc")
        return pointer.value

    def free(self, pointer: int) -> None:
        self._check(self.lib.cuMemFree_v2(pointer), "cuMemFree")

    def h2d(self, device_pointer: int, host_values: array.array) -> None:
        self._check(self.lib.cuMemcpyHtoD_v2(device_pointer,
                    ctypes.c_void_p(host_values.buffer_info()[0]), len(host_values) * 8), "cuMemcpyHtoD")

    def d2h(self, host_values: array.array, device_pointer: int) -> None:
        self._check(self.lib.cuMemcpyDtoH_v2(ctypes.c_void_p(host_values.buffer_info()[0]),
                    device_pointer, len(host_values) * 8), "cuMemcpyDtoH")

    def run(self, input_pointer: int, output_pointer: int, count: int) -> tuple[float, float, float]:
        input_arg, output_arg, count_arg = (ctypes.c_uint64(input_pointer), ctypes.c_uint64(output_pointer),
                                            ctypes.c_uint32(count))
        params = (ctypes.c_void_p * 3)(ctypes.addressof(input_arg), ctypes.addressof(output_arg),
                                      ctypes.addressof(count_arg))
        blocks = math.ceil(count / 128)
        self._check(self.lib.cuEventRecord(self.start_event, None), "cuEventRecord(start)")
        launch_start = time.perf_counter_ns()
        self._check(self.lib.cuLaunchKernel(self.function, blocks, 1, 1, 128, 1, 1,
                                             0, None, params, None), "cuLaunchKernel")
        launch_ms = (time.perf_counter_ns() - launch_start) / 1_000_000
        self._check(self.lib.cuEventRecord(self.stop_event, None), "cuEventRecord(stop)")
        sync_start = time.perf_counter_ns()
        self._check(self.lib.cuEventSynchronize(self.stop_event), "cuEventSynchronize")
        sync_ms = (time.perf_counter_ns() - sync_start) / 1_000_000
        kernel_ms = ctypes.c_float()
        self._check(self.lib.cuEventElapsedTime(ctypes.byref(kernel_ms), self.start_event, self.stop_event),
                    "cuEventElapsedTime")
        return launch_ms, sync_ms, kernel_ms.value

    def metadata(self) -> dict:
        version = self.driver_version.value
        return {"available": True, "backend": "cuda_driver_ptx", "device": self.name,
                "computeCapability": self.compute_capability,
                "cudaDriverApiVersion": f"{version // 1000}.{(version % 1000) // 10}"}

    def close(self) -> None:
        if self.stop_event.value:
            self._check(self.lib.cuEventDestroy_v2(self.stop_event), "cuEventDestroy(stop)")
        if self.start_event.value:
            self._check(self.lib.cuEventDestroy_v2(self.start_event), "cuEventDestroy(start)")
        if self.module.value:
            self._check(self.lib.cuModuleUnload(self.module), "cuModuleUnload")
        if self.context.value:
            self._check(self.lib.cuCtxDestroy_v2(self.context), "cuCtxDestroy")


def compare(expected: array.array, actual: array.array) -> dict:
    if len(expected) != len(actual):
        return {"equivalent": False, "reason": "length_mismatch"}
    differences = [abs(a - b) for a, b in zip(expected, actual)]
    equivalent = all(math.isclose(a, b, rel_tol=REL_TOLERANCE, abs_tol=ABS_TOLERANCE)
                     for a, b in zip(expected, actual))
    return {"equivalent": equivalent, "relativeTolerance": REL_TOLERANCE,
            "absoluteTolerance": ABS_TOLERANCE, "maxAbsoluteDifference": max(differences, default=0.0)}


def device_metadata(driver: CudaDriver) -> dict:
    try:
        output = subprocess.run(["nvidia-smi", "--query-gpu=name,driver_version,memory.total",
                                 "--format=csv,noheader,nounits"], check=True,
                                capture_output=True, text=True).stdout.strip().splitlines()[0]
        name, version, memory_mb = [part.strip() for part in output.split(",", 2)]
        return {**driver.metadata(), "nvidiaSmiName": name, "driverVersion": version,
                "gpuMemoryBytes": int(memory_mb) * 1024 * 1024}
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return {**driver.metadata(), "nvidiaSmiName": None, "driverVersion": None, "gpuMemoryBytes": None}


def run_case(driver: CudaDriver, library: ctypes.CDLL, count: int, initialization_ms: float) -> dict:
    host_setup_samples: list[float] = []
    allocation_samples: list[float] = []
    h2d_samples: list[float] = []
    launch_samples: list[float] = []
    sync_samples: list[float] = []
    kernel_samples: list[float] = []
    d2h_samples: list[float] = []
    gpu_total_samples: list[float] = []
    cpu_kernel_samples: list[float] = []
    cpu_total_samples: list[float] = []
    for _ in range(WARMUPS):
        values = cattle_input(count)
        cpu_expected = native_call(library, values, count)
        in_ptr, out_ptr = driver.allocate(len(values) * 8), driver.allocate(count * 2 * 8)
        try:
            driver.h2d(in_ptr, values)
            driver.run(in_ptr, out_ptr, count)
            result = array.array("d", [0.0]) * (count * 2)
            driver.d2h(result, out_ptr)
            check = compare(cpu_expected, result)
            if not check["equivalent"]:
                raise RuntimeError(f"GPU correctness failed during warmup for {count}: {check}")
        finally:
            driver.free(out_ptr); driver.free(in_ptr)

    for _ in range(REPETITIONS):
        total_start = time.perf_counter_ns()
        host_start = time.perf_counter_ns()
        values = cattle_input(count)
        cpu_out = array.array("d", [0.0]) * (count * 2)
        host_setup_samples.append((time.perf_counter_ns() - host_start) / 1_000_000)
        host_setup_ms = host_setup_samples[-1]
        cpu_start = time.perf_counter_ns()
        status = library.riose_update_metabolism_batch(
            count, (ctypes.c_double * len(values)).from_buffer(values),
            (ctypes.c_double * len(cpu_out)).from_buffer(cpu_out))
        cpu_kernel_samples.append((time.perf_counter_ns() - cpu_start) / 1_000_000)
        if status != 0:
            raise RuntimeError(f"native metabolism ABI returned {status}")
        cpu_total_samples.append((time.perf_counter_ns() - total_start) / 1_000_000)

        gpu_total_start = time.perf_counter_ns()
        alloc_start = time.perf_counter_ns()
        in_ptr, out_ptr = driver.allocate(len(values) * 8), driver.allocate(count * 2 * 8)
        allocation_samples.append((time.perf_counter_ns() - alloc_start) / 1_000_000)
        try:
            h2d_start = time.perf_counter_ns(); driver.h2d(in_ptr, values)
            h2d_samples.append((time.perf_counter_ns() - h2d_start) / 1_000_000)
            launch_ms, sync_ms, kernel_ms = driver.run(in_ptr, out_ptr, count)
            launch_samples.append(launch_ms); sync_samples.append(sync_ms); kernel_samples.append(kernel_ms)
            actual = array.array("d", [0.0]) * (count * 2)
            d2h_start = time.perf_counter_ns(); driver.d2h(actual, out_ptr)
            d2h_samples.append((time.perf_counter_ns() - d2h_start) / 1_000_000)
            # Stop at the documented end-to-end boundary before CPU-side
            # correctness validation or device-buffer cleanup.
            gpu_elapsed_ms = (time.perf_counter_ns() - gpu_total_start) / 1_000_000
            correctness = compare(cpu_out, actual)
            if not correctness["equivalent"]:
                raise RuntimeError(f"GPU correctness failed for {count}: {correctness}")
        finally:
            driver.free(out_ptr); driver.free(in_ptr)
        gpu_total_samples.append(host_setup_ms + gpu_elapsed_ms)

    # Repeated, steady-state runs reuse device allocations while keeping both
    # transfers and synchronization inside the timed operation.
    values = cattle_input(count)
    in_ptr, out_ptr = driver.allocate(len(values) * 8), driver.allocate(count * 2 * 8)
    steady_samples: list[float] = []
    try:
        for _ in range(WARMUPS):
            driver.h2d(in_ptr, values); driver.run(in_ptr, out_ptr, count)
        for _ in range(REPETITIONS):
            start = time.perf_counter_ns()
            driver.h2d(in_ptr, values); driver.run(in_ptr, out_ptr, count)
            actual = array.array("d", [0.0]) * (count * 2)
            driver.d2h(actual, out_ptr)
            steady_samples.append((time.perf_counter_ns() - start) / 1_000_000)
            if not compare(native_call(library, values, count), actual)["equivalent"]:
                raise RuntimeError(f"steady-state GPU correctness failed for {count}")
    finally:
        driver.free(out_ptr); driver.free(in_ptr)

    gpu_first_total_samples = [initialization_ms + value for value in gpu_total_samples]
    warm_speedup = statistics.median(cpu_total_samples) / max(statistics.median(gpu_total_samples), 1e-12)
    cold_speedup = statistics.median(cpu_total_samples) / max(statistics.median(gpu_first_total_samples), 1e-12)
    return {"animals": count, "correctness": correctness,
            "cpuKernel": statistics_for(cpu_kernel_samples), "cpuTotal": statistics_for(cpu_total_samples),
            "initialHostSetup": statistics_for(host_setup_samples),
            "allocation": statistics_for(allocation_samples), "h2d": statistics_for(h2d_samples),
            "kernelLaunchHost": statistics_for(launch_samples), "synchronization": statistics_for(sync_samples),
            "gpuKernel": statistics_for(kernel_samples),
            "d2h": statistics_for(d2h_samples), "gpuTotal": statistics_for(gpu_total_samples),
            "gpuFirstRunTotal": statistics_for(gpu_first_total_samples),
            "gpuSteadyStateWithTransfers": statistics_for(steady_samples),
            "kernelOnlySpeedup": statistics.median(cpu_kernel_samples) / max(statistics.median(kernel_samples), 1e-12),
            "warmEndToEndSpeedup": warm_speedup, "firstRunEndToEndSpeedup": cold_speedup,
            "hostInputBytes": count * 4 * 8, "hostOutputBytes": count * 2 * 8,
            "deviceInputBytes": count * 4 * 8, "deviceOutputBytes": count * 2 * 8}


def measurement(phase: str, metric: str, values: list[float], count: int, source: str) -> dict:
    stats = statistics_for(values)
    return {"phase": phase, "metric": metric, "unit": "ms", "statistics": {
        "sampleCount": stats["sampleCount"], "median": stats["median"],
        "spread": {"min": stats["min"], "max": stats["max"], "range": stats["range"]},
        "rawObservations": values}, "population": count, "source": source}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight-only", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if WARMUPS < 0 or REPETITIONS < 1:
        raise ValueError("warmups must be >= 0 and repetitions >= 1")
    initialized = time.perf_counter_ns()
    try:
        driver = CudaDriver()
    except (OSError, RuntimeError) as exc:
        if args.preflight_only:
            raise
        report = {"status": "blocked", "reason": "nvidia_cuda_driver_unavailable", "detail": str(exc),
                  "gpuExecutionClaim": False}
        print(json.dumps(report, indent=2)); return
    init_ms = (time.perf_counter_ns() - initialized) / 1_000_000
    try:
        library = native_library()
        preflight_values = cattle_input(100)
        preflight_cpu = native_call(library, preflight_values, 100)
        in_ptr = driver.allocate(len(preflight_values) * 8)
        out_ptr = driver.allocate(100 * 2 * 8)
        try:
            driver.h2d(in_ptr, preflight_values)
            driver.run(in_ptr, out_ptr, 100)
            preflight_gpu = array.array("d", [0.0]) * 200
            driver.d2h(preflight_gpu, out_ptr)
        finally:
            driver.free(out_ptr); driver.free(in_ptr)
        correctness = compare(preflight_cpu, preflight_gpu)
        if not correctness["equivalent"]:
            raise RuntimeError(f"preflight CPU/GPU correctness failed: {correctness}; expected={list(preflight_cpu[:12])}; actual={list(preflight_gpu[:12])}")
        hardware = device_metadata(driver)
        if args.preflight_only:
            print(json.dumps({"status": "passed", "gpuExecutionClaim": True,
                              "hardware": hardware, "preflightAnimals": 100,
                              "correctness": correctness}, indent=2))
            return

        rows = [run_case(driver, library, count, init_ms) for count in SIZES]
        warm_speedups = [row["warmEndToEndSpeedup"] for row in rows]
        if all(speedup <= 1.0 for speedup in warm_speedups):
            decision = "NO_GO"
            decision_reason = "CPU end-to-end median was at least as fast at every tested population."
        elif all(speedup >= 1.2 for speedup in warm_speedups):
            decision = "GO"
            decision_reason = "Warm end-to-end GPU execution was at least 20% faster at every tested population."
        else:
            decision = "CONDITIONAL_GO"
            decision_reason = "Warm end-to-end benefit was limited to some sizes or below the 20% materiality threshold."
        measurements = []
        for row in rows:
            count = row["animals"]
            for key, label, metric in (("cpuKernel", "cpu_steady_state", "nativeMetabolismBatch"),
                                       ("cpuTotal", "cpu_total", "nativeMetabolismEndToEnd"),
                                       ("allocation", "accelerator_allocation", "deviceBufferAllocation"),
                                       ("h2d", "host_to_device_transfer", "inputCopy"),
                                       ("gpuKernel", "accelerator_kernel", "deviceKernelRuntime"),
                                       ("kernelLaunchHost", "accelerator_launch", "deviceKernelLaunchHost"),
                                       ("synchronization", "accelerator_synchronization", "deviceSynchronization"),
                                       ("d2h", "device_to_host_transfer", "outputCopy"),
                                       ("gpuTotal", "accelerator_total_run", "deviceEndToEnd"),
                                       ("gpuFirstRunTotal", "accelerator_first_run_total", "deviceFirstRunTotal"),
                                       ("gpuSteadyStateWithTransfers", "accelerator_steady_state", "deviceSteadyStateWithTransfers")):
                measurements.append(measurement(label, metric, row[key]["rawObservations"], count,
                                                "real CUDA Driver API PTX kernel; no CPU fallback" if key not in ("cpuKernel", "cpuTotal") else "riose_core::update_metabolism via native C ABI"))
        report = {"schemaVersion": 2,
                  "benchmark": {"name": "cattle-metabolism-cpu-nvidia-cuda", "source": source_info()},
                  "runtime": {"platform": sys.platform, "python": platform.python_version(),
                              "cudaDriverApiVersion": hardware["cudaDriverApiVersion"]},
                  "hardware": {"os": platform.platform(), "architecture": platform.machine(),
                               "cpu": cpu_model(), "gpuMemoryBytes": hardware["gpuMemoryBytes"],
                               "accelerator": hardware},
                  "workload": {"seed": "deterministic-animal-state-index-v1",
                               "populations": [{"animals": count, "scope": "numeric-kernel-only",
                                                **({"limit": "isolated numeric kernel only; not FarmEngine or renderer"} if count == 100_000 else {})}
                                               for count in SIZES],
                               "inputLayout": ["weightKg", "energyPercent", "intakeKgDMPerDay", "restingFlag"],
                               "outputLayout": ["weightKg", "energyPercent"],
                               "inputSha256": hashlib.sha256(cattle_input(100_000).tobytes()).hexdigest()},
                  "configuration": {"warmupRuns": WARMUPS, "repetitions": REPETITIONS, "dtype": "float64",
                                    "correctnessTolerance": {"relative": REL_TOLERANCE, "absolute": ABS_TOLERANCE}},
                  "limits": {"farmEngineMaxAnimals": 10_000, "rendererMaxAnimals": 10_000,
                             "numericKernelMaxAnimalsMeasured": 100_000},
                  "phases": {"engine": {"status": "measured", "measurements": measurements},
                             "snapshot": {"status": "not-measured", "measurements": []},
                             "serialization": {"status": "not-measured", "measurements": []},
                             "worker": {"status": "not-measured", "measurements": []},
                             "ui": {"status": "not-measured", "measurements": []},
                             "layout": {"status": "not-measured", "measurements": []},
                             "render": {"status": "not-measured", "measurements": []},
                             "startup": {"status": "measured", "measurements": [measurement("accelerator_initialization", "cudaDriverAndModuleInitialization", [init_ms], 0, "CUDA Driver API init, physical-device discovery, context creation, PTX JIT and module load")]},
                             "coldStartup": {"status": "not-measured", "measurements": []},
                             "warmStartup": {"status": "not-measured", "measurements": []},
                             "bridgeMarshaling": {"status": "not-measured", "measurements": []},
                             "fullScenario": {"status": "not-measured", "measurements": []},
                             "uiEndToEnd": {"status": "not-measured", "measurements": []},
                             "memory": {"status": "not-measured", "measurements": []}},
                  "timingBoundaries": [{"phase": "engine", "timed": ["Native CPU kernel and end-to-end host setup; CUDA allocation, H2D, launch, synchronized execution, D2H and total; preallocated steady-state with transfers."],
                                        "notTimed": ["FarmEngine orchestration, feeding, weather, snapshots, worker scheduling, UI and rendering."],
                                        "whatIsTimed": ["Native CPU kernel and end-to-end host setup; CUDA allocation, H2D, launch, synchronized execution, D2H and total; preallocated steady-state with transfers."],
                                        "whatIsNotTimed": ["FarmEngine orchestration, feeding, weather, snapshots, worker scheduling, UI and rendering."]},
                                       {"phase": "startup", "timed": ["CUDA Driver API initialization, physical-device discovery, context creation, PTX JIT and module load."],
                                        "notTimed": ["Python process startup, repository import time, native Rust build time."],
                                        "whatIsTimed": ["CUDA Driver API initialization, physical-device discovery, context creation, PTX JIT and module load."],
                                        "whatIsNotTimed": ["Python process startup, repository import time, native Rust build time."]}],
                  "results": {"decision": decision, "decisionReason": decision_reason, "rows": rows,
                              "correctness": {"status": "passed", "method": "native Rust baseline compared with CUDA output at all sizes and each repetition", "tolerance": {"relative": REL_TOLERANCE, "absolute": ABS_TOLERANCE}},
                              "gpuExecutionClaim": True,
                              "interpretation": "Use endToEndSpeedup and gpuSteadyStateWithTransfers for accelerator decisions; kernelOnlySpeedup excludes transfers, allocation, host input setup and synchronization."},
                  "limitations": ["Hardware tested: one NVIDIA GeForce GTX 1060 6GB; this is not AMD/ROCm evidence and supports no cross-vendor claim.",
                                  "The workload is the native metabolism numeric kernel used by FarmEngine, not a full farm simulation or renderer.",
                                  "The 100,000-animal case exceeds current FarmEngine and renderer limits and is isolated kernel research only.",
                                  "CUDA kernel is an isolated PTX implementation of the existing Rust formula; it is not integrated into production and adds no product dependency/default change.",
                                  "CUDA event timing measures the queued kernel; host synchronization wall time includes waiting for queued work and should not be added to event time.",
                                  "Host-side cattle input creation is the deterministic benchmark harness, not FarmEngine packing; it is included in CPU total and GPU total to compare equivalent starting data."]}
        validation = subprocess.run(["node", str(ROOT / "scripts/validate-benchmark-report.mjs")],
                                    input=json.dumps(report, allow_nan=False), text=True, capture_output=True)
        if validation.returncode:
            raise ValueError(f"benchmark_report_schema_validation_failed: {validation.stderr.strip()}")
        encoded = json.dumps(report, indent=2, allow_nan=False)
        if args.output:
            args.output.write_text(encoded + "\n", encoding="utf-8")
        print(encoded)
    finally:
        driver.close()


if __name__ == "__main__":
    main()
