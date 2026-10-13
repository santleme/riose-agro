#!/usr/bin/env python3
"""Compare two riose-run binaries using one identical 30-day request."""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import subprocess
import time
from pathlib import Path


def invoke(runner: Path, payload: bytes) -> tuple[float, dict]:
    started = time.perf_counter_ns()
    completed = subprocess.run(
        [str(runner)], input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
    if completed.returncode:
        raise RuntimeError(
            f"{runner} exited {completed.returncode}: "
            f"{completed.stderr.decode(errors='replace')}"
        )
    record = json.loads(completed.stdout)
    if record.get("status") != "success":
        raise RuntimeError(f"{runner} returned status {record.get('status')!r}")
    return elapsed_ms, record


def percentile_95(samples: list[float]) -> float:
    ordered = sorted(samples)
    index = max(0, (len(ordered) * 95 + 99) // 100 - 1)
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="one saved riose-run request")
    parser.add_argument("--baseline", type=Path, required=True, help="sequential riose-run binary")
    parser.add_argument("--candidate", type=Path, required=True, help="candidate riose-run binary")
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--repetitions", type=int, default=5)
    args = parser.parse_args()
    if args.warmups < 0 or args.repetitions < 1:
        parser.error("warmups must be nonnegative and repetitions must be positive")

    payload = args.input.read_bytes()
    print(f"input_sha256={hashlib.sha256(payload).hexdigest()}")
    runners = [("baseline", args.baseline), ("candidate", args.candidate)]
    last_records: dict[str, dict] = {}
    for _, runner in runners:
        for _ in range(args.warmups):
            _, last_records[str(runner)] = invoke(runner, payload)

    samples = {name: [] for name, _ in runners}
    for _ in range(args.repetitions):
        paired = {}
        for name, runner in runners:
            elapsed, record = invoke(runner, payload)
            samples[name].append(elapsed)
            paired[name] = record
            last_records[str(runner)] = record
        if paired["baseline"].get("nativeResult") != paired["candidate"].get("nativeResult"):
            raise RuntimeError("paired binaries returned different scientific results")

    for name, _ in runners:
        values = samples[name]
        print(
            f"{name}_samples_ms=" + ",".join(f"{value:.3f}" for value in values)
        )
        print(
            f"{name}_median_ms={statistics.median(values):.3f} "
            f"{name}_p95_ms={percentile_95(values):.3f}"
        )
    print("scientific_result_parity=exact")


if __name__ == "__main__":
    main()
