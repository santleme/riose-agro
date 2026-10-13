"""Focused invariants for the isolated Mendeley biomass transport diagnostics."""
import importlib.util
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/evaluate_biomass_transport_stress_2026_10.py"
SPEC = importlib.util.spec_from_file_location("biomass_transport_stress", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def tiny_frame():
    rows = []
    # Point B is about 55 m from A; C is about 1.1 km away. Each point repeats
    # across campaigns to exercise exact-coordinate identity grouping.
    for field, lat in [("A", 0.0), ("B", 0.0005), ("C", 0.01)]:
        for campaign in ["2018-11", "2019-03"]:
            rows.append({
                "farm": "F", "field_code": field, "campaign": campaign,
                "management_type": "rotational", "latitude_deg": lat,
                "longitude_deg": 0.0, "sward_height_cm": 10.0 + lat,
                "dry_matter_yield_kg_dm_ha": 1000.0 + lat,
            })
    return pd.DataFrame(rows)


class BiomassTransportStressTests(unittest.TestCase):
    def test_campaign_split_excludes_repeated_coordinate_identities(self):
        frame = tiny_frame()
        train, test, test_coords, removed, overlap = MODULE.campaign_split_masks(frame, "2018-11")
        self.assertEqual(test.sum(), 3)
        self.assertEqual(test_coords, 3)
        self.assertEqual(train.sum(), 0)
        self.assertEqual(removed, 3)
        self.assertEqual(overlap, 0)

    def test_spatial_components_keep_campaign_repeats_together_and_buffer(self):
        frame = tiny_frame()
        frame["_block"] = MODULE.components(frame)
        self.assertEqual(frame.groupby("_block").size().tolist(), [2, 2, 2])
        folds = list(MODULE.spatial_folds(frame, 100.0))
        self.assertEqual(len(folds), 3)
        _, train, test = next(x for x in folds if x[0] == "F/A")
        self.assertEqual(test.sum(), 2)
        # Neighbor B falls inside 100 m, while distant C remains eligible.
        self.assertEqual(train.sum(), 2)
        self.assertEqual(set(frame.loc[train, "field_code"]), {"C"})
        train_coords = set(map(tuple, frame.loc[train, MODULE.COORDS].itertuples(index=False, name=None)))
        test_coords = set(map(tuple, frame.loc[test, MODULE.COORDS].itertuples(index=False, name=None)))
        self.assertFalse(train_coords & test_coords)

    def test_zero_buffer_keeps_only_other_components(self):
        frame = tiny_frame()
        frame["_block"] = MODULE.components(frame)
        folds = {block: (train, test) for block, train, test in MODULE.spatial_folds(frame, 0.0)}
        train, test = folds["F/A"]
        self.assertEqual(train.sum(), 4)
        train_coords = set(map(tuple, frame.loc[train, MODULE.COORDS].itertuples(index=False, name=None)))
        test_coords = set(map(tuple, frame.loc[test, MODULE.COORDS].itertuples(index=False, name=None)))
        self.assertFalse(train_coords & test_coords)

    def test_metrics_report_signed_bias_and_row_count(self):
        result = MODULE.metrics(np.array([100.0, 200.0]), np.array([110.0, 180.0]))
        self.assertEqual(result["rows"], 2)
        self.assertEqual(result["maeKgDmHa"], 15.0)
        self.assertEqual(result["biasPredictedMinusObservedKgDmHa"], -5.0)


if __name__ == "__main__":
    unittest.main()
