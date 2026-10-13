import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/build_dmi_adg_readiness.py"
FIXTURE = ROOT / "tests/fixtures/dmi-readiness/mixed-sources.json"
REPORT = ROOT / "docs/evidence/dmi-adg-readiness-v1.json"
SPEC = importlib.util.spec_from_file_location("dmi_adg_readiness", SCRIPT)
READINESS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(READINESS)


class ReadinessFixtureTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.read_reference = self.fixture["evidenceFiles"].__getitem__

    def build(self, sources=None):
        return READINESS.build_readiness_report(
            sources if sources is not None else self.fixture["sources"],
            self.read_reference,
            domain_expert_review=self.fixture["domainExpertReview"],
            elapsed_seconds=0.25,
        )

    def test_mixed_public_private_absent_label_and_missing_license(self):
        report = self.build()
        records = {record["id"]: record for record in report["sources"]}

        public = records["public-with-dmi"]
        self.assertEqual(public["outcomes"]["dmi"]["status"], "conditional")
        self.assertTrue(public["outcomes"]["dmi"]["trainable"])
        self.assertEqual(public["studyDesign"]["value"], "randomized block experiment")
        self.assertEqual(public["counts"]["animals"]["value"], 6)
        self.assertEqual(public["counts"]["trials"]["value"], 2)
        self.assertEqual(public["missingness"]["documentedMetrics"]["value"], {"missingDmiRows": 1})

        private = records["private-source"]
        self.assertEqual(private["outcomes"]["dmi"]["status"], "ineligible")
        self.assertFalse(private["outcomes"]["dmi"]["trainable"])
        self.assertIn("inaccessible", private["outcomes"]["dmi"]["reason"])

        no_label = records["source-without-label"]
        self.assertEqual(no_label["outcomes"]["dmi"]["status"], "ineligible")
        self.assertIn("No individual DMI outcome", no_label["outcomes"]["dmi"]["reason"])

        no_license = records["source-without-license"]
        self.assertIsNone(no_license["sourceIdentity"]["license"])
        self.assertEqual(no_license["outcomes"]["dmi"]["status"], "ineligible")
        self.assertFalse(no_license["outcomes"]["dmi"]["trainable"])
        self.assertIn("license is absent", no_license["outcomes"]["dmi"]["reason"])

    def test_undocumented_design_counts_and_missingness_remain_unknown(self):
        report = self.build()
        no_label = next(record for record in report["sources"] if record["id"] == "source-without-label")
        self.assertIsNone(no_label["studyDesign"]["value"])
        self.assertIsNone(no_label["counts"]["animals"]["value"])
        self.assertIsNone(no_label["counts"]["animalObservationUnits"]["value"])
        self.assertIsNone(no_label["counts"]["trials"]["value"])
        self.assertIsNone(no_label["missingness"]["documentedMetrics"]["value"])

    def test_evidence_json_pointers_must_resolve(self):
        sources = json.loads(json.dumps(self.fixture["sources"]))
        sources[0]["reportedFacts"]["animals"]["reference"] = "public-audit.json#/coverage/animalCounnt"
        with self.assertRaisesRegex(ValueError, "Unresolved JSON Pointer"):
            self.build(sources)

    def test_json_pointer_uses_rfc6901_escapes_and_array_indices(self):
        self.assertEqual(
            READINESS._resolve_json_pointer({"nested/key": [{"~field": "value"}]}, "/nested~1key/0/~0field", "fixture.json#/nested~1key/0/~0field"),
            "value",
        )
        with self.assertRaisesRegex(ValueError, "Invalid JSON Pointer escape"):
            READINESS._resolve_json_pointer({"x~2y": 1}, "/x~2y", "fixture.json#/x~2y")

    def test_source_order_and_markdown_are_stable_for_reordered_inputs(self):
        sources = self.fixture["sources"]
        first = self.build(sources)
        second = self.build(list(reversed(sources)))
        self.assertEqual(first["sources"], second["sources"])
        self.assertEqual(first["processing"], second["processing"])
        self.assertEqual(READINESS.render_markdown(first), READINESS.render_markdown(second))
        self.assertEqual([source["id"] for source in first["sources"]], sorted(source["id"] for source in sources))
        self.assertIn("Desenho documentado", READINESS.render_markdown(first))
        self.assertIn("Trials documentados", READINESS.render_markdown(first))

    def test_published_contract_rejects_missing_decisions_and_expert_attribution(self):
        report = self.build()
        READINESS.validate_readiness_report(report)

        checked_in_report = json.loads(REPORT.read_text(encoding="utf-8"))
        READINESS.validate_readiness_report(checked_in_report)

        missing_reason = json.loads(json.dumps(report))
        missing_reason["sources"][0]["outcomes"]["dmi"]["reason"] = "  "
        with self.assertRaisesRegex(ValueError, "decision reason"):
            READINESS.validate_readiness_report(missing_reason)

        missing_attribution = json.loads(json.dumps(report))
        missing_attribution["domainExpertReview"]["attributionNote"] = ""
        with self.assertRaisesRegex(ValueError, "attribution"):
            READINESS.validate_readiness_report(missing_attribution)

    def test_published_contract_rejects_duplicate_ids_and_trainable_private_sources(self):
        report = self.build()
        duplicate_id = json.loads(json.dumps(report))
        duplicate_id["sources"][1]["id"] = duplicate_id["sources"][0]["id"]
        with self.assertRaisesRegex(ValueError, "uniquely sorted"):
            READINESS.validate_readiness_report(duplicate_id)

        private = next(source for source in report["sources"] if source["access"] != "available_local")
        private["outcomes"]["dmi"]["status"] = "conditional"
        private["outcomes"]["dmi"]["trainable"] = True
        with self.assertRaisesRegex(ValueError, "Unavailable source"):
            READINESS.validate_readiness_report(report)


if __name__ == "__main__":
    unittest.main()
