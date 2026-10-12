#!/usr/bin/env python3
"""Integrity and descriptive coverage audit for an open Dryad grazing cohort.

This reports source coverage only. It does not evaluate or calibrate Agroville.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data/dryad-grazing-yearlings"
REPORT = ROOT / "docs/evidence/dryad-grazing-yearlings-audit.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _read_csv(path: Path, expected_columns: set[str]) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if set(reader.fieldnames or ()) != expected_columns:
            raise ValueError(f"Unexpected columns in {path.name}: {reader.fieldnames}")
        rows = list(reader)
    if any(any(value is None for value in row.values()) for row in rows):
        raise ValueError(f"Missing CSV field in {path.name}")
    return rows


def _numeric_values(rows: list[dict[str, str]], field: str) -> list[float]:
    values = [float(row[field]) for row in rows]
    if not all(math.isfinite(value) for value in values):
        raise ValueError(f"Non-finite value in {field}")
    return values


def audit() -> dict:
    manifest = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))
    for filename, metadata in manifest["files"].items():
        local_digest = _sha256(DATA_DIR / filename)
        if local_digest != metadata["sha256"] or local_digest != metadata["sourceDigest"]:
            raise ValueError(f"SHA-256 mismatch for {filename}")

    model_rows = _read_csv(DATA_DIR / "Database_Model.csv", {"ID", "CO2", "CH4", "O2", "ADG", "BW"})
    visit_rows = _read_csv(DATA_DIR / "Database_visits.csv", {"Observation", "Interval", "CO2", "CH4", "O2"})
    model_ids = [row["ID"] for row in model_rows]
    if len(model_ids) != len(set(model_ids)):
        raise ValueError("Database_Model.csv contains repeated steer IDs")
    if len(model_rows) != manifest["files"]["Database_Model.csv"]["rows"]:
        raise ValueError("Unexpected Database_Model.csv row count")
    if len(visit_rows) != manifest["files"]["Database_visits.csv"]["rows"]:
        raise ValueError("Unexpected Database_visits.csv row count")

    numeric_fields = {"CO2", "CH4", "O2", "ADG", "BW"}
    distributions = {}
    for field in sorted(numeric_fields):
        values = _numeric_values(model_rows, field)
        distributions[field] = {
            "n": len(values),
            "mean": statistics.fmean(values),
            "median": statistics.median(values),
            "sdSample": statistics.stdev(values),
            "min": min(values),
            "max": max(values),
        }

    adg = _numeric_values(model_rows, "ADG")
    bw = _numeric_values(model_rows, "BW")
    if any(value <= 0 for value in bw):
        raise ValueError("Non-positive BW in source data")

    visit_ids = {row["Observation"] for row in visit_rows}
    interval_counts = Counter(int(row["Interval"]) for row in visit_rows)
    by_id = Counter(row["Observation"] for row in visit_rows)
    intervals = sorted(interval_counts)
    if intervals != list(range(5, 101, 5)):
        raise ValueError("Unexpected visit intervals")
    if len(visit_rows) != len(visit_ids) * len(intervals) or set(by_id.values()) != {len(intervals)}:
        raise ValueError("Visit file does not contain a complete steer × interval grid")

    return {
        "source": {
            "doi": manifest["doi"],
            "articleDoi": manifest["articleDoi"],
            "license": manifest["license"],
            "version": manifest["version"],
            "publicationDate": manifest["publicationDate"],
            "sha256Verified": True,
        },
        "coverage": {
            "modelSteers": len(model_rows),
            "uniqueModelSteerIds": len(set(model_ids)),
            "modelRowsWithAdgAndBw": sum(1 for row in model_rows if row["ADG"] and row["BW"]),
            "negativeAdgRows": sum(value < 0 for value in adg),
            "zeroAdgRows": sum(value == 0 for value in adg),
            "visitRows": len(visit_rows),
            "visitSteers": len(visit_ids),
            "visitIntervals": intervals,
            "steersWithCompleteVisitGrid": sum(count == len(intervals) for count in by_id.values()),
            "modelIdsWithVisitData": len(set(model_ids) & visit_ids),
        },
        "descriptiveDistribution": distributions,
        "interpretation": {
            "primaryUse": "separate descriptive reference for yearling-steer grazing ADG and body weight",
            "engineValidation": False,
            "dmiObserved": False,
            "experimentIdInModelFile": False,
            "limitation": "The dataset has one ADG and BW record per steer but no experiment identifier, DMI, paired start/end weights, or animal-level grazing covariates. It cannot validate current engine DMI, pasture balance, causal management effects, or support a by-experiment holdout.",
        },
    }


if __name__ == "__main__":
    result = audit()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))
