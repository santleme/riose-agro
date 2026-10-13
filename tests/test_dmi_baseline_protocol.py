import copy
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from dmi_baseline_protocol import fit_standardizer, grouped_split, regression_metrics, transform_features  # noqa: E402


def make_rows():
    # animal 2 bridges two trials and must keep both trials in one partition.
    rows = [
        {"animal_period_id": "a1-p1", "study_or_trial_id": "trial-a", "animal_id": "animal-1", "weight": 100.0},
        {"animal_period_id": "a2-p1", "study_or_trial_id": "trial-a", "animal_id": "animal-2", "weight": 200.0},
        {"animal_period_id": "b2-p1", "study_or_trial_id": "trial-b", "animal_id": "animal-2", "weight": 300.0},
        {"animal_period_id": "c1-p1", "study_or_trial_id": "trial-c", "animal_id": "animal-3", "weight": 400.0},
        {"animal_period_id": "d1-p1", "study_or_trial_id": "trial-d", "animal_id": "animal-4", "weight": 500.0},
        {"animal_period_id": "e1-p1", "study_or_trial_id": "trial-e", "animal_id": "animal-5", "weight": 600.0},
    ]
    return rows


class DmiBaselineProtocolTest(unittest.TestCase):
    def test_split_keeps_animals_and_trials_whole_even_when_animal_bridges_trials(self):
        rows = make_rows()
        split = grouped_split(rows, seed=417)
        self.assertEqual(set(split.values()), {"train", "validation", "test"})
        for key in ("animal_id", "study_or_trial_id"):
            grouped = {}
            for row in rows:
                grouped.setdefault(row[key], set()).add(split[row["animal_period_id"]])
            self.assertTrue(all(len(partitions) == 1 for partitions in grouped.values()), (key, grouped))
        self.assertEqual(split["a2-p1"], split["b2-p1"])

    def test_group_split_is_deterministic_and_independent_of_row_order(self):
        rows = make_rows()
        expected = grouped_split(rows, seed=417)
        self.assertEqual(grouped_split(rows, seed=417), expected)
        self.assertEqual(grouped_split(list(reversed(rows)), seed=417), expected)
        self.assertEqual(grouped_split(rows, seed=99), grouped_split(rows, seed=99))

    def test_preprocessing_is_deterministic_and_fitted_only_on_training_rows(self):
        rows = make_rows()
        split = grouped_split(rows, seed=417)
        fitted = fit_standardizer(rows, ["weight"], split)
        train_values = [row["weight"] for row in rows if split[row["animal_period_id"]] == "train"]
        self.assertEqual(fitted["weight"]["mean"], sum(train_values) / len(train_values))
        altered = copy.deepcopy(rows)
        for row in altered:
            if split[row["animal_period_id"]] != "train":
                row["weight"] += 100_000
        self.assertEqual(fit_standardizer(altered, ["weight"], split), fitted)
        self.assertEqual(fit_standardizer(list(reversed(rows)), ["weight"], split), fitted)
        transformed = transform_features(rows, ["weight"], fitted)
        self.assertEqual(transformed, transform_features(rows, ["weight"], fitted))

    def test_preprocessing_rejects_missing_training_values_and_feature_mismatch(self):
        rows = make_rows()
        split = grouped_split(rows, seed=417)
        train_row = next(row for row in rows if split[row["animal_period_id"]] == "train")
        train_row["weight"] = float("nan")
        with self.assertRaisesRegex(ValueError, "finite numeric"):
            fit_standardizer(rows, ["weight"], split)
        with self.assertRaisesRegex(ValueError, "feature names"):
            transform_features(make_rows(), ["weight", "other"], {"weight": {"mean": 0, "scale": 1}})

    def test_regression_metrics_are_deterministic_and_have_signed_bias(self):
        observed = [10.0, 20.0, 30.0]
        predicted = [12.0, 18.0, 31.0]
        expected = {"mae": 5 / 3, "rmse": 3.0**0.5, "bias": 1 / 3}
        self.assertEqual(regression_metrics(observed, predicted), expected)
        self.assertEqual(regression_metrics(observed, predicted), regression_metrics(observed, predicted))

    def test_metrics_reject_empty_mismatched_or_non_finite_inputs(self):
        with self.assertRaisesRegex(ValueError, "same non-zero length"):
            regression_metrics([], [])
        with self.assertRaisesRegex(ValueError, "same non-zero length"):
            regression_metrics([1.0], [1.0, 2.0])
        with self.assertRaisesRegex(ValueError, "finite numbers"):
            regression_metrics([1.0], [float("nan")])

    def test_split_rejects_too_few_independent_components_and_duplicate_ids(self):
        rows = make_rows()[:3]
        with self.assertRaisesRegex(ValueError, "at least three independent"):
            grouped_split(rows, seed=0)
        duplicate = make_rows()
        duplicate.append(dict(duplicate[0]))
        with self.assertRaisesRegex(ValueError, "duplicate animal_period_id"):
            grouped_split(duplicate, seed=0)


if __name__ == "__main__":
    unittest.main()
