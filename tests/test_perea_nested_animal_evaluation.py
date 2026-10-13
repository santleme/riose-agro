import importlib.util
from datetime import datetime, timedelta
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "experiments/behavior/perea-nested-animal/run_perea_nested_evaluation.py"
spec = importlib.util.spec_from_file_location("perea_nested_evaluation", SCRIPT)
perea = importlib.util.module_from_spec(spec)
spec.loader.exec_module(perea)


def rows_for(animal, values, start_minute=0):
    breed, animal_id = animal.split(":", 1)
    base = datetime(2026, 1, 1, 0, 0)
    return [
        {
            "breed": breed,
            "animal_id": animal_id,
            "animal": animal,
            "timestamp": base + timedelta(minutes=start_minute + i),
            "mi": float(value),
            "label": "GR",
            "source_row": i + 2,
            "source_rows_collapsed": 1,
        }
        for i, value in enumerate(values)
    ]


class PereaNestedAnimalEvaluationTests(unittest.TestCase):
    def test_temporal_features_are_causal_and_reset_at_gaps_and_animals(self):
        rows = []
        rows += rows_for("AH:1", [0, 1, 2, 3, 4, 5])
        rows += rows_for("AH:1", [8, 9, 10, 11, 12], start_minute=8)
        rows += rows_for("BH:2", [100, 101, 102, 103, 104])

        generated = perea.make_temporal_rows(rows)
        by_key = {(row["animal"], row["timestamp"].minute): row["features"] for row in generated}

        # The first valid rows use current and strictly prior values in newest-first order.
        self.assertEqual(by_key[("AH:1", 4)], [4.0, 3.0, 2.0, 1.0, 0.0])
        self.assertEqual(by_key[("AH:1", 5)], [5.0, 4.0, 3.0, 2.0, 1.0])
        # A five-minute run after a gap yields one row and cannot borrow values from before it.
        self.assertEqual(by_key[("AH:1", 12)], [12.0, 11.0, 10.0, 9.0, 8.0])
        self.assertNotIn(("AH:1", 8), by_key)
        # Identical timestamps for another animal remain entirely separate.
        self.assertEqual(by_key[("BH:2", 4)], [104.0, 103.0, 102.0, 101.0, 100.0])
        self.assertEqual(len(generated), 4)

    def test_frozen_outer_train_animals_get_five_inner_folds_without_leakage(self):
        prereg = perea.load_preregistration()
        outer = prereg["outerEvaluation"]["assignmentsFromFrozenExistingEvaluation"][0]
        all_animals = {animal for fold in prereg["outerEvaluation"]["assignmentsFromFrozenExistingEvaluation"] for animal in fold["testAnimals"]}
        outer_test = set(outer["testAnimals"])
        outer_train = sorted(all_animals - outer_test)

        self.assertEqual(len(outer_train), 20)
        inner_map = perea.make_inner_fold_map(outer_train)
        self.assertEqual(set(inner_map), set(outer_train))
        for inner_fold in range(5):
            valid = {animal for animal, assigned in inner_map.items() if assigned == inner_fold}
            train = set(outer_train) - valid
            self.assertEqual(len(valid), 4)
            self.assertEqual(len(train), 16)
            self.assertFalse(train & valid)
            self.assertEqual({animal.split(":", 1)[0] for animal in valid}, {"AH", "BH", "BR", "RC"})
            self.assertEqual({animal.split(":", 1)[0] for animal in train}, {"AH", "BH", "BR", "RC"})

    def test_inner_fold_assignments_are_deterministic_and_sorted_by_animal_id(self):
        animals = [f"{breed}:{animal_id}" for breed in ["RC", "AH", "BR", "BH"] for animal_id in ["9", "2", "4", "1", "7"]]
        first = perea.make_inner_fold_map(animals)
        second = perea.make_inner_fold_map(list(reversed(animals)))
        self.assertEqual(first, second)
        self.assertEqual(first["AH:1"], 0)
        self.assertEqual(first["AH:2"], 1)
        self.assertEqual(first["AH:9"], 4)


if __name__ == "__main__":
    unittest.main()
