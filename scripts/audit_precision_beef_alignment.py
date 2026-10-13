#!/usr/bin/env python3
"""Audit timestamp-only 90-second alignment in Precision Beef source files.

The audit reads only each CSV's ``timestamp`` column. It never parses sensor
values or behavior labels. Windows are anchored to the paired, rounded start
time reported for that animal in the source README and use half-open intervals
``[start + 90*k, start + 90*(k+1))``.
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/raw/zenodo-4064802"
README_PATH = RAW_DIR / "Readme.md"
OUTPUT_PATH = ROOT / "data/precision-beef/alignment-audit.json"
WINDOW_SECONDS = 90
WINDOW_MICROSECONDS = WINDOW_SECONDS * 1_000_000
MIN_DENSE_WINDOW_ROWS = 800


def parse_source_timestamp(value: str) -> datetime:
    """Parse a timezone-naive source timestamp without normalizing its clock."""
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError as error:
        raise ValueError(f"invalid source timestamp {value!r}") from error
    if parsed.tzinfo is not None:
        raise ValueError(f"expected timezone-naive source timestamp, got {value!r}")
    return parsed


def read_readme_starts(path: Path) -> dict[int, datetime]:
    """Read each animal's paired collar/halter rounded start time from README."""
    starts: dict[int, datetime] = {}
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if not line.startswith("|") or "accel-" not in line:
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            try:
                animal_id = int(cells[0])
                collar_name, collar_start = cells[3], cells[4]
                halter_name, halter_start = cells[6], cells[7]
            except (ValueError, IndexError):
                continue
            if not collar_name.startswith("accel-") or not halter_name.startswith("halter-"):
                continue
            if collar_start != halter_start:
                raise ValueError(f"README start times differ for animal {animal_id}")
            starts[animal_id] = parse_source_timestamp(collar_start)
    if not starts:
        raise ValueError(f"no paired animal start times found in {path}")
    return starts


def _window_index(timestamp: datetime, anchor: datetime) -> int:
    delta = timestamp - anchor
    microseconds = ((delta.days * 86_400 + delta.seconds) * 1_000_000) + delta.microseconds
    return microseconds // WINDOW_MICROSECONDS


def audit_timestamp_file(path: Path, anchor: datetime) -> dict[str, Any]:
    """Count timestamp rows by anchored window and audit source ordering.

    CSV rows are parsed structurally, but only the column named ``timestamp``
    is accessed. All other fields remain opaque strings and are discarded.
    """
    windows: Counter[int] = Counter()
    row_count = inversions = adjacent_duplicates = 0
    max_inversion_lag_us = 0
    first_timestamp: datetime | None = None
    last_timestamp: datetime | None = None

    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream)
        try:
            header = next(reader)
        except StopIteration as error:
            raise ValueError(f"{path.name}: empty CSV") from error
        if header.count("timestamp") != 1:
            raise ValueError(f"{path.name}: expected exactly one timestamp column")
        timestamp_index = header.index("timestamp")
        for line_number, row in enumerate(reader, start=2):
            if timestamp_index >= len(row):
                raise ValueError(f"{path.name}:{line_number}: missing timestamp column")
            timestamp = parse_source_timestamp(row[timestamp_index])
            if first_timestamp is None:
                first_timestamp = timestamp
            if last_timestamp is not None:
                lag_us = int((last_timestamp - timestamp).total_seconds() * 1_000_000)
                if lag_us > 0:
                    inversions += 1
                    max_inversion_lag_us = max(max_inversion_lag_us, lag_us)
                elif lag_us == 0:
                    adjacent_duplicates += 1
            last_timestamp = timestamp
            windows[_window_index(timestamp, anchor)] += 1
            row_count += 1

    if first_timestamp is None or last_timestamp is None:
        raise ValueError(f"{path.name}: no timestamp rows")
    return {
        "file": path.name,
        "timestampRows": row_count,
        "firstTimestamp": first_timestamp.isoformat(sep=" "),
        "lastTimestamp": last_timestamp.isoformat(sep=" "),
        "sourceTimestampInversions": inversions,
        "maxInversionLagSeconds": max_inversion_lag_us / 1_000_000,
        "adjacentDuplicateTimestamps": adjacent_duplicates,
        "windowCount": len(windows),
        "_windowCounts": windows,
    }


def _count_summary(counts: list[int]) -> dict[str, int | float | None]:
    if not counts:
        return {"min": None, "median": None, "max": None}
    return {
        "min": min(counts),
        "median": statistics.median(counts),
        "max": max(counts),
    }


def audit_animal(raw_dir: Path, animal_id: int, anchor: datetime) -> dict[str, Any]:
    collar = audit_timestamp_file(raw_dir / f"accel-{animal_id:02}.csv", anchor)
    halter = audit_timestamp_file(raw_dir / f"halter-{animal_id:02}.csv", anchor)
    collar_windows: Counter[int] = collar.pop("_windowCounts")
    halter_windows: Counter[int] = halter.pop("_windowCounts")
    shared = sorted(collar_windows.keys() & halter_windows.keys())
    collar_shared_counts = [collar_windows[index] for index in shared]
    halter_shared_counts = [halter_windows[index] for index in shared]
    collar["samplesPerWindowAllBins"] = _count_summary(list(collar_windows.values()))
    halter["samplesPerWindowAllBins"] = _count_summary(list(halter_windows.values()))
    dense_shared = sum(
        collar_windows[index] >= MIN_DENSE_WINDOW_ROWS
        and halter_windows[index] >= MIN_DENSE_WINDOW_ROWS
        for index in shared
    )
    return {
        "animalId": animal_id,
        "readmePairedStartAnchor": anchor.isoformat(sep=" "),
        "collar": collar,
        "halter": halter,
        "sharedNonemptyWindowCount": len(shared),
        "sharedWindowsWithAtLeast800RowsInBothStreams": dense_shared,
        "collarSamplesPerSharedWindow": _count_summary(collar_shared_counts),
        "halterSamplesPerSharedWindow": _count_summary(halter_shared_counts),
        "firstSharedWindowIndex": shared[0] if shared else None,
        "lastSharedWindowIndex": shared[-1] if shared else None,
        "method": (
            "timestamp-only; k=floor((timestamp - README paired rounded start)/90s); "
            "half-open windows [anchor+90k, anchor+90(k+1)); no sensor values or labels read"
        ),
    }


def build_report(raw_dir: Path = RAW_DIR, readme_path: Path = README_PATH) -> dict[str, Any]:
    starts = read_readme_starts(readme_path)
    animals = [audit_animal(raw_dir, animal_id, starts[animal_id]) for animal_id in sorted(starts)]
    return {
        "schemaVersion": "1.0.0",
        "source": {
            "title": "Precision Beef - Animal Behaviour Classification",
            "doi": "10.5281/zenodo.4064802",
            "readme": readme_path.name,
        },
        "audit": {
            "timestampColumnOnly": True,
            "windowSeconds": WINDOW_SECONDS,
            "windowConvention": "half-open",
            "minimumRowsForDenseSharedWindow": MIN_DENSE_WINDOW_ROWS,
            "sensorValuesRead": False,
            "behaviorLabelsRead": False,
            "modelFit": False,
            "animals": animals,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--readme", type=Path, default=README_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()
    report = build_report(args.raw_dir, args.readme)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote timestamp-only alignment audit: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
