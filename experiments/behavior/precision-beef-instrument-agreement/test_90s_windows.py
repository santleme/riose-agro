from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import pytest

HERE = Path(__file__).resolve().parent


def load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    import sys
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


processor = load("precision_beef_90s_processor_test", "process_90s_windows.py")
evaluator = load("precision_beef_90s_evaluator_test", "evaluate_90s_windows.py")


def schedule(end_seconds: int = 150) -> dict:
    anchor = datetime(2020, 1, 1)
    return {"anchor": anchor, "advertisedStart": anchor,
            "advertisedEndExclusive": anchor + timedelta(seconds=end_seconds + 1),
            "farmTrialId": 1, "sourceSplit": "source_train"}


def sensor(x: float) -> dict:
    return {"x": x, "y": x + 1, "z": x + 2}


def test_half_open_bins_wall_clock_anchor_and_no_exact_timestamp_pairing():
    anchor = schedule()["anchor"]
    collar = [(anchor + timedelta(seconds=0.5), sensor(1)),
              (anchor + timedelta(seconds=89.9), sensor(3)),
              (anchor + timedelta(seconds=90), sensor(5))]
    halter = [(anchor + timedelta(seconds=30), {"classification": 1}),
              (anchor + timedelta(seconds=89.999), {"classification": 1}),
              (anchor + timedelta(seconds=90), {"classification": 2})]
    rows = list(processor.aggregate_90s(collar, halter, animal_id=1, schedule=schedule()))
    assert [row["window_index"] for row in rows] == [0, 1]
    assert [row["n_valid_collar_samples"] for row in rows] == [2, 1]
    assert [row["n_valid_halter_samples"] for row in rows] == [2, 1]
    assert rows[0]["x_mean_mg"] == 2
    assert rows[0]["reference_majority_class"] == 1
    assert rows[1]["reference_majority_class"] == 2
    assert rows[1]["window_start"] == "2020-01-01 00:01:30"
    # No source timestamps coincide, but the common temporal windows pair the modalities.


def test_ties_missing_modalities_and_partial_boundaries_are_retained_and_flagged():
    anchor = schedule(end_seconds=120)["anchor"]
    collar = [(anchor + timedelta(seconds=5), sensor(1)),
              (anchor + timedelta(seconds=90), sensor(2)),
              (anchor + timedelta(seconds=180), sensor(3))]
    halter = [(anchor + timedelta(seconds=10), {"classification": 0}),
              (anchor + timedelta(seconds=20), {"classification": 1}),
              (anchor + timedelta(seconds=90), {"classification": 2}),
              (anchor + timedelta(seconds=270), {"classification": 0})]
    rows = list(processor.aggregate_90s(collar, halter, animal_id=1, schedule=schedule(end_seconds=120)))
    assert [row["window_index"] for row in rows] == [0, 1, 2, 3]
    assert rows[0]["reference_label_tie"] and rows[0]["reference_majority_class"] is None
    assert rows[1]["has_valid_collar"] and rows[1]["has_valid_halter"]
    assert rows[2]["has_valid_collar"] and not rows[2]["has_valid_halter"]
    assert not rows[3]["has_valid_collar"] and rows[3]["has_valid_halter"]
    assert rows[1]["is_partial_boundary"] and rows[2]["is_partial_boundary"] and rows[3]["is_partial_boundary"]


def row(animal: int, index: int, *, collar=True, halter=True, collar_n=900, halter_n=900,
        target=0, tie=False, partial=False):
    anchor = datetime(2020, 1, 1)
    window_start = anchor + timedelta(seconds=index * 90)
    result = {
        "animal_id": animal, "farm_trial_id": 1 if animal <= 6 else 2 if animal <= 10 else 3,
        "source_split": "source_test" if animal in {4, 10, 11} else "source_train",
        "window_index": index, "window_start": window_start.isoformat(sep=" "),
        "window_end_exclusive": (window_start + timedelta(seconds=90)).isoformat(sep=" "), "window_seconds": 90,
        "anchor_timestamp": "2020-01-01 00:00:00", "n_valid_collar_samples": collar_n if collar else 0,
        "n_valid_halter_samples": halter_n if halter else 0, "has_valid_collar": collar,
        "has_valid_halter": halter, "reference_majority_class": None if tie or not halter else target,
        "reference_label_tie": tie, "is_partial_boundary": partial,
    }
    for feature in evaluator.FEATURES:
        result[feature] = 1.0 if collar else None
    for label in evaluator.LABELS:
        result[f"reference_fraction_class_{label}"] = (1.0 if label == target else 0.0) if halter and not tie else None
    return result


def test_eligibility_counts_common_bins_ties_and_partial_without_row_interpolation():
    frame = pd.DataFrame([
        row(1, 0, target=1),
        row(1, 1, tie=True, partial=True),
        row(1, 2, collar=True, halter=False),
        row(1, 3, collar=False, halter=True),
        row(1, 4, target=2, partial=True),
        row(1, 5, target=2, collar_n=800, halter_n=800),
        row(1, 6, target=2, collar_n=799, halter_n=900),
    ])
    eligible, coverage = evaluator.eligible_windows(frame)
    assert eligible["window_index"].tolist() == [0, 5]
    assert eligible["n_valid_collar_samples"].tolist() == [900, 800]
    assert coverage["unionWindows"] == 7
    assert coverage["commonValidWindows"] == 5
    assert coverage["eligibleWindows"] == 2
    assert coverage["tiedReferenceWindows"] == 1
    assert coverage["partialBoundaryWindows"] == 2
    assert coverage["belowThresholdWindows"] == 1
    assert coverage["collarSampleCountDistribution"] == {"0": 1, "799": 1, "800": 1, "900": 4}
    assert coverage["halterSampleCountDistribution"] == {"0": 1, "800": 1, "900": 5}
    assert coverage["collarOnlyWindows"] == coverage["halterOnlyWindows"] == 1


def test_source_test_groups_and_invalid_split_are_rejected():
    frame = pd.DataFrame([row(4, 0, target=2), row(5, 0, target=1)])
    for animal, group in frame.groupby("animal_id"):
        evaluator.validate_90s_frame(group, animal)
    invalid = frame.copy()
    invalid.loc[invalid["animal_id"] == 4, "source_split"] = "source_train"
    with pytest.raises(ValueError, match="source split"):
        evaluator.validate_90s_frame(invalid[invalid["animal_id"] == 4], 4)


def test_readme_schedule_uses_published_round_second_anchor(tmp_path: Path):
    rows = ["| Animal ID | Farm Trial ID | Test | Collar Start Timestamp | Collar End Timestamp | Halter Start Timestamp | Halter End Timestamp |",
            "|---:|---:|:---|:---|:---|:---|:---|"]
    for animal in range(1, 19):
        trial = 1 if animal <= 6 else 2 if animal <= 10 else 3
        split = "Yes" if animal in {4, 10, 11} else "No"
        start = f"2020-01-{animal:02d} 12:00:00"
        end = f"2020-01-{animal:02d} 12:10:00"
        rows.append(f"| {animal} | {trial} | {split} | {start} | {end} | {start} | {end} |")
    path = tmp_path / "Readme.md"
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    parsed = processor.read_schedule(path)
    assert parsed[12]["anchor"] == datetime(2020, 1, 12, 12, 0)
    assert parsed[12]["sourceSplit"] == "source_train"


def test_reproducibility_record_hashes_ordered_source_test_rows_and_predictions():
    frame = pd.DataFrame([row(4, 7, target=1), row(4, 8, target=2)])
    result = evaluator.reproducibility_record({
        "finalSourceTest": {"predictions": {
            "training_majority_baseline": [0, 0], "random_forest_fixed": [1, 2]
        }}
    }, frame)
    assert result["randomSeed"] == 20261013
    assert result["randomForestParameters"]["n_estimators"] == 200
    assert len(result["testRowsSha256"]) == 64
    assert len(result["testLabelsSha256"]) == 64
    assert len(result["testPredictionSha256"]["random_forest_fixed"]) == 64
    assert result["python"] and result["scikitLearn"]
    with pytest.raises(ValueError, match="one prediction per ordered test row"):
        evaluator.reproducibility_record({"finalSourceTest": {"predictions": {
            "random_forest_fixed": [1]
        }}}, frame)

