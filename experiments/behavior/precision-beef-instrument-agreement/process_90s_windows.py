#!/usr/bin/env python3
"""Stream Precision Beef into wall-clock 90-second instrument windows.

The README-rounded per-animal start time is the shared anchor. Collar features
and halter reference labels are accumulated independently into half-open bins;
timestamps are never paired across devices.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Iterator

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from scripts.science.data_pipelines.process_precision_beef_open_data import (  # noqa: E402
    AXES, EXPECTED_ANIMALS, MANIFEST_PATH, RAW_DIR, SOURCE_TEST_ANIMALS,
    TRIAL_BY_ANIMAL, _rows, file_sha256, parse_timestamp,
)

WINDOW_SECONDS = 90
README_PATH = RAW_DIR / "Readme.md"
OUTPUT_DIR = ROOT / "data/processed/zenodo-4064802-90s"
REPORT_PATH = ROOT / "data/precision-beef/processing-report-90s.json"
FEATURES = tuple(f"{axis}_{stat}_mg" for axis in AXES for stat in ("mean", "std_population", "min", "max"))
LABELS = (0, 1, 2)


def read_schedule(readme_path: Path) -> dict[int, dict[str, Any]]:
    """Extract the published wall-clock schedule; do not infer anchors from data."""
    lines = readme_path.read_text(encoding="utf-8").splitlines()
    header_index = next((i for i, line in enumerate(lines) if "Animal ID" in line and "Collar Start Timestamp" in line), None)
    if header_index is None:
        raise ValueError("README summary table with collar timestamps is missing")
    headers = [cell.strip() for cell in lines[header_index].strip().strip("|").split("|")]
    indexes = {name: headers.index(name) for name in (
        "Animal ID", "Farm Trial ID", "Test", "Collar Start Timestamp", "Collar End Timestamp",
        "Halter Start Timestamp", "Halter End Timestamp",
    )}
    schedule: dict[int, dict[str, Any]] = {}
    for line in lines[header_index + 1:]:
        if not line.lstrip().startswith("|"):
            break
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not cells or not cells[0].isdigit():
            continue
        if len(cells) < len(headers):
            raise ValueError(f"Malformed README schedule row: {line}")
        animal = int(cells[indexes["Animal ID"]])
        c_start = parse_timestamp(cells[indexes["Collar Start Timestamp"]])
        h_start = parse_timestamp(cells[indexes["Halter Start Timestamp"]])
        c_end = parse_timestamp(cells[indexes["Collar End Timestamp"]])
        h_end = parse_timestamp(cells[indexes["Halter End Timestamp"]])
        if c_start != h_start:
            raise ValueError(f"Animal {animal:02d}: collar and halter README starts differ")
        if c_end != h_end:
            raise ValueError(f"Animal {animal:02d}: collar and halter README ends differ")
        schedule[animal] = {
            "anchor": c_start,
            "advertisedStart": c_start,
            # README ends are displayed to whole-second precision and inclusive.
            "advertisedEndExclusive": c_end + timedelta(seconds=1),
            "farmTrialId": int(cells[indexes["Farm Trial ID"]]),
            "sourceSplit": "source_test" if cells[indexes["Test"]].lower() == "yes" else "source_train",
        }
    if set(schedule) != set(EXPECTED_ANIMALS):
        raise ValueError("README schedule must contain animals 01 through 18 exactly")
    for animal, values in schedule.items():
        if values["farmTrialId"] != TRIAL_BY_ANIMAL[animal]:
            raise ValueError(f"Animal {animal:02d}: README trial mapping differs from frozen source mapping")
        if (values["sourceSplit"] == "source_test") != (animal in SOURCE_TEST_ANIMALS):
            raise ValueError(f"Animal {animal:02d}: README split differs from frozen source split")
    return schedule


class Window:
    """One bounded-in-time bucket; each device writes only its own fields."""
    def __init__(self, index: int, anchor: datetime) -> None:
        self.index = index
        self.start = anchor + timedelta(seconds=index * WINDOW_SECONDS)
        self.end = self.start + timedelta(seconds=WINDOW_SECONDS)
        self.collar_n = 0
        self.halter_n = 0
        self.axes: dict[str, list[float]] = {axis: [] for axis in AXES}
        self.labels: Counter[int] = Counter()

    def add_collar(self, row: dict[str, Any]) -> None:
        if not row:
            return
        self.collar_n += 1
        for axis in AXES:
            self.axes[axis].append(float(row[axis]))

    def add_halter(self, row: dict[str, Any]) -> None:
        if row:
            self.halter_n += 1
            self.labels[int(row["classification"])] += 1

    def record(self, animal_id: int, trial_id: int, split: str, schedule: dict[str, Any]) -> dict[str, Any]:
        winner_count = max(self.labels.values(), default=0)
        winners = [label for label, count in self.labels.items() if count == winner_count]
        target = winners[0] if winner_count and len(winners) == 1 else None
        partial = self.start < schedule["advertisedStart"] or self.end > schedule["advertisedEndExclusive"]
        row = {
            "animal_id": animal_id, "farm_trial_id": trial_id, "source_split": split,
            "window_index": self.index, "window_start": self.start.isoformat(sep=" "),
            "window_end_exclusive": self.end.isoformat(sep=" "), "window_seconds": WINDOW_SECONDS,
            "anchor_timestamp": schedule["anchor"].isoformat(sep=" "),
            "n_valid_collar_samples": self.collar_n, "n_valid_halter_samples": self.halter_n,
            "has_valid_collar": self.collar_n > 0, "has_valid_halter": self.halter_n > 0,
            "reference_majority_class": target, "reference_label_tie": bool(winner_count and len(winners) > 1),
            "is_partial_boundary": partial,
        }
        for axis in AXES:
            values = self.axes[axis]
            mean = math.fsum(values) / len(values) if values else None
            row[f"{axis}_mean_mg"] = mean
            row[f"{axis}_std_population_mg"] = math.sqrt(math.fsum((v - mean) ** 2 for v in values) / len(values)) if values else None
            row[f"{axis}_min_mg"] = min(values) if values else None
            row[f"{axis}_max_mg"] = max(values) if values else None
        for label in LABELS:
            row[f"reference_fraction_class_{label}"] = self.labels[label] / self.halter_n if self.halter_n else None
        return row


def _window_index(timestamp: datetime, anchor: datetime) -> int:
    seconds = (timestamp - anchor).total_seconds()
    return math.floor(seconds / WINDOW_SECONDS)


def aggregate_90s(collar_rows: Iterable[tuple[datetime, dict[str, Any]]],
                  halter_rows: Iterable[tuple[datetime, dict[str, Any]]], *,
                  animal_id: int, schedule: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Merge streams only by event-time order and bin number, never by row pairing."""
    c_iter, h_iter = iter(collar_rows), iter(halter_rows)
    c, h = next(c_iter, None), next(h_iter, None)
    current: Window | None = None
    while c is not None or h is not None:
        ts = h[0] if c is None else c[0] if h is None else min(c[0], h[0])
        index = _window_index(ts, schedule["anchor"])
        if current is not None and index != current.index:
            yield current.record(animal_id, schedule["farmTrialId"], schedule["sourceSplit"], schedule)
            current = None
        if current is None:
            current = Window(index, schedule["anchor"])
        # Consume all rows at this timestamp from each stream independently.
        # _rows emits one timestamp group; duplicates/invalid groups are empty.
        if c is not None and _window_index(c[0], schedule["anchor"]) == index:
            current.add_collar(c[1])
            c = next(c_iter, None)
            while c is not None and _window_index(c[0], schedule["anchor"]) == index and c[0] == ts:
                current.add_collar(c[1]); c = next(c_iter, None)
        if h is not None and _window_index(h[0], schedule["anchor"]) == index:
            current.add_halter(h[1])
            h = next(h_iter, None)
            while h is not None and _window_index(h[0], schedule["anchor"]) == index and h[0] == ts:
                current.add_halter(h[1]); h = next(h_iter, None)
    if current is not None:
        yield current.record(animal_id, schedule["farmTrialId"], schedule["sourceSplit"], schedule)


def process_animal(animal_id: int, raw_dir: Path, schedule: dict[str, Any], writer: Any, batch_size: int = 2048) -> dict[str, Any]:
    audit: dict[str, Any] = {}
    c_path, h_path = raw_dir / f"accel-{animal_id:02d}.csv", raw_dir / f"halter-{animal_id:02d}.csv"
    c_iter = _rows(c_path, ("timestamp", *AXES), audit, "collar")
    h_iter = _rows(h_path, ("timestamp", "classification"), audit, "halter")
    rows = batch = []
    counts = Counter()
    first_seen: dict[str, datetime | None] = {"collar": None, "halter": None}
    last_seen: dict[str, datetime | None] = {"collar": None, "halter": None}

    def instrument_rows(iterator, modality):
        for timestamp, values in iterator:
            first_seen[modality] = timestamp if first_seen[modality] is None else first_seen[modality]
            last_seen[modality] = timestamp
            if values:
                counts[f"{modality}ValidSamples"] += 1
            else:
                counts[f"{modality}InvalidOrDuplicateGroups"] += 1
            yield timestamp, values

    for row in aggregate_90s(instrument_rows(c_iter, "collar"), instrument_rows(h_iter, "halter"),
                             animal_id=animal_id, schedule=schedule):
        counts["unionWindows"] += 1
        counts["commonValidWindows"] += row["has_valid_collar"] and row["has_valid_halter"]
        counts["collarOnlyWindows"] += row["has_valid_collar"] and not row["has_valid_halter"]
        counts["halterOnlyWindows"] += row["has_valid_halter"] and not row["has_valid_collar"]
        counts["tiedReferenceWindows"] += row["reference_label_tie"]
        counts["partialBoundaryWindows"] += row["is_partial_boundary"]
        batch.append(row)
        if len(batch) >= batch_size:
            writer.write(batch); batch = []
    if batch:
        writer.write(batch)
    report = {
        "animalId": animal_id, "farmTrialId": schedule["farmTrialId"], "sourceSplit": schedule["sourceSplit"],
        "anchorTimestamp": schedule["anchor"].isoformat(sep=" "),
        "advertisedEndExclusive": schedule["advertisedEndExclusive"].isoformat(sep=" "),
        **{key: int(value) for key, value in counts.items()},
        "collarFirstTimestamp": first_seen["collar"].isoformat(sep=" ") if first_seen["collar"] else None,
        "collarLastTimestamp": last_seen["collar"].isoformat(sep=" ") if last_seen["collar"] else None,
        "halterFirstTimestamp": first_seen["halter"].isoformat(sep=" ") if first_seen["halter"] else None,
        "halterLastTimestamp": last_seen["halter"].isoformat(sep=" ") if last_seen["halter"] else None,
        "rawQualityCounts": {key: value for key, value in audit.items()},
    }
    return report


class ParquetBatchWriter:
    def __init__(self, path: Path) -> None:
        self.path, self.writer = path, None

    @staticmethod
    def schema():
        import pyarrow as pa
        fields = [
            pa.field("animal_id", pa.int16()), pa.field("farm_trial_id", pa.int8()),
            pa.field("source_split", pa.string()), pa.field("window_index", pa.int64()),
            pa.field("window_start", pa.string()), pa.field("window_end_exclusive", pa.string()),
            pa.field("window_seconds", pa.int16()), pa.field("anchor_timestamp", pa.string()),
            pa.field("n_valid_collar_samples", pa.int64()), pa.field("n_valid_halter_samples", pa.int64()),
            pa.field("has_valid_collar", pa.bool_()), pa.field("has_valid_halter", pa.bool_()),
            pa.field("reference_majority_class", pa.int8()), pa.field("reference_label_tie", pa.bool_()),
            pa.field("is_partial_boundary", pa.bool_()),
        ]
        for axis in AXES:
            fields.extend(pa.field(f"{axis}_{stat}_mg", pa.float64()) for stat in ("mean", "std_population", "min", "max"))
        fields.extend(pa.field(f"reference_fraction_class_{label}", pa.float64()) for label in LABELS)
        return pa.schema(fields)

    def write(self, rows: list[dict[str, Any]]) -> None:
        import pyarrow as pa
        import pyarrow.parquet as pq
        schema = self.schema()
        table = pa.Table.from_pylist(rows, schema=schema)
        if self.writer is None:
            self.writer = pq.ParquetWriter(self.path, schema, compression="zstd")
        self.writer.write_table(table)

    def close(self) -> None:
        import pyarrow as pa
        import pyarrow.parquet as pq
        if self.writer is None:
            self.writer = pq.ParquetWriter(self.path, self.schema(), compression="zstd")
            self.writer.write_table(pa.Table.from_pylist([], schema=self.schema()))
        self.writer.close()


def run(raw_dir: Path = RAW_DIR, output_dir: Path = OUTPUT_DIR, manifest_path: Path = MANIFEST_PATH,
        readme_path: Path = README_PATH, report_path: Path = REPORT_PATH) -> dict[str, Any]:
    import pyarrow  # noqa: F401
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("source", {}).get("doi") != "10.5281/zenodo.4064802" or manifest.get("source", {}).get("license") != "CC BY 4.0":
        raise ValueError("Raw manifest source/license verification failed")
    readme_item = next((x for x in manifest.get("files", []) if x.get("name") == "Readme.md"), None)
    if not readme_item or file_sha256(readme_path) != readme_item.get("verifiedSha256"):
        raise ValueError("README schedule checksum does not match verified source download")
    files = {x.get("name"): x for x in manifest.get("files", [])}
    schedule = read_schedule(readme_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    animals = []
    for animal in EXPECTED_ANIMALS:
        for name in (f"accel-{animal:02d}.csv", f"halter-{animal:02d}.csv"):
            path = raw_dir / name
            if not path.is_file() or name not in files or file_sha256(path) != files[name].get("verifiedSha256"):
                raise ValueError(f"Raw file missing or checksum mismatch: {name}")
        path = output_dir / f"animal-{animal:02d}.parquet"
        path.unlink(missing_ok=True)
        writer = ParquetBatchWriter(path)
        try:
            animal_report = process_animal(animal, raw_dir, schedule[animal], writer)
        finally:
            writer.close()
        animal_report["outputPath"] = str(path.resolve().relative_to(ROOT.resolve()))
        animal_report["outputSha256"] = file_sha256(path)
        animal_report["outputRows"] = animal_report["unionWindows"]
        animals.append(animal_report)
    result = {
        "kind": "precision_beef_90s_window_processing",
        "status": "processed_open_source_instrument_reference_cohort",
        "sourceDoi": manifest["source"]["doi"],
        "totalRows": sum(item["outputRows"] for item in animals),
        "source": {"doi": manifest["source"]["doi"], "license": manifest["source"]["license"],
                   "readmePath": str(readme_path.resolve().relative_to(ROOT.resolve())),
                   "readmeSha256": file_sha256(readme_path), "rawChecksumsVerified": True},
        "protocolAmendment": "experiments/behavior/precision-beef-instrument-agreement/amendment-2026-10-13.json",
        "windowSeconds": WINDOW_SECONDS,
        "alignment": "shared README rounded start anchor; independent half-open wall-clock bins; no timestamp join, nearest join, row-index join, or interpolation",
        "coverageDefinition": "All union bins are emitted; evaluator scores only interior bins with at least 800 valid samples in each stream (800/900 nominal), finite collar features, and a unique valid halter majority. Ties, below-threshold bins, and partial boundary bins are retained and flagged but excluded from fitting/scoring.",
        "sourceTestAnimals": sorted(SOURCE_TEST_ANIMALS),
        "sourceTestHandling": "Source test animals preserved with original split; no fitting performed by this processor.",
        "perAnimal": animals,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    register_processed_outputs(result, manifest_path, report_path)
    return result


def register_processed_outputs(result: dict[str, Any], manifest_path: Path = MANIFEST_PATH,
                               report_path: Path = REPORT_PATH) -> None:
    """Record the generated window cohort in the strict scientific registry."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["processedOutputs"] = [
        {
            "path": item["outputPath"], "rows": item["outputRows"], "sha256": item["outputSha256"],
            "format": "parquet", "compression": "zstd",
        }
        for item in result["perAnimal"]
    ]
    manifest["processingReport"] = str(report_path.resolve().relative_to(ROOT.resolve()))
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    parser.add_argument("--readme", type=Path, default=README_PATH)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    args = parser.parse_args(argv)
    result = run(args.raw_dir, args.output_dir, args.manifest, args.readme, args.report)
    print(json.dumps({"status": result["status"], "animals": len(result["perAnimal"]), "windowSeconds": WINDOW_SECONDS}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
