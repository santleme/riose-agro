#!/usr/bin/env python3
"""Audit and aggregate Precision Beef sensor/reference files in bounded memory.

Each output row is one timezone-naive source timestamp second for one animal. Only
exactly timestamp-aligned collar/halter rows contribute. Sensor summaries and
instrument reference-label summaries are distinct fields; labels never enter
the sensor feature aggregation. Duplicate timestamps are excluded as ambiguous.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
RECORD_ID = "4064802"
RAW_DIR = ROOT / "data/raw/zenodo-4064802"
OUTPUT_DIR = ROOT / "data/processed/zenodo-4064802"
MANIFEST_PATH = ROOT / "data/precision-beef/manifest.json"
REPORT_PATH = OUTPUT_DIR / "quality-report.json"
REGISTRY_REPORT_PATH = ROOT / "data/precision-beef/processing-report.json"
EXPECTED_ANIMALS = range(1, 19)
TRIAL_BY_ANIMAL = {
    **{animal: 1 for animal in range(1, 7)},
    **{animal: 2 for animal in range(7, 11)},
    **{animal: 3 for animal in range(11, 19)},
}
SOURCE_TEST_ANIMALS = {4, 10, 11}
AXES = ("x", "y", "z")
VALID_LABELS = {0, 1, 2}


def parse_timestamp(value: str) -> datetime:
    """Parse the README's ISO timestamp, including optional millisecond digits."""
    text = value.strip()
    if not text:
        raise ValueError("empty timestamp")
    try:
        # Source uses a space separator and no timezone suffix.
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"invalid ISO 8601 timestamp {value!r}") from error


def _rows(path: Path, required: tuple[str, ...], audit: dict[str, Any], kind: str) -> Iterator[tuple[datetime, dict[str, Any]]]:
    """Yield contiguous timestamp groups as (timestamp, unique row or empty marker).

    A duplicate timestamp yields an empty marker, so it cannot be silently
    resolved by row order. Input must be monotonic; an out-of-order source file
    is rejected because external sorting would alter the audited source.
    """
    previous: datetime | None = None
    group_ts: datetime | None = None
    group_rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames is None or not set(required).issubset(reader.fieldnames):
            raise ValueError(f"{path.name}: expected columns {required}, got {reader.fieldnames}")
        audit[f"{kind}RowsRead"] = 0
        audit[f"{kind}MissingByColumn"] = {name: 0 for name in required}
        audit[f"{kind}InvalidTimestampRows"] = 0
        audit[f"{kind}InvalidValueRows"] = 0
        audit[f"{kind}DuplicateTimestampGroups"] = 0
        audit[f"{kind}DuplicateRows"] = 0
        for raw in reader:
            audit[f"{kind}RowsRead"] += 1
            try:
                timestamp = parse_timestamp(raw.get("timestamp", ""))
            except ValueError:
                audit[f"{kind}InvalidTimestampRows"] += 1
                continue
            if previous is not None and timestamp < previous:
                raise ValueError(f"{path.name}: timestamps are not monotonically increasing")
            previous = timestamp
            parsed: dict[str, Any] = {}
            valid = True
            for name in required[1:]:
                value = (raw.get(name) or "").strip()
                if not value:
                    audit[f"{kind}MissingByColumn"][name] += 1
                    valid = False
                    continue
                try:
                    if name == "classification":
                        parsed[name] = int(value)
                        if parsed[name] not in VALID_LABELS:
                            raise ValueError
                    else:
                        parsed[name] = float(value)
                        if not math.isfinite(parsed[name]):
                            raise ValueError
                except ValueError:
                    audit[f"{kind}InvalidValueRows"] += 1
                    valid = False
            if not valid:
                parsed = {}
            if group_ts is None:
                group_ts, group_rows = timestamp, [parsed]
            elif timestamp == group_ts:
                group_rows.append(parsed)
            else:
                yield _finish_group(group_ts, group_rows, audit, kind)
                group_ts, group_rows = timestamp, [parsed]
        if group_ts is not None:
            yield _finish_group(group_ts, group_rows, audit, kind)


def _finish_group(timestamp: datetime, rows: list[dict[str, Any]], audit: dict[str, Any], kind: str) -> tuple[datetime, dict[str, Any]]:
    if len(rows) > 1:
        audit[f"{kind}DuplicateTimestampGroups"] += 1
        audit[f"{kind}DuplicateRows"] += len(rows)
        return timestamp, {}
    return timestamp, rows[0]


class _SecondBucket:
    def __init__(self, second: datetime) -> None:
        self.second = second
        self.n_aligned = 0
        self.n_complete = 0
        self.values: dict[str, list[float]] = {axis: [] for axis in AXES}
        self.labels: Counter[int] = Counter()

    def add(self, sensor: dict[str, Any], label: dict[str, Any]) -> None:
        self.n_aligned += 1
        if not sensor or not label:
            return
        self.n_complete += 1
        for axis in AXES:
            self.values[axis].append(sensor[axis])
        self.labels[label["classification"]] += 1

    def record(self, animal_id: int, trial_id: int, split: str) -> dict[str, Any]:
        n = self.n_complete
        row: dict[str, Any] = {
            "timestamp_second": self.second.isoformat(sep=" "),
            "animal_id": animal_id,
            "farm_trial_id": trial_id,
            "source_split": split,
            "n_exact_aligned_10hz_samples": self.n_aligned,
            "n_complete_sensor_label_samples": n,
            # A full second means exactly ten complete paired source samples.
            "is_complete_10hz_second": n == 10 and self.n_aligned == 10,
        }
        for axis in AXES:
            vals = self.values[axis]
            row[f"{axis}_mean_mg"] = sum(vals) / len(vals) if vals else None
            row[f"{axis}_std_population_mg"] = math.sqrt(sum((v - row[f"{axis}_mean_mg"]) ** 2 for v in vals) / len(vals)) if vals else None
            row[f"{axis}_min_mg"] = min(vals) if vals else None
            row[f"{axis}_max_mg"] = max(vals) if vals else None
        for label in sorted(VALID_LABELS):
            row[f"reference_fraction_class_{label}"] = self.labels[label] / n if n else None
        largest = max(self.labels.values(), default=0)
        winners = [label for label, count in self.labels.items() if count == largest]
        # Majority label is nullable on ties; this is a reference outcome only.
        row["reference_majority_class"] = winners[0] if len(winners) == 1 else None
        return row


def aggregate_pair(collar_path: Path, halter_path: Path, animal_id: int, writer: Any, batch_size: int = 20_000) -> dict[str, Any]:
    """Stream an animal pair, exact-join timestamps, and emit per-second rows."""
    trial = TRIAL_BY_ANIMAL[animal_id]
    split = "source_test" if animal_id in SOURCE_TEST_ANIMALS else "source_train"
    audit: dict[str, Any] = {
        "animalId": animal_id,
        "farmTrialId": trial,
        "sourceSplit": split,
        "collarFile": collar_path.name,
        "halterFile": halter_path.name,
        "timestampJoin": "exact timestamp equality only; no nearest-neighbor or interpolation",
        "aggregation": "timezone-naive source timestamp second; arithmetic mean/population SD/min/max per axis; class proportions and unique majority label from aligned halter samples; tied majority is null",
        "expectedSamplesPerSecond": 10,
    }
    collar_iter = iter(_rows(collar_path, ("timestamp", *AXES), audit, "collar"))
    halter_iter = iter(_rows(halter_path, ("timestamp", "classification"), audit, "halter"))
    c = next(collar_iter, None)
    h = next(halter_iter, None)
    bucket: _SecondBucket | None = None
    batch: list[dict[str, Any]] = []
    matched = collar_only = halter_only = paired_invalid = 0
    seconds_written = incomplete = 0

    def flush() -> None:
        nonlocal seconds_written, incomplete, batch
        if bucket is None:
            return
        record = bucket.record(animal_id, trial, split)
        seconds_written += 1
        incomplete += not record["is_complete_10hz_second"]
        batch.append(record)
        if len(batch) >= batch_size:
            writer.write(batch)
            batch = []

    while c is not None and h is not None:
        ct, cr = c
        ht, hr = h
        if ct < ht:
            collar_only += 1
            c = next(collar_iter, None)
            continue
        if ht < ct:
            halter_only += 1
            h = next(halter_iter, None)
            continue
        matched += 1
        second = ct.replace(microsecond=0)
        if bucket is None or second != bucket.second:
            flush()
            bucket = _SecondBucket(second)
        if not cr or not hr:
            paired_invalid += 1
        bucket.add(cr, hr)
        c = next(collar_iter, None)
        h = next(halter_iter, None)
    while c is not None:
        collar_only += 1
        c = next(collar_iter, None)
    while h is not None:
        halter_only += 1
        h = next(halter_iter, None)
    flush()
    if batch:
        writer.write(batch)

    audit.update({
        "exactTimestampRows": matched,
        "collarOnlyTimestampRows": collar_only,
        "halterOnlyTimestampRows": halter_only,
        "exactPairsWithMissingOrInvalidFields": paired_invalid,
        "aggregatedSeconds": seconds_written,
        "incompleteOrPartiallyMissingSeconds": incomplete,
        "complete10HzSeconds": seconds_written - incomplete,
        "rowsExcludedDueToDuplicateTimestamps": audit["collarDuplicateRows"] + audit["halterDuplicateRows"],
        "outcomeIsInstrumentReferenceOnly": True,
    })
    return audit


class _ParquetBatchWriter:
    """Small adapter delaying pyarrow writer construction until first batch."""
    def __init__(self, path: Path) -> None:
        self.path = path
        self.writer: Any = None
        self.schema: Any = None

    def _ensure_schema(self) -> None:
        if self.schema is not None:
            return
        import pyarrow as pa
        fields = [
            pa.field("timestamp_second", pa.string()),
            pa.field("animal_id", pa.int16()),
            pa.field("farm_trial_id", pa.int8()),
            pa.field("source_split", pa.string()),
            pa.field("n_exact_aligned_10hz_samples", pa.int16()),
            pa.field("n_complete_sensor_label_samples", pa.int16()),
            pa.field("is_complete_10hz_second", pa.bool_()),
        ]
        for axis in AXES:
            fields.extend([
                pa.field(f"{axis}_mean_mg", pa.float64()),
                pa.field(f"{axis}_std_population_mg", pa.float64()),
                pa.field(f"{axis}_min_mg", pa.float64()),
                pa.field(f"{axis}_max_mg", pa.float64()),
            ])
        fields.extend(pa.field(f"reference_fraction_class_{label}", pa.float64()) for label in sorted(VALID_LABELS))
        fields.append(pa.field("reference_majority_class", pa.int8()))
        self.schema = pa.schema(fields)

    def write(self, rows: list[dict[str, Any]]) -> None:
        import pyarrow as pa
        import pyarrow.parquet as pq
        self._ensure_schema()
        table = pa.Table.from_pylist(rows, schema=self.schema)
        if self.writer is None:
            self.writer = pq.ParquetWriter(self.path, self.schema, compression="zstd")
        self.writer.write_table(table)

    def close(self) -> None:
        import pyarrow as pa
        import pyarrow.parquet as pq
        self._ensure_schema()
        if self.writer is None:
            self.writer = pq.ParquetWriter(self.path, self.schema, compression="zstd")
            self.writer.write_table(pa.Table.from_pylist([], schema=self.schema))
        self.writer.close()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def load_verified_file_manifest(path: Path) -> dict[str, dict[str, Any]]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("source", {}).get("doi") != "10.5281/zenodo.4064802":
        raise ValueError("Download manifest DOI does not match Precision Beef")
    if manifest.get("source", {}).get("license") != "CC BY 4.0":
        raise ValueError("Download manifest lacks verified CC BY 4.0 provenance")
    return {item["name"]: item for item in manifest.get("files", [])}


def process_all(raw_dir: Path = RAW_DIR, output_dir: Path = OUTPUT_DIR, manifest_path: Path = MANIFEST_PATH) -> dict[str, Any]:
    try:
        import pyarrow  # noqa: F401
    except ImportError as error:
        raise RuntimeError("Parquet output requires pyarrow; install requirements-format-parquet.txt") from error
    files = load_verified_file_manifest(manifest_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    animal_reports = []
    for animal_id in EXPECTED_ANIMALS:
        collar_name, halter_name = f"accel-{animal_id:02d}.csv", f"halter-{animal_id:02d}.csv"
        paths = [raw_dir / collar_name, raw_dir / halter_name]
        for path in paths:
            if not path.is_file() or path.name not in files:
                raise FileNotFoundError(f"Missing downloaded file or manifest entry: {path}")
            expected = files[path.name].get("verifiedSha256")
            if not expected or file_sha256(path) != expected:
                raise ValueError(f"Raw file failed manifest SHA-256 verification: {path.name}")
        target = output_dir / f"animal-{animal_id:02d}.parquet"
        target.unlink(missing_ok=True)
        writer = _ParquetBatchWriter(target)
        try:
            report = aggregate_pair(paths[0], paths[1], animal_id, writer)
        finally:
            writer.close()
        report["outputPath"] = str(target.relative_to(ROOT)) if target.is_relative_to(ROOT) else str(target)
        animal_reports.append(report)
        print(f"processed animal={animal_id:02d} split={report['sourceSplit']} seconds={report['aggregatedSeconds']}", flush=True)

    aggregate = {
        "sourceDoi": "10.5281/zenodo.4064802",
        "sourceLicense": "CC BY 4.0",
        "status": "processed_open_source_instrument_reference_cohort",
        "rawFilesChecksumVerifiedAgainstDownloadManifest": True,
        "animalCount": len(animal_reports),
        "sourceTestAnimals": sorted(SOURCE_TEST_ANIMALS),
        "sourceTestHandling": "Processed and preserved with their source-defined split; not used for feature/target selection or model fitting.",
        "timeBasis": "Source ISO 8601 naive wall clock retained as naive; README supplies no timezone.",
        "sensorTargetSeparation": "Only x/y/z collar accelerometer values enter sensor feature summaries. Halter classification is kept in separately named reference_* outcome columns.",
        "aggregationMethod": "Exact timestamp inner join, then floor to source second. For each second, per-axis arithmetic mean, population SD, minimum, and maximum; reference-label fractions and unique majority. Tied majority is null. No interpolation. Duplicate timestamp groups are excluded as ambiguous. Incomplete seconds are retained and flagged; complete means exactly 10 paired, valid 10 Hz samples.",
        "limitations": [
            "Instrument-derived RumiWatch classifications are a reference proxy, not independent human-verified ground truth; drinking was merged into eating by the source.",
            "Housed finishing steers in the UK do not validate grazing behavior, DMI, ADG, pasture condition, or the Riose engine.",
            "Exact timestamp pairing can lower coverage where either instrument has missing or duplicate observations.",
            "A 10 Hz/10 sample complete second is an operational completeness rule from the published nominal frequency, not a claim that all source periods are complete.",
        ],
        "perAnimal": animal_reports,
        "outputs": [item["outputPath"] for item in animal_reports],
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    report_text = json.dumps(aggregate, indent=2, ensure_ascii=False) + "\n"
    REPORT_PATH.write_text(report_text, encoding="utf-8")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    processed_outputs = []
    for animal_report in animal_reports:
        output_path = Path(animal_report["outputPath"])
        if not output_path.is_absolute():
            output_path = ROOT / output_path
        processed_outputs.append({
            "path": str(output_path.relative_to(ROOT)) if output_path.is_relative_to(ROOT) else str(output_path),
            "rows": animal_report["aggregatedSeconds"],
            "sha256": file_sha256(output_path),
            "format": "parquet",
            "compression": "zstd",
        })
    manifest["processedOutputs"] = processed_outputs
    manifest["processingReport"] = str(REGISTRY_REPORT_PATH.relative_to(ROOT))
    report_for_registry = {
        "sourceDoi": aggregate["sourceDoi"],
        "status": aggregate["status"],
        "totalRows": sum(item["rows"] for item in processed_outputs),
        "animalCount": aggregate["animalCount"],
        "sourceTestAnimals": aggregate["sourceTestAnimals"],
        "perAnimal": [
            {
                "animalId": item["animalId"],
                "farmTrialId": item["farmTrialId"],
                "sourceSplit": item["sourceSplit"],
                "collarRowsRead": item["collarRowsRead"],
                "halterRowsRead": item["halterRowsRead"],
                "exactTimestampRows": item["exactTimestampRows"],
                "collarOnlyTimestampRows": item["collarOnlyTimestampRows"],
                "halterOnlyTimestampRows": item["halterOnlyTimestampRows"],
                "collarDuplicateTimestampGroups": item["collarDuplicateTimestampGroups"],
                "halterDuplicateTimestampGroups": item["halterDuplicateTimestampGroups"],
                "collarMissingByColumn": item["collarMissingByColumn"],
                "halterMissingByColumn": item["halterMissingByColumn"],
                "collarInvalidTimestampRows": item["collarInvalidTimestampRows"],
                "halterInvalidTimestampRows": item["halterInvalidTimestampRows"],
                "collarInvalidValueRows": item["collarInvalidValueRows"],
                "halterInvalidValueRows": item["halterInvalidValueRows"],
                "aggregatedSeconds": item["aggregatedSeconds"],
                "complete10HzSeconds": item["complete10HzSeconds"],
                "incompleteOrPartiallyMissingSeconds": item["incompleteOrPartiallyMissingSeconds"],
            }
            for item in animal_reports
        ],
        "limitations": aggregate["limitations"],
        "detailedReport": str(REPORT_PATH.relative_to(ROOT)),
        "processedOutputs": processed_outputs,
    }
    REGISTRY_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_REPORT_PATH.write_text(json.dumps(report_for_registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return aggregate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    args = parser.parse_args(argv)
    try:
        report = process_all(args.raw_dir, args.output_dir, args.manifest)
    except Exception as error:
        print(f"processing failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({"report": str(REPORT_PATH), "animals": report["animalCount"], "outputs": len(report["outputs"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
