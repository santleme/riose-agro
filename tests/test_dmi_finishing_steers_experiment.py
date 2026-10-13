import hashlib
import json
import math
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/evidence/dmi-finishing-steers-experiment-v1.json"
PROTOCOL = ROOT / "experiments/dmi-finishing-steers/protocol-v1.json"
SOURCE = ROOT / "data/dryad-finishing-steers/Database_09-11-2025.csv"


class FinishingSteerExperimentEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(REPORT.read_text(encoding="utf-8"))
        cls.protocol = json.loads(PROTOCOL.read_text(encoding="utf-8"))

    def test_experiment_stays_outside_original_109_110_target(self):
        self.assertEqual(self.report["classification"], "separate_population_exploratory_component_experiment")
        self.assertEqual(self.report["targetGate109"], "NO_GO_UNCHANGED")
        self.assertEqual(self.report["issue110OriginalTarget"], "not_run_gate_not_met")
        self.assertIn("finishing-phase", self.report["estimand"])
        self.assertIn("not mature beef cows", self.report["estimand"])

    def test_protocol_and_source_checksums_are_pinned(self):
        protocol_digest = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
        source_digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
        self.assertEqual(protocol_digest, self.report["protocolSha256"])
        self.assertEqual(source_digest, self.report["source"]["sha256"])
        self.assertEqual(self.report["source"]["license"], "CC0-1.0")

    def test_leave_one_experiment_out_has_no_group_or_animal_overlap(self):
        projects = set(self.report["split"]["heldOutProjects"])
        self.assertEqual(projects, {"2023B", "2023F", "2023G", "2023H", "2024A"})
        for model in self.report["models"].values():
            predictions = model["predictions"]
            keys = [(row["project"], row["animalId"]) for row in predictions]
            self.assertEqual(len(keys), len(set(keys)))
            self.assertEqual({row["project"] for row in predictions}, projects)
            for held_out_project, fold in model["byHeldOutProject"].items():
                self.assertEqual(fold["n"], self.report["split"]["rowCountsByProject"][held_out_project])
                self.assertTrue(math.isfinite(fold["mae"]))
                self.assertTrue(math.isfinite(fold["rmse"]))
                self.assertTrue(math.isfinite(fold["biasPredictionMinusObserved"]))
            self.assertEqual(len(predictions), 446)

    def test_all_models_use_same_out_of_fold_cases_and_no_label_leakage(self):
        excluded = set(self.protocol["excludedFeatures"])
        used = set(self.report["featureColumns"])
        self.assertTrue(used.isdisjoint(excluded))
        model_keys = set(self.report["models"])
        self.assertEqual(model_keys, {"meanBaseline", "ridge", "randomForest"})
        self.assertEqual({model["pooledOutOfFold"]["n"] for model in self.report["models"].values()}, {446})
        self.assertFalse(self.report["intervals"]["reported"])


if __name__ == "__main__":
    unittest.main()
