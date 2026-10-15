#!/usr/bin/env python3
"""Paired sequential vs VecDeque history benchmark with snapshot parity checks."""

from __future__ import annotations

import hashlib
import itertools
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "target" / "release" / "examples" / "history_ring_matrix"
POPULATIONS = (100, 1_000, 10_000)
DAYS = (1, 30)
SEEDS = (417, 2026)
HOUSING = ("pasture", "barn")
RUNS = 21
WARMUPS = 3


def command(args: list[str], *, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(args, cwd=ROOT, env=env, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"command failed: {args}\n{result.stdout}\n{result.stderr}")
    return result.stdout


def build(feature: bool, output: Path) -> None:
    args = ["cargo", "build", "--locked", "--release", "-p", "riose-core", "--example", "history_ring_matrix"]
    if feature:
        args += ["--features", "riose-core/history-ring"]
    command(args)
    shutil.copy2(TARGET, output)


def measure(binary: Path, case: tuple[int, int, int, str], scratch: Path) -> dict:
    animals, days, seed, housing = case
    snapshot = scratch / f"snapshot-{animals}-{days}-{seed}-{housing}-{binary.name}"
    env = os.environ.copy()
    env.update({
        "RIOSE_BENCH_ANIMALS": str(animals),
        "RIOSE_BENCH_DAYS": str(days),
        "RIOSE_BENCH_SEED": str(seed),
        "RIOSE_BENCH_HOUSING": housing,
        "RIOSE_BENCH_RUNS": str(RUNS),
        "RIOSE_BENCH_WARMUPS": str(WARMUPS),
        "RIOSE_BENCH_SNAPSHOT_OUT": str(snapshot),
    })
    proc = subprocess.run(
        ["/usr/bin/time", "-f", "RSS_KB=%M", str(binary)],
        cwd=ROOT, env=env, text=True, capture_output=True,
    )
    if proc.returncode:
        raise RuntimeError(f"benchmark failed for {case}:\n{proc.stdout}\n{proc.stderr}")
    match = re.search(r"RSS_KB=(\d+)", proc.stderr)
    if not match:
        raise RuntimeError(f"GNU time did not report peak RSS: {proc.stderr}")
    fields = dict(line.split("=", 1) for line in proc.stdout.strip().splitlines() if "=" in line)
    p50 = re.search(r"p50_ms=([0-9.]+)", proc.stdout)
    p95 = re.search(r"p95_ms=([0-9.]+)", proc.stdout)
    if not p50 or not p95:
        raise RuntimeError(f"benchmark summary missing percentiles: {proc.stdout}")
    digest = hashlib.sha256(snapshot.read_bytes()).hexdigest()
    return {
        "variant": fields["variant"],
        "p50Ms": float(p50.group(1)),
        "p95Ms": float(p95.group(1)),
        "samplesMs": [float(value) for value in fields["samples_ms"].split(",")],
        "peakRssKb": int(match.group(1)),
        "snapshotSha256": digest,
    }


def main() -> None:
    revision = command(["git", "rev-parse", "HEAD"]).strip()
    uname = command(["uname", "-a"]).strip()
    cpu = command(["bash", "-lc", "grep -m1 'model name' /proc/cpuinfo | cut -d: -f2-"]).strip()
    rustc = command(["rustc", "--version"]).strip()
    source_files = [
        "crates/riose-core/src/simulation.rs",
        "crates/riose-core/examples/history_ring_matrix.rs",
        "scripts/benchmarks/benchmark-history-ring-matrix.py",
    ]
    with tempfile.TemporaryDirectory(prefix="riose-history-matrix-") as temp:
        scratch = Path(temp)
        sequential = scratch / "sequential"
        ring = scratch / "history-ring"
        build(False, sequential)
        build(True, ring)

        cases = list(itertools.product(POPULATIONS, DAYS, SEEDS, HOUSING))
        results = []
        for index, case in enumerate(cases):
            first, second = (sequential, ring) if index % 2 == 0 else (ring, sequential)
            # Run each arm once; keep the paired order interleaved across cases.
            first_result = measure(first, case, scratch)
            second_result = measure(second, case, scratch)
            pair = {first_result["variant"]: first_result, second_result["variant"]: second_result}
            if pair["sequential"]["snapshotSha256"] != pair["history-ring"]["snapshotSha256"]:
                raise RuntimeError(f"scientific snapshot mismatch for {case}: {pair}")
            results.append({
                "animals": case[0], "days": case[1], "seed": case[2], "housing": case[3],
                "sequential": pair["sequential"], "historyRing": pair["history-ring"],
            })

    report = {
        "schemaVersion": 1,
        "date": "2026-10-13",
        "sourceRevision": revision,
        "sourceFilesSha256": {
            name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in source_files
        },
        "runtime": {"os": uname, "cpu": cpu, "rustc": rustc, "profile": "release, thin LTO, codegen-units=1, panic=abort"},
        "benchmark": "single-engine simulation setup + configure + tick + snapshot serialization",
        "warmups": WARMUPS,
        "repetitions": RUNS,
        "percentileMethod": "nearest-rank",
        "pairOrder": "alternating sequential/history-ring order by case",
        "peakMemory": "GNU /usr/bin/time maximum resident set size per benchmark process, KiB",
        "matrix": {"animals": POPULATIONS, "days": DAYS, "seeds": SEEDS, "housing": HOUSING},
        "results": results,
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
