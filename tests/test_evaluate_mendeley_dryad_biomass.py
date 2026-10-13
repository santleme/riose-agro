from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "evaluate_mendeley_dryad_biomass", ROOT / "scripts/evaluate_mendeley_dryad_biomass.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class BufferedBiomassEvaluationTests(unittest.TestCase):
    def test_exact_coordinate_field_aliases_stay_in_same_holdout(self) -> None:
        frame = pd.DataFrame(
            [
                {"farm": "F", "field_code": "A", "latitude_deg": 0.0, "longitude_deg": 0.0},
                {"farm": "F", "field_code": "A_alias", "latitude_deg": 0.0, "longitude_deg": 0.0},
                {"farm": "F", "field_code": "B", "latitude_deg": 0.0, "longitude_deg": 0.02},
                {"farm": "F", "field_code": "C", "latitude_deg": 0.0, "longitude_deg": 0.04},
            ]
        )
        folds = MODULE.buffered_folds(frame)
        self.assertEqual(len(folds), 3)
        held_out = [set(frame.index[test]) for _, _, test in folds]
        self.assertTrue(any(indices == {0, 1} for indices in held_out))
        self.assertTrue(any(indices == {2} for indices in held_out))
        self.assertTrue(any(indices == {3} for indices in held_out))

    def test_metrics_report_signed_prediction_bias(self) -> None:
        result = MODULE.metric_values(pd.Series([10.0, 20.0]).to_numpy(), pd.Series([12.0, 17.0]).to_numpy())
        self.assertEqual(result["rows"], 2)
        self.assertAlmostEqual(result["maeKgDmHa"], 2.5)
        self.assertAlmostEqual(result["biasPredictedMinusObservedKgDmHa"], -0.5)


if __name__ == "__main__":
    unittest.main()
