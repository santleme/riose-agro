#!/usr/bin/env python3
"""Audit whether the USDA CPER period table can validate Agroville outputs.

This does not evaluate engine.js. It measures grouped mean and two-feature ADG
baselines to exercise split hygiene and documents target mismatch.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
DEFAULT_CSV = ROOT / "data/usda-cper/period.csv"
MANIFEST_PATH = ROOT / "data/usda-cper/manifest.json"
REQUIRED_COLUMNS = {
    "Year", "60dADG_INT", "Pasture", "Eartag", "DaysData",
    "GBD_5min", "GrazeHrs_5min", "GBD_4sec", "GrazeHrs_4sec",
    "MeanTA", "MeanVelo", "ADG_60d",
}
FEATURE_COLUMNS = ("GBD_5min", "MeanVelo")


def fit_linear_adg(train_rows: list[dict]) -> tuple[float, float, float]:
    """Fit ADG = intercept + GBD_5min + MeanVelo on training rows only."""
    matrix = [[0.0] * 4 for _ in range(3)]
    for row in train_rows:
        features = [1.0, *(float(row[column]) for column in FEATURE_COLUMNS)]
        target = row["_adg"]
        for i in range(3):
            for j in range(3):
                matrix[i][j] += features[i] * features[j]
            matrix[i][3] += features[i] * target

    # Gaussian elimination with partial pivoting for this 3x3 normal equation.
    for column in range(3):
        pivot = max(range(column, 3), key=lambda row_index: abs(matrix[row_index][column]))
        if abs(matrix[pivot][column]) < 1e-12:
            raise ValueError("Training split cannot identify the two-feature linear ADG model")
        matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
        divisor = matrix[column][column]
        matrix[column] = [value / divisor for value in matrix[column]]
        for row_index in range(3):
            if row_index == column:
                continue
            scale = matrix[row_index][column]
            matrix[row_index] = [matrix[row_index][i] - scale * matrix[column][i] for i in range(4)]
    return tuple(matrix[i][3] for i in range(3))


def predict_linear_adg(train_rows: list[dict], test_rows: list[dict]) -> list[dict]:
    intercept, gbd_coefficient, velocity_coefficient = fit_linear_adg(train_rows)
    return [
        {
            "observed": row["_adg"],
            "predicted": intercept + gbd_coefficient * float(row["GBD_5min"]) + velocity_coefficient * float(row["MeanVelo"]),
        }
        for row in test_rows
    ]


def metric_summary(predictions: list[dict]) -> dict:
    errors = [item["predicted"] - item["observed"] for item in predictions]
    return {
        "testRowCount": len(errors),
        "maeKgPerSteerDay": sum(abs(error) for error in errors) / len(errors),
        "rmseKgPerSteerDay": math.sqrt(sum(error * error for error in errors) / len(errors)),
        "biasKgPerSteerDay": sum(errors) / len(errors),
    }


def audit(path: Path) -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    verified_files = []
    expected_hashes = {}
    for item in manifest["files"]:
        snapshot_path = MANIFEST_PATH.parent / item["path"]
        snapshot_hash = hashlib.sha256(snapshot_path.read_bytes()).hexdigest()
        if snapshot_hash != item["sha256"]:
            raise ValueError(f"SHA-256 mismatch for {snapshot_path.relative_to(ROOT)}")
        verified_files.append(item["path"])
        expected_hashes[item["path"]] = item["sha256"]

    raw = path.read_bytes()
    current_hash = hashlib.sha256(raw).hexdigest()
    relative_path = str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else None
    expected_current_hash = expected_hashes.get(path.name) if relative_path == "data/usda-cper/period.csv" else None
    if expected_current_hash and current_hash != expected_current_hash:
        raise ValueError(f"SHA-256 mismatch for {relative_path}")
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        columns = set(reader.fieldnames or [])
        missing_columns = sorted(REQUIRED_COLUMNS - columns)
        if missing_columns:
            raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
        rows = list(reader)

    if not rows:
        raise ValueError("The source table has no records")

    animals: dict[str, list[dict]] = defaultdict(list)
    periods = Counter()
    pastures = Counter()
    for row_number, row in enumerate(rows, start=2):
        eartag = row["Eartag"].strip()
        if not eartag:
            raise ValueError(f"Missing Eartag at CSV line {row_number}")
        try:
            adg = float(row["ADG_60d"])
            days = int(row["DaysData"])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid ADG_60d or DaysData at CSV line {row_number}") from exc
        if not math.isfinite(adg) or days <= 0:
            raise ValueError(f"Invalid outcome or coverage at CSV line {row_number}")
        row["_adg"] = adg
        animals[eartag].append(row)
        periods[row["60dADG_INT"]] += 1
        pastures[row["Pasture"]] += 1

    # Leave one animal ID out per fold. No period from a held-out animal can
    # occur in training, including the three IDs observed in two periods.
    predictions = []
    model_oof = []
    folds = []
    for held_eartag in sorted(animals):
        test_rows = animals[held_eartag]
        train_rows = [row for eartag, group in animals.items() if eartag != held_eartag for row in group]
        train_ids = {row["Eartag"].strip() for row in train_rows}
        test_ids = {row["Eartag"].strip() for row in test_rows}
        if train_ids & test_ids:
            raise AssertionError("Animal identity leaked between training and test")
        train_mean = sum(row["_adg"] for row in train_rows) / len(train_rows)
        fold_predictions = [
            {"eartag": held_eartag, "period": row["60dADG_INT"], "observed": row["_adg"], "predicted": train_mean}
            for row in test_rows
        ]
        predictions.extend(fold_predictions)
        model_oof.extend(predict_linear_adg(train_rows, test_rows))
        folds.append({
            "heldOutEartag": held_eartag,
            "trainAnimalCount": len(train_ids),
            "testAnimalCount": len(test_ids),
            "trainRowCount": len(train_rows),
            "testRowCount": len(test_rows),
        })

    period_predictions = []
    period_model_oof = []
    period_folds = []
    for held_period in sorted(periods):
        test_rows = [row for row in rows if row["60dADG_INT"] == held_period]
        test_ids = {row["Eartag"].strip() for row in test_rows}
        train_rows = [
            row for row in rows
            if row["60dADG_INT"] != held_period and row["Eartag"].strip() not in test_ids
        ]
        train_ids = {row["Eartag"].strip() for row in train_rows}
        if not train_rows or train_ids & test_ids:
            raise AssertionError(f"Invalid animal-disjoint period split for period {held_period}")
        train_mean = sum(row["_adg"] for row in train_rows) / len(train_rows)
        period_predictions.extend(train_mean - row["_adg"] for row in test_rows)
        period_model_oof.extend(predict_linear_adg(train_rows, test_rows))
        period_folds.append({
            "heldOutPeriod": held_period,
            "trainRowCount": len(train_rows),
            "trainAnimalCount": len(train_ids),
            "testRowCount": len(test_rows),
            "testAnimalCount": len(test_ids),
            "animalOverlap": 0,
        })
    period_baseline_predictions = [
        {"observed": 0.0, "predicted": error} for error in period_predictions
    ]
    repeated_animals = {eartag: len(group) for eartag, group in animals.items() if len(group) > 1}

    return {
        "source": {
            **manifest["source"],
            "file": relative_path or path.name,
            "sha256": current_hash,
            "sha256Verified": current_hash == expected_current_hash if expected_current_hash else False,
            "verifiedSnapshotFiles": verified_files,
            "verifiedDataFiles": [name for name in verified_files if not name.endswith("_dict.csv")],
            "verifiedDictionaryFiles": [name for name in verified_files if name.endswith("_dict.csv")],
        },
        "coverage": {
            "rowCount": len(rows),
            "animalCount": len(animals),
            "repeatedAnimalIds": repeated_animals,
            "rowsByGainPeriod": dict(sorted(periods.items())),
            "rowsByPasture": dict(sorted(pastures.items())),
            "target": "ADG_60d (kg/steer/day)",
        },
        "groupedBaseline": {
            "method": "leave-one-Eartag-out; predict each held-out row with the mean ADG of training rows",
            "metricWeighting": "each animal-period row counts equally; the three animals with two periods contribute two rows",
            "foldCount": len(folds),
            "animalLeakage": False,
            **metric_summary(predictions),
            "folds": folds,
        },
        "twoFeatureAdgModel": {
            "target": "ADG_60d (kg/steer/day)",
            "features": [
                {"column": "GBD_5min", "unit": "minutes", "meaning": "mean grazing-bout duration per day at 5-min resolution"},
                {"column": "MeanVelo", "unit": "meters/minute", "meaning": "mean velocity while grazing"},
            ],
            "method": "ordinary least squares refit using training rows only in each fold",
            "featureSelection": "GBD_5min and MeanVelo were chosen by the published paper using this same study dataset; feature selection is not nested and may make these scores optimistic",
            "groupedByAnimal": {"foldCount": len(folds), "animalLeakage": False, **metric_summary(model_oof)},
            "withinStudyPeriodHoldout": {"foldCount": len(period_folds), "animalLeakage": False, **metric_summary(period_model_oof)},
            "relationToPaper": "The paper reports these two predictor families and 62% explained variation for its fitted dataset; the cross-validated scores here are an exploratory re-fit, not independent validation of that paper or Agroville's engine.",
        },
        "withinStudyPeriodHoldout": {
            "method": "leave-one-60dADG_INT-period-out; remove any training row whose Eartag occurs in the held-out period",
            "metricWeighting": "each held-out animal-period row counts equally",
            "foldCount": len(period_folds),
            "animalLeakage": False,
            **metric_summary(period_baseline_predictions),
            "folds": period_folds,
            "limitation": "All folds remain within the same USDA study, site, and four-paddock system; this is not external site/system validation.",
        },
        "engineValidation": {
            "evaluated": False,
            "reason": "The table has period ADG and grazing metrics, but no individual starting/ending weight, individual dry-matter intake, diet, feed cost, confinement arm, or paired counterfactual. engine.js emits demonstrative weight/intake/cost/forage trajectories, so its outputs do not match this target/protocol.",
            "usableFor": ["data-ingestion checks", "grouped-split plumbing", "exploratory within-study ADG baseline"],
            "notUsableFor": ["validating current engine.js", "dry-matter intake", "feed cost", "pasto-versus-confinement causal effect", "Brazilian farm generalization"],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="?", type=Path, default=DEFAULT_CSV)
    args = parser.parse_args()
    print(json.dumps(audit(args.csv.resolve()), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
