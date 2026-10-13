import unittest

from scripts.verify_scientific_ml_baseline import verify


class FrozenScientificMlBaselineTest(unittest.TestCase):
    def test_reference_hashes_and_metrics_reproduce_without_refitting(self):
        result = verify()
        self.assertEqual(result["status"], "valid")
        self.assertFalse(result["retrained"])
        self.assertEqual(result["biomassOOFRows"], 234)
        self.assertEqual(result["behaviorOOFRows"], 8864)
        self.assertEqual(result["historicalAdgRows"], 291)


if __name__ == "__main__":
    unittest.main()
