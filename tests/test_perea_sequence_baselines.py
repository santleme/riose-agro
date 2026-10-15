import unittest
from datetime import datetime, timedelta
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.science.behavior.perea_sequence_baselines import (
    CLASSES, animal_split, derive_seed, extract_windows, fit_baselines, generate,
)
from scripts.science.behavior.evaluate_perea_sequence_baselines import _complete_runs, _transition_tv


class PereaSequenceBaselineTests(unittest.TestCase):
    def test_animal_partitions_are_frozen_balanced_and_disjoint(self):
        groups = {f"{breed}:{animal}" for breed, animals in {
            "AH": ["2003", "2004", "2008", "2009", "2013", "2019"],
            "BH": ["4071", "4085", "4511", "4589", "5111", "6495"],
            "BR": ["7001", "8063", "8065", "8071", "8073", "8089"],
            "RC": ["35", "6", "1067", "2061", "2024", "9012"],
        }.items() for animal in animals}
        holdout, folds = animal_split(groups)
        self.assertEqual(holdout, {"AH:2008", "BH:5111", "BR:8065", "RC:35"})
        self.assertEqual(len(folds), 5)
        self.assertTrue(all(len(fold) == 4 for fold in folds))
        self.assertEqual(set.union(*folds) | holdout, groups)
        self.assertFalse(any(folds[i] & folds[j] for i in range(5) for j in range(i + 1, 5)))

    def test_gap_creates_windows_and_never_creates_a_cross_gap_transition(self):
        start = datetime(2022, 6, 30, 10, 0)
        rows = [
            {"group_id": "AH:1", "timestamp": start, "behavior": "GR"},
            {"group_id": "AH:1", "timestamp": start + timedelta(minutes=1), "behavior": "RE"},
            {"group_id": "AH:1", "timestamp": start + timedelta(minutes=3), "behavior": "WA"},
        ]
        windows = extract_windows(rows)
        self.assertEqual([window["labels"] for window in windows], [["GR", "RE"], ["WA"]])
        model = fit_baselines(windows)
        self.assertEqual(model["transitionSupport"]["RE"], 0)

    def test_generators_are_repeatable_bounded_and_take_no_observed_future_sequence(self):
        train = [
            {"animal": "AH:1", "labels": ["GR", "GR", "RE", "GR"]},
            {"animal": "BH:2", "labels": ["WA", "GR", "WA"]},
        ]
        model = fit_baselines(train)
        seed = derive_seed("markov", 1, "BR:unknown", 0, 0)
        for candidate in ("iid", "persistence", "markov"):
            first = generate(candidate, model, 100, derive_seed(candidate, 1, "BR:unknown", 0, 0))
            second = generate(candidate, model, 100, derive_seed(candidate, 1, "BR:unknown", 0, 0))
            self.assertEqual(first, second)
            self.assertEqual(len(first), 100)
            self.assertTrue(set(first) <= set(CLASSES))
        self.assertEqual(len(generate("markov", model, 0, seed)), 0)
        self.assertEqual(len(set(generate("persistence", model, 100, seed))), 1)
        with self.assertRaises(ValueError):
            generate("semi-markov", model, 1, seed)

    def test_complete_runs_are_censored_at_window_edges_and_transition_metric_is_explicit(self):
        sequence = ["GR", "RE", "RE", "WA", "WA", "RE"]
        self.assertEqual(_complete_runs(sequence), [("RE", 2), ("WA", 2)])
        tv, states = _transition_tv(sequence, sequence, ["GR", "RE", "WA"])
        self.assertEqual(tv, 0.0)
        self.assertEqual(states, 3)
        missing_row_tv, missing_row_count = _transition_tv(["GR", "RE"], ["WA", "WA"], ["GR"])
        self.assertEqual(missing_row_tv, 1.0)
        self.assertEqual(missing_row_count, 1)


if __name__ == "__main__":
    unittest.main()
