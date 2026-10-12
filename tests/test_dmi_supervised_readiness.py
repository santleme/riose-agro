import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/validate_dmi_supervised_readiness.py"
REPORT = ROOT / "docs/evidence/dmi-supervised-readiness-2026-10.json"
SPEC = importlib.util.spec_from_file_location("dmi_supervised_readiness", SCRIPT)
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


class SupervisedReadinessReportTests(unittest.TestCase):
    def setUp(self):
        self.report = json.loads(REPORT.read_text(encoding="utf-8"))

    def test_current_report_accounts_for_every_source_for_the_target(self):
        matrix = self.report["reviewedMatrix"]
        self.assertEqual(matrix["reviewedSourceCount"], 18)
        self.assertEqual(matrix["eligibleSourcesForTarget"], 0)
        self.assertEqual(matrix["conditionalSourcesForTarget"], 0)
        self.assertEqual(matrix["ineligibleOrUnavailableSourcesForTarget"], 18)
        VALIDATOR.validate(self.report)

    def test_target_counts_must_classify_every_reviewed_source(self):
        self.report["reviewedMatrix"]["ineligibleOrUnavailableSourcesForTarget"] -= 1
        with self.assertRaisesRegex(ValueError, "classify every reviewed source exactly once"):
            VALIDATOR.validate(self.report)


if __name__ == "__main__":
    unittest.main()
