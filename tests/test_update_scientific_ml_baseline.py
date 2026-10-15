from __future__ import annotations

import copy
import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.science.evaluations.update_scientific_ml_baseline import (
    ALLOWED_REPORT,
    BASELINE_PATH,
    CPER_REPORT,
    ENGINE_SOURCE_FILES,
    SOURCE_AUDIT,
    SOURCE_DATA,
    BaselineChangeRequiresReview,
    engine_source_sha256,
    update_baseline,
)


ROOT = Path(__file__).resolve().parents[1]


class UpdateScientificMlBaselineTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.baseline_path = self.root / BASELINE_PATH
        self.report_path = self.root / ALLOWED_REPORT
        self.baseline_path.parent.mkdir(parents=True)
        self.report_path.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / BASELINE_PATH, self.baseline_path)
        shutil.copyfile(ROOT / ALLOWED_REPORT, self.report_path)
        source_audit_path = self.root / SOURCE_AUDIT
        source_audit_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / SOURCE_AUDIT, source_audit_path)
        source_data_path = self.root / SOURCE_DATA
        source_data_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / SOURCE_DATA, source_data_path)
        cper_path = self.root / CPER_REPORT
        cper_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / CPER_REPORT, cper_path)
        self.engine_directory = self.root / "src/client"
        self.engine_directory.mkdir(parents=True)
        for filename in ENGINE_SOURCE_FILES:
            shutil.copyfile(ROOT / "src/client" / filename, self.engine_directory / filename)
        self.baseline = json.loads(self.baseline_path.read_text(encoding="utf-8"))
        self.report = json.loads(self.report_path.read_text(encoding="utf-8"))
        self.report["source"]["integrityAuditSha256"] = hashlib.sha256(
            source_audit_path.read_bytes()
        ).hexdigest()
        self.write_report(self.report)
        self.baseline["files"][ALLOWED_REPORT]["bytes"] = self.report_path.stat().st_size
        self.baseline["files"][ALLOWED_REPORT]["sha256"] = hashlib.sha256(
            self.report_path.read_bytes()
        ).hexdigest()
        self.baseline_path.write_text(json.dumps(self.baseline, indent=2) + "\n", encoding="utf-8")
        self.initial_baseline_bytes = self.baseline_path.read_bytes()

        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "core.autocrlf", "false"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.name", "Baseline test"], cwd=self.root, check=True)
        subprocess.run(["git", "add", BASELINE_PATH, ALLOWED_REPORT], cwd=self.root, check=True)
        subprocess.run(["git", "commit", "-qm", "pin previous report"], cwd=self.root, check=True)

    def tearDown(self):
        self.tempdir.cleanup()

    def write_report(self, report):
        self.report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def provenance_refresh(self):
        report = copy.deepcopy(self.report)
        new_audit = b"regenerated CGREC audit provenance\n"
        (self.root / SOURCE_AUDIT).write_bytes(new_audit)
        crlf_audit = new_audit.replace(b"\n", b"\r\n")
        report["source"]["integrityAuditSha256"] = hashlib.sha256(crlf_audit).hexdigest()
        source_file = self.engine_directory / ENGINE_SOURCE_FILES[0]
        source_file.write_bytes(source_file.read_bytes() + b"\n// provenance refresh fixture\n")
        new_engine_sha256 = engine_source_sha256(self.root)
        report["transferFromCper"]["cperEngineSha256"] = new_engine_sha256
        report["transferFromCper"]["engineSha256"] = new_engine_sha256
        cper_report = json.loads((self.root / CPER_REPORT).read_text(encoding="utf-8"))
        cper_report["engine"]["sha256"] = new_engine_sha256
        (self.root / CPER_REPORT).write_text(json.dumps(cper_report, indent=2) + "\n", encoding="utf-8")
        return report

    def test_correct_report_updates_exact_bytes_and_sha256(self):
        self.write_report(self.provenance_refresh())
        result = update_baseline(self.root, ALLOWED_REPORT)
        actual = self.report_path.read_bytes()
        record = json.loads(self.baseline_path.read_text(encoding="utf-8"))["files"][ALLOWED_REPORT]
        self.assertEqual(record["bytes"], len(actual))
        self.assertEqual(record["sha256"], hashlib.sha256(actual).hexdigest())
        self.assertEqual(result["scientificDiff"], "none")

    def test_scientific_values_unchanged_pass(self):
        self.write_report(self.provenance_refresh())
        result = update_baseline(self.root, ALLOWED_REPORT)
        self.assertEqual(result["scientificDiff"], "none")

    def test_engine_bundle_provenance_fields_refresh_without_scientific_changes(self):
        legacy = copy.deepcopy(self.report)
        legacy["transferFromCper"]["engineSha256"] = "e89971206a05c3a31f10b934be1150144a5d8c4ffe393954d3104ea1d9230569"
        legacy["transferFromCper"]["cperEngineSha256"] = legacy["transferFromCper"]["engineSha256"]
        legacy["transferFromCper"]["engineSourceFiles"] = [
            "engine.js", "feeding-model.js", "environment-model.js", "metabolism-wasm.js",
        ]
        self.write_report(legacy)
        self.baseline["files"][ALLOWED_REPORT]["bytes"] = self.report_path.stat().st_size
        self.baseline["files"][ALLOWED_REPORT]["sha256"] = hashlib.sha256(
            self.report_path.read_bytes()
        ).hexdigest()
        self.baseline_path.write_text(json.dumps(self.baseline, indent=2) + "\n", encoding="utf-8")
        subprocess.run(["git", "add", BASELINE_PATH, ALLOWED_REPORT], cwd=self.root, check=True)
        subprocess.run(["git", "commit", "-qm", "pin legacy engine provenance"], cwd=self.root, check=True)

        self.write_report(self.provenance_refresh())
        result = update_baseline(self.root, ALLOWED_REPORT)
        self.assertEqual(
            result["oldBytes"],
            self.baseline["files"][ALLOWED_REPORT]["bytes"],
        )
        self.assertEqual(result["scientificDiff"], "none")

    def assert_scientific_change_fails(self, mutate):
        report = self.provenance_refresh()
        mutate(report)
        self.write_report(report)
        with self.assertRaisesRegex(BaselineChangeRequiresReview, "SCIENTIFIC_BASELINE_CHANGE_REQUIRES_REVIEW"):
            update_baseline(self.root, ALLOWED_REPORT)
        self.assertEqual(self.baseline_path.read_bytes(), self.initial_baseline_bytes)

    def test_changed_metric_fails(self):
        self.assert_scientific_change_fails(
            lambda report: report["evaluation"]["rows"][0].__setitem__(
                "defaultEngineAdgKgPerDay",
                report["evaluation"]["rows"][0]["defaultEngineAdgKgPerDay"] + 0.01,
            )
        )

    def test_changed_expected_value_fails(self):
        self.assert_scientific_change_fails(
            lambda report: report["evaluation"]["cperCalibrated80IntervalTransport"].__setitem__(
                "cperThresholdKgPerHeadDay",
                report["evaluation"]["cperCalibrated80IntervalTransport"]["cperThresholdKgPerHeadDay"] + 0.01,
            )
        )

    def test_changed_cohort_fails(self):
        self.assert_scientific_change_fails(
            lambda report: report["evaluation"].__setitem__("population", "different population")
        )

    def test_changed_dataset_identity_fails(self):
        self.assert_scientific_change_fails(
            lambda report: report["source"].__setitem__("doi", "10.0000/different")
        )

    def test_integrity_audit_digest_mismatch_fails_closed(self):
        report = copy.deepcopy(self.report)
        report["source"]["integrityAuditSha256"] = "c" * 64
        self.write_report(report)
        with self.assertRaisesRegex(BaselineChangeRequiresReview, "integrity-audit digest"):
            update_baseline(self.root, ALLOWED_REPORT)
        self.assertEqual(self.baseline_path.read_bytes(), self.initial_baseline_bytes)

    def test_engine_bundle_identity_mismatch_fails_closed(self):
        report = self.provenance_refresh()
        report["transferFromCper"]["engineSha256"] = "c" * 64
        self.write_report(report)
        with self.assertRaisesRegex(BaselineChangeRequiresReview, "current engine source bundle"):
            update_baseline(self.root, ALLOWED_REPORT)
        self.assertEqual(self.baseline_path.read_bytes(), self.initial_baseline_bytes)

    def test_changed_eligibility_fails(self):
        self.assert_scientific_change_fails(lambda report: report.__setitem__("validated", True))

    def test_wrong_report_path_fails(self):
        with self.assertRaisesRegex(BaselineChangeRequiresReview, "not allowlisted"):
            update_baseline(self.root, str(self.report_path))

    def test_non_allowlisted_report_fails(self):
        with self.assertRaisesRegex(BaselineChangeRequiresReview, "not allowlisted"):
            update_baseline(self.root, "docs/evidence/another-report.json")

    def test_deterministic_rerun_produces_no_diff(self):
        self.write_report(self.provenance_refresh())
        update_baseline(self.root, ALLOWED_REPORT)
        after_first = self.baseline_path.read_bytes()
        update_baseline(self.root, ALLOWED_REPORT)
        self.assertEqual(self.baseline_path.read_bytes(), after_first)

    def test_baseline_changes_only_allowlisted_metadata(self):
        self.write_report(self.provenance_refresh())
        before = json.loads(self.baseline_path.read_text(encoding="utf-8"))
        update_baseline(self.root, ALLOWED_REPORT)
        after = json.loads(self.baseline_path.read_text(encoding="utf-8"))
        expected = copy.deepcopy(before)
        expected["files"][ALLOWED_REPORT]["bytes"] = self.report_path.stat().st_size
        expected["files"][ALLOWED_REPORT]["sha256"] = hashlib.sha256(self.report_path.read_bytes()).hexdigest()
        self.assertEqual(after, expected)


if __name__ == "__main__":
    unittest.main()
