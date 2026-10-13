"""Fixture audits for the Precision Beef streaming processor."""
from __future__ import annotations

import csv
import importlib.util
import json
import sys
import types
from pathlib import Path
from unittest.mock import patch


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
    assert report["exactTimestampGroups"] == 10
    assert report["temporalCoverageDenominator"].startswith("not estimated")
    assert report["complete10HzFractionAmongEmittedSeconds"] == 1.0
    assert report["tiedMajoritySeconds"] == 0
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
    assert report["exactTimestampGroups"] == 3
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
    assert report["tiedMajoritySeconds"] == 1
    assert report["tiedMajorityFractionAmongEmittedSeconds"] == 1.0


def test_bounded_event_time_buffer_restores_small_late_row_without_changing_join(tmp_path):
    timestamps = [f"2020-01-01 00:00:00.{i:03d}" for i in range(0, 1000, 100)]
    order = [0, 1, 3, 2, 4, 5, 6, 7, 8, 9]
    collar = [[timestamps[i], i, i + 1, i + 2] for i in order]
    halter = [[timestamp, i % 3] for i, timestamp in enumerate(timestamps)]
    rows, report = paired_fixture(tmp_path, collar, halter)

    assert len(rows) == 1
    assert rows[0]["is_complete_10hz_second"] is True
    assert report["collarOutOfOrderRows"] == 1
    assert report["collarMaxReorderLagSeconds"] == 0.1
    assert report["exactTimestampGroups"] == 10


def test_event_time_buffer_rejects_late_rows_beyond_one_second(tmp_path):
    collar = [
        ["2020-01-01 00:00:00.000", 1, 2, 3],
        ["2020-01-01 00:00:02.000", 2, 3, 4],
        ["2020-01-01 00:00:00.500", 3, 4, 5],
    ]
    halter = [["2020-01-01 00:00:00.000", 0]]
    try:
        paired_fixture(tmp_path, collar, halter)
    except ValueError as error:
        assert "exceeds the bounded 1s reorder window" in str(error)
    else:
        raise AssertionError("large timestamp disorder must be rejected")


def test_emitted_second_fraction_does_not_claim_temporal_coverage(tmp_path):
    # The whole second at 03:00 is absent from both files; the processor must
    # not invent it or use it as a denominator for temporal coverage.
    timestamps = ["2020-01-01 00:00:00.000", "2020-01-01 00:00:04.000"]
    collar = [[timestamp, 1, 2, 3] for timestamp in timestamps]
    halter = [[timestamp, 0] for timestamp in timestamps]
    rows, report = paired_fixture(tmp_path, collar, halter)

    assert len(rows) == 2
    assert report["aggregatedSeconds"] == 2
    assert report["incompleteOrPartiallyMissingSeconds"] == 2
    assert report["complete10HzFractionAmongEmittedSeconds"] == 0.0
    assert report["temporalCoverageDenominator"].startswith("not estimated")


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


def test_custom_output_directory_owns_quality_report_and_does_not_update_global_registry(tmp_path, monkeypatch):
    raw = tmp_path / "raw"
    out = tmp_path / "custom-output"
    manifest_path = tmp_path / "custom-manifest.json"
    global_report = tmp_path / "global-processing-report.json"
    global_manifest = tmp_path / "global-manifest.json"
    manifest_files = []
    raw.mkdir()
    for animal in range(1, 19):
        timestamp = "2020-01-01 00:00:00.000"
        collar = raw / f"accel-{animal:02d}.csv"
        halter = raw / f"halter-{animal:02d}.csv"
        write_csv(collar, ["timestamp", "x", "y", "z"], [[timestamp, 1, 2, 3]])
        write_csv(halter, ["timestamp", "classification"], [[timestamp, 0]])
        for path in (collar, halter):
            manifest_files.append({"name": path.name, "verifiedSha256": PROCESSOR.file_sha256(path)})
    manifest_path.write_text(json.dumps({
        "source": {"doi": "10.5281/zenodo.4064802", "license": "CC BY 4.0"},
        "files": manifest_files,
    }), encoding="utf-8")

    class FakeWriter:
        def __init__(self, path):
            self.path = path
            self.content = []

        def write(self, rows):
            self.content.extend(rows)

        def close(self):
            self.path.write_text(json.dumps(self.content), encoding="utf-8")

    monkeypatch.setattr(PROCESSOR, "_ParquetBatchWriter", FakeWriter)
    monkeypatch.setattr(PROCESSOR, "REGISTRY_REPORT_PATH", global_report)
    monkeypatch.setattr(PROCESSOR, "MANIFEST_PATH", global_manifest)
    with patch.dict(sys.modules, {"pyarrow": types.ModuleType("pyarrow")}):
        report = PROCESSOR.process_all(raw, out, manifest_path)

    quality_path = out / "quality-report.json"
    saved_report = json.loads(quality_path.read_text(encoding="utf-8"))
    assert saved_report["qualityReportPath"] == str(quality_path.resolve())
    assert report["qualityReportPath"] == str(quality_path.resolve())
    assert not global_report.exists()
    assert not global_manifest.exists()


def test_cli_prints_quality_report_path_from_selected_output_directory(tmp_path, capsys, monkeypatch):
    out = tmp_path / "selected-output"
    report_path = str((out / "quality-report.json").resolve())
    monkeypatch.setattr(PROCESSOR, "process_all", lambda raw, output, manifest: {
        "qualityReportPath": report_path,
        "animalCount": 18,
        "outputs": ["animal-01.parquet"],
    })

    result = PROCESSOR.main(["--output-dir", str(out), "--raw-dir", str(tmp_path / "raw"), "--manifest", str(tmp_path / "manifest.json")])

    assert result == 0
    assert json.loads(capsys.readouterr().out.splitlines()[-1])["report"] == report_path
