#!/usr/bin/env python3
"""Verify the frozen pre-experiment scientific ML reference without refitting."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
REFERENCE = ROOT / "experiments/scientific-ml/baseline-v1.json"
LABELS = ("GR", "RE", "RU", "WA")


def load_json(path: str | Path) -> Any:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with (ROOT / path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def assert_close(actual: Any, expected: Any, path: str, tolerance: float = 1e-7) -> None:
    if isinstance(expected, dict):
        if not isinstance(actual, dict) or set(actual) != set(expected):
            raise AssertionError(f"{path}: object keys differ")
        for key in expected:
            assert_close(actual[key], expected[key], f"{path}.{key}", tolerance)
        return
    if isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            raise AssertionError(f"{path}: list length differs")
        for index, (left, right) in enumerate(zip(actual, expected)):
            assert_close(left, right, f"{path}[{index}]", tolerance)
        return
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        if not isinstance(actual, (int, float)) or not math.isclose(
            float(actual), float(expected), rel_tol=tolerance, abs_tol=tolerance
        ):
            raise AssertionError(f"{path}: {actual!r} != frozen {expected!r}")
        return
    if actual != expected:
        raise AssertionError(f"{path}: {actual!r} != frozen {expected!r}")


def regression_metrics(rows: list[dict[str, Any]], observed: str, predicted: str) -> dict[str, Any]:
    errors = [float(row[predicted]) - float(row[observed]) for row in rows]
    return {
        "n": len(rows),
        "mae": sum(abs(error) for error in errors) / len(errors),
        "rmse": math.sqrt(sum(error * error for error in errors) / len(errors)),
        "biasPredictedMinusObserved": sum(errors) / len(errors),
    }


def biomass_metrics(rows: list[dict[str, Any]], observed: str, predicted: str) -> dict[str, Any]:
    metrics = regression_metrics(rows, observed, predicted)
    return {
        "rows": metrics["n"],
        "maeKgDmHa": metrics["mae"],
        "rmseKgDmHa": metrics["rmse"],
        "biasPredictedMinusObservedKgDmHa": metrics["biasPredictedMinusObserved"],
    }


def classification_metrics(
    rows: list[dict[str, str]], label_column: str, prediction_column: str,
    weights: list[float],
) -> dict[str, Any]:
    confusion = {(actual, predicted): 0.0 for actual in LABELS for predicted in LABELS}
    for row, weight in zip(rows, weights):
        confusion[(row[label_column], row[prediction_column])] += weight
    per_class: dict[str, dict[str, float]] = {}
    recalls = []
    f1s = []
    correct = 0.0
    total = sum(weights)
    for label in LABELS:
        true_positive = confusion[(label, label)]
        support = sum(confusion[(label, prediction)] for prediction in LABELS)
        predicted = sum(confusion[(actual, label)] for actual in LABELS)
        precision = true_positive / predicted if predicted else 0.0
        recall = true_positive / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[label] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": support,
        }
        recalls.append(recall)
        f1s.append(f1)
        correct += true_positive
    return {
        "n": len(rows),
        "accuracy": correct / total,
        "balancedAccuracy": sum(recalls) / len(LABELS),
        "macroF1": sum(f1s) / len(LABELS),
        "perClass": per_class,
    }


def verify_file_hashes(reference: dict[str, Any]) -> None:
    for relative_path, metadata in reference["files"].items():
        path = ROOT / relative_path
        if not path.is_file():
            raise AssertionError(f"frozen input/artifact is missing: {relative_path}")
        if path.stat().st_size != metadata["bytes"]:
            raise AssertionError(f"size changed: {relative_path}")
        actual = sha256(relative_path)
        if actual != metadata["sha256"]:
            raise AssertionError(f"SHA-256 changed for frozen file: {relative_path}")


def verify_biomass(reference: dict[str, Any]) -> None:
    item = reference["biomass"]
    report = load_json("docs/evidence/mendeley-pasture-biomass-prediction-readiness-2026-10.json")
    with (ROOT / "docs/evidence/mendeley-pasture-biomass-grouped-oof-2026-10.csv").open(
        encoding="utf-8", newline=""
    ) as stream:
        rows = list(csv.DictReader(stream))
    if len(rows) != item["nComplete"]:
        raise AssertionError("biomass OOF row count differs from frozen baseline")
    model_columns = {
        "trainingMedian": "training_median_prediction_kg_dm_ha",
        "heightLinearRegression": "height_linear_prediction_kg_dm_ha",
    }
    observed = "observed_dry_matter_yield_kg_dm_ha"
    actual_overall = {
        name: biomass_metrics(rows, observed, column)
        for name, column in model_columns.items()
    }
    assert_close(actual_overall, item["metrics"], "biomass.metrics")
    actual_groups: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        actual_groups[(row["farm"], row["campaign"])].append(row)
    grouped = []
    for (farm, campaign), group in sorted(actual_groups.items()):
        grouped.append({
            "farm": farm,
            "campaign": campaign,
            "spatialGroups": len({row["spatial_group_id"] for row in group}),
            "trainingMedian": biomass_metrics(group, observed, model_columns["trainingMedian"]),
            "heightLinearRegression": biomass_metrics(group, observed, model_columns["heightLinearRegression"]),
        })
    assert_close(grouped, item["metricsByFarmCampaign"], "biomass.metricsByFarmCampaign")
    assert_close(report["predictionReadiness"], item["readiness"], "biomass.readiness")


def verify_behavior(reference: dict[str, Any]) -> None:
    item = reference["behavior"]
    report = load_json("docs/evidence/perea-behavior-grouped-evaluation.json")
    with (ROOT / "docs/evidence/perea-behavior-grouped-oof-predictions.csv").open(
        encoding="utf-8", newline=""
    ) as stream:
        rows = list(csv.DictReader(stream))
    if len(rows) != item["analysisRows"]:
        raise AssertionError("behavior OOF row count differs from frozen baseline")
    counts = Counter((row["breed"], row["animal_id"]) for row in rows)
    observation_weights = [1.0] * len(rows)
    animal_weights = [1.0 / counts[(row["breed"], row["animal_id"])] for row in rows]
    actual_metrics = {
        "logistic_observation_weighted": classification_metrics(
            rows, "behavior_observed", "behavior_oof_logistic", observation_weights
        ),
        "logistic_equal_animal_weighted": classification_metrics(
            rows, "behavior_observed", "behavior_oof_logistic", animal_weights
        ),
        "majority_observation_weighted": classification_metrics(
            rows, "behavior_observed", "behavior_oof_majority", observation_weights
        ),
        "majority_equal_animal_weighted": classification_metrics(
            rows, "behavior_observed", "behavior_oof_majority", animal_weights
        ),
    }
    # The source report includes additional confusion-matrix fields; compare the
    # complete metrics object after removing those matrix-only details.
    expected_metrics = item["metrics"]
    for model_name, expected in expected_metrics.items():
        actual = actual_metrics[model_name]
        for field in ("accuracy", "balancedAccuracy", "macroF1", "perClass"):
            assert_close(actual[field], expected[field], f"behavior.metrics.{model_name}.{field}")
    if not report["evaluation"]["noAnimalOverlap"]:
        raise AssertionError("frozen behavior split has animal overlap")
    actual_groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        actual_groups[f"{row['breed']}:{row['animal_id']}"].append(row)
    by_animal = {
        group: classification_metrics(
            group_rows, "behavior_observed", "behavior_oof_logistic", [1.0] * len(group_rows)
        )
        for group, group_rows in sorted(actual_groups.items())
    }
    actual_breeds: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        actual_breeds[row["breed"]].append(row)
    by_breed = {
        group: classification_metrics(
            group_rows, "behavior_observed", "behavior_oof_logistic", [1.0] * len(group_rows)
        )
        for group, group_rows in sorted(actual_breeds.items())
    }
    assert_close(by_animal, item["metricsByAnimalAndBreed"]["byAnimal"], "behavior.byAnimal")
    assert_close(by_breed, item["metricsByAnimalAndBreed"]["byBreed"], "behavior.byBreed")


def verify_adg(reference: dict[str, Any]) -> None:
    item = reference["adg"]
    report = load_json("docs/evidence/engine-adg-usda-cgrec-transport-check.json")
    if report["transferFromCper"]["cgrecOutcomesUsedForFitting"]:
        raise AssertionError("historical CGREC outcomes were used for fitting")
    rows = report["evaluation"]["rows"]
    if len(rows) != item["nExternalRows"]:
        raise AssertionError("historical ADG row count changed")
    model_columns = {
        "cperTrainingMeanBaseline": "cperHistoricalMeanAdgKgPerDay",
        "cperTrainingScale": "cperScaleAdgKgPerDay",
        "defaultEngine": "defaultEngineAdgKgPerDay",
    }
    actual_overall = {}
    for name, column in model_columns.items():
        result = regression_metrics(rows, "observedRawAdgKgPerDay", column)
        actual_overall[name] = {
            "primary": {
                "n": result["n"],
                "meanObservedKgPerHeadDay": sum(
                    float(row["observedRawAdgKgPerDay"]) for row in rows
                ) / len(rows),
                "meanPredictedKgPerHeadDay": sum(float(row[column]) for row in rows) / len(rows),
                "meanErrorKgPerHeadDay": result["biasPredictedMinusObserved"],
                "maeKgPerHeadDay": result["mae"],
                "rmseKgPerHeadDay": result["rmse"],
            },
            "byYear": {},
        }
        for year in sorted({int(row["year"]) for row in rows}):
            group = [row for row in rows if int(row["year"]) == year]
            subgroup = regression_metrics(group, "observedRawAdgKgPerDay", column)
            actual_overall[name]["byYear"][str(year)] = {
                "n": subgroup["n"],
                "meanObservedKgPerHeadDay": sum(
                    float(row["observedRawAdgKgPerDay"]) for row in group
                ) / len(group),
                "meanPredictedKgPerHeadDay": sum(float(row[column]) for row in group) / len(group),
                "meanErrorKgPerHeadDay": subgroup["biasPredictedMinusObserved"],
                "maeKgPerHeadDay": subgroup["mae"],
                "rmseKgPerHeadDay": subgroup["rmse"],
            }
        actual_overall[name]["byTreatmentDescriptiveOnly"] = {}
        for treatment in sorted({row["treatment"] for row in rows}):
            group = [row for row in rows if row["treatment"] == treatment]
            subgroup = regression_metrics(group, "observedRawAdgKgPerDay", column)
            actual_overall[name]["byTreatmentDescriptiveOnly"][treatment] = {
                "n": subgroup["n"],
                "meanObservedKgPerHeadDay": sum(
                    float(row["observedRawAdgKgPerDay"]) for row in group
                ) / len(group),
                "meanPredictedKgPerHeadDay": sum(float(row[column]) for row in group) / len(group),
                "meanErrorKgPerHeadDay": subgroup["biasPredictedMinusObserved"],
                "maeKgPerHeadDay": subgroup["mae"],
                "rmseKgPerHeadDay": subgroup["rmse"],
            }
    assert_close(actual_overall, item["overallMetrics"], "adg.overallMetrics")
    actual_by_year: dict[str, Any] = {}
    for year in sorted({int(row["year"]) for row in rows}):
        group = [row for row in rows if int(row["year"]) == year]
        actual_by_year[str(year)] = {
            "observed": {
                "n": len(group),
                "meanAdgKgPerDay": sum(float(row["observedRawAdgKgPerDay"]) for row in group) / len(group),
                "meanDays": sum(float(row["seasonDays"]) for row in group) / len(group),
                "meanInitialWeightKg": sum(float(row["initialWeightKg"]) for row in group) / len(group),
            },
            "models": {
                name: regression_metrics(group, "observedRawAdgKgPerDay", column)
                for name, column in model_columns.items()
            },
        }
    assert_close(actual_by_year, item["byYear"], "adg.byYear")


def verify() -> dict[str, Any]:
    reference = load_json(REFERENCE.relative_to(ROOT))
    if reference["status"] != "frozen_baseline_reference":
        raise AssertionError("baseline reference is not marked frozen")
    verify_file_hashes(reference)
    verify_biomass(reference)
    verify_behavior(reference)
    verify_adg(reference)
    return {
        "status": "valid",
        "codeRevision": reference["codeRevision"],
        "datasets": 3,
        "biomassOOFRows": reference["biomass"]["nComplete"],
        "behaviorOOFRows": reference["behavior"]["analysisRows"],
        "historicalAdgRows": reference["adg"]["nExternalRows"],
        "retrained": False,
    }


def main() -> None:
    print(json.dumps(verify(), indent=2))


if __name__ == "__main__":
    main()
