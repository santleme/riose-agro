#!/usr/bin/env python3
"""Audit a cohort-held-out descriptive ADG baseline for Rothamsted 2018–2025.

This checks data integrity and evaluates only a mean-ADG baseline. It does not
fit a grazing model or validate Agroville's simulation engine.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data/rothamsted"
MANIFEST_PATH = DATA_DIR / "manifest.json"
WEIGHTS_PATH = DATA_DIR / "Cattle_LWt_collated_2018-2025.csv"
HERBAGE_PATH = DATA_DIR / "2018-2025_Pasture_DM_herbage_mass.csv"
REQUIRED_WEIGHT_COLUMNS = {
    "Plot_ID", "Year", "Cohort_number", "Tag_Official", "DOB", "Date_From",
    "Date_To", "LWt_Start", "LWt_End", "DLWG",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def summarize_errors(observed: list[float], predicted: float) -> dict:
    errors = [predicted - value for value in observed]
    return {
        "rowCount": len(observed),
        "maeKgPerSteerDay": sum(abs(error) for error in errors) / len(errors),
        "rmseKgPerSteerDay": math.sqrt(sum(error * error for error in errors) / len(errors)),
        "biasKgPerSteerDay": sum(errors) / len(errors),
    }


def summarize_ages(values: list[int]) -> dict:
    ordered = sorted(values)
    middle = len(ordered) // 2
    median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    return {
        "animalCount": len(ordered),
        "minimumDays": min(ordered),
        "medianDays": median,
        "meanDays": sum(ordered) / len(ordered),
        "maximumDays": max(ordered),
        "method": "For each official tag, age at its earliest Date_From, computed as Date_From minus DOB.",
    }


def audit() -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    verified = []
    for item in manifest["files"]:
        path = DATA_DIR / item["path"]
        actual = sha256(path)
        if actual != item["sha256"]:
            raise ValueError(f"SHA-256 mismatch for {path.relative_to(ROOT)}")
        verified.append(item["path"])

    with WEIGHTS_PATH.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        columns = set(reader.fieldnames or [])
        missing = sorted(REQUIRED_WEIGHT_COLUMNS - columns)
        if missing:
            raise ValueError(f"Missing required columns: {', '.join(missing)}")
        rows = list(reader)

    cohorts: dict[int, list[dict]] = defaultdict(list)
    tags_by_cohort: dict[int, set[str]] = defaultdict(set)
    tags = set()
    year_cohorts: dict[int, set[int]] = defaultdict(set)
    first_age_by_tag: dict[str, tuple[date, int]] = {}
    plots = set()
    invalid_or_unreconciled = []
    treatment_values: dict[str, list[float]] = defaultdict(list)
    for row_number, row in enumerate(rows, start=2):
        try:
            cohort = int(row["Cohort_number"])
            year = int(row["Year"])
            start_date = date.fromisoformat(row["Date_From"])
            end_date = date.fromisoformat(row["Date_To"])
            dob = date.fromisoformat(row["DOB"])
            start_weight = float(row["LWt_Start"])
            end_weight = float(row["LWt_End"])
            dlwg = float(row["DLWG"])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid numeric/date value at CSV line {row_number}") from exc
        tag = row["Tag_Official"].strip()
        plot = row["Plot_ID"].strip()
        if not tag or not plot or end_date <= start_date or not all(
            math.isfinite(value) for value in (start_weight, end_weight, dlwg)
        ):
            raise ValueError(f"Invalid identity, dates, or values at CSV line {row_number}")
        if start_date.year != year or end_date.year not in (year, year + 1):
            raise ValueError(f"Date/year mismatch at CSV line {row_number}")
        days = (end_date - start_date).days
        age_at_start_days = (start_date - dob).days
        if age_at_start_days < 0:
            raise ValueError(f"DOB is after Date_From at CSV line {row_number}")
        calculated = (end_weight - start_weight) / days
        difference = abs(calculated - dlwg)
        if difference > 0.011:
            invalid_or_unreconciled.append({"line": row_number, "differenceKgPerDay": difference})
        row["_dlwg"] = dlwg
        cohorts[cohort].append(row)
        tags_by_cohort[cohort].add(tag)
        tags.add(tag)
        if tag not in first_age_by_tag or start_date < first_age_by_tag[tag][0]:
            first_age_by_tag[tag] = (start_date, age_at_start_days)
        year_cohorts[year].add(cohort)
        plots.add(plot)
        treatment = "set-stocked" if plot.startswith("C") else "cell-grazed" if plot.startswith("T") else "unknown"
        treatment_values[treatment].append(dlwg)

    if invalid_or_unreconciled:
        raise ValueError(f"DLWG does not reconcile within rounding tolerance: {invalid_or_unreconciled[:5]}")
    if set(cohorts) != {1, 2, 3, 4}:
        raise ValueError(f"Expected cohorts 1–4, got {sorted(cohorts)}")
    if len(plots) != 6:
        raise ValueError(f"Expected 6 plot IDs, got {sorted(plots)}")

    train_cohorts = {1, 2, 3}
    test_cohort = 4
    train_rows = [row for cohort in train_cohorts for row in cohorts[cohort]]
    test_rows = cohorts[test_cohort]
    train_tags = {row["Tag_Official"].strip() for row in train_rows}
    test_tags = {row["Tag_Official"].strip() for row in test_rows}
    if train_tags & test_tags:
        raise ValueError("Animal ID leakage between train cohorts 1–3 and held-out cohort 4")
    train_mean = sum(row["_dlwg"] for row in train_rows) / len(train_rows)
    test_values = [row["_dlwg"] for row in test_rows]

    herbage_rows = 0
    with HERBAGE_PATH.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if not {"Date", "Plot_ID", "DM_HM"}.issubset(set(reader.fieldnames or [])):
            raise ValueError("Herbage mass file is missing Date, Plot_ID, or DM_HM")
        for row in reader:
            date.fromisoformat(row["Date"])
            float(row["DM_HM"])
            herbage_rows += 1

    cohort_summary = {}
    for cohort, group in sorted(cohorts.items()):
        earliest_age_by_tag = {}
        for row in group:
            tag = row["Tag_Official"].strip()
            observation_date = date.fromisoformat(row["Date_From"])
            if tag not in earliest_age_by_tag or observation_date < earliest_age_by_tag[tag][0]:
                earliest_age_by_tag[tag] = (observation_date, (observation_date - date.fromisoformat(row["DOB"])).days)
        cohort_summary[str(cohort)] = {
            "rowCount": len(group),
            "animalCount": len(tags_by_cohort[cohort]),
            "years": sorted({int(row["Year"]) for row in group}),
            "ageAtFirstObservedIntervalDays": summarize_ages([value[1] for value in earliest_age_by_tag.values()]),
        }

    return {
        "source": {
            **manifest["source"],
            "verifiedSnapshotFiles": verified,
        },
        "integrity": {
            "animalPeriodRowCount": len(rows),
            "uniqueOfficialTagCount": len(tags),
            "plotIds": sorted(plots),
            "dlwgReconcilesWithWeightEndpointsAndDays": True,
            "herbageMassRowCount": herbage_rows,
        },
        "population": {
            "classification": "young growing dairy-cross-beef cattle; not a mature-cow cohort",
            "ageAtFirstObservedIntervalDays": summarize_ages([value[1] for value in first_age_by_tag.values()]),
        },
        "cohorts": cohort_summary,
        "heldOutBaseline": {
            "method": "train cohorts 1–3; predict each animal-period in cohort 4 with the training-row mean DLWG",
            "trainCohorts": sorted(train_cohorts),
            "testCohort": test_cohort,
            "trainAnimalCount": len(train_tags),
            "testAnimalCount": len(test_tags),
            "animalLeakage": False,
            "trainMeanKgPerSteerDay": train_mean,
            **summarize_errors(test_values, train_mean),
            "scope": "later cohorts on the same six North Wyke plots; not new-farm generalization and not a feature model",
        },
        "descriptiveTreatmentMeans": {
            treatment: {
                "animalPeriodRowCount": len(values),
                "meanDlwgKgPerSteerDay": sum(values) / len(values),
                "warning": "descriptive only; treatment is replicated at three plots per arm, so animal-period rows are not independent treatment replicates",
            }
            for treatment, values in sorted(treatment_values.items())
        },
        "fullEngineValidation": {
            "evaluated": False,
            "reason": "This dataset audit does not establish end-to-end validation of engine.js: it lacks the approved USDA CPER bout-duration/velocity predictors, individual dry-matter intake, feed costs, and a confinement arm, and its pasture treatment comparison cannot validate a pasture-versus-confinement counterfactual.",
        },
        "separateFrozenComponentDiagnostic": {
            "reportPath": "docs/evidence/engine-adg-rothamsted-check.json",
            "scope": "ADG component only; not full-engine validation, calibration, or product prediction interval",
        },
    }


if __name__ == "__main__":
    print(json.dumps(audit(), indent=2, ensure_ascii=False))
