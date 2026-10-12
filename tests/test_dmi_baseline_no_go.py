import copy
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_dmi_baseline_no_go import REPORT, validate  # noqa: E402


with REPORT.open(encoding="utf-8") as stream:
    REPORT_DATA = json.load(stream)


class BaselineNoGoReportTest(unittest.TestCase):
    def test_current_evidence_validates_as_unsigned_no_go(self):
        validate(REPORT_DATA)

    def test_unmeasured_metrics_cannot_be_zero_error(self):
        report = copy.deepcopy(REPORT_DATA)
        report["heldOutEvaluation"]["metrics"]["maeKgDMPerAnimalDay"] = 0
        with self.assertRaisesRegex(ValueError, "unmeasured metrics must be null"):
            validate(report)

    def test_no_go_cannot_claim_a_fitted_predictor_or_final_signoff(self):
        report = copy.deepcopy(REPORT_DATA)
        report["candidateModels"][1]["status"] = "fit"
        with self.assertRaisesRegex(ValueError, "predictive baseline must remain unfit"):
            validate(report)

        report = copy.deepcopy(REPORT_DATA)
        report["decisionStatus"] = "final_signed_off"
        with self.assertRaisesRegex(ValueError, "do not imply a signed-off"):
            validate(report)


if __name__ == "__main__":
    unittest.main()
