"""Small, deterministic compute endpoint with optional PyTorch ROCm support."""

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
BACKENDS = ("auto", "cpu", "amd")
METABOLISM_INPUT_WIDTH = 4
METABOLISM_OUTPUT_WIDTH = 2
METABOLISM_MAINTENANCE_KG_DM = 5.3
METABOLISM_GAIN_FACTOR = 0.22


def _is_finite_number(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def detect_amd_backend() -> dict[str, Any]:
    """Report AMD availability only when PyTorch exposes a usable ROCm device."""
    try:
        torch = import_module("torch")
    except Exception:
        return {
            "available": False,
            "reason": "pytorch_unavailable",
            "torch_version": None,
            "rocm_version": None,
            "device_name": None,
        }

    rocm_version = getattr(getattr(torch, "version", None), "hip", None)
    try:
        available = bool(rocm_version) and bool(torch.cuda.is_available())
    except Exception:
        available = False

    if available:
        reason = None
    elif not rocm_version:
        reason = "pytorch_rocm_unavailable"
    else:
        reason = "amd_device_unavailable"

    try:
        device_name = torch.cuda.get_device_name(0) if available else None
    except Exception:
        device_name = None
    return {
        "available": available,
        "reason": reason,
        "torch_version": getattr(torch, "__version__", None),
        "rocm_version": rocm_version,
        "device_name": device_name,
    }


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
    amd_detector: Callable[[], dict[str, Any]] = detect_amd_backend,
    torch_module: Any | None = None,
) -> dict[str, Any]:
    operation, values, factor, count, requested = validate_request(body)
    hardware = amd_detector()
    use_amd = requested != "cpu" and hardware["available"]
    fallback_reason = None

    if use_amd:
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
            use_amd = False
            fallback_reason = "amd_execution_failed"

    if use_amd:
        backend_used = "amd_rocm"
        mode = "accelerated"
    else:
        result = ([value * factor for value in values] if operation == "scale_vector"
                  else _cpu_metabolism_batch(values, count))
        backend_used = "cpu"
        fallback_reason = fallback_reason or ((hardware.get("reason") or "amd_backend_unavailable") if requested == "amd" else None)
        mode = "cpu_fallback" if fallback_reason else "cpu"

    if any(not _is_finite_number(value) for value in result):
        raise ValueError("result_must_be_finite")

    execution_metadata = {
        "operation": operation,
        "runtime": "pytorch" if use_amd else "python",
        "torch_version": hardware.get("torch_version") if use_amd else None,
        "rocm_version": hardware.get("rocm_version") if use_amd else None,
        "fallback_reason": fallback_reason,
        "deterministic": True,
    }
    if operation == "livestock_metabolism_batch":
        execution_metadata["animal_count"] = count
        execution_metadata["device_name"] = hardware.get("device_name") if use_amd else None
    return {
        "contract_version": CONTRACT_VERSION,
        "status": "fallback" if fallback_reason else "ok",
        "backend_requested": requested,
        "backend_used": backend_used,
        "hardware_available": bool(hardware["available"]),
        "fallback_used": bool(fallback_reason),
        "mode": mode,
        "result": {"values": result},
        "execution_metadata": execution_metadata,
    }


def create_server(
    host: str = "127.0.0.1",
    port: int = 8766,
    *,
    amd_detector: Callable[[], dict[str, Any]] = detect_amd_backend,
) -> ThreadingHTTPServer:
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
                result = execute_compute(body, amd_detector=amd_detector)
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
    print(f"AMD compute service listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
