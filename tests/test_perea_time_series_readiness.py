import csv
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.science.behavior.perea_time_series import canonical_observation_sha256, read_canonical_rows


def write_csv(path, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Breed", "ID", "Time.MTD", "MI", "State", "Behavior"])
        writer.writerows(rows)


class PereaReadinessTests(unittest.TestCase):
    def test_duplicate_policy_gap_windows_and_boundary_censoring(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.csv"
            write_csv(path, [
                ["AH", "1", "06/30/2022 10:00", "2", "AC", "GR"],
                ["AH", "1", "06/30/2022 10:00", "4", "AC", "GR"],
                ["AH", "1", "06/30/2022 10:01", "5", "ST", "RE"],
                ["AH", "1", "06/30/2022 10:02", "5", "AC", "WA"],
                ["AH", "1", "06/30/2022 10:02", "6", "ST", "RU"],
                ["AH", "1", "06/30/2022 10:05", "7", "ST", "RU"],
            ])
            rows, audit = read_canonical_rows(path, expected_md5=None)
            self.assertEqual(audit["sourceRows"], 6)
            self.assertEqual(audit["animalMinuteKeys"], 4)
            self.assertEqual(audit["repeatedAnimalMinuteKeys"], 2)
            self.assertEqual(audit["conflictingLabelKeys"], 1)
            self.assertEqual(audit["analysisRows"], 3)
            self.assertEqual(rows[0]["motion_index"], 3)
            from scripts.science.behavior.perea_time_series import _summarize_runs
            windows, runs = _summarize_runs(rows)
            self.assertEqual(len(windows), 2)
            self.assertEqual([w["observedMinutes"] for w in windows], [2, 1])
            self.assertTrue(runs[0]["leftBoundaryCensored"])
            self.assertTrue(runs[1]["rightBoundaryCensored"])

    def test_report_is_deterministic_and_describes_timezone_and_carry_forward(self):
        audit_script = ROOT / "scripts/science/source-audits/audit_perea_time_series_readiness.py"
        output = ROOT / "docs/evidence/perea-time-series-readiness.json"
        subprocess.run([sys.executable, str(audit_script)], cwd=ROOT, check=True, capture_output=True, text=True)
        first = output.read_bytes()
        report = json.loads(first)
        subprocess.run([sys.executable, str(audit_script)], cwd=ROOT, check=True, capture_output=True, text=True)
        self.assertEqual(first, output.read_bytes())
        self.assertEqual(report["preprocessing"]["sourceRows"], 9222)
        self.assertEqual(report["preprocessing"]["repeatedAnimalMinuteKeys"], 290)
        self.assertEqual(report["preprocessing"]["excessRowsAtRepeatedKeys"], 304)
        self.assertEqual(report["preprocessing"]["conflictingLabelKeys"], 54)
        self.assertEqual(report["preprocessing"]["analysisRows"], 8864)
        self.assertEqual(report["coverage"]["animals"], 24)
        self.assertEqual(report["coverage"]["complete24HourWindows"], 0)
        self.assertIn("no UTC offset", report["coverage"]["timeZone"])
        self.assertIn("shorter than 30 seconds", report["annotationLimitations"]["carryForward"])
        self.assertFalse(report["compatibility"]["modelFittingPerformed"])
        self.assertEqual(report["source"]["sha256"], hashlib.sha256((ROOT / report["source"]["file"]).read_bytes()).hexdigest())

    def test_rows_match_legacy_classifier_reader(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        import evaluate_perea_behavior_grouped as legacy

        new_rows, new_audit = read_canonical_rows(ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv")
        old_rows, old_audit = legacy.read_observations()
        projection = lambda rows: [(r["group_id"], r["timestamp"].isoformat(timespec="minutes"),
                                    r["motion_index"], r["state"], r["behavior"], r["source_rows"])
                                   for r in rows]
        self.assertEqual(projection(new_rows), projection(old_rows))
        self.assertEqual(canonical_observation_sha256(new_rows), canonical_observation_sha256(old_rows))
        self.assertEqual(new_audit["analysisRows"], old_audit["analysisRows"])
        self.assertEqual(new_audit["conflictingLabelKeys"], old_audit["conflictingLabelTimestampKeys"])


if __name__ == "__main__":
    unittest.main()
