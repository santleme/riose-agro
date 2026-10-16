"""Small, deterministic compute endpoint with optional PyTorch CUDA/ROCm support."""

from __future__ import annotations

import json
import math
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import import_module
from typing import Any, Callable


CONTRACT_VERSION = "1"
MAX_REQUEST_BYTES = 1_048_576
MAX_VECTOR_LENGTH = 100_000
MAX_ANIMAL_COUNT = 10_000
MAX_EXACT_INTEGER = 2**53
BACKENDS = ("auto", "cpu", "cuda", "rocm", "amd")
ACCELERATOR_BACKEND_ORDER = ("cuda", "rocm")
METABOLISM_INPUT_WIDTH = 4
METABOLISM_OUTPUT_WIDTH = 2
METABOLISM_MAINTENANCE_KG_DM = 5.3
METABOLISM_GAIN_FACTOR = 0.22


def _unavailable_hardware(reason: str) -> dict[str, Any]:
    unavailable = {"available": False, "reason": reason, "device_name": None, "runtime_version": None}
    return {"torch_version": None, "cuda": dict(unavailable), "rocm": dict(unavailable)}


def _is_finite_number(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def detect_compute_backends() -> dict[str, Any]:
    """Detect loadable CUDA and ROCm devices through the active PyTorch runtime."""
    try:
        torch = import_module("torch")
    except Exception:
        return _unavailable_hardware("pytorch_unavailable")

    torch_version = getattr(torch, "__version__", None)
    version = getattr(torch, "version", None)
    rocm_version = getattr(version, "hip", None)
    cuda_version = getattr(version, "cuda", None)
    probe_error = False
    try:
        device_available = bool(torch.cuda.is_available())
    except Exception:
        device_available = False
        probe_error = True

    runtime_backend = "rocm" if rocm_version else "cuda" if cuda_version else None
    device_name = None
    if device_available and runtime_backend:
        try:
            device_name = torch.cuda.get_device_name(0)
            # Exercise allocation and synchronization so AUTO does not select a
            # runtime that only passed a superficial availability check.
            torch.empty(1, dtype=torch.float64, device="cuda").sum().item()
        except Exception:
            device_available = False
            probe_error = True

    def capability(name: str, runtime_version: str | None) -> dict[str, Any]:
        available = device_available and runtime_backend == name
        reason = None if available else (
            "runtime_initialization_failed" if probe_error and runtime_backend == name else
            "device_unavailable" if runtime_backend == name else
            "runtime_unavailable"
        )
        return {"available": available, "reason": reason,
                "device_name": device_name if available else None, "runtime_version": runtime_version}

    return {"torch_version": torch_version,
            "cuda": capability("cuda", cuda_version),
            "rocm": capability("rocm", rocm_version)}


def detect_amd_backend() -> dict[str, Any]:
    """Compatibility wrapper for callers that still request AMD/ROCm only."""
    capabilities = detect_compute_backends()
    detected = capabilities["rocm"]
    return {"available": detected["available"], "reason": detected["reason"],
            "torch_version": capabilities.get("torch_version"), "rocm_version": detected["runtime_version"],
            "device_name": detected["device_name"]}


def validate_request(body: Any) -> tuple[str, list[float], float | None, int | None, str]:
    if not isinstance(body, dict):
        raise ValueError("request_must_be_object")
    if body.get("contract_version") != CONTRACT_VERSION:
        raise ValueError("unsupported_contract_version")
    operation = body.get("operation")
    if operation not in ("scale_vector", "livestock_metabolism_batch"):
        raise ValueError("unsupported_operation")

    payload = body.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("payload_must_be_object")
    values = payload.get("values")
    factor = payload.get("factor") if operation == "scale_vector" else None
    count = payload.get("count") if operation == "livestock_metabolism_batch" else None
    if operation == "scale_vector":
        if not isinstance(values, list) or not values or len(values) > MAX_VECTOR_LENGTH:
            raise ValueError("values_must_be_nonempty_bounded_array")
    elif (not isinstance(count, int) or isinstance(count, bool) or count < 1 or count > MAX_ANIMAL_COUNT
          or not isinstance(values, list) or len(values) != count * METABOLISM_INPUT_WIDTH):
        raise ValueError("metabolism_values_must_match_animal_count")
    if any(not _is_finite_number(value) for value in values):
        raise ValueError("values_must_be_finite_numbers")
    if operation == "scale_vector" and not _is_finite_number(factor):
        raise ValueError("factor_must_be_finite_number")
    if any(isinstance(value, int) and abs(value) > MAX_EXACT_INTEGER for value in values) or (
        operation == "scale_vector" and isinstance(factor, int) and abs(factor) > MAX_EXACT_INTEGER
    ):
        raise ValueError("integer_outside_exact_float64_range")

    preferred_backend = body.get("preferred_backend", "auto")
    if preferred_backend not in BACKENDS:
        raise ValueError("unsupported_preferred_backend")
    # Both the CPU and PyTorch paths use the same IEEE-754 float64 operands.
    return operation, [float(value) for value in values], float(factor) if factor is not None else None, count, preferred_backend


def _cpu_metabolism_batch(values: list[float], count: int) -> list[float]:
    result: list[float] = []
    for index in range(count):
        offset = index * METABOLISM_INPUT_WIDTH
        weight, energy, intake, resting = values[offset:offset + METABOLISM_INPUT_WIDTH]
        gain = (intake - METABOLISM_MAINTENANCE_KG_DM * (weight / 360) / 24) * METABOLISM_GAIN_FACTOR
        result.extend((max(200.0, weight + gain), max(0.0, min(100.0, energy + (5.0 if resting != 0 else intake * 4 - 1.5)))))
    return result


def execute_compute(
    body: Any,
    *,
    backend_detector: Callable[[], dict[str, Any]] = detect_compute_backends,
    amd_detector: Callable[[], dict[str, Any]] | None = None,
    torch_module: Any | None = None,
) -> dict[str, Any]:
    operation, values, factor, count, requested = validate_request(body)
    requested_backend = "rocm" if requested == "amd" else requested
    if requested_backend == "cpu":
        hardware = {"torch_version": None,
                    "cuda": {"available": False, "reason": "not_requested", "device_name": None, "runtime_version": None},
                    "rocm": {"available": False, "reason": "not_requested", "device_name": None, "runtime_version": None}}
    elif amd_detector is not None:
        try:
            legacy = amd_detector()
            hardware = {"torch_version": legacy.get("torch_version"),
                        "cuda": {"available": False, "reason": "runtime_unavailable", "device_name": None, "runtime_version": None},
                        "rocm": {"available": bool(legacy.get("available")), "reason": legacy.get("reason"),
                                 "device_name": legacy.get("device_name"), "runtime_version": legacy.get("rocm_version")}}
        except Exception:
            hardware = _unavailable_hardware("runtime_detection_failed")
    else:
        try:
            hardware = backend_detector()
        except Exception:
            hardware = _unavailable_hardware("runtime_detection_failed")
    selected_backend = next((name for name in ACCELERATOR_BACKEND_ORDER if hardware[name]["available"]), None) if requested_backend == "auto" else requested_backend
    if selected_backend == "cpu":
        selected_backend = None
    capability = hardware.get(selected_backend, {}) if selected_backend else {}
    use_accelerator = bool(selected_backend and capability.get("available"))
    fallback_reason = None

    if use_accelerator:
        try:
            torch = torch_module if torch_module is not None else import_module("torch")
            tensor = torch.tensor(values, dtype=torch.float64, device="cuda")
            if operation == "scale_vector":
                result = (tensor * factor).tolist()
            else:
                weights = tensor[0::METABOLISM_INPUT_WIDTH]
                energies = tensor[1::METABOLISM_INPUT_WIDTH]
                intakes = tensor[2::METABOLISM_INPUT_WIDTH]
                resting = tensor[3::METABOLISM_INPUT_WIDTH] != 0
                gain = (intakes - METABOLISM_MAINTENANCE_KG_DM * (weights / 360) / 24) * METABOLISM_GAIN_FACTOR
                next_weights = torch.clamp(weights + gain, min=200.0)
                next_energies = torch.clamp(energies + torch.where(resting, 5.0, intakes * 4 - 1.5), min=0.0, max=100.0)
                result = torch.stack((next_weights, next_energies), dim=1).reshape(-1).tolist()
        except Exception:
            use_accelerator = False
            fallback_reason = "amd_execution_failed" if requested == "amd" or (amd_detector is not None and selected_backend == "rocm") else f"{selected_backend}_execution_failed"

    if use_accelerator:
        backend_used = "amd_rocm" if selected_backend == "rocm" else "cuda"
        mode = "accelerated"
    else:
        result = ([value * factor for value in values] if operation == "scale_vector"
                  else _cpu_metabolism_batch(values, count))
        backend_used = "cpu"
        if requested_backend != "cpu":
            fallback_reason = fallback_reason or capability.get("reason") or "no_accelerator_available"
        mode = "cpu_fallback" if fallback_reason else "cpu"

    if any(not _is_finite_number(value) for value in result):
        raise ValueError("result_must_be_finite")

    execution_metadata = {
        "operation": operation,
        "runtime": "pytorch" if use_accelerator else "python",
        "torch_version": hardware.get("torch_version") if use_accelerator else None,
        "rocm_version": capability.get("runtime_version") if use_accelerator and selected_backend == "rocm" else None,
        "cuda_version": capability.get("runtime_version") if use_accelerator and selected_backend == "cuda" else None,
        "device_name": capability.get("device_name") if use_accelerator else None,
        "backend_selected": selected_backend or "cpu",
        "fallback_reason": fallback_reason,
        "deterministic": True,
    }
    if operation == "livestock_metabolism_batch":
        execution_metadata["animal_count"] = count
    response_backend_requested = "amd" if requested == "amd" else requested_backend
    return {
        "contract_version": CONTRACT_VERSION,
        "status": "fallback" if fallback_reason else "ok",
        "backend_requested": response_backend_requested,
        "backend_used": backend_used,
        "backend_selected": selected_backend or "cpu",
        "backend_availability": hardware,
        "hardware_available": bool(use_accelerator),
        "fallback_used": bool(fallback_reason),
        "mode": mode,
        "result": {"values": result},
        "execution_metadata": execution_metadata,
    }


def create_server(
    host: str = "127.0.0.1",
    port: int = 8766,
    *,
    backend_detector: Callable[[], dict[str, Any]] = detect_compute_backends,
    amd_detector: Callable[[], dict[str, Any]] | None = None,
) -> ThreadingHTTPServer:
    def detect() -> dict[str, Any]:
        try:
            if amd_detector is None:
                return backend_detector()
            legacy = amd_detector()
            return {"torch_version": legacy.get("torch_version"),
                    "cuda": {"available": False, "reason": "runtime_unavailable", "device_name": None, "runtime_version": None},
                    "rocm": {"available": bool(legacy.get("available")), "reason": legacy.get("reason"),
                             "device_name": legacy.get("device_name"), "runtime_version": legacy.get("rocm_version")}}
        except Exception:
            return _unavailable_hardware("runtime_detection_failed")

    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, status: int, payload: dict[str, Any]) -> None:
            encoded = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self._send_json(200, {"status": "ok", "contract_version": CONTRACT_VERSION})
            elif self.path == "/api/compute/backends":
                hardware = detect()
                self._send_json(200, {"cpu": {"available": True}, "cuda": hardware["cuda"],
                                      "rocm": hardware["rocm"], "torch_version": hardware.get("torch_version"),
                                      "auto_order": list(ACCELERATOR_BACKEND_ORDER)})
            else:
                self._send_json(404, {"error": "not_found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/api/compute/v1":
                self._send_json(404, {"error": "not_found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._send_json(400, {"error": "invalid_content_length"})
                return
            if length <= 0 or length > MAX_REQUEST_BYTES:
                self._send_json(413 if length > MAX_REQUEST_BYTES else 400, {"error": "invalid_request_size"})
                return
            try:
                body = json.loads(self.rfile.read(length))
                result = execute_compute(body, backend_detector=backend_detector, amd_detector=amd_detector)
            except (UnicodeDecodeError, json.JSONDecodeError):
                self._send_json(400, {"error": "invalid_json"})
                return
            except ValueError as error:
                self._send_json(400, {"error": str(error)})
                return
            except Exception:
                self._send_json(503, {"error": "compute_backend_failed"})
                return
            self._send_json(200, result)

        def log_message(self, *_: Any) -> None:
            return

    return ThreadingHTTPServer((host, port), Handler)


def main() -> None:
    host = os.environ.get("COMPUTE_HOST", "127.0.0.1")
    port = int(os.environ.get("COMPUTE_PORT", "8766"))
    server = create_server(host, port)
    print(f"Compute service listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
