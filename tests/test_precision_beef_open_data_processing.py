"""Fixture audits for the Precision Beef streaming processor."""
from __future__ import annotations

import csv
import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/process_precision_beef_open_data.py"
SPEC = importlib.util.spec_from_file_location("precision_beef_processing", MODULE_PATH)
PROCESSOR = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(PROCESSOR)


class RowsWriter:
    def __init__(self):
        self.rows = []

    def write(self, rows):
        self.rows.extend(rows)


def write_csv(path: Path, header: list[str], rows: list[list[object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(header)
        writer.writerows(rows)


def paired_fixture(tmp_path: Path, collar_rows, halter_rows):
    collar = tmp_path / "accel-01.csv"
    halter = tmp_path / "halter-01.csv"
    write_csv(collar, ["timestamp", "x", "y", "z"], collar_rows)
    write_csv(halter, ["timestamp", "classification"], halter_rows)
    writer = RowsWriter()
    report = PROCESSOR.aggregate_pair(collar, halter, 1, writer)
    return writer.rows, report


def test_exact_alignment_and_per_second_sensor_and_reference_aggregation(tmp_path):
    timestamps = [f"2020-01-01 00:00:00.{i:03d}" for i in range(0, 1000, 100)]
    collar = [[timestamp, i, i + 10, -i] for i, timestamp in enumerate(timestamps)]
    labels = [[timestamp, 2 if i < 6 else 1] for i, timestamp in enumerate(timestamps)]
    rows, report = paired_fixture(tmp_path, collar, labels)

    assert len(rows) == 1
    row = rows[0]
    assert row["n_exact_aligned_10hz_samples"] == 10
    assert row["n_complete_sensor_label_samples"] == 10
    assert row["is_complete_10hz_second"] is True
    assert row["x_mean_mg"] == 4.5
    assert row["x_min_mg"] == 0.0 and row["x_max_mg"] == 9.0
    assert row["reference_majority_class"] == 2
    assert row["reference_fraction_class_2"] == 0.6
    assert report["exactTimestampRows"] == 10
    assert report["collarOnlyTimestampRows"] == report["halterOnlyTimestampRows"] == 0
    # Sensor feature fields and reference outcome fields are disjoint.
    assert not any(name.startswith("reference_") for name in ("x_mean_mg", "y_mean_mg", "z_mean_mg"))


def test_missing_and_duplicate_timestamps_are_audited_without_interpolation(tmp_path):
    base = "2020-01-01 00:00:00."
    collar = [
        [base + "000", 1, 2, 3],
        [base + "100", 2, 3, 4],
        [base + "100", 3, 4, 5],  # ambiguous duplicate group is excluded
        [base + "300", "", 4, 5],  # exact pair exists, but a required sensor value is missing
    ]
    halter = [[base + "000", 0], [base + "100", 1], [base + "200", 2], [base + "300", 2]]
    rows, report = paired_fixture(tmp_path, collar, halter)

    assert report["collarDuplicateTimestampGroups"] == 1
    assert report["collarDuplicateRows"] == 2
    assert report["collarMissingByColumn"]["x"] == 1
    assert report["collarOnlyTimestampRows"] == 0
    assert report["halterOnlyTimestampRows"] == 1  # 200 ms has no collar observation
    assert report["exactTimestampRows"] == 3
    assert report["exactPairsWithMissingOrInvalidFields"] == 2  # duplicate and missing-value groups
    # One output second is preserved, flagged incomplete, with no fabricated values.
    assert len(rows) == 1
    assert rows[0]["is_complete_10hz_second"] is False
    assert rows[0]["x_mean_mg"] == 1.0


def test_partial_second_and_tied_reference_class_are_explicit(tmp_path):
    base = "2020-01-01 00:00:02."
    collar = [[base + f"{i * 100:03d}", i, i, i] for i in range(4)]
    halter = [[base + f"{i * 100:03d}", i % 2] for i in range(4)]
    rows, report = paired_fixture(tmp_path, collar, halter)

    assert report["aggregatedSeconds"] == 1
    assert report["incompleteOrPartiallyMissingSeconds"] == 1
    assert rows[0]["n_complete_sensor_label_samples"] == 4
    assert rows[0]["is_complete_10hz_second"] is False
    assert rows[0]["reference_majority_class"] is None
    assert rows[0]["reference_fraction_class_0"] == 0.5
    assert rows[0]["reference_fraction_class_1"] == 0.5


def test_schema_units_and_source_defined_split_metadata():
    row = PROCESSOR._SecondBucket(PROCESSOR.parse_timestamp("2020-01-01 00:00:00")).record(4, 1, "source_test")

    assert row["source_split"] == "source_test"
    assert row["animal_id"] == 4 and row["farm_trial_id"] == 1
    assert row["x_mean_mg"] is None
    assert row["reference_majority_class"] is None
    assert "x_std_population_mg" in row
    assert "reference_fraction_class_0" in row
    assert PROCESSOR.SOURCE_TEST_ANIMALS == {4, 10, 11}
    assert PROCESSOR.TRIAL_BY_ANIMAL[18] == 3


def test_source_timestamps_must_remain_timezone_naive():
    assert PROCESSOR.parse_timestamp("2020-01-01 00:00:00.100").tzinfo is None
    try:
        PROCESSOR.parse_timestamp("2020-01-01T00:00:00Z")
    except ValueError as error:
        assert "unexpected timezone" in str(error)
    else:
        raise AssertionError("timezone-aware timestamp must not be silently accepted")
