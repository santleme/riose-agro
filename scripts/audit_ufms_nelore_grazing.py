#!/usr/bin/env python3
"""Audit the public v1 UFMS Nelore pasture supplementation file.

This is an integrity and compatibility audit, not a model fit or validation.
The source file is retained unchanged; suspicious values are reported rather
than corrected or silently removed.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import Counter
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data/ufms-nelore-grazing"
MANIFEST = DATA_DIR / "manifest.json"
SOURCE = DATA_DIR / "Complete_Dataset.csv"
EXPECTED_COLUMNS = 71
EXPECTED_ANIMALS = 26
EXPECTED_PERIODS = 15


def _number(value: str, *, decimal_comma: bool = False) -> float:
    normalized = value.strip().replace(",", ".") if decimal_comma else value.strip()
    result = float(normalized)
    if not math.isfinite(result):
        raise ValueError("Non-finite number in source data")
    return result


def audit() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sha256 = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if sha256 != manifest["sha256"] or sha256 != manifest["repository_sha256"]:
        raise ValueError("Source CSV SHA-256 does not match the manifest or repository API")

    with SOURCE.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        columns = reader.fieldnames or []
        rows = list(reader)
    if len(columns) != EXPECTED_COLUMNS or len(set(columns)) != len(columns):
        raise ValueError("Unexpected or duplicate source columns")
    if any(None in row for row in rows):
        raise ValueError("A source row has more fields than the header")

    ids = {row["ANIMAL"] for row in rows}
    periods: dict[tuple[str, str], list[dict[str, str]]] = {}
    animal_periods: set[tuple[str, str, str]] = set()
    adg_differences: list[float] = []
    empty_counts: Counter[str] = Counter()
    for row in rows:
        animal = row["ANIMAL"].strip()
        start, end = row["START_DATE"].strip(), row["FINAL_DATE"].strip()
        if not animal or not start or not end:
            raise ValueError("Missing animal or period key")
        period_key = (start, end)
        periods.setdefault(period_key, []).append(row)
        animal_period_key = (animal, start, end)
        if animal_period_key in animal_periods:
            raise ValueError("Duplicate animal-period key")
        animal_periods.add(animal_period_key)

        start_date = datetime.strptime(start, "%d/%m/%Y").date()
        end_date = datetime.strptime(end, "%d/%m/%Y").date()
        date_days = (end_date - start_date).days
        days = _number(row["AMOUNT_DAYS"])
        if date_days != days or days <= 0:
            raise ValueError("AMOUNT_DAYS disagrees with the published interval dates")

        start_weight = _number(row["START_WEIGHT"])
        final_weight = _number(row["FINAL_WEIGHT"])
        reported_adg = _number(row["GMD"], decimal_comma=True)
        derived_adg = (final_weight - start_weight) / days
        adg_differences.append(abs(reported_adg - derived_adg))
        for column, value in row.items():
            if value is None or not value.strip():
                empty_counts[column] += 1

    if len(rows) != EXPECTED_ANIMALS * EXPECTED_PERIODS:
        raise ValueError("Unexpected animal-period row count")
    if len(ids) != EXPECTED_ANIMALS or len(periods) != EXPECTED_PERIODS:
        raise ValueError("Unexpected animal or interval coverage")
    if set(map(len, periods.values())) != {EXPECTED_ANIMALS}:
        raise ValueError("Each weighing interval must contain one row for each animal")

    mismatch_tolerance_kg_per_day = 0.002
    mismatch_count = sum(value > mismatch_tolerance_kg_per_day for value in adg_differences)
    mismatched_periods = sum(
        any(
            abs(
                _number(row["GMD"], decimal_comma=True)
                - (_number(row["FINAL_WEIGHT"]) - _number(row["START_WEIGHT"]))
                / _number(row["AMOUNT_DAYS"])
            )
            > mismatch_tolerance_kg_per_day
            for row in period_rows
        )
        for period_rows in periods.values()
    )
    gemi = [
        _number(row["GEMI"])
        for row in rows
        if row.get("GEMI", "").strip()
    ]

    return {
        "source": {
            "doi": manifest["doi"],
            "articleDoi": manifest["article_doi"],
            "version": manifest["version"],
            "license": manifest["license"],
            "sha256Verified": True,
            "file": manifest["file"],
        },
        "coverage": {
            "rows": len(rows),
            "columns": len(columns),
            "animals": len(ids),
            "intervals": len(periods),
            "animalIntervalKeys": len(animal_periods),
            "daysRange": [
                int(min(_number(row["AMOUNT_DAYS"]) for row in rows)),
                int(max(_number(row["AMOUNT_DAYS"]) for row in rows)),
            ],
            "missingValuesByColumn": dict(sorted(empty_counts.items())),
        },
        "qualityChecks": {
            "duplicateAnimalIntervals": 0,
            "intervalDaysMatchDates": True,
            "reportedGmdVsWeightDeltaMismatches": mismatch_count,
            "gmdMismatchToleranceKgPerDay": mismatch_tolerance_kg_per_day,
            "intervalsWithAnyGmdMismatch": mismatched_periods,
            "maxAbsoluteGmdDifferenceKgPerDay": round(max(adg_differences), 6),
            "gemiObservedRange": [round(min(gemi), 6), round(max(gemi), 6)],
            "gemiAllNegativeAndExtreme": bool(gemi) and max(gemi) < -100,
        },
        "interpretation": {
            "engineValidation": False,
            "primaryUse": "independent descriptive reference for growing male Nelore pasture and supplementation",
            "notSuitableFor": [
                "validating the current CPER engine",
                "causal effect of supplementation (one paddock and no untreated comparison)",
                "pasture DMI calibration (the file has no measured forage intake)",
                "using the reported GMD without checking the weight and interval fields",
            ],
            "releaseNote": "The Mendeley record v1 file is publicly downloadable under CC BY 4.0. The current v7 metadata page is public, but its files API returned no downloadable file entries during this audit; the archived local CSV is therefore pinned to v1, not assumed equivalent to v7.",
        },
    }


if __name__ == "__main__":
    print(json.dumps(audit(), indent=2, ensure_ascii=False))
