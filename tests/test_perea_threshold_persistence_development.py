import importlib.util
import unittest
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "experiments/behavior/perea-threshold-persistence-development/evaluate_perea_threshold_persistence.py"
SPEC = importlib.util.spec_from_file_location("perea_threshold_persistence", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PereaThresholdPersistenceDevelopmentTests(unittest.TestCase):
    def test_two_mi_cutpoints_map_all_four_quadrants(self):
        features = np.array([
            [1.0, 1.0],  # low level, low change -> RE
            [1.0, 3.0],  # low level, high change -> RU
            [8.0, 8.0],  # high level, low change -> GR
            [8.0, 5.0],  # high level, high change -> WA
        ])
        pred = MODULE.threshold_rule(features, level_cut=4.0, change_cut=1.0)
        self.assertEqual([MODULE.CLASSES[i] for i in pred], ["RE", "RU", "GR", "WA"])

    def test_persistence_is_auto_fed_and_resets_on_gaps_and_animals(self):
        start = datetime(2022, 1, 1, 12, 0)
        rows = [
            {"animal": "A", "timestamp": start + timedelta(minutes=0)},
            {"animal": "A", "timestamp": start + timedelta(minutes=1)},
            {"animal": "A", "timestamp": start + timedelta(minutes=2)},
            {"animal": "A", "timestamp": start + timedelta(minutes=3)},
            {"animal": "A", "timestamp": start + timedelta(minutes=7)},
            {"animal": "A", "timestamp": start + timedelta(minutes=8)},
            {"animal": "B", "timestamp": start + timedelta(minutes=8)},
        ]
        suggestions = np.array([
            MODULE.CLASS_INDEX["GR"], MODULE.CLASS_INDEX["RU"], MODULE.CLASS_INDEX["RU"],
            MODULE.CLASS_INDEX["GR"], MODULE.CLASS_INDEX["WA"], MODULE.CLASS_INDEX["GR"],
            MODULE.CLASS_INDEX["RE"],
        ])
        output = MODULE.auto_fed_persistence(rows, suggestions, confirmations=2)
        self.assertEqual(
            [MODULE.CLASSES[i] for i in output],
            ["GR", "GR", "RU", "RU", "WA", "WA", "RE"],
        )

    def test_metrics_use_equal_animal_per_class_f1_and_zero_for_missing_support(self):
        y = np.array([1, 2, 0, 0])
        pred = np.array([1, 2, 0, 0])
        animals = np.array(["A", "A", "B", "B"], dtype=object)
        score = MODULE.per_animal_metrics(y, pred, animals)
        self.assertEqual(score["nAnimals"], 2)
        self.assertEqual(score["equalAnimalPerClass"]["RE"]["f1"], 0.5)
        self.assertEqual(score["equalAnimalPerClass"]["RU"]["f1"], 0.5)
        self.assertEqual(score["primaryEqualAnimalMeanF1_RE_RU"], 0.5)

    def test_inner_threshold_selection_uses_five_animal_group_folds(self):
        # Six animals per breed: outer test gets one per breed, the remaining
        # twenty form five inner folds with four held-out animals each.
        rows = []
        start = datetime(2022, 1, 1, 12, 0)
        for breed in ("AH", "BH", "BR", "RC"):
            for animal_number in range(6):
                animal = f"{breed}:{animal_number}"
                for minute in range(3):
                    level = float((animal_number + minute) % 2 * 8)
                    delta = 0.0 if minute == 0 else 2.0
                    rows.append({
                        "animal": animal,
                        "breed": breed,
                        "timestamp": start + timedelta(minutes=minute),
                        "features": [level, level - delta],
                        "label": ("RE", "RU", "GR", "WA")[(animal_number + minute) % 4],
                    })
        outer_fold = {"fold": 0, "testAnimals": [f"{breed}:0" for breed in ("AH", "BH", "BR", "RC")]}
        selected = MODULE.select_thresholds_inner(
            rows,
            {"make_inner_fold_map": lambda animals: {
                animal: int(animal.split(":")[1]) - 1 for animal in animals
            }},
            outer_fold,
            threshold_grid=(-0.5, 0.5),
        )
        self.assertEqual(selected["thresholdPairsEvaluated"], 4)
        self.assertEqual(len(selected["innerFolds"]), 5)
        flattened = [animal for animals in selected["innerFolds"].values() for animal in animals]
        self.assertEqual(len(flattened), 20)
        self.assertEqual(len(set(flattened)), 20)
        self.assertIn(selected["rawThreshold"]["levelCut"], (-0.5, 0.5))
        self.assertIn(selected["rawThreshold"]["changeCut"], (-0.5, 0.5))


if __name__ == "__main__":
    unittest.main()
