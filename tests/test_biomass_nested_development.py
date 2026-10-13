from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "evaluate_biomass_nested_development", ROOT / "scripts/evaluate_biomass_nested_development.py"
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NestedBiomassDevelopmentTests(unittest.TestCase):
    def test_protocol_was_frozen_before_candidate_fit_and_marks_epistemic_limits(self) -> None:
        protocol = json.loads(MODULE.PROTOCOL.read_text(encoding="utf-8"))
        self.assertEqual(protocol["status"], "preregistered_before_candidate_model_fitting")
        self.assertTrue(protocol["epistemicStatus"]["candidateFamilyChosenAfterBaselineReview"])
        self.assertFalse(protocol["epistemicStatus"]["independentValidation"])
        self.assertFalse(protocol["externalData"]["usedForCandidateSelection"])
        self.assertEqual(protocol["candidateSet"][-1]["id"], "M7_hgb_monotone")

    def test_nested_spatial_preflight_has_full_coverage_before_any_fit(self) -> None:
        protocol = json.loads(MODULE.PROTOCOL.read_text(encoding="utf-8"))
        frame = pd.read_parquet(MODULE.MEND).dropna(
            subset=[*MODULE.GROUP_KEYS, "campaign", MODULE.HEIGHT, MODULE.TARGET,
                    "latitude_deg", "longitude_deg"]
        ).reset_index(drop=True)
        folds = MODULE.buffered_folds(frame)
        details = MODULE.preflight(frame, folds, protocol)
        self.assertEqual(len(folds), 13)
        self.assertEqual(len(details), 13)
        self.assertEqual({row["innerFolds"] for row in details}, {12})
        self.assertEqual({row["innerCoverage"] for row in details}, {1.0})
        self.assertEqual(min(row["minimumInnerTrainingRows"] for row in details), 192)

    def test_saved_outer_predictions_and_metrics_are_reproducible_and_aligned(self) -> None:
        report = json.loads(MODULE.REPORT_JSON.read_text(encoding="utf-8"))
        predictions = pd.read_csv(MODULE.PREDICTIONS)
        self.assertEqual(len(predictions), 234)
        self.assertEqual(predictions.outer_block.nunique(), 13)
        self.assertEqual(report["outerOof"]["rows"], len(predictions))
        self.assertEqual(report["outerOof"]["coverage"], 1.0)
        self.assertEqual(report["selection"]["selectedFrequencyByOuterBlock"], {"M1_ols": 13})
        self.assertEqual(
            report["outerOof"]["advancementGate"]["decision"],
            "NO_ADVANCEMENT_RETAIN_OLS_AS_DEVELOPMENT_REFERENCE",
        )
        for model_id, expected in report["outerOof"]["metricsByFixedCandidate"].items():
            pred = predictions[f"{model_id}_prediction"].to_numpy(float)
            actual = predictions.observed.to_numpy(float)
            self.assertAlmostEqual(mean_absolute_error(actual, pred), expected["maeKgDmHa"], places=7)
            self.assertAlmostEqual(np.sqrt(mean_squared_error(actual, pred)), expected["rmseKgDmHa"], places=7)
            self.assertAlmostEqual(float(np.mean(pred - actual)), expected["biasPredictedMinusObservedKgDmHa"], places=7)
        digest = hashlib.sha256(MODULE.PREDICTIONS.read_bytes()).hexdigest()
        self.assertEqual(digest, report["artifacts"]["predictions"]["sha256"])

    def test_tree_candidates_are_monotone_and_bounded(self) -> None:
        rf = MODULE.make_model("M6_rf_monotone")
        hgb = MODULE.make_model("M7_hgb_monotone")
        self.assertEqual(rf.monotonic_cst, [1])
        self.assertEqual(rf.n_estimators, 100)
        self.assertEqual(rf.max_depth, 3)
        self.assertEqual(rf.min_samples_leaf, 10)
        self.assertEqual(hgb.monotonic_cst, [1])
        self.assertEqual(hgb.max_iter, 50)
        self.assertEqual(hgb.max_leaf_nodes, 3)
        self.assertEqual(hgb.min_samples_leaf, 15)

    def test_external_support_wording_and_protocol_hash_are_corrected(self) -> None:
        old_protocol_path = ROOT / "experiments/diagnostics/biomass/preregister-mendeley-to-dryad-biomass-2026-10.json"
        external_report_path = ROOT / "experiments/biomass/dryad-external/evaluation-report.json"
        old_protocol = json.loads(old_protocol_path.read_text(encoding="utf-8"))
        external_report = json.loads(external_report_path.read_text(encoding="utf-8"))
        mendeley = pd.read_parquet(MODULE.MEND).dropna(subset=[MODULE.HEIGHT])
        dryad = pd.read_parquet(ROOT / "data/dryad-mob-rotational-biomass/processed/dryad-paddock-biomass-height-v1.parquet")
        self.assertEqual(int(mendeley[MODULE.HEIGHT].between(2.0, 56.0).sum()), 234)
        self.assertEqual(int(mendeley[MODULE.HEIGHT].between(float(dryad.preGrazingHeightMeanCm.min()), 56.0).sum()), 51)
        self.assertIn("All 234", old_protocol["externalEvaluation"]["supportComposition"])
        self.assertIn("23.533", old_protocol["externalEvaluation"]["supportComposition"])
        self.assertEqual(
            hashlib.sha256(old_protocol_path.read_bytes()).hexdigest(),
            external_report["protocolSha256"],
        )


if __name__ == "__main__":
    unittest.main()
