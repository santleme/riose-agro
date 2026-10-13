import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/evaluate_cper_preoutcome_adg_candidates.py"
spec = importlib.util.spec_from_file_location("cper_preoutcome_adg_candidates", SCRIPT)
experiment = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(experiment)


class CperPreOutcomeAdgCandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows, cls.source = experiment.read_cohort()

    def test_preregistration_and_source_are_frozen_and_narrow(self):
        import json

        protocol = json.loads(experiment.PROTOCOL_PATH.read_text(encoding="utf-8"))
        self.assertEqual(protocol["status"], "preregistered_before_execution")
        self.assertEqual(len(self.rows), 320)
        self.assertEqual(self.source["sha256"], "533929668b59bc9b6f67bf202c87a746634871419972db126e6c94b2f83eac14")
        self.assertEqual(protocol["features"]["included"], ["on_Weight converted to kg"])
        self.assertTrue(any(item.startswith("Season.Days because it is realized duration")
                            for item in protocol["features"]["excluded"]))

    def test_treatment_is_perfectly_aliased_with_pasture_and_excluded(self):
        audit = experiment.treatment_alias_audit(self.rows)
        self.assertTrue(audit["perfectOneToOneAlias"])
        self.assertEqual(audit["treatmentToPastures"], {
            "heavy": ["23E"], "light": ["23W"], "moderate": ["15E"]
        })

    def test_outer_and_inner_year_splits_purge_identity_proxies(self):
        outer_train, outer_test, purged = experiment.split_year(self.rows, 2009)
        self.assertEqual(len(outer_test), 62)
        self.assertEqual(purged, 4)
        self.assertFalse({r["identity"] for r in outer_train} & {r["identity"] for r in outer_test})
        inner_train, inner_test, _ = experiment.split_year(outer_train, 2010)
        self.assertFalse({r["identity"] for r in inner_train} & {r["identity"] for r in inner_test})

    def test_nested_predictions_cover_every_row_and_alpha_selection_stays_inside(self):
        evaluation, oof = experiment.nested_evaluate(self.rows)
        self.assertEqual(evaluation["oofRowCount"], 320)
        self.assertEqual(len({r["rowId"] for r in oof}), 320)
        self.assertEqual({f["outerTestYear"] for f in evaluation["folds"]}, set(experiment.YEARS))
        for fold in evaluation["folds"]:
            self.assertEqual(len(fold["innerTrainingYears"]), 4)
            self.assertIn(fold["m2SelectedAlpha"], experiment.ALPHAS)
            self.assertEqual(set(fold["m2InnerScores"]), {str(alpha) for alpha in experiment.ALPHAS})
            self.assertEqual(fold["metrics"]["M2"]["n"], fold["outerTestN"])
        self.assertEqual(set(evaluation["models"]), {"M0", "M1", "M2"})

    def test_linear_candidates_are_deterministic_and_use_initial_weight_only(self):
        train = [row for row in self.rows if row["year"] != 2009]
        test = [row for row in self.rows if row["year"] == 2009]
        first = experiment.fit_predict_linear(train, test, 1.0)
        second = experiment.fit_predict_linear(train, test, 1.0)
        self.assertEqual(first, second)
        self.assertEqual(len(first), len(test))
        self.assertTrue(all(isinstance(value, float) for value in first))


if __name__ == "__main__":
    unittest.main()
