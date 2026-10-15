#!/usr/bin/env python3
"""Normalize the openly downloadable XGain hourly behavior summaries.

These records are already classifier outputs aggregated to hourly class counts.
They are suitable for descriptive activity-profile work only; this script does
not treat the counts as independent human ground truth or fit a model.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from statistics import mean

import openpyxl
import pyarrow as pa
import pyarrow.parquet as pq


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "data/raw/zenodo-15600573/WP5_T5.7_IoT sensor data_v1_EV ILVO_dataset.zip"
OUT_DIR = ROOT / "data/xgain-cattle-behavior/processed"
OUT_PARQUET = OUT_DIR / "xgain-hourly-behavior-counts-v1.parquet"
OUT_REPORT = ROOT / "docs/evidence/xgain-hourly-behavior-quality-2026-10.json"
CLASSES = ("other_activity", "ruminating", "resting", "grazing")
EXPECTED_MD5 = "8941ddd707e1a353649bf2b43a3bcd20"


def digest(path: Path, algorithm: str) -> str:
    hasher = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def process() -> dict:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"download the public Zenodo file first: {SOURCE}")
    source_md5 = digest(SOURCE, "md5")
    if source_md5 != EXPECTED_MD5:
        raise ValueError(f"source MD5 mismatch: {source_md5}")

    records = []
    row_counts = Counter()
    timestamps = Counter()
    with zipfile.ZipFile(SOURCE) as archive:
        workbook_names = sorted(
            name for name in archive.namelist()
            if name.endswith(".xlsx") and "/proc_data_" in name
        )
        if len(workbook_names) != 10:
            raise ValueError(f"expected 10 animal workbooks, got {len(workbook_names)}")
        for name in workbook_names:
            match = re.search(r"proc_data_(\d+)_", Path(name).name)
            if not match:
                raise ValueError(f"cannot parse animal id from {name}")
            animal_id = match.group(1)
            with archive.open(name) as xlsx_stream:
                workbook_bytes = xlsx_stream.read()
            workbook = openpyxl.load_workbook(io.BytesIO(workbook_bytes), read_only=True, data_only=True)
            sheet = workbook["Sheet1"]
            iterator = sheet.iter_rows(values_only=True)
            header = next(iterator)
            if tuple(header) != ("date", *CLASSES):
                raise ValueError(f"unexpected columns in {name}: {header}")
            animal_rows = 0
            for values in iterator:
                if not values or values[0] is None:
                    continue
                timestamp = values[0]
                if isinstance(timestamp, str):
                    timestamp = datetime.fromisoformat(timestamp)
                if not isinstance(timestamp, datetime):
                    raise ValueError(f"invalid timestamp in {name}: {timestamp!r}")
                counts = {label: int(value or 0) for label, value in zip(CLASSES, values[1:])}
                if any(value < 0 for value in counts.values()):
                    raise ValueError(f"negative predicted count in {name} at {timestamp}")
                total_minutes = sum(counts.values())
                if total_minutes != 60:
                    raise ValueError(f"hour counts sum to {total_minutes}, not 60, for {animal_id} at {timestamp}")
                records.append({"animal_id": animal_id, "timestamp": timestamp, **counts, "total_minutes": total_minutes})
                animal_rows += 1
                timestamps[(animal_id, timestamp)] += 1
            row_counts[animal_id] = animal_rows
            workbook.close()

    duplicates = [key for key, count in timestamps.items() if count != 1]
    if duplicates:
        raise ValueError(f"duplicate animal-hour keys: {len(duplicates)}")
    if len({row["animal_id"] for row in records}) != 10:
        raise ValueError("animal count differs from 10")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pylist(records)
    pq.write_table(table, OUT_PARQUET, compression="zstd")
    report = {
        "schemaVersion": "1.0.0",
        "status": "processed_descriptive_only",
        "sourceDoi": "10.5281/zenodo.15600573",
        "sourceArchive": SOURCE.relative_to(ROOT).as_posix(),
        "sourceBytes": SOURCE.stat().st_size,
        "sourceMd5": source_md5,
        "sourceSha256": digest(SOURCE, "sha256"),
        "normalizedParquet": OUT_PARQUET.relative_to(ROOT).as_posix(),
        "normalizedSha256": digest(OUT_PARQUET, "sha256"),
        "records": len(records),
        "animals": len(row_counts),
        "hoursByAnimal": dict(sorted(row_counts.items())),
        "timestampRange": {
            "start": min(row["timestamp"] for row in records).isoformat(),
            "end": max(row["timestamp"] for row in records).isoformat(),
        },
        "timestampTimezone": "not specified in the source workbooks; preserved as naive local timestamps",
        "uniqueAnimalHourKeys": len(timestamps),
        "duplicateAnimalHourKeys": len(duplicates),
        "countSumMinutesPerHour": {"minimum": 60, "mean": mean(row["total_minutes"] for row in records), "maximum": 60},
        "missingValues": 0,
        "targetProvenance": "Hourly counts of class labels produced by a supervised decision-tree classifier; not released human-reference labels.",
        "interpretation": "Use only for descriptive hourly behavior profiles or software ingestion checks. Do not use as independent ground truth or for external validation of a classifier.",
    }
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps(process(), indent=2))
