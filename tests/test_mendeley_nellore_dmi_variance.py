import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from analyze_mendeley_nellore_dmi_variance import analyze, decompose  # noqa: E402


class NelloreDmiObservedVarianceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((ROOT / "tests/fixtures/mendeley-nellore-dmi-variance.json").read_text(encoding="utf-8"))

    def test_fixture_is_deterministic_and_components_reconcile(self):
        first = decompose(self.fixture)
        second = decompose(self.fixture)
        self.assertEqual(first, second)
        components = first["sequentialOls"]["components"]
        total = first["sequentialOls"]["totalCenteredSumSquaresKgSquaredPerDaySquared"]
        self.assertAlmostEqual(sum(item["sumSquares"] for item in components), total, places=6)
        self.assertEqual(first["nObservedAnimalDays"], 16)
        self.assertEqual(first["nAnimals"], 4)
        self.assertEqual(first["nCalendarDays"], 4)

    def test_report_keeps_feedlot_scope_and_uncertainty_language_bounded(self):
        report = analyze(self.fixture, {"doi": "10.17632/cctgpznjrc.1", "license": "CC BY 4.0"})
        text = json.dumps(report).lower()
        self.assertEqual(report["outcome"]["unit"], "kg dry matter per animal per day")
        self.assertIn("feedlot", report["classification"])
        self.assertIn("not measurement error", text)
        self.assertIn("no bootstrap quantiles or calibrated prediction intervals", text)
        self.assertIn("not evidence for mature beef cows grazing pasture", text)
        self.assertNotIn("predictioninterval", text)

    def test_invalid_or_duplicated_rows_rejected(self):
        duplicate = self.fixture + [dict(self.fixture[0])]
        with self.assertRaisesRegex(ValueError, "Duplicate animal-day"):
            decompose(duplicate)
        invalid_treatment = [dict(row) for row in self.fixture]
        invalid_treatment[0]["treatment"] = "Unknown"
        with self.assertRaisesRegex(ValueError, "Unexpected treatment"):
            decompose(invalid_treatment)


if __name__ == "__main__":
    unittest.main()
