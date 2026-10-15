import copy
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/science/readiness"))
from validate_dmi_baseline_no_go import REPORT, validate  # noqa: E402


with REPORT.open(encoding="utf-8") as stream:
    REPORT_DATA = json.load(stream)
with (ROOT / "docs/evidence/dmi-supervised-readiness-2026-10.json").open(encoding="utf-8") as stream:
    READINESS_DATA = json.load(stream)


class BaselineNoGoReportTest(unittest.TestCase):
    def test_current_evidence_validates_as_evidence_based_no_go(self):
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
        with self.assertRaisesRegex(ValueError, "do not imply a scientific endorsement"):
            validate(report)

    def test_no_go_cannot_claim_training_or_load_readiness_outside_repository(self):
        report = copy.deepcopy(REPORT_DATA)
        report["performance"]["modelTrainingPerformed"] = True
        with self.assertRaisesRegex(ValueError, "no training should be claimed"):
            validate(report)

        report = copy.deepcopy(REPORT_DATA)
        report["sourceReadiness"]["path"] = "../outside-readiness.json"
        with self.assertRaisesRegex(ValueError, "missing or unsafe source-readiness report"):
            validate(report)

    def test_linked_readiness_report_must_pass_its_full_gate(self):
        readiness = copy.deepcopy(READINESS_DATA)
        readiness["reviewedMatrix"]["eligibleSourcesForTarget"] = 1
        readiness["reviewedMatrix"]["ineligibleOrUnavailableSourcesForTarget"] -= 1
        with self.assertRaisesRegex(ValueError, "eligible source count must be zero"):
            validate(copy.deepcopy(REPORT_DATA), readiness)

    def test_evaluation_must_keep_all_required_metrics_explicitly_unmeasured(self):
        report = copy.deepcopy(REPORT_DATA)
        del report["heldOutEvaluation"]["metrics"]["rmseKgDMPerAnimalDay"]
        with self.assertRaisesRegex(ValueError, "declare every required metric"):
            validate(report)

    def test_leakage_split_must_keep_studies_and_repeated_animals_together(self):
        report = copy.deepcopy(REPORT_DATA)
        report["leakageAudit"]["requiredSplitUnit"] = "random animal-period rows"
        with self.assertRaisesRegex(ValueError, "group whole studies or trials"):
            validate(report)


if __name__ == "__main__":
    unittest.main()
