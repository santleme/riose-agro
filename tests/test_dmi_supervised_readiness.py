import importlib.util
import json
import tempfile
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
        self.assertEqual(matrix["reviewedSourceCount"], 28)
        self.assertEqual(matrix["eligibleSourcesForTarget"], 0)
        self.assertEqual(matrix["conditionalSourcesForTarget"], 0)
        self.assertEqual(matrix["ineligibleOrUnavailableSourcesForTarget"], 28)
        VALIDATOR.validate(self.report)

    def test_dryad_yearling_candidate_is_included_but_ineligible_for_model_training(self):
        matrix_path = ROOT / self.report["reviewedMatrix"]["path"]
        matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
        source = next(item for item in matrix["sources"] if item["id"] == "dryad-grazing-yearlings")
        self.assertEqual(source["outcomes"]["dmi"]["status"], "ineligible")
        self.assertFalse(source["outcomes"]["dmi"]["trainable"])
        self.assertEqual(source["outcomes"]["adg"]["status"], "ineligible")
        self.assertFalse(source["outcomes"]["adg"]["trainable"])
        self.assertEqual(source["counts"]["trials"]["value"], 4)
        self.assertIn("cannot be assigned", source["counts"]["trials"]["definition"])
        self.assertEqual(matrix["processing"]["sourceCount"], 28)
        self.assertEqual(self.report["reviewedMatrix"]["eligibleSourcesForTarget"], 0)
        self.assertEqual(self.report["reviewedMatrix"]["conditionalSourcesForTarget"], 0)
        self.assertEqual(self.report["reviewedMatrix"]["ineligibleOrUnavailableSourcesForTarget"], 28)
        soares = next(item for item in matrix["sources"] if item["id"] == "pasture-dmi-triage-soares-2026-holstein-gyr")
        self.assertEqual(soares["outcomes"]["dmi"]["status"], "ineligible")
        self.assertFalse(soares["outcomes"]["dmi"]["trainable"])
        candidate = next(item for item in self.report["candidateEvidence"] if item["id"] == "dryad-dbrv15fg8-yearling-adg")
        self.assertIn("already represented in the 28-source", candidate["decision"])
        self.assertIn("not the frozen engine ADG evaluation", candidate["outcomeFit"])
        VALIDATOR.validate(self.report)

    def test_cattlesat_model_outputs_are_not_promoted_to_observed_dmi_rows(self):
        matrix_path = ROOT / self.report["reviewedMatrix"]["path"]
        matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
        source = next(item for item in matrix["sources"] if item["id"] == "pasture-dmi-triage-cattlesat-2026")
        self.assertEqual(source["outcomes"]["dmi"]["status"], "ineligible")
        self.assertFalse(source["outcomes"]["dmi"]["trainable"])
        self.assertIn("Simulated outputs", source["outcomes"]["dmi"]["reason"])
        reference = source["references"]["sourceAssessment"]
        self.assertTrue(reference.endswith("#/sources/18"))
        triage = json.loads((ROOT / "docs/evidence/public-pasture-dmi-source-triage-2026-10.json").read_text(encoding="utf-8"))
        cattlesat = triage["sources"][18]
        self.assertFalse(cattlesat["individualDataRetrieved"])
        self.assertIn("no human or animal subjects", cattlesat["reportedPopulation"])

    def test_human_readable_gate_report_matches_the_current_source_count(self):
        markdown = (ROOT / "docs/evidence/dmi-supervised-readiness-2026-10.md").read_text(encoding="utf-8")
        self.assertIn("matriz de 28 fontes", markdown)
        self.assertIn("28 ineligíveis ou indisponíveis", markdown)
        candidate = next(item for item in self.report["candidateEvidence"] if item["id"] == "dmi-adg-readiness-matrix")
        self.assertIn("28-source matrix", candidate["decision"])

    def test_target_counts_must_classify_every_reviewed_source(self):
        self.report["reviewedMatrix"]["ineligibleOrUnavailableSourcesForTarget"] -= 1
        with self.assertRaisesRegex(ValueError, "classify every reviewed source exactly once"):
            VALIDATOR.validate(self.report)

    def test_matrix_reference_cannot_escape_repository_root(self):
        self.report["reviewedMatrix"]["path"] = "../outside-readiness.json"
        with self.assertRaisesRegex(ValueError, "escapes repository root"):
            VALIDATOR.validate(self.report)

    def test_matrix_reference_cannot_escape_through_symlink(self):
        link = ROOT / ".tmp-readiness-matrix-link.json"
        try:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json") as outside:
                outside.write("{}")
                outside.flush()
                link.symlink_to(Path(outside.name))
                self.report["reviewedMatrix"]["path"] = link.name
                with self.assertRaisesRegex(ValueError, "escapes repository root"):
                    VALIDATOR.validate(self.report)
        finally:
            link.unlink(missing_ok=True)

    def test_target_must_keep_total_dmi_population_and_unit_explicit(self):
        self.report["estimand"]["outcome"] = "DMI in kg per day"
        with self.assertRaisesRegex(ValueError, "define total DMI"):
            VALIDATOR.validate(self.report)

    def test_split_must_preserve_study_and_animal_groups(self):
        self.report["eligibility"]["splitUnit"] = "Randomly split animal-period rows."
        with self.assertRaisesRegex(ValueError, "preserve study and animal groups"):
            VALIDATOR.validate(self.report)

    def test_candidate_source_link_must_resolve_inside_repository(self):
        self.report["candidateEvidence"][0]["source"] = "docs/evidence/not-a-real-source.json"
        with self.assertRaisesRegex(ValueError, "missing source evidence"):
            VALIDATOR.validate(self.report)

    def test_no_go_reopens_when_target_matched_dataset_is_available(self):
        self.report["nextEvidenceRequired"] = ["A dataset was located."]
        with self.assertRaisesRegex(ValueError, "target-matched reusable dataset"):
            VALIDATOR.validate(self.report)


if __name__ == "__main__":
    unittest.main()
