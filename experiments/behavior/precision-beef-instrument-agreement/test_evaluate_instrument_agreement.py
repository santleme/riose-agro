"""Synthetic fixture tests; these tests never load or fit the real cohort."""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

import numpy as np
import pandas as pd


SCRIPT = Path(__file__).with_name("evaluate_instrument_agreement.py")
SPEC = importlib.util.spec_from_file_location("precision_beef_agreement", SCRIPT)
AGREEMENT = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(AGREEMENT)


def row(animal=1, second="2022-01-01 00:00:00", label=0, complete=True, missing_feature=False,
        split=None, trial=None, n_aligned=10, n_complete=10):
    result = {
        "timestamp_second": second,
        "animal_id": animal,
        "farm_trial_id": AGREEMENT.TRIAL_BY_ANIMAL[animal] if trial is None else trial,
        "source_split": AGREEMENT.SPLIT_BY_ANIMAL[animal] if split is None else split,
        "n_exact_aligned_10hz_samples": n_aligned,
        "n_complete_sensor_label_samples": n_complete,
        "is_complete_10hz_second": complete,
        "reference_majority_class": label,
    }
    for i, feature in enumerate(AGREEMENT.FEATURES):
        result[feature] = None if (missing_feature and i == 0) else float((animal * 10 + i) % 17)
    return result


def model_frame(animals=(1, 2), rows_per_animal=30):
    rows = []
    for animal in animals:
        for i in range(rows_per_animal):
            item = row(animal, f"2022-01-01 00:{i // 60:02d}:{i % 60:02d}", label=i % 3)
            # Add modest class-dependent signal without using IDs or split as model features.
            for j, feature in enumerate(AGREEMENT.FEATURES):
                item[feature] = float((i % 3) * (j + 1) + (i % 5) / 10)
            rows.append(item)
    return pd.DataFrame(rows)


class PrecisionBeefInstrumentAgreementTests(unittest.TestCase):
    def test_preregistered_fixed_models_and_parameters_are_loaded(self):
        prereg = AGREEMENT.load_preregistration()
        self.assertEqual([item["id"] for item in prereg["models"]], ["training_majority_baseline", "random_forest_fixed"])
        self.assertEqual(AGREEMENT.RF_PARAMETERS, {
            "n_estimators": 200, "max_depth": 12, "min_samples_leaf": 10, "max_features": "sqrt",
            "class_weight": "balanced_subsample", "n_jobs": 1, "random_state": 20261013,
        })

    def test_source_split_and_manifest_animal_identity_are_enforced(self):
        valid = pd.DataFrame([row(animal=4, second="2022-01-01 00:00:00", label=1)])
        AGREEMENT.validate_animal_frame(valid, 4)
        wrong_split = valid.copy()
        wrong_split.loc[:, "source_split"] = "source_train"
        with self.assertRaisesRegex(ValueError, "frozen source split"):
            AGREEMENT.validate_animal_frame(wrong_split, 4)
        wrong_animal = valid.copy()
        wrong_animal.loc[:, "animal_id"] = 3
        with self.assertRaisesRegex(ValueError, "manifest animal id"):
            AGREEMENT.validate_animal_frame(wrong_animal, 4)

    def test_tied_labels_incomplete_seconds_and_missing_features_are_excluded(self):
        frame = pd.DataFrame([
            row(animal=1, second="s0", label=1),
            row(animal=1, second="s1", label=None),  # complete second, tied/undefined majority
            row(animal=1, second="s2", label=2, complete=False, n_aligned=9, n_complete=9),
            row(animal=1, second="s3", label=2, missing_feature=True),
        ])
        eligible, coverage = AGREEMENT.eligible_seconds(frame)
        self.assertEqual(len(eligible), 1)
        self.assertEqual(eligible["timestamp_second"].tolist(), ["s0"])
        self.assertEqual(coverage["completeSeconds"], 3)
        self.assertEqual(coverage["tiedReferenceLabelSeconds"], 1)
        self.assertEqual(coverage["missingFeatureCompleteSeconds"], 1)
        self.assertEqual(coverage["eligibleSeconds"], 1)
        self.assertEqual(coverage["byAnimal"]["01"]["tiedFractionOfCompleteSeconds"], 1 / 3)

    def test_equal_animal_weights_assign_equal_total_mass(self):
        frame = pd.DataFrame([
            row(animal=1, second=f"a{i}", label=i % 3) for i in range(2)
        ] + [row(animal=2, second="b0", label=0)])
        weights = AGREEMENT.equal_animal_weights(frame)
        sums = {animal: float(weights[frame["animal_id"].to_numpy() == animal].sum()) for animal in (1, 2)}
        np.testing.assert_allclose([weights[0], weights[1], weights[2]], [.5, .5, 1.0])
        self.assertEqual(sums, {1: 1.0, 2: 1.0})

    def test_metrics_match_fixed_three_class_confusion(self):
        metric = AGREEMENT.classification_metrics([0, 0, 1, 1, 2], [0, 1, 1, 2, 2])
        self.assertEqual(metric["confusionMatrixActualRowsPredictedColumns"], [[1, 1, 0], [0, 1, 1], [0, 0, 1]])
        self.assertAlmostEqual(metric["accuracy"], .6)
        self.assertAlmostEqual(metric["balancedAccuracy"], 2 / 3)
        self.assertAlmostEqual(metric["macroF1"], (2 / 3 + .5 + 2 / 3) / 3)
        self.assertEqual(metric["classSupport"], {"0": 2, "1": 2, "2": 1})

    def test_source_test_rows_are_rejected_from_any_fit_or_development(self):
        contaminated = pd.concat([model_frame(animals=(1,)), pd.DataFrame([row(animal=4, label=1)])], ignore_index=True)
        with self.assertRaisesRegex(ValueError, "Source-test animals"):
            AGREEMENT.fit_random_forest(contaminated)
        with self.assertRaisesRegex(ValueError, "Source-test animals"):
            AGREEMENT.development_leave_one_animal_out(contaminated)

    def test_loao_development_uses_source_train_animals_only(self):
        train = model_frame(animals=(1, 2), rows_per_animal=9)
        dev = AGREEMENT.development_leave_one_animal_out(train)
        for fold in dev["folds"]:
            self.assertNotIn(fold["validationAnimal"], fold["fitAnimals"])
            self.assertTrue(set(fold["fitAnimals"]).issubset({"01", "02"}))
            self.assertNotIn("04", fold["fitAnimals"])
        self.assertEqual(len(dev["predictions"]), len(train))

    def test_final_test_animals_are_scored_after_source_train_only_fits(self):
        train = model_frame(animals=(1, 2), rows_per_animal=9)
        test = pd.DataFrame([row(animal=animal, second=f"test-{animal}-{i}", label=i % 3)
                             for animal in (4, 10, 11) for i in range(3)])
        report = AGREEMENT.evaluate(train, test)
        final = report["finalSourceTest"]
        self.assertEqual(final["animals"], ["04", "10", "11"])
        self.assertEqual(final["animalOverlap"], [])
        self.assertEqual(set(final["trainingAnimals"]), {"01", "02"})
        for fold in report["developmentSourceTrainLeaveOneAnimalOut"]["folds"]:
            self.assertNotIn("04", fold["fitAnimals"])
            self.assertNotIn("10", fold["fitAnimals"])
            self.assertNotIn("11", fold["fitAnimals"])
        self.assertEqual(set(final["predictions"]), {"training_majority_baseline", "random_forest_fixed"})

    def test_fixed_random_forest_predictions_are_deterministic(self):
        train = model_frame(animals=(1, 2, 3), rows_per_animal=15)
        model_a, _ = AGREEMENT.fit_random_forest(train)
        model_b, _ = AGREEMENT.fit_random_forest(train)
        x = train.loc[:, AGREEMENT.FEATURES].to_numpy(dtype=float)
        np.testing.assert_array_equal(model_a.predict(x), model_b.predict(x))


if __name__ == "__main__":
    unittest.main()
