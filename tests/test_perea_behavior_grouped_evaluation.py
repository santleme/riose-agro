import csv
import json
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/evidence/perea-behavior-grouped-evaluation.json"
PREDICTIONS = ROOT / "docs/evidence/perea-behavior-grouped-oof-predictions.csv"


class PereaGroupedBehaviorEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(
            [sys.executable, "scripts/evaluate_perea_behavior_grouped.py"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        cls.report = json.loads(REPORT.read_text(encoding="utf-8"))

    def test_evaluation_scope_and_duplicate_policy_are_explicit(self):
        self.assertEqual(self.report["classification"], "within_source_grouped_by_animal_behavior_classification_diagnostic")
        self.assertIn("DMI prediction or calibration", self.report["scope"]["not_valid_for"])
        self.assertIn("ADG prediction or validation", self.report["scope"]["not_valid_for"])
        self.assertEqual(self.report["preprocessingAudit"]["publishedRows"], 9222)
        self.assertEqual(self.report["preprocessingAudit"]["repeatedAnimalTimestampKeys"], 290)
        self.assertEqual(self.report["preprocessingAudit"]["conflictingLabelTimestampKeys"], 54)
        self.assertEqual(self.report["preprocessingAudit"]["analysisRows"], 8864)

    def test_all_animals_are_held_out_once_without_group_leakage(self):
        folds = self.report["evaluation"]["folds"]
        self.assertEqual(len(folds), 6)
        held_out = []
        for fold in folds:
            self.assertEqual(fold["testAnimalCount"], 4)
            self.assertEqual(fold["trainAnimalCount"], 20)
            self.assertEqual(fold["animalOverlap"], [])
            self.assertEqual(len({animal.split(":", 1)[0] for animal in fold["testAnimals"]}), 4)
            held_out.extend(fold["testAnimals"])
        self.assertEqual(len(held_out), 24)
        self.assertEqual(len(set(held_out)), 24)
        self.assertTrue(self.report["evaluation"]["noAnimalOverlap"])

    def test_model_beats_majority_baseline_on_equal_animal_metrics(self):
        metrics = self.report["evaluation"]["metrics"]
        model = metrics["logistic_equal_animal_weighted"]
        baseline = metrics["majority_equal_animal_weighted"]
        self.assertGreater(model["balancedAccuracy"], baseline["balancedAccuracy"])
        self.assertGreater(model["macroF1"], baseline["macroF1"])
        self.assertAlmostEqual(sum(item["support"] for item in model["perClass"].values()), 24.0, places=8)
        self.assertGreater(model["perClass"]["RU"]["recall"], 0.0)

    def test_oof_prediction_rows_keep_each_animal_in_one_fold(self):
        with PREDICTIONS.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 8864)
        folds_by_animal = {}
        for row in rows:
            key = f"{row['breed']}:{row['animal_id']}"
            folds_by_animal.setdefault(key, set()).add(row["fold"])
            self.assertIn(row["behavior_observed"], {"GR", "RE", "RU", "WA"})
            self.assertIn(row["behavior_oof_logistic"], {"GR", "RE", "RU", "WA"})
        self.assertEqual(len(folds_by_animal), 24)
        self.assertTrue(all(len(folds) == 1 for folds in folds_by_animal.values()))


if __name__ == "__main__":
    unittest.main()
