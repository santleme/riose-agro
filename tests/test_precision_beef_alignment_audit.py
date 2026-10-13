"""Synthetic tests for timestamp-only Precision Beef alignment auditing."""
from __future__ import annotations

import csv
import importlib.util
from datetime import datetime
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/audit_precision_beef_alignment.py"
SPEC = importlib.util.spec_from_file_location("precision_beef_alignment_audit", MODULE_PATH)
AUDIT = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(AUDIT)


def write_csv(path: Path, header: list[str], rows: list[list[object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(header)
        writer.writerows(rows)


def test_readme_anchor_and_half_open_windows_ignore_other_columns(tmp_path):
    readme = tmp_path / "Readme.md"
    readme.write_text(
        "| Animal ID | Farm Trial ID | Test | Collar Filename | Collar Start Timestamp | Collar End Timestamp | Halter Filename | Halter Start Timestamp | Halter End Timestamp |\n"
        "| 1 | 1 | No | accel-01.csv | 2020-01-01 00:00:00 | 2020-01-01 00:03:00 | halter-01.csv | 2020-01-01 00:00:00 | 2020-01-01 00:03:00 |\n",
        encoding="utf-8",
    )
    starts = AUDIT.read_readme_starts(readme)
    anchor = starts[1]
    assert anchor == datetime(2020, 1, 1)
    assert AUDIT._window_index(datetime(2020, 1, 1, 0, 1, 29, 999999), anchor) == 0
    assert AUDIT._window_index(datetime(2020, 1, 1, 0, 1, 30), anchor) == 1

    collar = tmp_path / "accel-01.csv"
    halter = tmp_path / "halter-01.csv"
    # Non-timestamp fields deliberately contain non-numeric values. The audit
    # must treat them as opaque and count only timestamp membership.
    write_csv(collar, ["timestamp", "x", "y", "z"], [
        ["2020-01-01 00:00:00.000", "ignore", "me", "please"],
        ["2020-01-01 00:01:00.000", "ignore", "me", "please"],
        ["2020-01-01 00:01:30.000", "ignore", "me", "please"],
        ["2020-01-01 00:03:00.000", "ignore", "me", "please"],
    ])
    write_csv(halter, ["timestamp", "classification"], [
        ["2020-01-01 00:00:00.000", "not-a-label-for-this-audit"],
        ["2020-01-01 00:01:30.000", "not-a-label-for-this-audit"],
        ["2020-01-01 00:03:00.000", "not-a-label-for-this-audit"],
    ])
    animal = AUDIT.audit_animal(tmp_path, 1, anchor)
    assert animal["sharedNonemptyWindowCount"] == 3
    assert animal["collarSamplesPerSharedWindow"] == {"min": 1, "median": 1, "max": 2}
    assert animal["halterSamplesPerSharedWindow"] == {"min": 1, "median": 1, "max": 1}
    assert animal["sharedWindowsWithAtLeast800RowsInBothStreams"] == 0
    assert animal["collar"]["sourceTimestampInversions"] == 0


def test_source_timestamp_inversions_and_shared_window_counts_are_reported(tmp_path):
    anchor = datetime(2020, 1, 1)
    collar = tmp_path / "accel-01.csv"
    halter = tmp_path / "halter-01.csv"
    write_csv(collar, ["timestamp", "x", "y", "z"], [
        ["2020-01-01 00:00:01.000", "not-read", "not-read", "not-read"],
        ["2020-01-01 00:00:00.500", "not-read", "not-read", "not-read"],
        ["2020-01-01 00:01:29.999", "not-read", "not-read", "not-read"],
        ["2020-01-01 00:01:30.000", "not-read", "not-read", "not-read"],
    ])
    write_csv(halter, ["timestamp", "classification"], [
        ["2020-01-01 00:00:00.000", "not-read"],
        ["2020-01-01 00:01:29.999", "not-read"],
        ["2020-01-01 00:01:30.000", "not-read"],
        ["2020-01-01 00:02:59.999", "not-read"],
    ])

    animal = AUDIT.audit_animal(tmp_path, 1, anchor)
    assert animal["collar"]["sourceTimestampInversions"] == 1
    assert animal["collar"]["maxInversionLagSeconds"] == 0.5
    assert animal["sharedNonemptyWindowCount"] == 2
    assert animal["collarSamplesPerSharedWindow"] == {"min": 1, "median": 2, "max": 3}
    assert animal["halterSamplesPerSharedWindow"] == {"min": 2, "median": 2, "max": 2}
    assert animal["sharedWindowsWithAtLeast800RowsInBothStreams"] == 0


def test_dense_shared_window_threshold(tmp_path):
    anchor = datetime(2020, 1, 1)
    collar = tmp_path / "accel-01.csv"
    halter = tmp_path / "halter-01.csv"
    stamps = [
        [f"2020-01-01 00:{(i // 600):02d}:{(i // 10) % 60:02d}.{(i % 10) * 100:03d}", "ignored"]
        for i in range(800)
    ]
    write_csv(collar, ["timestamp", "x"], [[row[0], row[1]] for row in stamps])
    write_csv(halter, ["timestamp", "classification"], [[row[0], row[1]] for row in stamps])
    animal = AUDIT.audit_animal(tmp_path, 1, anchor)
    assert animal["sharedNonemptyWindowCount"] == 1
    assert animal["collarSamplesPerSharedWindow"] == {"min": 800, "median": 800, "max": 800}
    assert animal["sharedWindowsWithAtLeast800RowsInBothStreams"] == 1
