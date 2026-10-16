import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/evidence/perea-confirmatory-v1.json"
RESOURCE = ROOT / "docs/evidence/perea-confirmatory-execution-metadata.json"


class PereaConfirmatoryResultTests(unittest.TestCase):
    def test_frozen_confirmatory_run_records_no_go_without_model_promotion(self):
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        self.assertEqual(report["schemaVersion"], "perea-generative-confirmatory.v1")
        self.assertEqual(report["partition"]["trainingAnimals"], 20)
        self.assertEqual(report["partition"]["confirmatoryAnimals"], 4)
        self.assertEqual(report["partition"]["confirmatoryAnimalIds"], ["AH:2008", "BH:5111", "BR:8065", "RC:35"])
        self.assertFalse(report["gate"]["pass"])
        self.assertEqual(report["gate"]["decision"], "NO_GO_FOR_THIS_CANDIDATE_AND_SOURCE")
        self.assertFalse(report["gate"]["modelPromoted"])
        self.assertFalse(report["gate"]["productionEnabled"])
        self.assertFalse(report["gate"]["externalValidationEstablished"])
        self.assertFalse(report["gate"]["compositionAtMostBestSimpleBaselinePlus001"])
        self.assertFalse(report["gate"]["transitionTVAtLeast002BetterThanIIDAndPersistence"]["persistence"])
        self.assertFalse(report["gate"]["classwiseCompositionAtMostBestBaselinePlus005"]["RU"])

    def test_resource_sidecar_is_separate_and_scientific_limitation_is_preserved(self):
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        resource = json.loads(RESOURCE.read_text(encoding="utf-8"))
        self.assertEqual(resource["schemaVersion"], "perea-confirmatory-execution-metadata.v1")
        self.assertGreater(resource["wallTimeSeconds"], 0)
        self.assertGreater(resource["peakRssBytes"], 0)
        self.assertEqual(resource["evaluatorSha256"], report["implementation"]["evaluatorSha256"])
        self.assertTrue(any("not independent external-site validation" in item for item in report["limitations"]))


if __name__ == "__main__":
    unittest.main()
