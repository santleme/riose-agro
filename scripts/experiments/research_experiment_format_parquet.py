#!/usr/bin/env python3
"""Optional PyArrow adapter for the experiment-format study."""
import hashlib
import json
import os
import sys
import tempfile
import time

import pyarrow as pa
import pyarrow.parquet as pq

try:
    import resource
except ImportError:  # Windows has no resource module.
    resource = None


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def rss_bytes():
    if resource is None:
        return None
    # Linux reports ru_maxrss in KiB; macOS reports bytes.
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform == "darwin" else value * 1024)


def measure(operation, repetitions, expected=None):
    durations = []
    rss_before_after = []
    for _ in range(repetitions):
        before = rss_bytes()
        started = time.perf_counter()
        value = operation()
        durations.append((time.perf_counter() - started) * 1000)
        after = rss_bytes()
        if expected is not None and value != expected:
            raise AssertionError("Parquet operation failed normalized digest/projection check")
        rss_before_after.append({"beforeBytes": before, "afterBytes": after, "peakBytes": after})
    ordered = sorted(durations)
    middle = len(ordered) // 2
    median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    return {"medianMs": median, "minMs": min(durations), "maxMs": max(durations), "durationsMs": durations,
            "processMemorySamples": rss_before_after}


def main():
    source_path, repetitions = sys.argv[1], int(sys.argv[2])
    with open(source_path, encoding="utf-8") as source:
        records = json.load(source)
    expected_digest = digest(records)
    expected_projection = digest([
        {"scenarioId": record["run"]["scenarioId"],
         "totalIntakeKgDM": record["run"]["outputs"]["totalDryMatterIntake"]["value"]}
        for record in records
    ])

    with tempfile.TemporaryDirectory(prefix="riose-format-parquet-") as directory:
        path = os.path.join(directory, "batch.parquet")

        def write():
            table = pa.Table.from_pylist(records)
            pq.write_table(table, path, compression="zstd", use_dictionary=True)
            return None

        def full_read():
            table = pq.read_table(path)
            return digest(table.to_pylist())

        def selective_read():
            table = pq.read_table(path, columns=["run.scenarioId", "run.outputs.totalDryMatterIntake.value"])
            projection = []
            for row in table.to_pylist():
                projection.append({"scenarioId": row["scenarioId"], "totalIntakeKgDM": row["value"]})
            return digest(projection)

        write()
        full_roundtrip = full_read()
        if full_roundtrip != expected_digest:
            raise AssertionError("Parquet round trip changed normalized records")
        selective_digest = selective_read()
        if selective_digest != expected_projection:
            raise AssertionError("Parquet selective projection changed values")
        write_result = measure(write, repetitions)
        read_result = measure(full_read, repetitions, expected_digest)
        selective_result = measure(selective_read, repetitions, expected_projection)
        size = os.path.getsize(path)
        # Installed distribution bytes include PyArrow files but not shared OS libraries.
        import importlib.metadata as metadata
        distribution = metadata.distribution("pyarrow")
        installed_bytes = sum(os.path.getsize(distribution.locate_file(file))
                              for file in (distribution.files or [])
                              if os.path.isfile(distribution.locate_file(file)))
        print(json.dumps({
            "engine": {"name": "pyarrow", "version": pa.__version__, "pythonVersion": sys.version.split()[0],
                       "platform": sys.platform, "arrowVersion": pa.__version__},
            "schema": str(pa.Table.from_pylist(records).schema),
            "roundTrip": {"exactNormalized": True, "sha256": expected_digest, "records": len(records)},
            "selectiveRead": {"columns": ["run.scenarioId", "run.outputs.totalDryMatterIntake.value"],
                              "exactProjection": True, "sha256": expected_projection},
            "compression": "zstd",
            "bytes": size,
            "installedPackageBytes": installed_bytes,
            "write": write_result,
            "fullRead": read_result,
            "selectiveMetricRead": selective_result,
            "memoryMethod": "process peak RSS from resource.getrusage before/after; this is cumulative process peak, not per-operation allocation",
        }))


if __name__ == "__main__":
    main()
