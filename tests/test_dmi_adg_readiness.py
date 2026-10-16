import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/science/readiness/build_dmi_adg_readiness.py"
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

    def test_published_contract_rejects_non_finite_processing_time(self):
        report = self.build()
        for elapsed in (float("nan"), float("inf"), float("-inf")):
            invalid = json.loads(json.dumps(report))
            invalid["processing"]["elapsedSeconds"] = elapsed
            with self.subTest(elapsed=elapsed):
                with self.assertRaisesRegex(ValueError, "elapsedSeconds"):
                    READINESS.validate_readiness_report(invalid)

    def test_recent_near_miss_candidates_are_cited_but_not_trainable(self):
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        records = {source["id"]: source for source in report["sources"]}
        expected = {
            "pasture-dmi-triage-ancp-nellore-1539056",
            "pasture-dmi-triage-teagasc-2019-williams",
            "pasture-dmi-triage-soares-2026-holstein-gyr",
        }
        self.assertTrue(expected.issubset(records))
        for source_id in expected:
            with self.subTest(source=source_id):
                source = records[source_id]
                self.assertEqual(source["outcomes"]["dmi"]["status"], "ineligible")
                self.assertFalse(source["outcomes"]["dmi"]["trainable"])
                if source_id == "pasture-dmi-triage-soares-2026-holstein-gyr":
                    self.assertIn("dairy cows are outside", source["outcomes"]["dmi"]["reason"])
                    self.assertIn("total DMI including forage and supplement", source["outcomes"]["dmi"]["reason"])
                self.assertIn(
                    "public-pasture-dmi-source-triage-2026-10.json#/sources/",
                    source["references"]["sourceAssessment"],
                )
        READINESS.validate_readiness_report(report)

    def test_component_assessments_add_module_readiness_without_changing_legacy_dmi_adg_rows(self):
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        READINESS.validate_readiness_report(report)
        records = {item["id"]: item for item in report["componentAssessments"]}

        dryad = records["dryad-mob-rotational-biomass"]
        self.assertEqual(dryad["decision"], "CONDITIONAL")
        self.assertEqual(dryad["metrics"]["externalRows"], 64)
        self.assertAlmostEqual(dryad["metrics"]["externalMaeKgDmHa"], 2507.1157652653906)
        self.assertIn("not identical sampling estimands", " ".join(dryad["limitations"]))
        self.assertIn("confounded with management", " ".join(dryad["limitations"]))

        perea = records["perea-rangeland-behavior"]
        self.assertEqual(perea["decision"], "ELIGIBLE")
        self.assertEqual(perea["metrics"]["nestedRows"], 5582)
        self.assertEqual(perea["metrics"]["selectedCandidatesAcrossOuterFolds"], {"cart_depth_4": 4, "temporal_logistic_c_10": 2})
        self.assertAlmostEqual(perea["metrics"]["nestedEqualAnimalMeanF1_RE_RU"], 0.4025871778670964)
        self.assertAlmostEqual(perea["metrics"]["nestedEqualAnimalMacroF1"], 0.665958419440892)
        self.assertAlmostEqual(perea["metrics"]["nestedEqualAnimalRecall_RE"], 0.3081198933322601)
        self.assertAlmostEqual(perea["metrics"]["nestedEqualAnimalRecall_RU"], 0.7265047037876734)
        self.assertAlmostEqual(perea["metrics"]["nestedObservationWeightedAccuracy"], 0.813686850591186)
        self.assertNotIn("equalAnimalMacroF1", perea["metrics"])
        prior = perea["previousStaticGroupedOof"]
        self.assertEqual(prior["sourceReport"], "docs/evidence/perea-behavior-grouped-evaluation.json")
        self.assertEqual(prior["rows"], 8864)
        self.assertAlmostEqual(prior["equalAnimalMacroF1"], 0.6642230410345241)
        self.assertIn("not metrics for the nested-selected model", prior["interpretation"])
        self.assertIn("nested within-source exploratory", perea["metrics"]["modelEvaluation"])
        self.assertIn("does not validate DMI consumption", " ".join(perea["limitations"]))
        self.assertIn("breed", perea["groups"])

        self.assertNotIn("xgain-cattle-hourly-behavior", records)

        cper = records["usda-cper-ltgi-internal-adg"]
        self.assertEqual(cper["metrics"]["oofRows"], 320)
        self.assertIsNone(cper["metrics"]["selectedCandidate"])
        self.assertFalse(cper["metrics"]["anyCandidatePassedAdvancementRule"])

        dmi_gate = records["adult-beef-cow-pasture-total-dmi-gate"]
        self.assertEqual(dmi_gate["decision"], "NO_GO")
        self.assertEqual(dmi_gate["metrics"]["eligibleCohorts"], 0)

        self.assertEqual(report["processing"]["componentAssessmentCount"], len(records))
        rendered = READINESS.render_markdown(report)
        self.assertIn("adult-beef-cow-pasture-total-dmi-gate", rendered)
        self.assertIn("previousStaticGroupedOof", rendered)

    def test_legacy_v1_report_without_component_collection_remains_valid(self):
        report = self.build()
        self.assertNotIn("componentAssessments", report)
        self.assertNotIn("componentAssessmentCount", report["processing"])
        READINESS.validate_readiness_report(report)


if __name__ == "__main__":
    unittest.main()
